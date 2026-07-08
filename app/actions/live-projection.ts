"use server";

import { fetchRankings, fetchMatches } from "@/lib/ftc-api";
import { projectFinalRankings, type LiveProjectionResult } from "@/lib/live-projection";

/**
 * Server action wrapper around `projectFinalRankings`. Pulls rankings and
 * matches via the cached FTC API helpers and runs the pure projection on
 * the server (avoids shipping the live data plus algorithm to the client).
 *
 * Cached fetches mean repeated calls during a live event are cheap — the
 * Smart TTL keeps active-event data fresh at ~60s.
 */
export async function fetchLiveProjectionAction(input: {
    season: number;
    eventCode: string;
}): Promise<
    | { ok: true; result: LiveProjectionResult }
    | { ok: false; error: string }
> {
    const { season, eventCode } = input;
    if (!eventCode) return { ok: false, error: "Falta eventCode" };
    try {
        const [rankings, matches] = await Promise.all([
            fetchRankings(season, eventCode),
            fetchMatches(season, eventCode),
        ]);
        const result = projectFinalRankings(rankings, matches, eventCode);
        return { ok: true, result };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Error desconocido";
        return { ok: false, error: message };
    }
}
