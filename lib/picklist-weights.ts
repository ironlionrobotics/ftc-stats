import type { AggregatedTeamStats } from "@/types/scouting";

/**
 * Weighted-score builder for the picklist editor. Each metric is normalized
 * 0-1 across the loaded team pool (min-max scaling) so weights are
 * comparable. The weighted average is then a 0-1 score the user can sort by.
 *
 * Why min-max instead of z-score: scores are easier to interpret as "this
 * team is X% of the way between worst and best" than as standard deviations.
 * Cost: outliers compress the middle of the distribution. Acceptable
 * tradeoff for a UI sorting heuristic.
 */

export interface PicklistWeights {
    averageRS: number;        // Ranking Score
    averageNP: number;        // Net Points (OPR-ish)
    averageAutoPoints: number;
    winRate: number;
    bestRank: number;         // inverted (lower rank = better)
    advancementPoints: number;
}

export const DEFAULT_WEIGHTS: PicklistWeights = {
    averageRS: 60,
    averageNP: 80,
    averageAutoPoints: 40,
    winRate: 30,
    bestRank: 30,
    advancementPoints: 20,
};

export const WEIGHT_KEYS: (keyof PicklistWeights)[] = [
    "averageRS",
    "averageNP",
    "averageAutoPoints",
    "winRate",
    "bestRank",
    "advancementPoints",
];

export const WEIGHT_LABELS: Record<keyof PicklistWeights, string> = {
    averageRS: "Ranking Score (RS)",
    averageNP: "Net Points (NP)",
    averageAutoPoints: "Auto Points",
    winRate: "Win Rate",
    bestRank: "Best Rank",
    advancementPoints: "Advancement Pts",
};

function getMetric(team: AggregatedTeamStats, key: keyof PicklistWeights): number {
    switch (key) {
        case "averageRS":
            return team.averageRS ?? 0;
        case "averageNP":
            return team.averageNP ?? 0;
        case "averageAutoPoints":
            return team.averageAutoPoints ?? 0;
        case "winRate":
            return team.totalWins + team.totalLosses + team.totalTies > 0
                ? team.totalWins / (team.totalWins + team.totalLosses + team.totalTies)
                : 0;
        case "bestRank":
            // Inverted so lower rank = higher value. Avoid /0 with sentinel.
            return team.bestRank > 0 ? 1 / team.bestRank : 0;
        case "advancementPoints":
            return team.advancementPoints?.total ?? 0;
    }
}

function minMaxNormalize(value: number, all: number[]): number {
    const min = Math.min(...all);
    const max = Math.max(...all);
    if (max === min) return 0.5;
    return (value - min) / (max - min);
}

/**
 * Returns 0-1 score per team. Caller can multiply by 100 for percentage UI.
 * Weights are typically 0-100 (as set by sliders) but any positive scale
 * works since we divide by the weight sum.
 */
export function computeWeightedScores(
    teams: AggregatedTeamStats[],
    weights: PicklistWeights,
): Map<number, number> {
    const totalWeight = WEIGHT_KEYS.reduce((sum, k) => sum + Math.max(0, weights[k]), 0);
    if (totalWeight === 0) {
        // All sliders at 0 — return identity (0.5 each) so the UI doesn't show NaN.
        return new Map(teams.map(t => [t.teamNumber, 0.5]));
    }

    // Pre-compute all values per metric so normalization is cheap.
    const allValuesByMetric = new Map<keyof PicklistWeights, number[]>();
    for (const key of WEIGHT_KEYS) {
        allValuesByMetric.set(key, teams.map(t => getMetric(t, key)));
    }

    const scores = new Map<number, number>();
    for (const team of teams) {
        let weighted = 0;
        for (const key of WEIGHT_KEYS) {
            const w = Math.max(0, weights[key]);
            if (w === 0) continue;
            const value = getMetric(team, key);
            const normalized = minMaxNormalize(value, allValuesByMetric.get(key)!);
            weighted += normalized * w;
        }
        scores.set(team.teamNumber, weighted / totalWeight);
    }
    return scores;
}

/**
 * Returns teams sorted by descending weighted score. Stable sort: teams with
 * the same score keep their original order, so the strategy lead's manual
 * tweaks survive a "re-apply weights" within ties.
 */
export function sortTeamsByWeightedScore(
    teamNumbers: number[],
    scores: Map<number, number>,
): number[] {
    const indexed = teamNumbers.map((tn, idx) => ({ tn, idx, score: scores.get(tn) ?? 0 }));
    indexed.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return a.idx - b.idx;
    });
    return indexed.map(x => x.tn);
}
