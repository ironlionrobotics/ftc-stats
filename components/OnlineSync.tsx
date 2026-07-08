"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    getPendingScouting,
    markAsSynced,
    recordSyncFailure,
} from "@/lib/localDatabase";
import { saveMatchScouting } from "@/lib/scouting-service";
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

    const refreshPendingCount = useCallback(async () => {
        try {
            const items = await getPendingScouting();
            setPendingCount(items.length);
        } catch {
            // Dexie not ready yet; ignore.
        }
    }, []);

    const drain = useCallback(async () => {
        if (!user || syncing) return;
        setSyncing(true);
        setLastError(null);
        let failed = false;
        try {
            const items = await getPendingScouting();
            for (const entry of items) {
                if (!entry.id) continue;
                try {
                    // Use the stable Dexie local id as the Firestore document id
                    // so an interrupted drain (write committed, markAsSynced not
                    // yet run) re-converges to the SAME doc instead of creating a
                    // duplicate. saveMatchScouting is create-if-not-exists.
                    await saveMatchScouting(entry, entry.id);
                    await markAsSynced(entry.id);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    await recordSyncFailure(entry.id, msg);
                    setLastError(msg);
                    failed = true;
                    // Stop on first failure — likely a connectivity blip; we'll
                    // retry on the next online event rather than burn through
                    // every entry against the same broken connection.
                    break;
                }
            }
            await refreshPendingCount();
        } finally {
            setSyncing(false);
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
                            `Hay ${pendingCount} entradas pendientes que llevan ${consecutiveFailuresRef.current} intentos fallidos. ` +
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
    }, [user, syncing, refreshPendingCount, pendingCount]);

    // Initial count + connectivity listeners.
    useEffect(() => {
        refreshPendingCount();
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
                "flex items-center gap-2 px-3 py-2 rounded-full text-xs font-bold shadow-2xl border backdrop-blur-md transition-all",
                online
                    ? lastError
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-200 hover:bg-amber-500/30"
                        : pendingCount > 0
                            ? "bg-blue-500/20 border-blue-500/40 text-blue-200 hover:bg-blue-500/30"
                            : "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                    : "bg-gray-700/30 border-gray-500/30 text-gray-300",
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
