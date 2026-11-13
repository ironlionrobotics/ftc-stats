import { describe, it, expect } from "vitest";
import scores2026 from "@/lib/__fixtures__/scores-2026-AUBRQ1-qual.json";
import matches2026 from "@/lib/__fixtures__/matches-2026-AUBRQ1-qual.json";
import scores2025 from "@/lib/__fixtures__/scores-2025-FPEMX-qual.json";
import {
    flattenMatchScores,
    phaseSplit,
    robotSlotsFor,
    biobuzzRobotOutcomes,
    biobuzzTips,
    scoutableAllianceScore,
} from "./score-breakdown";

// Fixtures are real FIRST API responses (trimmed), fetched 2026-11-13.

describe("flattenMatchScores (real /scores shape)", () => {
    it("yields one entry per alliance from matchScores[].alliances[]", () => {
        const flat = flattenMatchScores(scores2026);
        expect(flat).toHaveLength(8); // 4 matches × 2 alliances
        const q1Blue = flat.find(e => e.matchNumber === 1 && e.alliance === "Blue")!;
        expect(q1Blue.matchLevel).toBe("QUALIFICATION");
        expect(q1Blue.scoreBreakdown.teleopHiveTips).toBe(1);
        expect(q1Blue.scoreBreakdown.swarmRP).toBe(true);
    });

    it("returns [] for the legacy `.scores` shape and garbage", () => {
        expect(flattenMatchScores({ scores: [{ alliance: "Red", scoreBreakdown: {} }] })).toEqual([]);
        expect(flattenMatchScores(null)).toEqual([]);
        expect(flattenMatchScores({ matchScores: "nope" })).toEqual([]);
    });
});

describe("phaseSplit", () => {
    it("2026 BIOBUZZ: end = FLOWER + final PARK; tele excludes it", () => {
        const q1Blue = flattenMatchScores(scores2026).find(e => e.matchNumber === 1 && e.alliance === "Blue")!;
        // teleopPoints 31 = 20 hive + 1 garden + 10 park
        expect(phaseSplit(2026, q1Blue.scoreBreakdown)).toEqual({ auto: 8, tele: 21, end: 10 });
    });

    it("2025 DECODE: end = BASE points; tele excludes it", () => {
        const blue = flattenMatchScores(scores2025).find(e => e.alliance === "Blue")!;
        // teleopPoints 30 includes teleopBasePoints 10
        expect(phaseSplit(2025, blue.scoreBreakdown)).toEqual({ auto: 22, tele: 20, end: 10 });
    });

    it("legacy seasons keep the historical field variants", () => {
        expect(phaseSplit(2023, { autoPoints: 5, teleopPoints: 40, endgamePoints: 12 })).toEqual({ auto: 5, tele: 40, end: 12 });
        expect(phaseSplit(2024, { autoPoints: 5, dcPoints: 40, parkingPoints: 3, ascentPoints: 15 })).toEqual({ auto: 5, tele: 40, end: 18 });
    });

    it("returns null without a breakdown so callers use their fallback", () => {
        expect(phaseSplit(2026, undefined)).toBeNull();
        expect(phaseSplit(2026, {})).toBeNull();
    });
});

describe("robot slots (robot1/robot2 ↔ station 1/2)", () => {
    const flat = flattenMatchScores(scores2026);
    const matchById = new Map(matches2026.matches.map(m => [m.matchNumber, m]));

    it("orders an alliance's teams by station", () => {
        const q1 = matchById.get(1)!;
        expect(robotSlotsFor(q1.teams, "Red")).toEqual([23332, 18439]);
        expect(robotSlotsFor(q1.teams, "Blue")).toEqual([11506, 12993]);
    });

    it("every robot that was not on the field has all its slot flags false", () => {
        let checked = 0;
        for (const m of matches2026.matches) {
            for (const t of m.teams.filter(t => !t.onField)) {
                const alliance = t.station.startsWith("Red") ? "Red" : "Blue";
                const slot = (robotSlotsFor(m.teams, alliance).indexOf(t.teamNumber) + 1) as 1 | 2;
                const b = flat.find(e => e.matchNumber === m.matchNumber && e.alliance === alliance)!.scoreBreakdown;
                expect(biobuzzRobotOutcomes(b, slot)).toEqual({ leave: false, autoPark: false, teleopPark: false });
                checked++;
            }
        }
        expect(checked).toBe(3);
    });
});

describe("BIOBUZZ alliance helpers", () => {
    it("tips = auto + teleop", () => {
        const q16Red = flattenMatchScores(scores2026).find(e => e.matchNumber === 16 && e.alliance === "Red")!;
        expect(biobuzzTips(q16Red.scoreBreakdown)).toBe(6);
    });

    it("SWARM flag agrees with LEAVE + PARK points >= 16 on every fixture alliance", () => {
        for (const e of flattenMatchScores(scores2026)) {
            const b = e.scoreBreakdown;
            const pts = (b.autoLeavePoints ?? 0) + (b.autoParkPoints ?? 0) + (b.teleopParkPoints ?? 0);
            expect(b.swarmRP).toBe(pts >= 16);
        }
    });
});

describe("scoutableAllianceScore (ground-truth target)", () => {
    it("2026: auto + teleop minus 2 pts per element left in the top CELL", () => {
        const b = { autoPoints: 8, teleopPoints: 31, teleopHivePollenNectar: 3 };
        expect(scoutableAllianceScore(2026, b, 60, 15)).toBe(33);
    });
    it("2025: auto + teleop, ignoring a bogus preFoulTotal", () => {
        const blue = flattenMatchScores(scores2025).find(e => e.alliance === "Blue")!.scoreBreakdown;
        expect(blue.preFoulTotal).toBe(0);
        expect(scoutableAllianceScore(2025, blue, 57, 5)).toBe(52);
    });
    it("no breakdown: final minus foul points received", () => {
        expect(scoutableAllianceScore(2026, undefined, 60, 15)).toBe(45);
    });
});
