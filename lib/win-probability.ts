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
