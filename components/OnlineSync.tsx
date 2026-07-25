"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    getPendingScouting,
    getPendingScoutingRows,
    markAsSynced,
    recordSyncFailure,
    MAX_SYNC_ATTEMPTS,
} from "@/lib/localDatabase";
import { saveMatchScouting } from "@/lib/scouting-service";
import { cachePruneOlderThan } from "@/lib/client-cache";
import { notifyDiscordAction } from "@/app/actions/notify-discord";
import { Cloud, CloudOff, Loader2, AlertTriangle } from "lucide-react";
import clsx from "clsx";

// Notify Discord after 3 consecutive drain failures. Below this threshold
// the OnlineSync UI pill alone is sufficient — we don't want to spam the
// channel for transient blips. Webhook is also rate-limited server-side
// (60s default) so even if this counter overshoots, channel stays quiet.
const SYNC_FAILURE_NOTIFY_THRESHOLD = 3;

/**
 * Background-sync coordinator. Lives outside the service worker because our
 * scouting writes go through the Firebase SDK (which has its own offline
 * queue), not through `fetch`. The SW-level BackgroundSync API would be
 * redundant — what we actually need is a watcher that pushes pending Dexie
 * rows to Firestore as soon as connectivity returns.
 *
 * What it does:
 *   - Runs once on mount (catches up on entries captured in a previous session).
 *   - Subscribes to the `online` event; on reconnect, drains the Dexie
 *     pending queue.
 *   - Tracks per-entry attempts via recordSyncFailure for debugging.
 *
 * What it doesn't do:
 *   - Periodic polling. The `online` event + initial run cover the realistic
 *     transitions; polling would drain battery during long offline stretches.
 *   - Conflict resolution. Each pending row is a brand new match_scouting
 *     entry; the federated aggregator handles duplicate detection downstream.
 *
 * UI: a small pill in the bottom-right shows connection state + pending count.
 * Tap-to-retry is built in (forces an immediate drain).
 */
export default function OnlineSync() {
    const { user } = useAuth();
    const [online, setOnline] = useState(
        typeof navigator !== "undefined" ? navigator.onLine : true,
    );
    const [pendingCount, setPendingCount] = useState(0);
    const [syncing, setSyncing] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);
    const consecutiveFailuresRef = useRef(0);
    const notifiedForCurrentStreakRef = useRef(false);
    // Real mutual-exclusion lock for drain(). `syncing` state alone isn't
    // enough — setSyncing(true) doesn't take effect until the next render,
    // so two calls fired in the same tick (e.g. the online-event handler and
    // a user tap-to-retry) both pass the `!syncing` check and drain
    // concurrently, racing on the same Dexie rows. A ref is synchronous.
    const drainingRef = useRef(false);
    // Mirrors pendingCount without being a dependency of drain() — pendingCount
    // changes every 5s poll, and having drain() depend on it would recreate
    // the callback (and re-run the effects that depend on it) on every tick.
    const pendingCountRef = useRef(0);

    const refreshPendingCount = useCallback(async () => {
        try {
            const items = await getPendingScouting();
            pendingCountRef.current = items.length;
            setPendingCount(items.length);
        } catch {
            // Dexie not ready yet; ignore.
        }
    }, []);

    const drain = useCallback(async () => {
        if (!user || drainingRef.current) return;
        drainingRef.current = true;
        setSyncing(true);
        setLastError(null);
        let failed = false;
        try {
            const rows = await getPendingScoutingRows();
            for (const row of rows) {
                // Dead-letter: this entry has failed repeatedly (malformed
                // payload, permission error, etc). Skip it permanently instead
                // of retrying forever and blocking everything queued behind it.
                if (row.syncAttempts >= MAX_SYNC_ATTEMPTS) continue;
                try {
                    // Use the stable Dexie local id as the Firestore document id
                    // so an interrupted drain (write committed, markAsSynced not
                    // yet run) re-converges to the SAME doc instead of creating a
                    // duplicate. saveMatchScouting is create-if-not-exists.
                    await saveMatchScouting(row.data, row.id);
                    await markAsSynced(row.id);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    await recordSyncFailure(row.id, msg);
                    setLastError(msg);
                    failed = true;
                    // Keep draining the rest of the queue — one bad entry
                    // (poison pill) shouldn't block every other pending entry.
                }
            }
            await refreshPendingCount();
        } finally {
            setSyncing(false);
            drainingRef.current = false;
        }

        // Track consecutive-failure streak so we only ping Discord after
        // sustained issues. Resets on the next successful drain.
        if (failed) {
            consecutiveFailuresRef.current += 1;
            if (
                consecutiveFailuresRef.current >= SYNC_FAILURE_NOTIFY_THRESHOLD &&
                !notifiedForCurrentStreakRef.current
            ) {
                notifiedForCurrentStreakRef.current = true;
                try {
                    const idToken = await user.getIdToken();
                    await notifyDiscordAction({
                        idToken,
                        title: "Sync de scouting bloqueado",
                        description:
                            `Hay ${pendingCountRef.current} entradas pendientes que llevan ${consecutiveFailuresRef.current} intentos fallidos. ` +
                            "Revisa la conexión del scout o el estado de Firestore.",
                        severity: "error",
                    });
                } catch {
                    // Best-effort — never let a Discord ping failure break the app.
                }
            }
        } else {
            consecutiveFailuresRef.current = 0;
            notifiedForCurrentStreakRef.current = false;
        }
    }, [user, refreshPendingCount]);

    // Initial count + connectivity listeners.
    useEffect(() => {
        refreshPendingCount();
        // Housekeeping: drop SWR cache entries older than the default max age.
        // OnlineSync mounts once per session (root layout), so this is the one
        // place that keeps FTCStatsClientCache from growing without bound.
        cachePruneOlderThan().catch(() => { /* Dexie unavailable — ignore */ });
        const onOnline = () => {
            setOnline(true);
            drain();
        };
        const onOffline = () => setOnline(false);
        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);
        return () => {
            window.removeEventListener("online", onOnline);
            window.removeEventListener("offline", onOffline);
        };
    }, [drain, refreshPendingCount]);

    // Catch-up drain on mount once we have a user (auth might load after
    // the network event already fired).
    useEffect(() => {
        if (user && online) drain();
    }, [user, online, drain]);

    // Poll the count every 5s while there's a user — Dexie writes from other
    // components (forms) don't notify us. Cheap enough.
    useEffect(() => {
        if (!user) return;
        const t = setInterval(refreshPendingCount, 5000);
        return () => clearInterval(t);
    }, [user, refreshPendingCount]);

    if (!user) return null;

    return (
        <button
            type="button"
            onClick={() => online && drain()}
            disabled={syncing || !online}
            className={clsx(
                "fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40",
                "flex items-center gap-2 px-3 py-2 rounded-full text-xs font-bold shadow-sm border transition-all",
                online
                    ? lastError
                        ? "bg-warning/20 border-warning/40 text-warning hover:bg-warning/30"
                        : pendingCount > 0
                            ? "bg-secondary/20 border-secondary/40 text-secondary hover:bg-secondary/30"
                            : "bg-success/15 border-success/30 text-success"
                    : "bg-muted border-border text-muted-foreground",
            )}
            title={
                online
                    ? pendingCount > 0
                        ? `Sincronizando ${pendingCount} pendientes — click para forzar`
                        : "Online · todo sincronizado"
                    : "Offline — los datos se guardan localmente y se enviarán al recuperar conexión"
            }
        >
            {syncing ? (
                <Loader2 size={13} className="animate-spin" />
            ) : !online ? (
                <CloudOff size={13} />
            ) : lastError ? (
                <AlertTriangle size={13} />
            ) : (
                <Cloud size={13} />
            )}
            <span>
                {!online
                    ? "Offline"
                    : syncing
                        ? `Sync ${pendingCount}`
                        : pendingCount > 0
                            ? `${pendingCount} pend.`
                            : "Online"}
            </span>
        </button>
    );
}
