/**
 * "Will I get picked?" — the empirical version.
 *
 * `lib/event-selector.ts` answers this with a verdict label (capitán / pick /
 * burbuja / fuera) derived from seed thresholds that were eyeballed from a few
 * events (decisions.md #58). This module answers it with a probability taken
 * from 606 events of measured selection outcomes (lib/reports/draft-priors.ts).
 *
 * The two coexist deliberately: the verdict is the thing to SAY, the
 * probability is the thing to DECIDE on. A verdict of "burbuja" reads the same
 * at 45% and at 85%, and those are very different situations to plan for.
 */

import { DRAFT_PRIORS as P } from "./reports/draft-priors";

export interface DraftOdds {
    /** 0-1 probability of ending up on a playoff alliance. */
    probability: number;
    /** True when the seed is good enough to captain an alliance outright. */
    wouldCaptain: boolean;
    /**
     * How much the OPR standing moved the estimate, in probability points.
     * 0 when no OPR percentile was supplied.
     */
    oprAdjustment: number;
    /** Reason the estimate is what it is, for UI that must explain itself. */
    basis: string;
}

/**
 * Selection rate at a seed, linearly interpolated between measured seeds.
 *
 * Reads `pickRateSmoothed`, not the raw rate: the raw series wiggles at the
 * thin end (seed 14 measured above seed 13) and a curve implying that seeding
 * worse helps would be noise presented as advice.
 */
export function seedPickRate(seed: number): number {
    const t = P.bySeed;
    if (seed <= t[0].seed) return t[0].pickRateSmoothed;
    const last = t[t.length - 1];
    // Beyond the measured range the rate keeps decaying; hold the tail value
    // rather than extrapolating a line straight through zero into negatives.
    if (seed >= last.seed) return last.pickRateSmoothed;
    for (let i = 1; i < t.length; i++) {
        if (seed <= t[i].seed) {
            const a = t[i - 1], b = t[i];
            const w = (seed - a.seed) / (b.seed - a.seed);
            return a.pickRateSmoothed + (b.pickRateSmoothed - a.pickRateSmoothed) * w;
        }
    }
    return last.pickRateSmoothed;
}

/** Odds ratio for a team's OPR standing within its own event. */
function oprOddsRatio(oprPct: number): number {
    const b = P.oprEffect.bands;
    if (oprPct >= 90) return b[0].oddsRatio;
    if (oprPct >= 75) return b[1].oddsRatio;
    if (oprPct >= 50) return b[2].oddsRatio;
    if (oprPct >= 25) return b[3].oddsRatio;
    return b[4].oddsRatio;
}

/**
 * Probability that a team at `seed` in a field with `alliances` alliances ends
 * up on one. `oprPct` (0-100, the team's OPR percentile within that event)
 * sharpens the estimate where it matters most.
 *
 * The OPR lift was measured on teams that could NOT captain, so it is applied
 * only there — a top seed is already at ~100% and has nothing to gain.
 */
export function draftOdds(seed: number, alliances: number, oprPct?: number): DraftOdds {
    const base = seedPickRate(seed);
    const wouldCaptain = seed <= alliances;

    if (wouldCaptain || oprPct === undefined || !Number.isFinite(oprPct)) {
        return {
            probability: base,
            wouldCaptain,
            oprAdjustment: 0,
            basis: wouldCaptain
                ? `Seed ${seed} alcanza para capitanear una de las ${alliances} alianzas.`
                : `Tasa histórica de selección en el seed ${seed}.`,
        };
    }

    const or = oprOddsRatio(oprPct);
    // Applied in ODDS space, not probability space: multiplying a probability
    // by a >1 factor overshoots whenever the base is already high, and the
    // clamp that would hide it also destroys the information. Odds ratios
    // compose correctly and land inside (0,1) by construction.
    const odds = (base / (1 - base)) * or;
    const adjusted = odds / (1 + odds);
    return {
        probability: adjusted,
        wouldCaptain: false,
        oprAdjustment: adjusted - base,
        basis: or >= 1
            ? `Seed ${seed} da ${(base * 100).toFixed(0)}%, pero estar en el percentil ${oprPct.toFixed(0)} de OPR del evento sube la probabilidad: los capitanes miran capacidad, no solo la tabla.`
            : `Seed ${seed} da ${(base * 100).toFixed(0)}%, pero un OPR en el percentil ${oprPct.toFixed(0)} la baja — a igualdad de seed, los capitanes prefieren al que anota más.`,
    };
}

/**
 * The seed at which selection odds first drop below `target`. Answers the
 * planning question directly: "how high do we need to finish?"
 */
export function seedNeededFor(target: number): number {
    for (const row of P.bySeed) if (row.pickRateSmoothed < target) return Math.max(1, row.seed - 1);
    return P.bySeed[P.bySeed.length - 1].seed;
}
