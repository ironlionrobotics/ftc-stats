import { describe, it, expect } from "vitest";
import {
    computeWeightedScores,
    sortTeamsByWeightedScore,
    DEFAULT_WEIGHTS,
    type PicklistWeights,
} from "./picklist-weights";
import type { AggregatedTeamStats } from "@/types/scouting";

function team(overrides: Partial<AggregatedTeamStats> & Pick<AggregatedTeamStats, "teamNumber">): AggregatedTeamStats {
    return {
        teamName: `Team ${overrides.teamNumber}`,
        regionalsAttended: 1,
        totalRS: 10, averageRS: 2.5,
        totalMatchPoints: 200, averageMatchPoints: 50,
        totalBasePoints: 100, averageBasePoints: 25,
        totalAutoPoints: 40, averageAutoPoints: 10,
        totalHighScore: 0, averageHighScore: 0,
        totalWins: 2, totalLosses: 2, totalTies: 0,
        bestRank: 5, averageRank: 5,
        hasAdvanced: false,
        advancementPoints: { total: 0, judging: 0, playoff: 0, selection: 0, qualification: 0 },
        totalNP: 200, averageNP: 50,
        opr: 50,
        events: [],
        ...overrides,
    };
}

describe("computeWeightedScores", () => {
    it("returns 0.5 for every team when all weights are 0", () => {
        const teams = [team({ teamNumber: 1 }), team({ teamNumber: 2 })];
        const weights: PicklistWeights = {
            averageRS: 0, averageNP: 0, averageAutoPoints: 0,
            winRate: 0, bestRank: 0, advancementPoints: 0,
        };
        const scores = computeWeightedScores(teams, weights);
        expect(scores.get(1)).toBe(0.5);
        expect(scores.get(2)).toBe(0.5);
    });

    it("ranks best team highest when single metric dominates", () => {
        const teams = [
            team({ teamNumber: 1, averageNP: 100 }),
            team({ teamNumber: 2, averageNP: 50 }),
            team({ teamNumber: 3, averageNP: 25 }),
        ];
        const weights: PicklistWeights = {
            averageRS: 0, averageNP: 100, averageAutoPoints: 0,
            winRate: 0, bestRank: 0, advancementPoints: 0,
        };
        const scores = computeWeightedScores(teams, weights);
        // Team 1 has max NP → normalized = 1; Team 3 min → 0; Team 2 middle.
        expect(scores.get(1)).toBe(1);
        expect(scores.get(3)).toBe(0);
        expect(scores.get(2)).toBeGreaterThan(0);
        expect(scores.get(2)).toBeLessThan(1);
    });

    it("inverts bestRank so lower rank = higher score", () => {
        const teams = [
            team({ teamNumber: 1, bestRank: 1 }),   // top → high score
            team({ teamNumber: 2, bestRank: 20 }),  // mid
            team({ teamNumber: 3, bestRank: 50 }),  // bottom → low score
        ];
        const weights: PicklistWeights = {
            averageRS: 0, averageNP: 0, averageAutoPoints: 0,
            winRate: 0, bestRank: 100, advancementPoints: 0,
        };
        const scores = computeWeightedScores(teams, weights);
        expect(scores.get(1)!).toBeGreaterThan(scores.get(2)!);
        expect(scores.get(2)!).toBeGreaterThan(scores.get(3)!);
    });

    it("computes win rate from W/L/T", () => {
        const teams = [
            team({ teamNumber: 1, totalWins: 8, totalLosses: 2, totalTies: 0 }), // 80%
            team({ teamNumber: 2, totalWins: 5, totalLosses: 5, totalTies: 0 }), // 50%
            team({ teamNumber: 3, totalWins: 2, totalLosses: 8, totalTies: 0 }), // 20%
        ];
        const weights: PicklistWeights = {
            averageRS: 0, averageNP: 0, averageAutoPoints: 0,
            winRate: 100, bestRank: 0, advancementPoints: 0,
        };
        const scores = computeWeightedScores(teams, weights);
        expect(scores.get(1)).toBe(1);
        expect(scores.get(3)).toBe(0);
    });

    it("blends multiple metrics proportionally to their weights", () => {
        const teams = [
            team({ teamNumber: 1, averageNP: 100, averageRS: 0 }),
            team({ teamNumber: 2, averageNP: 0, averageRS: 100 }),
        ];
        // Equal weights → both teams should score 0.5 (one wins NP, other wins RS).
        const equal: PicklistWeights = {
            averageRS: 50, averageNP: 50, averageAutoPoints: 0,
            winRate: 0, bestRank: 0, advancementPoints: 0,
        };
        const scoresEqual = computeWeightedScores(teams, equal);
        expect(scoresEqual.get(1)).toBeCloseTo(0.5, 1);
        expect(scoresEqual.get(2)).toBeCloseTo(0.5, 1);

        // Heavy NP weight → team 1 wins.
        const npHeavy: PicklistWeights = {
            averageRS: 10, averageNP: 90, averageAutoPoints: 0,
            winRate: 0, bestRank: 0, advancementPoints: 0,
        };
        const scoresNP = computeWeightedScores(teams, npHeavy);
        expect(scoresNP.get(1)!).toBeGreaterThan(scoresNP.get(2)!);
    });
});

describe("sortTeamsByWeightedScore", () => {
    it("sorts descending by score", () => {
        const scores = new Map([[10, 0.2], [20, 0.8], [30, 0.5]]);
        expect(sortTeamsByWeightedScore([10, 20, 30], scores)).toEqual([20, 30, 10]);
    });

    it("preserves original order on ties (stable sort)", () => {
        const scores = new Map([[1, 0.5], [2, 0.5], [3, 0.5]]);
        expect(sortTeamsByWeightedScore([2, 1, 3], scores)).toEqual([2, 1, 3]);
    });

    it("treats missing teams as score 0 (sort to bottom)", () => {
        const scores = new Map([[1, 0.9]]);
        expect(sortTeamsByWeightedScore([2, 1, 3], scores)).toEqual([1, 2, 3]);
    });
});

describe("DEFAULT_WEIGHTS", () => {
    it("is a balanced starting point — every metric has positive weight", () => {
        for (const key of Object.keys(DEFAULT_WEIGHTS) as (keyof PicklistWeights)[]) {
            expect(DEFAULT_WEIGHTS[key]).toBeGreaterThan(0);
        }
    });
});
