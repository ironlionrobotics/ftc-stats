import { describe, it, expect } from "vitest";
import { frcMatchBonusRp } from "./frc-rp";
import { allianceRpObs } from "./rp-inference";
import { frcThresholdLevel, rpThresholdsFor } from "./games/season-rules";
import type { FTCMatch } from "@/types/scouting";

const qual = (n: number, red: number, blue: number): FTCMatch => ({
    matchNumber: n, tournamentLevel: "QUALIFICATION", description: `Qualification ${n}`, scoreRedFinal: red, scoreBlueFinal: blue,
    teams: [{ teamNumber: 1, station: "Red1" }, { teamNumber: 2, station: "Red2" }, { teamNumber: 3, station: "Red3" }, { teamNumber: 4, station: "Blue1" }, { teamNumber: 5, station: "Blue2" }, { teamNumber: 6, station: "Blue3" }],
} as unknown as FTCMatch);

describe("FRC bonus RP (#118)", () => {
    it("counts the bonus booleans when the breakdown has them", () => {
        const out = frcMatchBonusRp(2026, [qual(1, 120, 90)], [{
            matchLevel: "Qualification", matchNumber: 1,
            alliances: [
                { alliance: "Red", energizedAchieved: true, superchargedAchieved: false, traversalAchieved: true },
                { alliance: "Blue", energizedAchieved: false, superchargedAchieved: false, traversalAchieved: false },
            ],
        }]);
        expect(out).toEqual({ "1-Red": 2, "1-Blue": 0 });
    });

    it("falls back to total rp minus the result RP, and skips alliances with neither", () => {
        const out = frcMatchBonusRp(2026, [qual(2, 100, 100), qual(3, 50, 80)], [
            { matchLevel: "Qualification", matchNumber: 2, alliances: [{ alliance: "Red", rp: 2 }, { alliance: "Blue", rp: 1 }] },
            { matchLevel: "Qualification", matchNumber: 3, alliances: [{ alliance: "Red", totalPoints: 50 }, { alliance: "Blue", rp: 5 }] },
            { matchLevel: "Playoff", matchNumber: 1, alliances: [{ alliance: "Red", rp: 9 }] },
        ]);
        expect(out).toEqual({ "2-Red": 1, "2-Blue": 0, "3-Blue": 2 });
    });

    it("an FRC breakdown without the season's keys is no observation, FTC is unchanged", () => {
        const m = qual(1, 0, 0);
        expect(allianceRpObs(2026, { totalPoints: 10 } as never, m, "Red", "FRC")).toBeUndefined();
        expect(allianceRpObs(2025, { totalPoints: 10 } as never, m, "Red")).toBeDefined();
    });

    it("thresholds follow the event level (Table 6-5)", () => {
        expect(frcThresholdLevel("Regional")).toBe("event");
        expect(frcThresholdLevel("DistrictChampionshipDivision")).toBe("districtChampionship");
        expect(frcThresholdLevel("ChampionshipSubdivision")).toBe("championship");
        expect(rpThresholdsFor(2026, "MXMO", "FRC", "Regional")).toEqual({ energized: 100, supercharged: 360, traversal: 50 });
        expect(rpThresholdsFor(2026, "NEWTON", "FRC", "ChampionshipSubdivision")).toEqual({ energized: 360, supercharged: 500, traversal: 50 });
        // FTC default path untouched.
        expect(rpThresholdsFor(2026)).toEqual(rpThresholdsFor(2026, undefined, "FTC"));
    });
});
