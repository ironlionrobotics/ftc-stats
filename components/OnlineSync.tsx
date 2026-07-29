"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import {
    getPendingScoutingRows,
    getLivePendingScoutingRows,
    getStuckScoutingRows,
    markAsSynced,
    recordSyncFailure,
    retryStuckRow,
    retryAllStuckRows,
    getPendingPitRows,
    getLivePendingPitRows,
    getStuckPitRows,
    markPitAsSynced,
    recordPitSyncFailure,
    retryStuckPitRow,
    retryAllStuckPitRows,
    MAX_SYNC_ATTEMPTS,
    type PendingMatchRow,
    type PendingPitRow,
} from "@/lib/localDatabase";
import { saveMatchScouting, savePitScouting } from "@/lib/scouting-service";
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
 * The dead-letter inspector shows both queues in one list. Match and pit rows
 * have different shapes (a pit row has no matchNumber/eventCode), so we tag
 * each with its origin instead of merging into one loosely-typed row —
 * callers pattern-match on `kind` to know which local-db functions to call
 * and how to render/label it ("Match N" vs "Pit").
 */
type StuckRow =
    | { kind: "match"; row: PendingMatchRow }
    | { kind: "pit"; row: PendingPitRow };

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
    // Dead-lettered rows (syncAttempts >= MAX_SYNC_ATTEMPTS) are tracked
    // separately from pendingCount — they must NOT inflate the "N pend."
    // badge, since drain() will never pick them up on its own again.
    const [stuckCount, setStuckCount] = useState(0);
    const [stuckRows, setStuckRows] = useState<StuckRow[]>([]);
    const [showStuckPanel, setShowStuckPanel] = useState(false);
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
            // Fetched together so the badge and the stuck indicator always
            // reflect the same snapshot of BOTH queues (match + pit).
            const [liveMatches, stuckMatches, livePits, stuckPits] = await Promise.all([
                getLivePendingScoutingRows(),
                getStuckScoutingRows(),
                getLivePendingPitRows(),
                getStuckPitRows(),
            ]);
            const liveTotal = liveMatches.length + livePits.length;
            pendingCountRef.current = liveTotal;
            setPendingCount(liveTotal);
            const combinedStuck: StuckRow[] = [
                ...stuckMatches.map((row): StuckRow => ({ kind: "match", row })),
                ...stuckPits.map((row): StuckRow => ({ kind: "pit", row })),
            ];
            setStuckCount(combinedStuck.length);
            setStuckRows(combinedStuck);
        } catch {
            // Dexie not ready yet; ignore.
        }
    }, []);

    // The inspector panel only makes sense while there's something stuck to
    // show — auto-close it once the last entry has been retried/exported.
    useEffect(() => {
        if (stuckCount === 0) setShowStuckPanel(false);
    }, [stuckCount]);

    const drain = useCallback(async () => {
        if (!user || drainingRef.current) return;
        drainingRef.current = true;
        setSyncing(true);
        setLastError(null);
        let failed = false;
        try {
            // Both queues are drained in the same pass — a bad row in either
            // one must not block the other (or the rest of its own queue).
            const [matchRows, pitRows] = await Promise.all([
                getPendingScoutingRows(),
                getPendingPitRows(),
            ]);
            for (const row of matchRows) {
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
            for (const row of pitRows) {
                // Same poison-pill semantics as match rows above.
                if (row.syncAttempts >= MAX_SYNC_ATTEMPTS) continue;
                try {
                    // savePitScouting itself is idempotent (setDoc with merge
                    // on the deterministic season+team+org doc id), so unlike
                    // match scouting there's no separate docId param needed —
                    // re-sending the same queued row can never create a dup.
                    await savePitScouting(row.data);
                    await markPitAsSynced(row.id);
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    await recordPitSyncFailure(row.id, msg);
                    setLastError(msg);
                    failed = true;
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

    const handleRetryOne = async (item: StuckRow) => {
        // Resetting only clears the dead-letter flag; the actual re-send
        // happens on the next drain(). We trigger one immediately here (same
        // gesture as tap-to-retry on the main pill) so a scout sees it move
        // right away instead of waiting for the next `online` event or the
        // 5s poll.
        if (item.kind === "match") {
            await retryStuckRow(item.row.id);
        } else {
            await retryStuckPitRow(item.row.id);
        }
        await refreshPendingCount();
        if (online) drain();
    };

    const handleRetryAll = async () => {
        await Promise.all([retryAllStuckRows(), retryAllStuckPitRows()]);
        await refreshPendingCount();
        if (online) drain();
    };

    const handleExportStuck = () => {
        if (stuckRows.length === 0) return;
        // Escape hatch for data that transient retries can't fix (expired
        // token, a rules deploy mid-event, etc). Must work with no network —
        // it only reads from Dexie and triggers a client-side download.
        // Covers both queues; `kind` tags which one each entry came from
        // since pit rows have no matchNumber/eventCode.
        const payload = stuckRows.map(item => {
            if (item.kind === "match") {
                const r = item.row;
                return {
                    kind: "match" as const,
                    id: r.id,
                    teamNumber: r.teamNumber,
                    matchNumber: r.matchNumber,
                    eventCode: r.eventCode,
                    scoutId: r.scoutId,
                    orgId: r.orgId,
                    season: r.season,
                    program: r.program,
                    createdAt: r.createdAt,
                    syncAttempts: r.syncAttempts,
                    lastError: r.lastError,
                    data: r.data,
                };
            }
            const r = item.row;
            return {
                kind: "pit" as const,
                id: r.id,
                teamNumber: r.teamNumber,
                orgId: r.orgId,
                season: r.season,
                createdAt: r.createdAt,
                syncAttempts: r.syncAttempts,
                lastError: r.lastError,
                data: r.data,
            };
        });
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const eventCodes = Array.from(
            new Set(stuckRows.map(item => (item.kind === "match" ? item.row.eventCode : `pit-${item.row.orgId}`))),
        ).join("-") || "sin-evento";
        const a = document.createElement("a");
        a.href = url;
        a.download = `pride-scouting-atascadas-${eventCodes}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

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
        <>
            {showStuckPanel && stuckRows.length > 0 && (
                <div
                    className={clsx(
                        // Clears the stuck pill (bottom-16/20 + its ~33px height)
                        // with breathing room instead of sitting flush on it.
                        "fixed bottom-28 right-4 md:bottom-32 md:right-6 z-50",
                        "w-[90vw] max-w-sm max-h-[70vh] overflow-y-auto",
                        "bg-card border border-border rounded-xl shadow-sm p-4 space-y-3",
                    )}
                >
                    <div className="flex items-start justify-between gap-2">
                        <h3 className="text-sm font-black text-foreground">Entradas atascadas</h3>
                        <button
                            type="button"
                            onClick={() => setShowStuckPanel(false)}
                            className="text-muted-foreground hover:text-foreground text-xs font-bold"
                        >
                            Cerrar
                        </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Fallaron {MAX_SYNC_ATTEMPTS}+ veces y ya no se reintentan solas. Reintenta si
                        el problema era temporal, o exporta el JSON para no perder la captura.
                    </p>
                    <div className="space-y-2">
                        {stuckRows.map(item => {
                            const row = item.row;
                            return (
                                <div
                                    key={`${item.kind}-${row.id}`}
                                    className="p-2 rounded-lg bg-muted border border-border text-xs space-y-1"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-bold text-foreground">
                                            Equipo {row.teamNumber} ·{" "}
                                            {item.kind === "match" ? `Match ${item.row.matchNumber}` : "Pit"}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => handleRetryOne(item)}
                                            className="px-2 py-1 rounded-md bg-secondary/20 text-secondary font-bold hover:bg-secondary/30 shrink-0"
                                        >
                                            Reintentar
                                        </button>
                                    </div>
                                    <div className="text-muted-foreground">
                                        {item.kind === "match" ? item.row.eventCode : `Org ${row.orgId}`} ·{" "}
                                        {new Date(row.createdAt).toLocaleString()}
                                    </div>
                                    {row.lastError && (
                                        <div className="text-danger break-words">{row.lastError}</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="flex gap-2 pt-1">
                        <button
                            type="button"
                            onClick={handleRetryAll}
                            className="flex-1 px-3 py-2 rounded-lg bg-secondary/20 text-secondary font-bold text-xs hover:bg-secondary/30"
                        >
                            Reintentar todas
                        </button>
                        <button
                            type="button"
                            onClick={handleExportStuck}
                            className="flex-1 px-3 py-2 rounded-lg bg-muted border border-border text-foreground font-bold text-xs hover:bg-muted/70"
                        >
                            Exportar JSON
                        </button>
                    </div>
                </div>
            )}

            {stuckCount > 0 && (
                <button
                    type="button"
                    onClick={() => setShowStuckPanel(v => !v)}
                    className={clsx(
                        "fixed bottom-16 right-4 md:bottom-20 md:right-6 z-40",
                        "flex items-center gap-2 px-3 py-2 rounded-full text-xs font-bold shadow-sm border transition-all",
                        "bg-danger/15 border-danger/40 text-danger hover:bg-danger/25",
                    )}
                    title={`${stuckCount} entrada${stuckCount === 1 ? "" : "s"} atascada${stuckCount === 1 ? "" : "s"} — click para revisar`}
                >
                    <AlertTriangle size={13} />
                    <span>{stuckCount} atascada{stuckCount === 1 ? "" : "s"}</span>
                </button>
            )}

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
        </>
    );
}
