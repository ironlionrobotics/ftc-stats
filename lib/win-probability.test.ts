import { describe, it, expect } from "vitest";
import {
    winProbabilityFromProjections,
    winProbabilityFromNormalModel,
    playoffWinProbability,
    consistencyMarginAdjustment,
    CONSISTENCY_MARGIN_WEIGHT,
} from "./win-probability";

describe("winProbabilityFromProjections (logistic, projection-only)", () => {
    it("gives exactly 0.5 for equal projections", () => {
        expect(winProbabilityFromProjections(100, 100)).toBeCloseTo(0.5, 10);
    });

    it("matches the calibrated k=1.5 logistic (parity with predictMatch)", () => {
        // diff 100, avg 100 → 1/(1+e^{-1.5}) ≈ 0.8176 — the same value the
        // projections.test.ts suite pins for predictMatch.
        expect(winProbabilityFromProjections(150, 50)).toBeCloseTo(0.8176, 3);
    });

    it("is symmetric: P(a,b) + P(b,a) = 1", () => {
        const p = winProbabilityFromProjections(120, 80);
        const q = winProbabilityFromProjections(80, 120);
        expect(p + q).toBeCloseTo(1, 10);
    });

    it("clamps to [0.01, 0.99]", () => {
        expect(winProbabilityFromProjections(1000, 1)).toBeLessThanOrEqual(0.99);
        expect(winProbabilityFromProjections(1, 1000)).toBeGreaterThanOrEqual(0.01);
    });

    it("handles zero scores without NaN", () => {
        expect(winProbabilityFromProjections(0, 0)).toBeCloseTo(0.5, 10);
    });
});

describe("winProbabilityFromNormalModel (probit, sigma-aware)", () => {
    it("gives 0.5 for equal means (within the erf approximation error)", () => {
        // A&S 7.1.26 has max abs error ≈ 1.5e-7 — assert to that guarantee.
        expect(winProbabilityFromNormalModel(100, 100, 25)).toBeCloseTo(0.5, 7);
    });

    it("matches the standard normal CDF at known quantiles", () => {
        // diff = 1σ → Φ(1) ≈ 0.84134
        expect(winProbabilityFromNormalModel(125, 100, 25)).toBeCloseTo(0.84134, 4);
        // diff = 2σ → Φ(2) ≈ 0.97725
        expect(winProbabilityFromNormalModel(150, 100, 25)).toBeCloseTo(0.97725, 4);
        // diff = 1.96σ → Φ(1.96) ≈ 0.975
        expect(winProbabilityFromNormalModel(149, 100, 25)).toBeCloseTo(0.975, 3);
    });

    it("is symmetric: P(a,b) + P(b,a) = 1", () => {
        const p = winProbabilityFromNormalModel(120, 90, 20);
        const q = winProbabilityFromNormalModel(90, 120, 20);
        expect(p + q).toBeCloseTo(1, 6);
    });

    it("clamps to [0.01, 0.99] instead of saturating", () => {
        expect(winProbabilityFromNormalModel(500, 0, 20)).toBe(0.99);
        expect(winProbabilityFromNormalModel(0, 500, 20)).toBe(0.01);
    });

    it("larger sigma pulls the probability toward 0.5", () => {
        const tight = winProbabilityFromNormalModel(120, 90, 15);
        const noisy = winProbabilityFromNormalModel(120, 90, 60);
        expect(tight).toBeGreaterThan(noisy);
        expect(noisy).toBeGreaterThan(0.5);
    });

    it("falls back to the projection logistic for invalid sigma", () => {
        const expected = winProbabilityFromProjections(120, 90);
        expect(winProbabilityFromNormalModel(120, 90, 0)).toBeCloseTo(expected, 10);
        expect(winProbabilityFromNormalModel(120, 90, -5)).toBeCloseTo(expected, 10);
        expect(winProbabilityFromNormalModel(120, 90, NaN)).toBeCloseTo(expected, 10);
        expect(winProbabilityFromNormalModel(120, 90, Infinity)).toBeCloseTo(expected, 10);
    });
});

describe("volatility effect (CONSISTENCY_MARGIN_WEIGHT)", () => {
    const SIG = 25;

    it("is inert when no consistency data is supplied", () => {
        // Callers that don't track per-team sigma must get the old answer,
        // not a silently different one.
        const withOut = playoffWinProbability(150, 140, SIG);
        const withUndef = playoffWinProbability(150, 140, SIG, undefined);
        expect(withUndef).toBeCloseTo(withOut, 12);
    });

    it("favors the MORE volatile alliance", () => {
        // The fitted direction: a sigma advantage is worth margin. Counter-
        // intuitive, and exactly why it's pinned by a test.
        const evenTeams = playoffWinProbability(150, 150, SIG);
        const redVolatile = playoffWinProbability(150, 150, SIG, { redMeanSigma: 30, blueMeanSigma: 20 });
        expect(redVolatile).toBeGreaterThan(evenTeams);
        const blueVolatile = playoffWinProbability(150, 150, SIG, { redMeanSigma: 20, blueMeanSigma: 30 });
        expect(blueVolatile).toBeLessThan(evenTeams);
    });

    it("is symmetric: swapping sides mirrors the probability", () => {
        const a = playoffWinProbability(160, 140, SIG, { redMeanSigma: 30, blueMeanSigma: 18 });
        const b = playoffWinProbability(140, 160, SIG, { redMeanSigma: 18, blueMeanSigma: 30 });
        expect(a + b).toBeCloseTo(1, 10);
    });

    it("converts one point of sigma advantage into ~1.06 points of margin", () => {
        // The adjustment is the whole integration; if the constant drifts, the
        // model silently stops matching the fit it came from.
        expect(consistencyMarginAdjustment({ redMeanSigma: 30, blueMeanSigma: 20 }))
            .toBeCloseTo(CONSISTENCY_MARGIN_WEIGHT * 10, 10);
        // Equivalent to shifting red's projected score by that amount.
        const viaAdj = playoffWinProbability(150 + CONSISTENCY_MARGIN_WEIGHT * 10, 150, SIG);
        const viaCons = playoffWinProbability(150, 150, SIG, { redMeanSigma: 30, blueMeanSigma: 20 });
        expect(viaCons).toBeCloseTo(viaAdj, 12);
    });

    it("degrades to zero on missing or nonsensical sigmas", () => {
        for (const c of [
            { redMeanSigma: 0, blueMeanSigma: 20 },
            { redMeanSigma: 30, blueMeanSigma: 0 },
            { redMeanSigma: NaN, blueMeanSigma: 20 },
            { redMeanSigma: -5, blueMeanSigma: 20 },
        ]) {
            expect(consistencyMarginAdjustment(c)).toBe(0);
        }
    });
});
