import { describe, it, expect } from "vitest";
import { eventPickMetrics } from "./pick-metrics";
import { eventStrengthModel } from "./live-projection";
import type { FTCMatch } from "@/types/scouting";
import type { MatchScoreEntry } from "./score-breakdown";

const team = (n: number, station: string, extra: Record<string, unknown> = {}) => ({ teamNumber: n, station, onField: true, dq: false, ...extra });
const match = (n: number, red: [number, number], blue: [number, number], rs: number, bs: number): FTCMatch => ({
    tournamentLevel: "QUALIFICATION", matchNumber: n, series: 0, description: `Q${n}`, postResultTime: "2026-11-14T10:00:00Z",
    scoreRedFinal: rs, scoreBlueFinal: bs, scoreRedFoul: 0, scoreBlueFoul: 0,
    teams: [team(red[0], "Red1"), team(red[1], "Red2"), team(blue[0], "Blue1"), team(blue[1], "Blue2")],
} as unknown as FTCMatch);
const bd = (n: number, alliance: string, tips: number, r1: [boolean, boolean], r2: [boolean, boolean]): MatchScoreEntry => ({
    matchNumber: n, matchLevel: "QUALIFICATION", matchSeries: 0, alliance,
    scoreBreakdown: { autoHiveTips: 0, teleopHiveTips: tips, autoRobot1Leave: r1[0], teleopRobot1Park: r1[1], autoRobot2Leave: r2[0], teleopRobot2Park: r2[1] },
});

const matches = [match(1, [1, 2], [3, 4], 80, 40), match(2, [1, 3], [2, 4], 70, 50), match(3, [1, 4], [2, 3], 90, 45)];
const scores = [
    bd(1, "Red", 3, [true, true], [true, false]), bd(1, "Blue", 1, [false, true], [true, true]),
    bd(2, "Red", 2, [true, true], [false, false]), bd(2, "Blue", 1, [true, false], [true, true]),
    bd(3, "Red", 3, [true, true], [true, true]), bd(3, "Blue", 1, [false, false], [true, true]),
];

describe("eventPickMetrics (#115)", () => {
    it("OPR is the live model's strength (same numbers as the ledger/Oracle)", () => {
        const m = eventPickMetrics(2026, matches, scores);
        const model = eventStrengthModel(matches);
        for (const t of [1, 2, 3, 4]) expect(m[t].opr).toBeCloseTo(model.strength(t), 10);
        expect(m[1].matches).toBe(3);
    });

    it("LEAVE/PARK is exact per robot, mapped by station order", () => {
        const m = eventPickMetrics(2026, matches, scores);
        // Team 1 (Red1 every match): leave+park in all 3 → 6/6.
        expect(m[1].leavePark).toBe(1);
        // Team 2: Red2 in Q1 (leave ✓ park ✗), Blue1 in Q2 (leave ✓ park ✗), Blue1 in Q3 (✗ ✗) → 2/6.
        expect(m[2].leavePark).toBeCloseTo(2 / 6, 10);
    });

    it("the robot with more TIPS per match gets the higher TIPS OPR", () => {
        const m = eventPickMetrics(2026, matches, scores);
        expect(m[1].tipsOpr!).toBeGreaterThan(m[4].tipsOpr!);
    });

    it("DECODE and earlier: only the OPR (no BIOBUZZ fields)", () => {
        const m = eventPickMetrics(2025, matches, scores);
        expect(m[1].tipsOpr).toBeUndefined();
        expect(m[1].leavePark).toBeUndefined();
    });

    it("no metrics before 2 quals are played", () => {
        expect(eventPickMetrics(2026, matches.slice(0, 1), scores)).toEqual({});
    });
});
