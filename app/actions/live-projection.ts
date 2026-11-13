"use server";

import { allowRequest } from "@/lib/request-guard";
import { isValidSeason, normalizeEventCode } from "@/lib/input-guards";
import { getCurrentSeason } from "@/lib/constants";
import { fetchRankings, fetchMatches } from "@/lib/ftc-api";
import { projectFinalRankings, type LiveProjectionResult } from "@/lib/live-projection";
import { seasonRulesFor } from "@/lib/games/season-rules";

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
    const season = input?.season;
    const eventCode = normalizeEventCode(input?.eventCode);
    if (!eventCode || !isValidSeason(season, getCurrentSeason())) return { ok: false, error: "invalid input" };
    if (!(await allowRequest("light"))) return { ok: false, error: "rate limited" };
    try {
        const [rankings, matches] = await Promise.all([
            fetchRankings(season, eventCode),
            fetchMatches(season, eventCode),
        ]);
        const rules = seasonRulesFor(season);
        const result = projectFinalRankings(rankings, matches, eventCode, { winRp: rules.winRp, tieRp: rules.tieRp });
        return { ok: true, result };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Error desconocido";
        return { ok: false, error: message };
    }
}
