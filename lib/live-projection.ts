import type { TeamRanking, FTCMatch } from "@/types/scouting";

/**
 * Live ranking projection during an event.
 *
 * Use case: strategy lead asks "if my team keeps performing at this rate,
 * where do we end up?" The answer drives decisions like:
 *   - Pursue RPs aggressively vs play it safe
 *   - Push hard for a high seed or accept current spot
 *   - Identify nearby teams to leapfrog
 *
 * Algorithm (v1, linear extrapolation):
 *   1. For each team in rankings:
 *      - avgRPperMatch = currentRP / matchesPlayed
 *      - matchesRemaining = scheduled - played (counted from match list)
 *      - projectedFinalRP = currentRP + avgRPperMatch × matchesRemaining
 *   2. Re-sort all teams by projectedFinalRP (using current TBP1 as tiebreaker).
 *   3. Each team gets a projectedFinalRank and a rankDelta (climbed vs dropped).
 *
 * Limitations (documented for v2):
 *   - No opponent strength adjustment. A team about to play 3 weak teams will
 *     in reality outperform the average; we don't account for that.
 *   - Linear extrapolation ignores variance. A team with high variance has
 *     wide confidence intervals not captured here.
 *   - Tiebreaker projection (TBP1, TBP2) is held constant, which is
 *     conservative — those usually creep up with more matches played.
 *   - We don't simulate playoff seeding within alliances; this is qualification
 *     ranking only.
 */

export interface RankingProjection {
    teamNumber: number;
    teamName: string;
    currentRank: number;
    currentRP: number;
    currentTBP1: number;
    matchesPlayed: number;
    matchesScheduled: number;
    matchesRemaining: number;
    avgRPperMatch: number;
    projectedFinalRP: number;
    projectedFinalRank: number;
    /** Positive = climbed (improved from current rank). Negative = dropped. */
    rankDelta: number;
}

export interface LiveProjectionResult {
    eventCode: string;
    teamProjections: RankingProjection[];
    qualMatchesTotal: number;
    qualMatchesPlayed: number;
    /** Set when no qualification matches have been played yet. Caller can
     *  show "not enough data" instead of an all-zeros table. */
    insufficientData: boolean;
}

function isMatchPlayed(m: FTCMatch): boolean {
    if (m.postResultTime && m.postResultTime.length > 0) return true;
    return (m.scoreRedFinal ?? 0) + (m.scoreBlueFinal ?? 0) > 0;
}

export function projectFinalRankings(
    rankings: TeamRanking[],
    matches: FTCMatch[],
    eventCode: string,
): LiveProjectionResult {
    // Count scheduled vs played qualification matches per team.
    const counts = new Map<number, { played: number; scheduled: number }>();
    let qualMatchesTotal = 0;
    let qualMatchesPlayed = 0;

    for (const m of matches) {
        if (m.tournamentLevel !== "QUALIFICATION") continue;
        qualMatchesTotal += 1;
        const played = isMatchPlayed(m);
        if (played) qualMatchesPlayed += 1;
        for (const t of m.teams) {
            const entry = counts.get(t.teamNumber) ?? { played: 0, scheduled: 0 };
            entry.scheduled += 1;
            if (played) entry.played += 1;
            counts.set(t.teamNumber, entry);
        }
    }

    const insufficientData = rankings.length === 0 ||
        rankings.every(r => (r.matchesPlayed ?? 0) === 0);

    if (insufficientData) {
        return {
            eventCode,
            teamProjections: [],
            qualMatchesTotal,
            qualMatchesPlayed,
            insufficientData: true,
        };
    }

    // Build per-team projection (still in original rank order).
    const projections: RankingProjection[] = rankings.map(r => {
        const c = counts.get(r.teamNumber) ?? { played: r.matchesPlayed, scheduled: r.matchesPlayed };
        // Fall back to ranking's matchesPlayed when match data isn't loaded yet
        // (avoids producing fake "0 played" projections that nuke the average).
        const matchesPlayed = c.played || r.matchesPlayed;
        const matchesScheduled = Math.max(c.scheduled, matchesPlayed);
        const matchesRemaining = Math.max(0, matchesScheduled - matchesPlayed);
        const currentRP = r.sortOrder1 ?? 0;
        const avgRPperMatch = matchesPlayed > 0 ? currentRP / matchesPlayed : 0;
        const projectedFinalRP = currentRP + avgRPperMatch * matchesRemaining;
        return {
            teamNumber: r.teamNumber,
            teamName: r.teamName,
            currentRank: r.rank,
            currentRP,
            currentTBP1: r.sortOrder2 ?? 0,
            matchesPlayed,
            matchesScheduled,
            matchesRemaining,
            avgRPperMatch,
            projectedFinalRP,
            projectedFinalRank: 0, // computed in next step
            rankDelta: 0,
        };
    });

    // Re-sort by projected RP (TBP1 breaks ties — held constant from current).
    const sorted = [...projections].sort((a, b) => {
        if (b.projectedFinalRP !== a.projectedFinalRP) {
            return b.projectedFinalRP - a.projectedFinalRP;
        }
        return b.currentTBP1 - a.currentTBP1;
    });
    sorted.forEach((p, idx) => {
        const projectedRank = idx + 1;
        // Mutate in place — both arrays reference the same objects.
        p.projectedFinalRank = projectedRank;
        p.rankDelta = p.currentRank - projectedRank;
    });

    return {
        eventCode,
        teamProjections: sorted, // return SORTED so the UI shows the projected order
        qualMatchesTotal,
        qualMatchesPlayed,
        insufficientData: false,
    };
}
