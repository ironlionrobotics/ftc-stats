import { describe, it, expect } from "vitest";
import { buildSeasonFormPoints } from "./team-season-analysis";
import { buildConsistencyProfile } from "./consistency";
import type { TeamSeasonRanking } from "./ftc-api";

// Only the four fields the mapper reads matter; the rest of TeamRanking is
// filled with neutral values so the fixture type-checks against the real shape.
function ranking(over: Partial<TeamSeasonRanking> = {}): TeamSeasonRanking {
    return {
        rank: 1, teamNumber: 30311, displayTeamNumber: "30311", teamName: "Iron Lion",
        sortOrder1: 0, sortOrder2: 0, sortOrder3: 0, sortOrder4: 0, sortOrder5: 0, sortOrder6: 0,
        wins: 0, losses: 0, ties: 0, qualAverage: 0, dq: 0, matchesPlayed: 0, matchesCounted: 0,
        eventCode: "EVT", eventName: "Event", dateStart: "2025-12-01",
        avgNP: 50, avgAuto: 10, highScore: 0, winRate: 0,
        ...over,
    };
}

describe("buildSeasonFormPoints", () => {
    it("maps eventCode/avgNP/avgAuto onto a FormPoint series", () => {
        const s = buildSeasonFormPoints([
            ranking({ eventCode: "MXSTQ", avgNP: 50.5, avgAuto: 9.5 }),
            ranking({ eventCode: "MXMOQ", avgNP: 68.9, avgAuto: 8.25 }),
        ]);

        expect(s).not.toBeNull();
        expect(s!.points.map(p => p.label)).toEqual(["MXSTQ", "MXMOQ"]);
        expect(s!.points.map(p => p.opr)).toEqual([50.5, 68.9]);
        expect(s!.points.map(p => p.auto)).toEqual([9.5, 8.25]);
        // dc is the teleop+endgame remainder of the net average.
        expect(s!.points[0].dc).toBeCloseTo(41, 10);
        expect(s!.points[1].dc).toBeCloseTo(60.65, 10);
    });

    it("preserves the order it is given — the slope is per event, chronologically", () => {
        const s = buildSeasonFormPoints([
            ranking({ eventCode: "A", avgNP: 40 }),
            ranking({ eventCode: "B", avgNP: 60 }),
            ranking({ eventCode: "C", avgNP: 80 }),
        ]);

        expect(s!.points.map(p => p.label)).toEqual(["A", "B", "C"]);
        expect(buildConsistencyProfile(s!.points, s!.publicNumber).tot.slope).toBeCloseTo(20, 10);
    });

    it("clamps dc at zero when auto exceeds the net average", () => {
        const s = buildSeasonFormPoints([
            ranking({ eventCode: "A", avgNP: 12, avgAuto: 20 }),
            ranking({ eventCode: "B", avgNP: 30, avgAuto: 10 }),
        ]);

        expect(s!.points[0].dc).toBe(0);
        expect(s!.points[1].dc).toBe(20);
    });

    it("omits the phase split when avgAuto is not a number", () => {
        const s = buildSeasonFormPoints([
            ranking({ eventCode: "A", avgNP: 40, avgAuto: NaN }),
            ranking({ eventCode: "B", avgNP: 60, avgAuto: 10 }),
        ]);

        expect(s!.points[0].auto).toBeUndefined();
        expect(s!.points[0].dc).toBeUndefined();
        // A partial phase series is dropped by buildConsistencyProfile, which is
        // the point: it must not compare different sets of events.
        expect(buildConsistencyProfile(s!.points, s!.publicNumber).phases).toEqual([]);
    });

    it("drops events with no usable average (NaN, undefined, or the 0 sentinel)", () => {
        const s = buildSeasonFormPoints([
            ranking({ eventCode: "OK1", avgNP: 40 }),
            ranking({ eventCode: "NAN", avgNP: NaN }),
            // A team registered for an event that never produced qual matches.
            ranking({ eventCode: "ZERO", avgNP: 0 }),
            ranking({ eventCode: "UNDEF", avgNP: undefined as unknown as number }),
            ranking({ eventCode: "OK2", avgNP: 60 }),
        ]);

        expect(s!.points.map(p => p.label)).toEqual(["OK1", "OK2"]);
    });

    it("returns null with fewer than two usable events", () => {
        expect(buildSeasonFormPoints([])).toBeNull();
        expect(buildSeasonFormPoints([ranking({ avgNP: 55 })])).toBeNull();
        expect(buildSeasonFormPoints([
            ranking({ eventCode: "OK", avgNP: 55 }),
            ranking({ eventCode: "BAD", avgNP: 0 }),
        ])).toBeNull();
    });

    it("reports publicNumber as the mean of the usable per-event averages", () => {
        const s = buildSeasonFormPoints([
            ranking({ eventCode: "A", avgNP: 40 }),
            ranking({ eventCode: "B", avgNP: 50 }),
            ranking({ eventCode: "C", avgNP: 90 }),
            ranking({ eventCode: "SKIP", avgNP: 0 }),
        ]);

        expect(s!.publicNumber).toBeCloseTo(60, 10);
    });
});
