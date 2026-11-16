import { describe, it, expect } from "vitest";
import { projectFinalRankings, eventStrengthModel } from "./live-projection";
import { winProbabilityFromNormalModel } from "./win-probability";
import type { TeamRanking, FTCMatch } from "@/types/scouting";
import type { StartingPoints } from "./starting-points";

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
        // Winning out keeps the average at 3 — v1 projected "12" as if RS were a
        // total. With 2 matches of evidence the model is not certain they win out.
        expect(top.projectedFinalRS).toBeGreaterThan(2);
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
            expect(p.pCaptain).toBeGreaterThanOrEqual(0);
            expect(p.pCaptain).toBeLessThanOrEqual(1);
            expect(p.rankRange[0]).toBeLessThanOrEqual(p.rankRange[1]);
        }
        // Projected ranks are a real ranking: a permutation of 1..N.
        expect(a.teamProjections.map(p => p.projectedFinalRank).sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6]);
        // Captain probabilities sum to the number of captain slots (4 here).
        expect(a.captainSlots).toBe(4);
        expect(a.teamProjections.reduce((s, p) => s + p.pCaptain, 0)).toBeCloseTo(4, 6);
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

    it("is less sure early in the event, never flips the favorite (decision #109)", () => {
        const m = (n: number) => ({ ...match({ matchNumber: n, redTeams: [1], blueTeams: [2], played: true }), scoreRedFinal: 80, scoreBlueFinal: 40, scoreRedFoul: 0, scoreBlueFoul: 0 }) as FTCMatch;
        const few = eventStrengthModel([m(1), m(2)]);
        const many = eventStrengthModel(Array.from({ length: 10 }, (_, i) => m(i + 1)));
        // Un-inflated normal model on the same strengths and σ.
        const raw = (mdl: typeof few) => winProbabilityFromNormalModel(mdl.strength(1), mdl.strength(2), mdl.sigmaDiff);
        expect(few.pRed([1], [2])).toBeGreaterThan(0.5);
        // The inflation shrinks toward 50% more with 2 matches played than with 10.
        expect(few.pRed([1], [2]) - 0.5).toBeLessThan(raw(few) - 0.5);
        const shrinkFew = (few.pRed([1], [2]) - 0.5) / (raw(few) - 0.5);
        const shrinkMany = (many.pRed([1], [2]) - 0.5) / (raw(many) - 0.5);
        expect(shrinkFew).toBeLessThan(shrinkMany);
    });
});

describe("eventStrengthModel with starting points (#117)", () => {
    const start = { v: 1 as const, inSeason: { 1: 20, 2: -20 }, history: { 3: 1, 4: -1 }, mu0Hint: 40 };
    const m = (n: number, red: number[], blue: number[], rs: number, bs: number) =>
        ({ ...match({ matchNumber: n, redTeams: red, blueTeams: blue, played: true }), scoreRedFinal: rs, scoreBlueFinal: bs, scoreRedFoul: 0, scoreBlueFoul: 0 }) as FTCMatch;

    it("forecasts before any match is played, favoring the better starting point", () => {
        const model = eventStrengthModel([], start);
        expect(model.pRed([1], [2])).toBeGreaterThan(0.6);
        expect(model.pRed([3], [4])).toBeGreaterThan(0.5);
        expect(model.strength(1)).toBe(60);
        expect(model.strength(9)).toBe(40); // unknown robot = average robot
        // Without starting points nothing is known yet.
        expect(eventStrengthModel([]).pRed([1], [2])).toBeCloseTo(0.5, 6);
    });

    it("the event's own results take over as quals are played", () => {
        // Robot 2 started worse but keeps beating robot 1 by 40.
        const played = Array.from({ length: 12 }, (_, i) => m(i + 1, [2], [1], 80, 40));
        const model = eventStrengthModel(played, start);
        expect(model.strength(2)).toBeGreaterThan(model.strength(1));
        expect(model.pRed([2], [1])).toBeGreaterThan(0.6);
    });

    it("null or empty starting points behave exactly as before", () => {
        const played = [m(1, [1], [2], 80, 40), m(2, [1], [3], 70, 50), m(3, [2], [3], 60, 55)];
        const base = eventStrengthModel(played);
        const variants: (StartingPoints | null | undefined)[] = [null, undefined, { v: 1, inSeason: {}, history: {}, mu0Hint: 40 }, { v: 1, inSeason: { 1: 5 }, history: {}, mu0Hint: 0 }];
        for (const s of variants) {
            const other = eventStrengthModel(played, s);
            for (const t of [1, 2, 3, 99]) expect(other.strength(t)).toBe(base.strength(t));
            for (const [r, b] of [[[1], [2]], [[2], [3]], [[1, 99], [3, 2]]]) expect(other.pRed(r, b)).toBe(base.pRed(r, b));
            expect(other.sigmaDiff).toBe(base.sigmaDiff);
        }
    });
});

describe("projectFinalRankings robustness (review of #95)", () => {
    it("reports insufficient data when the match list is unavailable", () => {
        const res = projectFinalRankings(
            [ranking({ rank: 1, teamNumber: 1, sortOrder1: 3, matchesPlayed: 2, wins: 2 }), ranking({ rank: 2, teamNumber: 2, sortOrder1: 0, matchesPlayed: 2 })],
            [],
            "X",
        );
        expect(res.insufficientData).toBe(true);
        expect(res.teamProjections).toEqual([]);
    });
    it("gives teams with no counted match the average-robot strength, not 0", () => {
        const played = [
            { ...match({ matchNumber: 1, redTeams: [1, 2], blueTeams: [3, 4], played: true }), scoreRedFinal: 60, scoreBlueFinal: 40 } as FTCMatch,
            { ...match({ matchNumber: 2, redTeams: [1, 3], blueTeams: [2, 4], played: true }), scoreRedFinal: 50, scoreBlueFinal: 50 } as FTCMatch,
        ];
        const model = eventStrengthModel(played);
        const unseen = model.strength(99);
        expect(unseen).toBeGreaterThan(20);
        expect(unseen).toBeLessThan(30);
    });
    it("ranges widen with uncertainty: a mid-pack team is not pinned to one rank", () => {
        const teams = [1, 2, 3, 4, 5, 6, 7, 8];
        const sched: FTCMatch[] = [];
        let n = 1;
        for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) {
            const rot = teams.map((_, i) => teams[(i + r * 3 + k) % 8]);
            sched.push(match({ matchNumber: n++, redTeams: [rot[0], rot[1]], blueTeams: [rot[2], rot[3]], played: r < 2 }));
            sched.push(match({ matchNumber: n++, redTeams: [rot[4], rot[5]], blueTeams: [rot[6], rot[7]], played: r < 2 }));
        }
        const rankings = teams.map((t, i) => ranking({ rank: i + 1, teamNumber: t, sortOrder1: 4 - i * 0.4, sortOrder2: 60 - i, matchesPlayed: 2, wins: i < 4 ? 2 : 1 }));
        const res = projectFinalRankings(rankings, sched, "X");
        const mid = res.teamProjections.find(p => p.teamNumber === 4)!;
        expect(mid.rankRange[1] - mid.rankRange[0]).toBeGreaterThanOrEqual(1);
    });
});
