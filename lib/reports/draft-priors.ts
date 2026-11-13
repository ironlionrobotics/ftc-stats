/**
 * Draft priors — measured, not assumed.
 *
 * The alliance-selection thresholds the app used until now came from reading a
 * handful of events (decisions.md #58: "captain ≈ top `alliances`, pickable ≈
 * top 2×"). These numbers replace that guess with the observed rates from
 * **606 events and 15,186 team-event observations** of the 2025 season,
 * reconstructed by `scripts/draft-science.mjs` and summarized by
 * `scripts/draft-analysis.mjs`.
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
     * thin end — seed 14 measured slightly above seed 13 — and a curve where
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
    events: 606,
    observations: 15186,

    /**
     * Selection rate by ABSOLUTE seed, restricted to fields of 20+ teams so a
     * given seed means a comparable thing. Absolute rather than normalized
     * because a seed number is what a team can actually read off the ranking
     * screen mid-event.
     */
    bySeed: [
        { seed: 1, n: 436, pickRate: 1, pickRateSmoothed: 1 },
        { seed: 2, n: 436, pickRate: 0.9954, pickRateSmoothed: 0.9954 },
        { seed: 3, n: 436, pickRate: 0.9885, pickRateSmoothed: 0.9885 },
        { seed: 4, n: 436, pickRate: 0.9862, pickRateSmoothed: 0.9862 },
        { seed: 5, n: 436, pickRate: 0.9656, pickRateSmoothed: 0.9656 },
        { seed: 6, n: 436, pickRate: 0.9495, pickRateSmoothed: 0.9495 },
        { seed: 7, n: 436, pickRate: 0.9174, pickRateSmoothed: 0.9174 },
        { seed: 8, n: 436, pickRate: 0.867, pickRateSmoothed: 0.867 },
        { seed: 9, n: 436, pickRate: 0.7592, pickRateSmoothed: 0.7592 },
        { seed: 10, n: 436, pickRate: 0.6261, pickRateSmoothed: 0.6261 },
        { seed: 11, n: 436, pickRate: 0.5367, pickRateSmoothed: 0.5367 },
        { seed: 12, n: 436, pickRate: 0.4633, pickRateSmoothed: 0.4633 },
        { seed: 13, n: 436, pickRate: 0.3028, pickRateSmoothed: 0.3166 },
        { seed: 14, n: 436, pickRate: 0.3303, pickRateSmoothed: 0.3166 },
        { seed: 15, n: 436, pickRate: 0.2339, pickRateSmoothed: 0.2339 },
        { seed: 16, n: 436, pickRate: 0.1743, pickRateSmoothed: 0.1743 },
        { seed: 17, n: 437, pickRate: 0.1739, pickRateSmoothed: 0.1739 },
        { seed: 18, n: 436, pickRate: 0.156, pickRateSmoothed: 0.156 },
        { seed: 19, n: 436, pickRate: 0.1422, pickRateSmoothed: 0.1422 },
        { seed: 20, n: 436, pickRate: 0.1376, pickRateSmoothed: 0.1376 },
        { seed: 21, n: 415, pickRate: 0.0916, pickRateSmoothed: 0.0922 },
        { seed: 22, n: 388, pickRate: 0.0928, pickRateSmoothed: 0.0922 },
        { seed: 23, n: 365, pickRate: 0.0849, pickRateSmoothed: 0.0849 },
        { seed: 24, n: 330, pickRate: 0.0636, pickRateSmoothed: 0.0636 },
    ] as SeedPickRate[],

    /**
     * Effect of OPR within a NARROW seed band (7-12) so the lift cannot be
     * seeding in disguise. `base` is the pooled rate for that band.
     */
    oprEffect: {
        seedRange: [7, 12] as const,
        base: 0.7181,
        bands: [
        { band: "p90", n: 185, pickRate: 0.9405, lift: 1.31, oddsRatio: 6.205 },
        { band: "p75", n: 562, pickRate: 0.879, lift: 1.224, oddsRatio: 2.852 },
        { band: "p50", n: 793, pickRate: 0.7062, lift: 0.983, oddsRatio: 0.944 },
        { band: "p25", n: 491, pickRate: 0.5601, lift: 0.78, oddsRatio: 0.500 },
        { band: "p0", n: 207, pickRate: 0.5024, lift: 0.7, oddsRatio: 0.396 },
        ] as OprBandLift[],
    },

    /**
     * Share of teams that seeded ABOVE the last team selected and still went
     * unpicked. Captains routinely reach past better-seeded teams, which is why
     * a pure seed threshold was never going to be right.
     */
    seedOrderViolationRate: 0.367,
} as const;
