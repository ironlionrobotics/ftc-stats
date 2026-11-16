/**
 * Draft priors — measured, not assumed.
 *
 * The alliance-selection thresholds the app used until now came from reading a
 * handful of events (decisions.md #58: "captain ≈ top `alliances`, pickable ≈
 * top 2×"). These numbers replace that guess with the observed rates from
 * **622 events and 15,511 team-event observations** of the 2025 season,
 * reconstructed from the official FIRST archive by `scripts/draft-science.ts`,
 * summarized by `scripts/draft-analysis.mjs` and regenerated with
 * `node scripts/build-draft-priors.mjs 2025` (FTCScout until 16-nov-2026).
 *
 * One season on purpose: OPR is only comparable within a season, and the OPR
 * half of this analysis would be meaningless pooled across games.
 *
 * The headline finding is that seeding is NOT destiny. Among teams that cannot
 * captain (seeded below the alliance count) but sit in the upper third of the
 * table, being in the top OPR decile of your event raises selection odds from
 * roughly 50% to over 90% — a bigger swing than several seed positions. That is
 * the quantified form of what FPEMX suggested anecdotally: being visibly
 * pickable is worth more than grinding out one more rank.
 */

export interface SeedPickRate {
    seed: number;
    /** Team-events observed at this seed (fields of 20+ teams). */
    n: number;
    /** Raw observed share that ended up on a playoff alliance. Kept for transparency. */
    pickRate: number;
    /**
     * `pickRate` after isotonic regression (pool-adjacent-violators, weighted by
     * n) forcing the curve to be non-increasing. The raw rates wiggle at the
     * thin end — seed 20 measured slightly above seed 19 — and a curve where
     * seeding WORSE improves your odds is noise, not signal. Monotonicity is
     * known a priori here, so imposing it is the maximum-likelihood estimate,
     * not a cosmetic smoothing. This is the series to compute with.
     */
    pickRateSmoothed: number;
}

export interface OprBandLift {
    /** Lower edge of the OPR percentile band within the event. */
    band: "p90" | "p75" | "p50" | "p25" | "p0";
    n: number;
    pickRate: number;
    /** pickRate relative to the band-agnostic base. Descriptive only. */
    lift: number;
    /**
     * The same effect expressed as an ODDS ratio, and this is the one to
     * compute with. Multiplying a probability by `lift` overshoots whenever the
     * base is already high — a seed-8 team at 87% times a 1.22 lift lands past
     * 100% and has to be clamped, which hides the breakdown rather than fixing
     * it. Odds ratios compose correctly and stay inside (0,1) by construction.
     */
    oddsRatio: number;
}

export const DRAFT_PRIORS = {
    season: 2025,
    events: 622,
    observations: 15511,

    /**
     * Selection rate by ABSOLUTE seed, restricted to fields of 20+ teams so a
     * given seed means a comparable thing. Absolute rather than normalized
     * because a seed number is what a team can actually read off the ranking
     * screen mid-event.
     */
    bySeed: [
        { seed: 1, n: 439, pickRate: 1, pickRateSmoothed: 1 },
        { seed: 2, n: 439, pickRate: 1, pickRateSmoothed: 1 },
        { seed: 3, n: 439, pickRate: 1, pickRateSmoothed: 1 },
        { seed: 4, n: 439, pickRate: 1, pickRateSmoothed: 1 },
        { seed: 5, n: 439, pickRate: 0.9932, pickRateSmoothed: 0.9932 },
        { seed: 6, n: 439, pickRate: 0.9863, pickRateSmoothed: 0.9863 },
        { seed: 7, n: 439, pickRate: 0.9544, pickRateSmoothed: 0.9544 },
        { seed: 8, n: 439, pickRate: 0.918, pickRateSmoothed: 0.918 },
        { seed: 9, n: 439, pickRate: 0.82, pickRateSmoothed: 0.82 },
        { seed: 10, n: 439, pickRate: 0.6879, pickRateSmoothed: 0.6879 },
        { seed: 11, n: 439, pickRate: 0.5376, pickRateSmoothed: 0.5376 },
        { seed: 12, n: 439, pickRate: 0.4374, pickRateSmoothed: 0.4374 },
        { seed: 13, n: 439, pickRate: 0.2938, pickRateSmoothed: 0.2938 },
        { seed: 14, n: 439, pickRate: 0.287, pickRateSmoothed: 0.287 },
        { seed: 15, n: 439, pickRate: 0.1936, pickRateSmoothed: 0.1936 },
        { seed: 16, n: 439, pickRate: 0.1526, pickRateSmoothed: 0.1526 },
        { seed: 17, n: 439, pickRate: 0.1367, pickRateSmoothed: 0.1367 },
        { seed: 18, n: 439, pickRate: 0.1298, pickRateSmoothed: 0.1298 },
        { seed: 19, n: 439, pickRate: 0.0957, pickRateSmoothed: 0.1059 },
        { seed: 20, n: 439, pickRate: 0.1162, pickRateSmoothed: 0.1059 },
        { seed: 21, n: 418, pickRate: 0.0646, pickRateSmoothed: 0.0702 },
        { seed: 22, n: 394, pickRate: 0.0761, pickRateSmoothed: 0.0702 },
        { seed: 23, n: 369, pickRate: 0.0542, pickRateSmoothed: 0.057 },
        { seed: 24, n: 333, pickRate: 0.0601, pickRateSmoothed: 0.057 },
    ] as SeedPickRate[],

    /**
     * Effect of OPR within a NARROW seed band (7-12) so the lift cannot be
     * seeding in disguise. `base` is the pooled rate for that band.
     */
    oprEffect: {
        seedRange: [7, 12] as const,
        base: 0.7558,
        bands: [
        { band: "p90", n: 180, pickRate: 0.9556, lift: 1.264, oddsRatio: 6.945 },
        { band: "p75", n: 588, pickRate: 0.8827, lift: 1.168, oddsRatio: 2.430 },
        { band: "p50", n: 857, pickRate: 0.7386, lift: 0.977, oddsRatio: 0.913 },
        { band: "p25", n: 476, pickRate: 0.6092, lift: 0.806, oddsRatio: 0.504 },
        { band: "p0", n: 164, pickRate: 0.5976, lift: 0.791, oddsRatio: 0.480 },
        ] as OprBandLift[],
    },

    /**
     * Share of teams that seeded ABOVE the last team selected and still went
     * unpicked. Captains routinely reach past better-seeded teams, which is why
     * a pure seed threshold was never going to be right.
     */
    seedOrderViolationRate: 0.335,
} as const;
