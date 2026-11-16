/**
 * Oracle calibration record — the public transparency dataset.
 *
 * Every figure here was RECOMPUTED from the raw backtest output in
 * `data/oracle-backtest-first/*.jsonl` (produced by `scripts/oracle-backtest.ts`
 * over the official FIRST archive, `scripts/first-archive-pull.ts`; decision
 * #118) and summarized by `scripts/build-oracle-calibration.mjs`, not
 * transcribed from prose. Until Nov 2026 the same pipeline read FTCScout; the
 * FIRST rebuild moved the total from 74.8% to 74.4%. A finished
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
        events: 2808,
        matches: 21368,
        accuracy: 74.4,
    },

    /** One row per season. Different games, same model — that's the point. */
    seasons: [
        { season: 2019, game: "Skystone", events: 276, matches: 1910, accuracy: 71.3, brier: 0.213, confidence: 68.4, gap: -2.9 },
        { season: 2020, game: "Ultimate Goal", events: 48, matches: 322, accuracy: 81.1, brier: 0.136, confidence: 77.7, gap: -3.4 },
        { season: 2021, game: "Freight Frenzy", events: 292, matches: 1990, accuracy: 72.1, brier: 0.197, confidence: 67.4, gap: -4.7 },
        { season: 2022, game: "Power Play", events: 420, matches: 2917, accuracy: 72.3, brier: 0.197, confidence: 70.4, gap: -1.9 },
        { season: 2023, game: "Centerstage", events: 490, matches: 3356, accuracy: 75.3, brier: 0.184, confidence: 72.8, gap: -2.5 },
        { season: 2024, game: "Into The Deep", events: 584, matches: 4964, accuracy: 75.6, brier: 0.178, confidence: 73.2, gap: -2.4 },
        { season: 2025, game: "DECODE", events: 698, matches: 5909, accuracy: 75.4, brier: 0.182, confidence: 72.9, gap: -2.5 },
    ] as SeasonCalibration[],

    /** Same model, by event tier. Accuracy falls as the field tightens. */
    levels: [
        { key: "regional", label: "Regionales y ligas", matches: 16394, accuracy: 75.3, confidence: 72.7, gap: -2.6 },
        { key: "championship", label: "Campeonatos regionales", matches: 4447, accuracy: 72, confidence: 69, gap: -3 },
        { key: "premier", label: "Premier Events", matches: 314, accuracy: 71.7, confidence: 67.7, gap: -4 },
        { key: "worlds", label: "Mundial (divisiones)", matches: 213, accuracy: 63.4, confidence: 60.5, gap: -2.9 },
    ] as LevelCalibration[],

    /**
     * Reliability diagram over the 10,873 playoff matches of 2024+2025 —
     * the seasons for which per-match features were exported.
     *
     * `raw` is the model as first shipped: σ estimated from qualification
     * matches. `corrected` applies the 2.4× playoff σ inflation that was
     * LEARNED from this very data (decisions.md #59), not assumed.
     */
    reliability: {
        matches: 10873,
        raw: [
        { range: "50-60%", matches: 933, predicted: 55, realized: 50.6, gap: 4.5 },
        { range: "60-70%", matches: 1006, predicted: 65.2, realized: 56.9, gap: 8.4 },
        { range: "70-80%", matches: 1126, predicted: 75.2, realized: 64.7, gap: 10.5 },
        { range: "80-90%", matches: 1495, predicted: 85.1, realized: 68, gap: 17.1 },
        { range: "90-100%", matches: 6313, predicted: 98, realized: 85.9, gap: 12.1 },
        ] as ReliabilityBin[],
        corrected: [
        { range: "50-60%", matches: 2239, predicted: 55.1, realized: 54.8, gap: 0.3 },
        { range: "60-70%", matches: 2260, predicted: 65, realized: 67, gap: -2.1 },
        { range: "70-80%", matches: 2052, predicted: 74.9, realized: 76.2, gap: -1.4 },
        { range: "80-90%", matches: 1873, predicted: 85, realized: 85.5, gap: -0.5 },
        { range: "90-100%", matches: 2449, predicted: 95.7, realized: 94.2, gap: 1.5 },
        ] as ReliabilityBin[],
    },

    /** How anyone can regenerate every number above from scratch. */
    reproduce: {
        source: "https://ftc-events.firstinspires.org/services/API",
        script: "scripts/oracle-backtest.ts",
        steps: [
            "node scripts/run-ts.mjs scripts/first-archive-pull.ts <season>      # official FIRST archive (needs FTC_API_* credentials)",
            "node scripts/run-ts.mjs scripts/oracle-backtest.ts run <season>      # per-event aggregates, 2019-2025",
            "node scripts/run-ts.mjs scripts/oracle-backtest.ts matches <season>  # per-match features (2024, 2025)",
            "node scripts/build-oracle-calibration.mjs                            # every figure on this page",
        ],
    },
} as const;
