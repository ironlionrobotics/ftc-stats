/**
 * Consistency tracker — "¿cuánto de nuestro pico entregamos de verdad?"
 *
 * Motivation (decisions.md #58): 30311's season-aggregate OPR is 63.4 but its
 * peak is 80.8. Projected into real fields, the peak reaches playoff bubble at
 * 4/5 Premiers while the season number is out of playoffs at ALL of them. So
 * the 17-point gap is the entire difference between viable and not viable, and
 * #58 concluded "the lever is season consistency, not the peak".
 *
 * This module refines that conclusion, because "inconsistent" hides two very
 * different situations that call for OPPOSITE strategies:
 *
 *   - GROWTH: the spread is a rising trend. Early-season events drag the
 *     average down, but the team's current form is near its peak. The problem
 *     is not variance — it is that the public season-aggregate number LAGS
 *     current form, and captains scout on that lagging number.
 *     Lever: retain the gains and make current form visible.
 *
 *   - VOLATILITY: the spread is noise around a flat mean. Any given event is a
 *     coin flip between floor and peak.
 *     Lever: raise the floor (reliability, failure modes), not the ceiling.
 *
 * The two are separated by fitting a line over the chronological series and
 * asking how much of the raw spread that line explains (r²). What is left over
 * (residualSigma) is volatility the trend does NOT account for.
 *
 * STATISTICAL NOTE ON SMALL n. A season is typically 3-6 events, so every
 * estimate here is noisy and `n` is always reported so callers can caveat.
 * `rawSigma` and `residualSigma` are both population (RMS) deviations — from
 * the mean and from the fitted line respectively — so they are directly
 * comparable and satisfy exactly (residualSigma/rawSigma)² = 1 − r². Using the
 * unbiased n−1 / n−2 estimators instead would break that identity and make the
 * two numbers incomparable in the UI, which is the main thing we want to show.
 * `adjustedR2` carries the small-sample correction for callers that need the
 * conservative figure.
 *
 * All outputs are descriptive statistics over a handful of observations, not
 * predictions — same honesty contract as the Oracle. `projectedNext` in
 * particular is a linear EXTRAPOLATION and must be labeled as such in any UI.
 */

import { EventProfile, EventProjection, Verdict, projectAtEvent } from "./event-selector";

/** One chronological observation of a team's performance. */
export interface FormPoint {
    /** Display label, e.g. the event code. */
    label: string;
    /** Total OPR at this event. */
    opr: number;
    /** Optional phase splits, enabling the per-phase decomposition. */
    auto?: number;
    dc?: number;
}

export interface SeriesAnalysis {
    n: number;
    mean: number;
    min: number;
    max: number;
    median: number;
    /** Population sd of the raw values (RMS deviation from the mean). */
    rawSigma: number;
    /** Scale-free spread: rawSigma / mean. 0 when mean is 0. */
    cv: number;
    /** OLS slope, in units per event. */
    slope: number;
    /** Share of the raw spread explained by the linear trend, 0-1. */
    r2: number;
    /** Small-sample-corrected r². Null when n < 4 (no residual df to correct with). */
    adjustedR2: number | null;
    /** Population sd of the residuals — the spread the trend does NOT explain. */
    residualSigma: number;
    /** Fitted value at the last observation. Less noisy than the raw last point. */
    currentForm: number;
    /** Fitted value one event past the last. EXTRAPOLATION — label it as such. */
    projectedNext: number;
}

export type FormDiagnosis =
    | "insuficiente"   // too few events to say anything
    | "estable"        // spread is negligible regardless of shape
    | "crecimiento"    // rising trend explains most of the spread
    | "declive"        // falling trend explains most of the spread
    | "volatilidad"    // spread is mostly noise around a flat mean
    | "mixto";         // some trend, some noise

function median(sorted: number[]): number {
    const n = sorted.length;
    if (n === 0) return 0;
    const mid = n >> 1;
    return n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Ordinary least squares over (index, value) pairs. Index is the event's
 * chronological position, so `slope` reads as "OPR gained per event".
 */
function ols(values: number[]): { slope: number; intercept: number } {
    const n = values.length;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;
    let sxy = 0;
    let sxx = 0;
    for (let i = 0; i < n; i++) {
        sxy += (i - xMean) * (values[i] - yMean);
        sxx += (i - xMean) ** 2;
    }
    // sxx is 0 only when n < 2; a flat line through the mean is the right
    // degenerate answer there.
    const slope = sxx === 0 ? 0 : sxy / sxx;
    return { slope, intercept: yMean - slope * xMean };
}

export function analyzeSeries(values: number[]): SeriesAnalysis {
    const n = values.length;
    if (n === 0) {
        return {
            n: 0, mean: 0, min: 0, max: 0, median: 0, rawSigma: 0, cv: 0,
            slope: 0, r2: 0, adjustedR2: null, residualSigma: 0,
            currentForm: 0, projectedNext: 0,
        };
    }

    const mean = values.reduce((a, b) => a + b, 0) / n;
    const sorted = [...values].sort((a, b) => a - b);

    const ssTot = values.reduce((s, v) => s + (v - mean) ** 2, 0);
    const rawSigma = Math.sqrt(ssTot / n);

    const { slope, intercept } = ols(values);
    const ssRes = values.reduce((s, v, i) => s + (v - (intercept + slope * i)) ** 2, 0);
    const residualSigma = Math.sqrt(ssRes / n);

    // A perfectly flat series has nothing to explain; call that r²=0 rather
    // than 0/0. Guard the tiny-negative case from floating point too.
    const r2 = ssTot === 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);

    // Adjusted r² needs n-2 residual degrees of freedom, so it only exists
    // from n=4 up (a line through 2 points is exact, 3 leaves 1 df).
    const adjustedR2 = n >= 4 ? 1 - (1 - r2) * ((n - 1) / (n - 2)) : null;

    return {
        n,
        mean,
        min: sorted[0],
        max: sorted[n - 1],
        median: median(sorted),
        rawSigma,
        cv: mean === 0 ? 0 : rawSigma / mean,
        slope,
        r2,
        adjustedR2,
        residualSigma,
        currentForm: intercept + slope * (n - 1),
        projectedNext: intercept + slope * n,
    };
}

/**
 * Classifies a series into the growth-vs-volatility distinction that drives
 * the strategic recommendation.
 *
 * Thresholds are judgment calls, not fitted constants: cv 8% is roughly the
 * point below which event-to-event OPR differences stop being visible in
 * ranking outcomes, and r² 0.6/0.35 splits "the line is the story" from "the
 * line is not the story" with a deliberate `mixto` band between them so
 * borderline cases are not forced into a confident label.
 */
export function diagnoseForm(a: SeriesAnalysis): FormDiagnosis {
    if (a.n < 3) return "insuficiente";
    if (a.cv < 0.08) return "estable";
    if (a.r2 >= 0.6) return a.slope > 0 ? "crecimiento" : "declive";
    if (a.r2 < 0.35) return "volatilidad";
    return "mixto";
}

export interface PhaseConsistency {
    /** Semantic key ("auto" | "dc") — the UI translates it, never a label here. */
    key: string;
    analysis: SeriesAnalysis;
    diagnosis: FormDiagnosis;
}

export interface ConsistencyProfile {
    /** Total-OPR series — the headline analysis. */
    tot: SeriesAnalysis;
    diagnosis: FormDiagnosis;
    /** Chronological labels, parallel to the input points. */
    labels: string[];
    /**
     * The season-blended OPR other teams see when scouting you (e.g. on
     * FTCScout). This — not your peak — is what captains draft on.
     */
    publicNumber: number;
    /** currentForm − publicNumber: how far your public number lags your form. */
    scoutingGap: number;
    /** peak − publicNumber: the gap decisions.md #58 identified. */
    peakGap: number;
    /** publicNumber / peak, 0-1: the share of your best you typically show. */
    realizationRate: number;
    phases: PhaseConsistency[];
    /**
     * The phase contributing the most UNEXPLAINED spread (largest residual
     * sigma) — i.e. the true volatility driver, as opposed to the phase that
     * merely varies most because it is growing. Null when no phase data.
     */
    volatilityDriver: PhaseConsistency | null;
}

/**
 * Builds the full profile. `publicNumber` should be the season-aggregate OPR
 * as published (FTCScout's blended figure); it falls back to the series median
 * when not supplied, which is the closest stand-in.
 */
export function buildConsistencyProfile(points: FormPoint[], publicNumber?: number): ConsistencyProfile {
    const tot = analyzeSeries(points.map(p => p.opr));

    const phaseKeys: ("auto" | "dc")[] = ["auto", "dc"];

    const phases: PhaseConsistency[] = phaseKeys.flatMap((key) => {
        const values = points.map(p => p[key]).filter((v): v is number => typeof v === "number");
        // Only analyze a phase when every event reported it; a partial series
        // would silently compare different sets of events.
        if (values.length !== points.length || values.length === 0) return [];
        const analysis = analyzeSeries(values);
        return [{ key, analysis, diagnosis: diagnoseForm(analysis) }];
    });

    const volatilityDriver = phases.length === 0
        ? null
        : phases.reduce((a, b) => (b.analysis.residualSigma > a.analysis.residualSigma ? b : a));

    const publik = publicNumber ?? tot.median;

    return {
        tot,
        diagnosis: diagnoseForm(tot),
        labels: points.map(p => p.label),
        publicNumber: publik,
        scoutingGap: tot.currentForm - publik,
        peakGap: tot.max - publik,
        realizationRate: tot.max === 0 ? 0 : publik / tot.max,
        phases,
        volatilityDriver,
    };
}

// ── Translating form into alliance-selection outcomes ──────────────────────

export type BandKey = "piso" | "publico" | "actual" | "pico";

export interface FormBand {
    /** Semantic key — the UI translates label + hint from it, never prose here. */
    key: BandKey;
    opr: number;
    projection: EventProjection;
}

/**
 * Projects each form band into a real event field, so "consistency" stops
 * being an abstract statistic and becomes "at your floor you are out; at your
 * current form you are a pick".
 */
export function projectFormBands(profile: ConsistencyProfile, event: EventProfile): FormBand[] {
    const bands: { key: BandKey; opr: number }[] = [
        { key: "piso", opr: profile.tot.min },
        { key: "publico", opr: profile.publicNumber },
        { key: "actual", opr: profile.tot.currentForm },
        { key: "pico", opr: profile.tot.max },
    ];

    return bands.map(b => ({ ...b, projection: projectAtEvent(b.opr, event) }));
}

const VERDICT_RANK: Record<Verdict, number> = { capitan: 0, pick: 1, burbuja: 2, fuera: 3 };

/**
 * Minimum OPR needed to reach `target` at this event.
 *
 * Solved by bisection over `projectAtEvent` rather than by inverting the
 * normal CDF analytically: the verdict is a step function of seed, which is
 * itself rounded, so an analytic inverse would disagree with the forward
 * function at the boundaries. Bisecting the real function cannot.
 *
 * Returns null when the target is unreachable within the search range.
 */
export function oprToReachVerdict(target: Verdict, event: EventProfile): number | null {
    const meets = (opr: number) => VERDICT_RANK[projectAtEvent(opr, event).verdict] <= VERDICT_RANK[target];

    let lo = 0;
    // The top of the field is a generous ceiling for "captain at this event";
    // double it so the bound is never the binding constraint.
    let hi = Math.max(event.oprTop * 2, event.oprMean * 4, 100);
    if (!meets(hi)) return null;
    if (meets(lo)) return lo;

    // 40 halvings takes the bracket well below 0.01 OPR for any real field.
    for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        if (meets(mid)) hi = mid; else lo = mid;
    }
    return hi;
}

export interface TierGap {
    from: Verdict;
    to: Verdict;
    oprNeeded: number;
    /** OPR points still missing. 0 when already there. */
    delta: number;
}

/**
 * "How many OPR points from here to the next tier at this event?" — the
 * actionable version of the consistency gap. Returns null when already the
 * top tier (captain) or when the next tier is unreachable.
 */
export function pointsToNextTier(currentOpr: number, event: EventProfile): TierGap | null {
    const from = projectAtEvent(currentOpr, event).verdict;
    const order: Verdict[] = ["fuera", "burbuja", "pick", "capitan"];
    const idx = order.indexOf(from);
    if (idx === order.length - 1) return null;

    const to = order[idx + 1];
    const oprNeeded = oprToReachVerdict(to, event);
    if (oprNeeded === null) return null;

    return { from, to, oprNeeded, delta: Math.max(0, oprNeeded - currentOpr) };
}

/**
 * Why the one-line strategic read is what it is — as a translation KEY plus
 * its (already rounded) parameters, NOT formed prose. Mirrors DraftBasis in
 * lib/draft-odds.ts: the analysis layer must not bake a language in. The UI
 * renders these via next-intl (namespace "Consistency.note").
 */
export type ConsistencyNote =
    | { key: "insufficient" }
    | { key: "stable" }
    | { key: "growthLag"; r2Pct: number; scoutingGap: number }
    | { key: "growthClear"; slope: number }
    | { key: "decline"; slope: number }
    | { key: "volatility"; r2Pct: number; min: number; max: number }
    | { key: "mixed"; r2Pct: number; residualSigma: number };

/**
 * The one-line strategic read for a diagnosis. Deliberately deterministic
 * (no LLM): the input space is small and a wrong-but-fluent narrative is
 * worse than a plain correct one — same reasoning as the partner-suggestion
 * explanations (decisions.md #55).
 */
export function consistencyNote(profile: ConsistencyProfile): ConsistencyNote {
    const { diagnosis, scoutingGap, tot } = profile;
    const r2Pct = Math.round(tot.r2 * 100);

    switch (diagnosis) {
        case "insuficiente":
            return { key: "insufficient" };
        case "estable":
            return { key: "stable" };
        case "crecimiento":
            return scoutingGap > 3
                ? { key: "growthLag", r2Pct, scoutingGap: Number(scoutingGap.toFixed(1)) }
                : { key: "growthClear", slope: Number(tot.slope.toFixed(1)) };
        case "declive":
            return { key: "decline", slope: Number(tot.slope.toFixed(1)) };
        case "volatilidad":
            return { key: "volatility", r2Pct, min: Number(tot.min.toFixed(0)), max: Number(tot.max.toFixed(0)) };
        case "mixto":
            return { key: "mixed", r2Pct, residualSigma: Number(tot.residualSigma.toFixed(1)) };
    }
}
