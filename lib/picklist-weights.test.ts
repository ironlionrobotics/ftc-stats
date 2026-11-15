import { describe, it, expect } from "vitest";
import {
    computeWeightedScores,
    sortTeamsByWeightedScore,
    DEFAULT_WEIGHTS,
    WEIGHT_KEYS,
    defaultWeightsFor,
    weightKeysFor,
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
            winRate: 0, bestRank: 0, advancementPoints: 0, modelOpr: 0, tipsOpr: 0, leavePark: 0,
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
            winRate: 0, bestRank: 0, advancementPoints: 0, modelOpr: 0, tipsOpr: 0, leavePark: 0,
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
            winRate: 0, bestRank: 100, advancementPoints: 0, modelOpr: 0, tipsOpr: 0, leavePark: 0,
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
            winRate: 100, bestRank: 0, advancementPoints: 0, modelOpr: 0, tipsOpr: 0, leavePark: 0,
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
            winRate: 0, bestRank: 0, advancementPoints: 0, modelOpr: 0, tipsOpr: 0, leavePark: 0,
        };
        const scoresEqual = computeWeightedScores(teams, equal);
        expect(scoresEqual.get(1)).toBeCloseTo(0.5, 1);
        expect(scoresEqual.get(2)).toBeCloseTo(0.5, 1);

        // Heavy NP weight → team 1 wins.
        const npHeavy: PicklistWeights = {
            averageRS: 10, averageNP: 90, averageAutoPoints: 0,
            winRate: 0, bestRank: 0, advancementPoints: 0, modelOpr: 0, tipsOpr: 0, leavePark: 0,
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

describe("weights saved before a metric existed", () => {
    it("a missing key counts as 0, never NaN", () => {
        const teams = [team({ teamNumber: 1, averageNP: 10 }), team({ teamNumber: 2, averageNP: 20 })];
        const old = { averageRS: 0, averageNP: 50, averageAutoPoints: 0, winRate: 0, bestRank: 0, advancementPoints: 0 } as unknown as PicklistWeights;
        const scores = computeWeightedScores(teams, old);
        expect(scores.get(2)).toBe(1);
        expect(scores.get(1)).toBe(0);
    });
});

describe("DEFAULT_WEIGHTS", () => {
    it("DECODE and earlier: the six original metrics, all positive, event metrics off (unchanged behavior)", () => {
        for (const key of ["averageRS", "averageNP", "averageAutoPoints", "winRate", "bestRank", "advancementPoints"] as (keyof PicklistWeights)[]) {
            expect(DEFAULT_WEIGHTS[key]).toBeGreaterThan(0);
        }
        expect(DEFAULT_WEIGHTS.modelOpr + DEFAULT_WEIGHTS.tipsOpr + DEFAULT_WEIGHTS.leavePark).toBe(0);
        expect(defaultWeightsFor(2025)).toBe(DEFAULT_WEIGHTS);
        expect(weightKeysFor(2025)).not.toContain("modelOpr");
    });

    it("BIOBUZZ (2026+): ranks by the model OPR alone (#115)", () => {
        const w = defaultWeightsFor(2026);
        expect(w.modelOpr).toBe(100);
        expect(WEIGHT_KEYS.filter(k => k !== "modelOpr").every(k => w[k] === 0)).toBe(true);
        expect(weightKeysFor(2026)[0]).toBe("modelOpr");
    });

    it("BIOBUZZ ordering follows the event OPR, not partner-dependent RS or win rate", () => {
        const mk = (n: number, opr: number, rs: number, wins: number) => ({
            teamNumber: n, averageRS: rs, averageNP: 0, averageAutoPoints: 0, totalWins: wins, totalLosses: 5 - wins, totalTies: 0,
            bestRank: 1, advancementPoints: { total: 0 }, pick: { opr, matches: 5 },
        }) as unknown as AggregatedTeamStats;
        // Team 1: lucky partners (high RS, 5 wins) but weak robot; team 2: strong robot, unlucky.
        const teams = [mk(1, 20, 4.5, 5), mk(2, 45, 2.0, 2)];
        const scores = computeWeightedScores(teams, defaultWeightsFor(2026));
        expect(sortTeamsByWeightedScore([1, 2], scores)).toEqual([2, 1]);
        const legacy = computeWeightedScores(teams, DEFAULT_WEIGHTS);
        expect(sortTeamsByWeightedScore([1, 2], legacy)).toEqual([1, 2]); // DECODE logic untouched
    });
});
