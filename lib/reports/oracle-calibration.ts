/**
 * Oracle calibration record — the public transparency dataset.
 *
 * Every figure here was RECOMPUTED from the raw backtest output in
 * `data/oracle-backtest/*.jsonl` (produced by `scripts/oracle-backtest.mjs`
 * against FTCScout's public API), not transcribed from prose. A finished
 * backtest is a fixed historical record, so curating it as static data keeps
 * the public page fast and every number reproducible — see REPRODUCE below.
 *
 * Why publish this at all: a prediction tool that won't show its error rate is
 * asking for trust it hasn't earned. The uncomfortable part — that the first
 * version of the playoff model was badly overconfident — is in here too,
 * because a calibration page that only showed the good result would be
 * marketing, not evidence.
 */

export interface SeasonCalibration {
    season: number;
    game: string;
    events: number;
    matches: number;
    /** % of playoff matches whose winner the model called correctly. */
    accuracy: number;
    /** Brier score (lower is better; 0.25 = always guessing 50/50). */
    brier: number;
    /** Mean probability the model assigned to the side it picked. */
    confidence: number;
    /** confidence − accuracy, in percentage points. Negative = under-confident. */
    gap: number;
}

export interface LevelCalibration {
    key: string;
    label: string;
    matches: number;
    accuracy: number;
    confidence: number;
    gap: number;
}

export interface ReliabilityBin {
    range: string;
    matches: number;
    /** Mean predicted probability inside this bin. */
    predicted: number;
    /** Share that actually won. */
    realized: number;
    /** predicted − realized. Positive = overconfident. */
    gap: number;
}

export const ORACLE_CALIBRATION = {
    totals: {
        seasons: 7,
        events: 2793,
        matches: 21436,
        accuracy: 74.8,
    },

    /** One row per season. Different games, same model — that's the point. */
    seasons: [
        { season: 2019, game: "Skystone", events: 276, matches: 1910, accuracy: 71.4, brier: 0.212, confidence: 68.4, gap: -3 },
        { season: 2020, game: "Ultimate Goal", events: 54, matches: 365, accuracy: 83.6, brier: 0.131, confidence: 79, gap: -4.6 },
        { season: 2021, game: "Freight Frenzy", events: 290, matches: 1978, accuracy: 73.3, brier: 0.193, confidence: 70, gap: -3.3 },
        { season: 2022, game: "Power Play", events: 422, matches: 2934, accuracy: 72.3, brier: 0.196, confidence: 70.4, gap: -1.9 },
        { season: 2023, game: "Centerstage", events: 503, matches: 3449, accuracy: 75.6, brier: 0.183, confidence: 72.9, gap: -2.7 },
        { season: 2024, game: "Into The Deep", events: 586, matches: 5028, accuracy: 75.9, brier: 0.177, confidence: 73.2, gap: -2.7 },
        { season: 2025, game: "DECODE", events: 662, matches: 5772, accuracy: 75.8, brier: 0.18, confidence: 73.1, gap: -2.7 },
    ] as SeasonCalibration[],

    /** Same model, by event tier. Accuracy falls as the field tightens. */
    levels: [
        { key: "regional", label: "Regionales y ligas", matches: 16462, accuracy: 75.7, confidence: 73.1, gap: -2.6 },
        { key: "championship", label: "Campeonatos regionales", matches: 4447, accuracy: 72.2, confidence: 69.3, gap: -2.9 },
        { key: "premier", label: "Premier Events", matches: 314, accuracy: 71.7, confidence: 67.7, gap: -3.9 },
        { key: "worlds", label: "Mundial (divisiones)", matches: 213, accuracy: 63.4, confidence: 60.9, gap: -2.5 },
    ] as LevelCalibration[],

    /**
     * Reliability diagram over the 10,800 playoff matches of 2024+2025 —
     * the seasons for which per-match features were exported.
     *
     * `raw` is the model as first shipped: σ estimated from qualification
     * matches. `corrected` applies the 2.4× playoff σ inflation that was
     * LEARNED from this very data (decisions.md #59), not assumed.
     */
    reliability: {
        matches: 10800,
        raw: [
        { range: "50-60%", matches: 926, predicted: 55, realized: 51.3, gap: 3.7 },
        { range: "60-70%", matches: 1006, predicted: 65.2, realized: 57.7, gap: 7.6 },
        { range: "70-80%", matches: 1131, predicted: 75.2, realized: 64.7, gap: 10.5 },
        { range: "80-90%", matches: 1496, predicted: 85.1, realized: 69, gap: 16.1 },
        { range: "90-100%", matches: 6241, predicted: 98, realized: 86, gap: 11.9 },
        ] as ReliabilityBin[],
        corrected: [
        { range: "50-60%", matches: 2239, predicted: 55.1, realized: 55.5, gap: -0.5 },
        { range: "60-70%", matches: 2262, predicted: 65, realized: 67.6, gap: -2.7 },
        { range: "70-80%", matches: 2059, predicted: 74.9, realized: 76.3, gap: -1.4 },
        { range: "80-90%", matches: 1840, predicted: 85, realized: 86, gap: -1 },
        { range: "90-100%", matches: 2400, predicted: 95.7, realized: 94.3, gap: 1.4 },
        ] as ReliabilityBin[],
    },

    /** How anyone can regenerate every number above from scratch. */
    reproduce: {
        source: "https://api.ftcscout.org/graphql",
        script: "scripts/oracle-backtest.mjs",
        steps: [
            "node scripts/oracle-backtest.mjs run <season>   # per-event aggregates, 2019-2025",
            "node scripts/oracle-backtest.mjs matches <season>  # per-match features (2024, 2025)",
            "node scripts/oracle-backtest.mjs report",
        ],
    },
} as const;
