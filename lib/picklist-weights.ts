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
    /** Live-model OPR at the selected event (#115) — the best single predictor of playoff wins. */
    modelOpr: number;
    /** BIOBUZZ: TIPS contributed per match at the event (ridge OPR). */
    tipsOpr: number;
    /** BIOBUZZ: exact LEAVE + final PARK reliability per robot (0–1). */
    leavePark: number;
}

/** Defaults up to DECODE (2025) — unchanged; the event metrics don't exist there. */
export const DEFAULT_WEIGHTS: PicklistWeights = {
    averageRS: 60,
    averageNP: 80,
    averageAutoPoints: 40,
    winRate: 30,
    bestRank: 30,
    advancementPoints: 20,
    modelOpr: 0,
    tipsOpr: 0,
    leavePark: 0,
};

/**
 * BIOBUZZ (2026+) defaults, decision #115: the model OPR alone. Playoff
 * backtest (sum of the two picks' metric picks the winner): OPR 77.3 %;
 * alliance-average points 72.0 %; Ranking Score 69.3 %; win rate 65.7 %
 * (RS/wins depend on the partners a team drew; RPs don't exist in playoffs).
 * Mixing in LEAVE/PARK reliability made it WORSE (weight 5 → 76.5 %,
 * 30 → 73.5 %), so it's shown next to each team but weighted 0 by default.
 */
export const BIOBUZZ_WEIGHTS: PicklistWeights = {
    averageRS: 0,
    averageNP: 0,
    averageAutoPoints: 0,
    winRate: 0,
    bestRank: 0,
    advancementPoints: 0,
    modelOpr: 100,
    tipsOpr: 0,
    leavePark: 0,
};

const LEGACY_KEYS: (keyof PicklistWeights)[] = [
    "averageRS",
    "averageNP",
    "averageAutoPoints",
    "winRate",
    "bestRank",
    "advancementPoints",
];

/** Every metric (computeWeightedScores skips weight 0, so legacy results don't change). */
export const WEIGHT_KEYS: (keyof PicklistWeights)[] = [...LEGACY_KEYS, "modelOpr", "tipsOpr", "leavePark"];

export const defaultWeightsFor = (season: number): PicklistWeights => (season >= 2026 ? BIOBUZZ_WEIGHTS : DEFAULT_WEIGHTS);

/** Sliders offered per season: the event metrics first from BIOBUZZ on; DECODE keeps its six. */
export const weightKeysFor = (season: number): (keyof PicklistWeights)[] =>
    season >= 2026 ? ["modelOpr", "tipsOpr", "leavePark", ...LEGACY_KEYS] : LEGACY_KEYS;

export const WEIGHT_LABELS: Record<keyof PicklistWeights, string> = {
    averageRS: "Ranking Score (RS)",
    averageNP: "Net Points (NP)",
    averageAutoPoints: "Auto Points",
    winRate: "Win Rate",
    bestRank: "Best Rank",
    advancementPoints: "Advancement Pts",
    modelOpr: "OPR (PRIDE model)",
    tipsOpr: "TIPS OPR",
    leavePark: "LEAVE/PARK reliability",
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
        case "modelOpr":
            return team.pick?.opr ?? 0;
        case "tipsOpr":
            return team.pick?.tipsOpr ?? 0;
        case "leavePark":
            return team.pick?.leavePark ?? 0;
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
    // A missing key (weights saved before a metric existed) counts as 0.
    const w = (k: keyof PicklistWeights) => Math.max(0, Number(weights[k]) || 0);
    const totalWeight = WEIGHT_KEYS.reduce((sum, k) => sum + w(k), 0);
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
            const wk = w(key);
            if (wk === 0) continue;
            const value = getMetric(team, key);
            const normalized = minMaxNormalize(value, allValuesByMetric.get(key)!);
            weighted += normalized * wk;
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
