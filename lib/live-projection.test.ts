import { describe, it, expect } from "vitest";
import { projectFinalRankings, eventStrengthModel } from "./live-projection";
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

    it("treats the Ranking Score as an average, not a running total (v1 bug)", () => {
        const matches = [
            match({ matchNumber: 1, redTeams: [30311], blueTeams: [99], played: true }),
            match({ matchNumber: 2, redTeams: [30311], blueTeams: [99], played: true }),
            match({ matchNumber: 3, redTeams: [30311], blueTeams: [99], played: false }),
            match({ matchNumber: 4, redTeams: [30311], blueTeams: [99], played: false }),
        ];
        const result = projectFinalRankings(
            [
                ranking({ rank: 1, teamNumber: 30311, sortOrder1: 3, matchesPlayed: 2, wins: 2 }),
                ranking({ rank: 2, teamNumber: 99, sortOrder1: 0, matchesPlayed: 2, losses: 2 }),
            ],
            matches,
            "MXTOL",
        );
        const top = result.teamProjections.find(p => p.teamNumber === 30311)!;
        expect(top.matchesPlayed).toBe(2);
        expect(top.matchesScheduled).toBe(4);
        expect(top.matchesRemaining).toBe(2);
        expect(top.avgRPperMatch).toBe(3);
        expect(top.currentRP).toBe(6);
        // Winning out keeps the average at 3 — v1 projected "12" as if RS were a total.
        expect(top.projectedFinalRS).toBeGreaterThan(2.5);
        expect(top.projectedFinalRS).toBeLessThanOrEqual(3 + 1e-9);
        expect(top.projectedFinalRank).toBe(1);
    });

    it("does not inflate teams that have played fewer matches", () => {
        // A: 3/3 wins, B: 1/1 win — same RS 3. v1 extrapolated B to 16 vs A 12.
        const matches = [
            match({ matchNumber: 1, redTeams: [1], blueTeams: [99], played: true }),
            match({ matchNumber: 2, redTeams: [1], blueTeams: [99], played: true }),
            match({ matchNumber: 3, redTeams: [1], blueTeams: [99], played: true }),
            match({ matchNumber: 4, redTeams: [1], blueTeams: [99], played: false }),
            match({ matchNumber: 5, redTeams: [2], blueTeams: [99], played: true }),
            match({ matchNumber: 6, redTeams: [2], blueTeams: [99], played: false }),
            match({ matchNumber: 7, redTeams: [2], blueTeams: [99], played: false }),
            match({ matchNumber: 8, redTeams: [2], blueTeams: [99], played: false }),
        ];
        const result = projectFinalRankings(
            [
                ranking({ rank: 1, teamNumber: 1, sortOrder1: 3, matchesPlayed: 3, wins: 3 }),
                ranking({ rank: 2, teamNumber: 2, sortOrder1: 3, matchesPlayed: 1, wins: 1 }),
                ranking({ rank: 3, teamNumber: 99, sortOrder1: 0, matchesPlayed: 4, losses: 4 }),
            ],
            matches,
            "MXTOL",
        );
        for (const p of result.teamProjections) expect(p.projectedFinalRS).toBeLessThanOrEqual(3 + 1e-9);
        const b = result.teamProjections.find(p => p.teamNumber === 2)!;
        expect(b.projectedFinalRP).toBeLessThanOrEqual(12 + 1e-9);
    });

    it("is deterministic and reports a coherent rank distribution", () => {
        const teams = [1, 2, 3, 4, 5, 6];
        const matches = [
            match({ matchNumber: 1, redTeams: [1, 2], blueTeams: [3, 4], played: true }),
            match({ matchNumber: 2, redTeams: [5, 6], blueTeams: [1, 3], played: true }),
            match({ matchNumber: 3, redTeams: [2, 4], blueTeams: [5, 6], played: true }),
            match({ matchNumber: 4, redTeams: [1, 5], blueTeams: [2, 6], played: false }),
            match({ matchNumber: 5, redTeams: [3, 6], blueTeams: [4, 5], played: false }),
        ];
        const rankings = teams.map((t, i) => ranking({ rank: i + 1, teamNumber: t, sortOrder1: 3 - i * 0.5, sortOrder2: 50 - i, matchesPlayed: 2, wins: Math.max(0, 2 - Math.floor(i / 2)) }));
        const a = projectFinalRankings(rankings, matches, "X");
        const b = projectFinalRankings(rankings, matches, "X");
        expect(a).toEqual(b);
        for (const p of a.teamProjections) {
            expect(p.pTop4).toBeGreaterThanOrEqual(0);
            expect(p.pTop4).toBeLessThanOrEqual(1);
            expect(p.rankRange[0]).toBeLessThanOrEqual(p.projectedFinalRank);
            expect(p.projectedFinalRank).toBeLessThanOrEqual(p.rankRange[1]);
        }
        // Top-4 probabilities sum to 4 (exactly four teams are top 4 in each run).
        expect(a.teamProjections.reduce((s, p) => s + p.pTop4, 0)).toBeCloseTo(4, 6);
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
        // Same RS and no remaining matches: the second sort order (TB2) decides.
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

describe("projectFinalRankings on real data (AUBRQ1 2026)", () => {
    // Real FIRST API responses fetched 2026-11-13. With every qual played the
    // projection must reproduce the official ranking exactly: RS as an
    // average, surrogate appearances excluded, and the official tiebreakers.
    it("reproduces the official final ranking when quals are complete", async () => {
        const rankings = (await import("@/lib/__fixtures__/rankings-2026-AUBRQ1.json")).default.rankings as unknown as TeamRanking[];
        const matches = ((await import("@/lib/__fixtures__/matches-2026-AUBRQ1-qual-full.json")).default.matches as unknown as FTCMatch[])
            .map(m => ({ ...m, tournamentLevel: "QUALIFICATION" }) as FTCMatch);
        const res = projectFinalRankings(rankings, matches, "AUBRQ1");
        for (const p of res.teamProjections) {
            expect(p.projectedFinalRank).toBe(p.currentRank);
            expect(p.matchesRemaining).toBe(0);
        }
    });
});

describe("eventStrengthModel", () => {
    it("scores alliances without the foul points they RECEIVED (decision #48)", () => {
        // Red 100 final but 30 of it came from Blue's fouls (scoreBlueFoul = 30): red np = 70.
        const m = { ...match({ matchNumber: 1, redTeams: [1], blueTeams: [2], played: true }), scoreRedFinal: 100, scoreBlueFinal: 60, scoreRedFoul: 0, scoreBlueFoul: 30 } as FTCMatch;
        const model = eventStrengthModel([m, { ...m, matchNumber: 2 }, { ...m, matchNumber: 3 }]);
        expect(model.strength(1)).toBeGreaterThan(model.strength(2));
        // With λ=1 ridge the estimates shrink a bit toward the prior, but red's
        // np (70) must be what is learned, not 100.
        expect(model.strength(1)).toBeLessThan(75);
        expect(model.pRed([1], [2])).toBeGreaterThan(0.5);
    });
});
