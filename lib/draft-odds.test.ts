import { describe, it, expect } from "vitest";
import { draftOdds, seedPickRate, seedNeededFor } from "./draft-odds";
import { DRAFT_PRIORS } from "./reports/draft-priors";

describe("seedPickRate", () => {
    it("is monotonically non-increasing across the measured seeds", () => {
        // Selection odds must never improve by seeding worse.
        const rates = DRAFT_PRIORS.bySeed.map(r => seedPickRate(r.seed));
        for (let i = 1; i < rates.length; i++) {
            expect(rates[i]).toBeLessThanOrEqual(rates[i - 1] + 1e-9);
        }
    });

    it("reproduces the smoothed rate at measured seeds", () => {
        for (const row of DRAFT_PRIORS.bySeed) {
            expect(seedPickRate(row.seed)).toBeCloseTo(row.pickRateSmoothed, 10);
        }
    });

    it("interpolates between measured seeds", () => {
        // Seeds 10 and 12 are measured; 11 is not — it must land between them.
        const s10 = seedPickRate(10), s11 = seedPickRate(11), s12 = seedPickRate(12);
        expect(s11).toBeLessThan(s10);
        expect(s11).toBeGreaterThan(s12);
    });

    it("holds the tail value instead of extrapolating below zero", () => {
        const deep = seedPickRate(200);
        expect(deep).toBeGreaterThanOrEqual(0);
        expect(deep).toBeLessThan(0.2);
    });
});

describe("draftOdds", () => {
    it("treats a seed inside the alliance count as a captain", () => {
        const o = draftOdds(3, 8);
        expect(o.wouldCaptain).toBe(true);
        expect(o.probability).toBeGreaterThan(0.95);
        expect(o.oprAdjustment).toBe(0);
    });

    it("OPR standing moves the odds for teams that cannot captain", () => {
        // The finding this module exists for: at the same seed, visible ability
        // is worth more than a couple of ranking positions.
        const strong = draftOdds(10, 6, 95);
        const weak = draftOdds(10, 6, 10);
        expect(strong.probability).toBeGreaterThan(weak.probability);
        expect(strong.probability - weak.probability).toBeGreaterThan(0.15);
        expect(strong.oprAdjustment).toBeGreaterThan(0);
        expect(weak.oprAdjustment).toBeLessThan(0);
    });

    it("never applies the OPR lift to a captain-seeded team", () => {
        // A top seed is already near certain; lifting it would push past 1.
        const o = draftOdds(2, 8, 99);
        expect(o.oprAdjustment).toBe(0);
        expect(o.probability).toBeLessThanOrEqual(1);
    });

    it("adjusts in odds space, so a high base isn't clamped flat", () => {
        // Multiplying probabilities would push seed 8 (base ~87%) past 1 for
        // both p75 and p95, collapsing them to the same clamped value and
        // destroying the distinction. Odds ratios keep them ordered.
        const good = draftOdds(8, 6, 75).probability;
        const better = draftOdds(8, 6, 95).probability;
        expect(good).toBeLessThan(better);
        expect(better).toBeLessThan(1);
        expect(good).toBeGreaterThan(seedPickRate(8));
    });

    it("keeps probabilities inside (0,1) even at extreme inputs", () => {
        for (const [seed, all, opr] of [[1, 8, 99], [7, 6, 99], [40, 4, 0], [12, 6, 95]] as const) {
            const p = draftOdds(seed, all, opr).probability;
            expect(p).toBeGreaterThan(0);
            expect(p).toBeLessThanOrEqual(1);
        }
    });

    it("degrades gracefully when no OPR percentile is known", () => {
        const o = draftOdds(9, 6);
        expect(o.oprAdjustment).toBe(0);
        expect(o.probability).toBeCloseTo(seedPickRate(9), 10);
        // basis is now a translation key + params (no prose in the analysis layer).
        expect(o.basis).toEqual({ key: "seedRate", seed: 9 });
    });

    it("returns a structured basis (key + params), never prose", () => {
        expect(draftOdds(1, 8).basis).toEqual({ key: "captain", seed: 1, alliances: 8 });
        const up = draftOdds(9, 6, 95).basis;
        expect(up.key).toBe("oprUp");
        expect(up).toMatchObject({ seed: 9, oprPct: 95 });
    });
});

describe("seedNeededFor", () => {
    it("answers 'how high must we finish' monotonically", () => {
        // Demanding more certainty can only require an equal or better seed.
        const safe = seedNeededFor(0.9);
        const safer = seedNeededFor(0.95);
        expect(safer).toBeLessThanOrEqual(safe);
        expect(safe).toBeGreaterThan(0);
    });

    it("puts the 90% threshold in the single digits", () => {
        // Sanity against the measured table: seed 7 is ~92%, seed 9 ~76%.
        expect(seedNeededFor(0.9)).toBeLessThanOrEqual(9);
        expect(seedNeededFor(0.9)).toBeGreaterThanOrEqual(4);
    });
});
