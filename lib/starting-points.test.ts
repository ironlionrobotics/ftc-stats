import { describe, it, expect } from "vitest";
import {
    buildStartingPoints, eventTeamNumbers, hasStartingPoints, historyZ, HISTORY_COEFS, inSeasonOpr,
    maxTeamWithEvents, priorOf, STRENGTH_CV, teamSeasonProfiles, type ScoutEvent,
} from "./starting-points";

/** An official event with `n` robots whose OPR is 10·i (team 100+i), 5 quals each. */
function event(code: string, type: string, start: string, n: number, extra: Partial<ScoutEvent> = {}): ScoutEvent {
    return {
        code, type, start,
        teams: Array.from({ length: n }, (_, i) => ({ teamNumber: 100 + i, stats: { rank: n - i, qualMatchesPlayed: 5, opr: { totalPointsNp: 10 * i } } })),
        ...extra,
    };
}

describe("teamSeasonProfiles (#117)", () => {
    it("z of OPR within each official event, weighted by quals", () => {
        const p = teamSeasonProfiles([event("A", "Qualifier", "2025-11-01", 7)]);
        // OPR 0..60, mean 30: the best robot is above the mean, the worst below, the middle at 0.
        expect(p.get(106)!.zMean!).toBeGreaterThan(1);
        expect(p.get(100)!.zMean!).toBeLessThan(-1);
        expect(p.get(103)!.zMean!).toBeCloseTo(0, 10);
        expect(p.get(106)!.top4).toBe(true);
        expect(p.get(100)!.top4).toBe(false);
    });

    it("ignores scrimmages and events too small to compare", () => {
        const p = teamSeasonProfiles([event("S", "Scrimmage", "2025-10-01", 10), event("T", "Qualifier", "2025-10-02", 5)]);
        expect([...p.values()].every(x => x.zMean === null)).toBe(true);
    });

    it("reads achievements from awards and event types", () => {
        const p = teamSeasonProfiles([
            event("W", "FIRSTChampionship", "2026-04-20", 6, { awards: [{ type: "Winner", placement: 1, teamNumber: 105 }, { type: "Inspire", placement: 1, teamNumber: 104 }, { type: "Inspire", placement: 2, teamNumber: 103 }] }),
        ]);
        expect(p.get(105)).toMatchObject({ worlds: true, won: true, wonBig: true });
        expect(p.get(104)).toMatchObject({ inspire: true, won: false });
        expect(p.get(103)!.inspire).toBe(false); // only the Inspire winner (placement 1)
    });
});

describe("historyZ (#117)", () => {
    const strong = { zMean: 1.5, won: true, wonBig: true, worlds: true, premier: true, champ: true, inspire: true, finalist: false, top4: true };
    const weak = { zMean: -1, won: false, wonBig: false, worlds: false, premier: false, champ: false, inspire: false, finalist: false, top4: false };

    it("ranks a decorated veteran above an average one and a rookie below", () => {
        expect(historyZ(1, strong, strong)).toBeGreaterThan(historyZ(1, { ...weak, zMean: 0 }, { ...weak, zMean: 0 }));
        expect(historyZ(50000, undefined, undefined, undefined, 40000)).toBeCloseTo(HISTORY_COEFS[0] + HISTORY_COEFS[1], 10);
    });

    it("a strong team's bad year still predicts better than a weak team's (two seasons back counts)", () => {
        expect(historyZ(1, { ...weak, zMean: -0.5 }, strong)).toBeGreaterThan(historyZ(1, { ...weak, zMean: -0.5 }, weak));
    });

    it("an old team number without history is 'returning', not a rookie", () => {
        expect(historyZ(500, undefined, undefined, undefined, 40000)).toBeCloseTo(HISTORY_COEFS[0] + HISTORY_COEFS[2], 10);
    });

    it("maxTeamWithEvents skips placeholder numbers", () => {
        const p = teamSeasonProfiles([event("A", "Qualifier", "2025-11-01", 6), { ...event("B", "Qualifier", "2025-11-01", 6), teams: event("B", "Qualifier", "2025-11-01", 6).teams.map(t => ({ ...t, teamNumber: t.teamNumber + 99900 })) }]);
        expect(maxTeamWithEvents(p)).toBe(105);
    });
});

describe("inSeasonOpr / buildStartingPoints (#117)", () => {
    it("uses only events that started before this one, weighted by quals", () => {
        const ev = [{ start: "2026-11-01", opr: 30, n: 6 }, { start: "2026-11-08", opr: 60, n: 2 }, { start: "2026-11-27", opr: 99, n: 5 }];
        expect(inSeasonOpr(ev, "2026-11-27T00:00:00")).toBeCloseTo((30 * 6 + 60 * 2) / 8, 10);
        expect(inSeasonOpr(ev, "2026-11-01")).toBeNull();
    });

    it("centers both priors on the robots of the event", () => {
        const s = buildStartingPoints({
            teams: [1, 2, 3],
            inSeason: t => (t === 1 ? 50 : t === 2 ? 30 : null),
            history: t => ({ 1: 0.5, 2: 0, 3: -0.5 } as Record<number, number>)[t],
            seasonMeanRobot: 25,
        })!;
        expect(s.inSeason).toEqual({ 1: 10, 2: -10 });
        expect(s.history).toEqual({ 1: 0.5, 2: 0, 3: -0.5 });
        expect(s.mu0Hint).toBe(40); // mean earlier-season OPR of the robots that have one
        const prior = priorOf(s, 40);
        expect(prior(1)).toBe(50);            // in-season wins over history
        expect(prior(3)).toBeCloseTo(40 * (1 - 0.5 * STRENGTH_CV), 10);
        expect(prior(999)).toBe(40);
    });

    it("returns null when there is nothing to start from", () => {
        expect(buildStartingPoints({ teams: [1, 2], inSeason: () => null, history: () => null, seasonMeanRobot: 30 })).toBeNull();
        // History but no scale (season with no event played yet and nobody with in-season OPR).
        expect(hasStartingPoints(buildStartingPoints({ teams: [1, 2], inSeason: () => null, history: () => 0.3, seasonMeanRobot: 0 }))).toBe(false);
    });

    it("eventTeamNumbers merges matches, schedule and rankings", () => {
        expect(eventTeamNumbers([{ teams: [{ teamNumber: 1 }, { teamNumber: 2 }] }], [{ teams: [{ teamNumber: 3 }, { teamNumber: 0 }] }], [{ teamNumber: 4 }, { teamNumber: 1 }]).sort()).toEqual([1, 2, 3, 4]);
    });
});
