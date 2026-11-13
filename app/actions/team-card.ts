"use server";

import { fetchTeamRankingsInSeason } from "@/lib/ftc-api";
import type { MeasuredStats } from "@/types/team-profile";

/**
 * Ground-truth stats for the Trading Card: rank, official W/L/T record, and
 * average net points, taken from the team's most recent event in official
 * FIRST results. These are the numbers a viewer checks the team's self-reported
 * point claims against — the anchor pure self-report tools lack.
 *
 * Best-effort: returns null if the FIRST API is unreachable or the team hasn't
 * played, in which case the card renders the self-report alone.
 *
 * (OPR / strength-of-schedule need event-wide aggregation; deferred — rank +
 * record + avg score already give the claimed-vs-measured juxtaposition.)
 */
export async function getMeasuredStatsAction(
    season: number,
    teamNumber: number,
): Promise<MeasuredStats | null> {
    try {
        const rankings = await fetchTeamRankingsInSeason(season, teamNumber);
        if (!rankings.length) return null;
        // Most recent event (FIRST API returns them in chronological order).
        const latest = rankings[rankings.length - 1];
        return {
            rank: latest.rank,
            record: { wins: latest.wins, losses: latest.losses, ties: latest.ties },
            avgScore: Math.round(latest.avgNP),
            eventCode: latest.eventCode,
            eventName: latest.eventName,
        };
    } catch {
        return null;
    }
}
