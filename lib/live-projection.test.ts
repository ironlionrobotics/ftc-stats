import { describe, it, expect } from "vitest";
import { projectFinalRankings } from "./live-projection";
import type { TeamRanking, FTCMatch } from "@/types/scouting";

function ranking(overrides: Partial<TeamRanking> & Pick<TeamRanking, "rank" | "teamNumber">): TeamRanking {
    return {
        teamName: `Team ${overrides.teamNumber}`,
        displayTeamNumber: String(overrides.teamNumber),
        sortOrder1: 0,
        sortOrder2: 0,
        sortOrder3: 0,
        sortOrder4: 0,
        sortOrder5: 0,
        sortOrder6: 0,
        wins: 0,
        losses: 0,
        ties: 0,
        qualAverage: 0,
        dq: 0,
        matchesPlayed: 0,
        matchesCounted: 0,
        ...overrides,
    };
}

function match(opts: {
    matchNumber: number;
    redTeams: number[];
    blueTeams: number[];
    played?: boolean;
}): FTCMatch {
    const stationFor = (color: "Red" | "Blue", idx: number) => `${color}${idx + 1}` as const;
    return {
        description: `Q${opts.matchNumber}`,
        matchNumber: opts.matchNumber,
        tournamentLevel: "QUALIFICATION",
        scoreRedFinal: opts.played ? 100 : 0,
        scoreBlueFinal: opts.played ? 80 : 0,
        scoreRedAuto: 0,
        scoreBlueAuto: 0,
        scoreRedFoul: 0,
        scoreBlueFoul: 0,
        scoreRedRp1: 0,
        scoreRedRp2: 0,
        scoreBlueRp1: 0,
        scoreBlueRp2: 0,
        teams: [
            ...opts.redTeams.map((tn, i) => ({
                teamNumber: tn,
                station: stationFor("Red", i),
                dq: false,
                onField: true,
                yellowCard: false,
                redCard: false,
            })),
            ...opts.blueTeams.map((tn, i) => ({
                teamNumber: tn,
                station: stationFor("Blue", i),
                dq: false,
                onField: true,
                yellowCard: false,
                redCard: false,
            })),
        ],
        postResultTime: opts.played ? new Date().toISOString() : undefined,
    } as FTCMatch;
}

describe("projectFinalRankings", () => {
    it("flags insufficient data when nothing has been played", () => {
        const result = projectFinalRankings(
            [ranking({ rank: 1, teamNumber: 30311 })],
            [],
            "MXTOL",
        );
        expect(result.insufficientData).toBe(true);
        expect(result.teamProjections).toHaveLength(0);
    });

    it("linearly extrapolates a single team's RP", () => {
        const matches = [
            match({ matchNumber: 1, redTeams: [30311], blueTeams: [99], played: true }),
            match({ matchNumber: 2, redTeams: [30311], blueTeams: [99], played: true }),
            match({ matchNumber: 3, redTeams: [30311], blueTeams: [99], played: false }),
            match({ matchNumber: 4, redTeams: [30311], blueTeams: [99], played: false }),
        ];
        const result = projectFinalRankings(
            [
                ranking({ rank: 1, teamNumber: 30311, sortOrder1: 6, matchesPlayed: 2 }),
                ranking({ rank: 2, teamNumber: 99, sortOrder1: 0, matchesPlayed: 2 }),
            ],
            matches,
            "MXTOL",
        );
        const top = result.teamProjections.find(p => p.teamNumber === 30311)!;
        expect(top.matchesPlayed).toBe(2);
        expect(top.matchesScheduled).toBe(4);
        expect(top.matchesRemaining).toBe(2);
        expect(top.avgRPperMatch).toBe(3);
        // projectedFinal = 6 + 3*2 = 12
        expect(top.projectedFinalRP).toBe(12);
    });

    it("reorders rankings when projection inverts current standings", () => {
        // Team A: 3 quals played (RP=9 → 3/match), 1 remaining → projected = 9 + 3 = 12
        // Team B: 1 qual played (RP=4 → 4/match), 3 remaining → projected = 4 + 12 = 16
        // B overtakes A.
        const matches = [
            // Team A plays in matches 1-4 (4 total)
            match({ matchNumber: 1, redTeams: [1], blueTeams: [99], played: true }),
            match({ matchNumber: 2, redTeams: [1], blueTeams: [99], played: true }),
            match({ matchNumber: 3, redTeams: [1], blueTeams: [99], played: true }),
            match({ matchNumber: 4, redTeams: [1], blueTeams: [99], played: false }),
            // Team B plays in matches 5-8 (4 total)
            match({ matchNumber: 5, redTeams: [2], blueTeams: [99], played: true }),
            match({ matchNumber: 6, redTeams: [2], blueTeams: [99], played: false }),
            match({ matchNumber: 7, redTeams: [2], blueTeams: [99], played: false }),
            match({ matchNumber: 8, redTeams: [2], blueTeams: [99], played: false }),
        ];
        const result = projectFinalRankings(
            [
                ranking({ rank: 1, teamNumber: 1, sortOrder1: 9, matchesPlayed: 3 }),
                ranking({ rank: 2, teamNumber: 2, sortOrder1: 4, matchesPlayed: 1 }),
            ],
            matches,
            "MXTOL",
        );
        const a = result.teamProjections.find(p => p.teamNumber === 1)!;
        const b = result.teamProjections.find(p => p.teamNumber === 2)!;
        expect(b.projectedFinalRP).toBeGreaterThan(a.projectedFinalRP);
        expect(b.projectedFinalRank).toBe(1);
        expect(a.projectedFinalRank).toBe(2);
        // rankDelta: A was 1, projected 2 → -1 (dropped). B was 2, projected 1 → +1 (climbed).
        expect(a.rankDelta).toBe(-1);
        expect(b.rankDelta).toBe(1);
    });

    it("uses TBP1 to break ties on projected RP", () => {
        const matches = [
            match({ matchNumber: 1, redTeams: [1], blueTeams: [2], played: true }),
            match({ matchNumber: 2, redTeams: [1], blueTeams: [2], played: true }),
        ];
        const result = projectFinalRankings(
            [
                ranking({ rank: 2, teamNumber: 1, sortOrder1: 4, sortOrder2: 10, matchesPlayed: 2 }),
                ranking({ rank: 1, teamNumber: 2, sortOrder1: 4, sortOrder2: 25, matchesPlayed: 2 }),
            ],
            matches,
            "MXTOL",
        );
        // Both project to same final RP (no remaining matches). TBP1 wins.
        const t1 = result.teamProjections.find(p => p.teamNumber === 1)!;
        const t2 = result.teamProjections.find(p => p.teamNumber === 2)!;
        expect(t2.projectedFinalRank).toBe(1);
        expect(t1.projectedFinalRank).toBe(2);
    });

    it("returns 0 remaining matches when all quals are played", () => {
        const matches = [
            match({ matchNumber: 1, redTeams: [1, 2], blueTeams: [3, 4], played: true }),
            match({ matchNumber: 2, redTeams: [3, 4], blueTeams: [1, 2], played: true }),
        ];
        const result = projectFinalRankings(
            [
                ranking({ rank: 1, teamNumber: 1, sortOrder1: 4, matchesPlayed: 2 }),
                ranking({ rank: 2, teamNumber: 2, sortOrder1: 3, matchesPlayed: 2 }),
                ranking({ rank: 3, teamNumber: 3, sortOrder1: 2, matchesPlayed: 2 }),
                ranking({ rank: 4, teamNumber: 4, sortOrder1: 1, matchesPlayed: 2 }),
            ],
            matches,
            "MXTOL",
        );
        for (const p of result.teamProjections) {
            expect(p.matchesRemaining).toBe(0);
            expect(p.projectedFinalRP).toBe(p.currentRP);
        }
    });

    it("counts qualMatches at the event level for the result header", () => {
        const matches = [
            match({ matchNumber: 1, redTeams: [1], blueTeams: [2], played: true }),
            match({ matchNumber: 2, redTeams: [1], blueTeams: [2], played: false }),
            match({ matchNumber: 3, redTeams: [1], blueTeams: [2], played: false }),
        ];
        const result = projectFinalRankings(
            [ranking({ rank: 1, teamNumber: 1, sortOrder1: 2, matchesPlayed: 1 })],
            matches,
            "MXTOL",
        );
        expect(result.qualMatchesTotal).toBe(3);
        expect(result.qualMatchesPlayed).toBe(1);
    });
});
