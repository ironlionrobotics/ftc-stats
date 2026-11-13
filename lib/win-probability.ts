/**
 * Win-probability model — single source of truth.
 *
 * Before this module existed the app carried two unrelated formulas for the
 * same quantity: a normalized logistic in lib/projections.ts and an Elo-style
 * base-10 curve with a fixed 80-point divisor in lib/alliance-utils.ts. The
 * same matchup could show different win probabilities in different tabs, and
 * the Elo divisor didn't scale with the season's score level.
 *
 * The unified model has ONE assumption — alliance scores are noisy around a
 * projected mean — and two entry points depending on what the caller knows:
 *
 *   1. winProbabilityFromNormalModel(redMean, blueMean, sigmaDiff)
 *      Use when a score-noise model is available (per-alliance σ from event
 *      history, see lib/alliance-utils.ts). This is the exact probability
 *      that a N(redMean, σ²)-distributed score beats the blue one:
 *      P = Φ((redMean − blueMean) / σ_diff), σ_diff = √(σ_red² + σ_blue²).
 *      By construction it agrees with the Box-Muller Monte Carlo simulation
 *      (which samples from the very same normals), so the analytic bracket
 *      and the simulator converge to the same number.
 *
 *   2. winProbabilityFromProjections(redScore, blueScore)
 *      Use when only point projections exist (no variance model). Logistic
 *      on the score difference normalized by the average score, slope k=1.5 —
 *      game-agnostic (works whether the meta is 60 or 400 points) and
 *      calibrated against FRC/FTC score-variance distributions per community
 *      models (Statbotics, Caleb Sykes' Elo work). See decisions.md #23.
 *
 * Both clamp to [0.01, 0.99]: never display false certainty.
 */

/** Logistic slope for the projection-only entry point (decisions.md #23). */
export const WIN_PROB_LOGISTIC_K = 1.5;

const P_MIN = 0.01;
const P_MAX = 0.99;

function clampProb(p: number): number {
    return Math.min(P_MAX, Math.max(P_MIN, p));
}

function logistic(x: number, k: number): number {
    return 1 / (1 + Math.exp(-k * x));
}

/**
 * Error function, Abramowitz & Stegun approximation 7.1.26.
 * Max absolute error ≈ 1.5e-7 — far below every other error source here.
 */
function erf(x: number): number {
    const sign = x < 0 ? -1 : 1;
    const ax = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * ax);
    const y =
        1 -
        (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t -
            0.284496736) *
            t +
            0.254829592) *
            t) *
            Math.exp(-ax * ax);
    return sign * y;
}

/** Standard normal CDF Φ(x). */
function normalCdf(x: number): number {
    return 0.5 * (1 + erf(x / Math.SQRT2));
}

/**
 * P(red wins) when only point projections are known (no variance model).
 * Score difference normalized by average score, then logistic with k=1.5.
 */
export function winProbabilityFromProjections(
    redScore: number,
    blueScore: number,
): number {
    const diff = redScore - blueScore;
    const avgScore = Math.max((redScore + blueScore) / 2, 1);
    return clampProb(logistic(diff / avgScore, WIN_PROB_LOGISTIC_K));
}

/**
 * P(red wins) under the normal score-noise model:
 * red ~ N(redMean, σ_red²), blue ~ N(blueMean, σ_blue²) independent
 * ⇒ P(red > blue) = Φ((redMean − blueMean) / σ_diff),
 * where `sigmaDiff` = √(σ_red² + σ_blue²) (use combineSigmas from
 * lib/alliance-utils.ts).
 *
 * Falls back to the projection-only logistic when `sigmaDiff` is missing,
 * zero, or non-finite (e.g. manually assembled alliances with no σ yet).
 */
export function winProbabilityFromNormalModel(
    redMean: number,
    blueMean: number,
    sigmaDiff: number,
): number {
    if (!Number.isFinite(sigmaDiff) || sigmaDiff <= 0) {
        return winProbabilityFromProjections(redMean, blueMean);
    }
    return clampProb(normalCdf((redMean - blueMean) / sigmaDiff));
}

/**
 * Playoff-specific σ inflation — learned, not assumed.
 *
 * Fit on 10,800 real playoff matches (seasons 2024-2025, every region, via
 * scripts/oracle-backtest.mjs `matches` + `fit`, decisions.md #59): a logistic
 * regression over [z, consistency-diff, field level] against the quals-derived
 * baseline Φ(z) improved held-out log-loss 0.685 → 0.500 (−27%) with the
 * dominant learned effect being SHRINKAGE of z (weight 0.666 vs the ≈1.7
 * probit↔logit equivalence). Translated back into the normal model, that
 * shrinkage is equivalent to playoff scores being ~2.4× noisier than the
 * quals residuals suggest. Accuracy barely moves (74.7→75.0%) — what this
 * fixes is OVERCONFIDENCE at the extremes (e.g. the 98.7% Finals miss in
 * decisions.md #51), which log-loss punishes and picks/brackets feel.
 *
 * Secondary learned effect — see CONSISTENCY_MARGIN_WEIGHT below.
 */
export const PLAYOFF_SIGMA_INFLATION = 2.4;

/**
 * Volatility bonus, in points of score margin per point of per-team σ.
 *
 * The same fit carries a consistency term: with consDiff defined as
 * (meanσ_blue − meanσ_red) / σ_event, its weight is −0.6957 against z's
 * 0.6568, so the model is equivalent to shifting z by −1.059·consDiff. Because
 * z is itself a margin divided by σ_event, that σ cancels and the whole effect
 * reduces to adding 1.059 × (meanσ_red − meanσ_blue) to red's margin. No
 * scale approximation is involved.
 *
 * Direction: the MORE volatile alliance is favored, by about one point of
 * margin per point of σ advantage. That reads backwards until you notice the
 * qual-residual σ this is built from cannot distinguish "erratic" from
 * "improving during the event" — a team climbing through quals leaves large
 * late residuals and arrives at playoffs genuinely stronger than its OPR.
 * Which of the two drives the effect is NOT established here, so the constant
 * is used and the interpretation is left open (decisions.md #73).
 *
 * Tested against the alternative: an interaction term (z × consDiff), i.e.
 * "variance helps whoever is behind", adds nothing — its weight fits to 0.016
 * and held-out log-loss is unchanged at 0.4975. The effect really is a main
 * effect, not the underdog story it looks like.
 *
 * decisions.md #59 recorded this weight as −0.13. That was an unconverged
 * estimate: the fit ran 400 epochs at lr 0.05 and stopped there. At
 * convergence it is −0.6957, stable to 20,000 epochs. The z weight barely
 * moved (0.666 → 0.657), so the 2.4× inflation above is unaffected.
 */
export const CONSISTENCY_MARGIN_WEIGHT = 1.059;

/** Per-alliance mean team σ, when known. Both sides or neither. */
export interface AllianceConsistency {
    redMeanSigma: number;
    blueMeanSigma: number;
}

/**
 * Playoff entry point: the normal model with elimination-calibrated noise.
 *
 * Pass `consistency` to include the volatility effect. Omitted, the behavior is
 * exactly what it was before — callers that don't track per-team σ are not
 * silently given a different answer.
 */
export function playoffWinProbability(
    redMean: number,
    blueMean: number,
    sigmaDiff: number,
    consistency?: AllianceConsistency,
): number {
    const adj = consistencyMarginAdjustment(consistency);
    return winProbabilityFromNormalModel(
        redMean + adj,
        blueMean,
        sigmaDiff * PLAYOFF_SIGMA_INFLATION,
    );
}

/**
 * Points to add to RED's margin for the volatility effect. Positive when red
 * is the more volatile alliance. Zero when consistency data is absent or
 * unusable, so the caller degrades to the plain normal model.
 *
 * Exported because the Monte Carlo has to apply the SAME shift to stay
 * consistent with the analytic path — a sampler that disagrees with the
 * closed form is worse than either alone.
 */
export function consistencyMarginAdjustment(consistency?: AllianceConsistency): number {
    if (!consistency) return 0;
    const { redMeanSigma, blueMeanSigma } = consistency;
    if (!Number.isFinite(redMeanSigma) || !Number.isFinite(blueMeanSigma)) return 0;
    if (redMeanSigma <= 0 || blueMeanSigma <= 0) return 0;
    return CONSISTENCY_MARGIN_WEIGHT * (redMeanSigma - blueMeanSigma);
}
