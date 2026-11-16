/**
 * BIOBUZZ Ranking Point probabilities from count models.
 *
 * BIOBUZZ RPs are deterministic functions of counts (Competition Manual TU09,
 * Tables 10-2/10-3), so we model the counts directly instead of running a
 * logistic regression over phase points:
 *
 *  - POLLINATOR k: alliance HIVE TIPS >= k, with mean μ = tipsOPR(A) + tipsOPR(B).
 *    The season marginal is over-dispersed (mean 1.30, var 2.01), but that is
 *    mostly μ varying between alliances: GIVEN μ, the NB likelihood fit goes to
 *    r → ∞ (Poisson) on every fold of 282 FIRST events (decision #118), so the
 *    default is Poisson.
 *  - SWARM: alliance LEAVE (3) + AUTO PARK (5) + final PARK (5) per robot,
 *    summed over both robots, >= threshold (16). Exact enumeration of the
 *    2^6 outcomes of per-robot Bernoullis.
 *
 * Pure module — no I/O. Inputs are built in app/actions/analytics.ts from the
 * official /scores breakdowns (lib/score-breakdown.ts).
 */

/** Season marginal of alliance TIPS (FIRST archive, 301 events, 2026-11-16). Descriptive only. */
export const BIOBUZZ_TIPS_MEAN = 1.295;
export const BIOBUZZ_TIPS_VAR = 2.014;

/** NB size parameter from mean/variance; large (≈ Poisson) when not over-dispersed. */
export function nbDispersion(mean: number, variance: number): number {
    return variance > mean + 1e-9 ? (mean * mean) / (variance - mean) : 1e6;
}

/**
 * Conditional dispersion given μ: Poisson. Backtest (scripts/rp-counts-backtest.ts,
 * train first 60% of quals, predict the rest, 4,848 alliances): the marginal-moment
 * r = 2.99 over-dispersed; Poisson moves Brier 0.0405 → 0.0362 (POLLINATOR 1) and
 * 0.0079 → 0.0072 (POLLINATOR 2), mean prediction 0.087 / 0.012 vs observed 0.076 / 0.012.
 */
export const BIOBUZZ_TIPS_DISPERSION = 1e6;

/** P(X >= k) for X ~ NegBin(mean mu, size r). */
export function pAtLeastNegBin(k: number, mu: number, r: number = BIOBUZZ_TIPS_DISPERSION): number {
    if (k <= 0) return 1;
    if (!(mu > 0)) return 0;
    const p = r / (r + mu);               // success prob in the (r, p) parametrization
    let pmf = Math.exp(r * Math.log(p));  // P(X = 0)
    let cdf = 0;
    for (let x = 0; x < k; x++) {
        cdf += pmf;
        pmf *= ((x + r) / (x + 1)) * (1 - p);
    }
    return Math.min(1, Math.max(0, 1 - cdf));
}

export interface RobotRates {
    /** P(robot achieves LEAVE). */
    leave: number;
    /** P(robot parked at end of AUTO). */
    autoPark: number;
    /** P(robot parked at end of match). */
    teleopPark: number;
}

export interface SwarmPoints {
    leave: number;
    autoPark: number;
    teleopPark: number;
}

export const BIOBUZZ_SWARM_POINTS: SwarmPoints = { leave: 3, autoPark: 5, teleopPark: 5 };

/**
 * P(LEAVE + PARK points of the alliance >= threshold). Robot outcomes are
 * treated as independent — conservative for teams whose park is correlated
 * with their leave, but exact given the marginals.
 */
export function pSwarm(
    a: RobotRates,
    b: RobotRates,
    threshold: number,
    pts: SwarmPoints = BIOBUZZ_SWARM_POINTS,
): number {
    const events: Array<{ p: number; v: number }> = [
        { p: a.leave, v: pts.leave }, { p: a.autoPark, v: pts.autoPark }, { p: a.teleopPark, v: pts.teleopPark },
        { p: b.leave, v: pts.leave }, { p: b.autoPark, v: pts.autoPark }, { p: b.teleopPark, v: pts.teleopPark },
    ];
    let total = 0;
    for (let mask = 0; mask < 1 << events.length; mask++) {
        let prob = 1;
        let sum = 0;
        for (let i = 0; i < events.length; i++) {
            const on = (mask >> i) & 1;
            const pi = clamp01(events[i].p);
            prob *= on ? pi : 1 - pi;
            if (on) sum += events[i].v;
        }
        if (sum >= threshold) total += prob;
    }
    return clamp01(total);
}

/**
 * Recency decay for per-robot LEAVE/PARK rates: each new observation
 * multiplies the running counts by this factor first (half-life ≈ 2 matches).
 * Why: SWARM rates climb within an event (48% → 78% from the first to the
 * last fifth of quals across 15 events, 2026-11-13) as teams tune auto and
 * park. Backtest (train first 60% of quals, predict the rest, 348
 * alliances): Brier 0.1769 → 0.1688 (skill vs base rate 0.12 → 0.16).
 * Re-checked on 201 events: 0.7 stays; the residual under-prediction is
 * corrected by SWARM_CALIBRATION below (decision #96).
 */
export const SWARM_RECENCY_DECAY = 0.7;

/** Running counts with recency decay; feed observations in match order. */
export interface DecayedCounts {
    leave: number;
    autoPark: number;
    teleopPark: number;
    /** Decayed number of observations (effective sample size). */
    n: number;
}

export function decayedUpdate(
    c: DecayedCounts,
    obs: { leave: boolean; autoPark: boolean; teleopPark: boolean },
    decay: number = SWARM_RECENCY_DECAY,
): DecayedCounts {
    return {
        leave: c.leave * decay + (obs.leave ? 1 : 0),
        autoPark: c.autoPark * decay + (obs.autoPark ? 1 : 0),
        teleopPark: c.teleopPark * decay + (obs.teleopPark ? 1 : 0),
        n: c.n * decay + 1,
    };
}

/** Beta-shrunk rate: (successes + strength·prior) / (trials + strength). */
export function shrunkRate(successes: number, trials: number, prior: number, strength = 4): number {
    return (successes + strength * prior) / (trials + strength);
}

/** Per-team inputs for the BIOBUZZ RP models (serializable). */
export interface BiobuzzRpInputs {
    /** Expected HIVE TIPS this team contributes to its alliance per match. */
    tipsOpr: number;
    rates: RobotRates;
    /** Qualification matches observed. */
    matches: number;
}

/**
 * Platt calibration of the SWARM probability (decision #96):
 * p' = σ(a + b · logit p). The independent-Bernoulli model under-predicts
 * SWARM (teams improve within an event, and LEAVE/PARK are not independent).
 * First fit (2,960 test alliances, 201 events, 2026-11-13): a 0.65, b 1.05.
 * Refit on the FIRST archive (4,848 test alliances, 282 events, 2026-11-16,
 * scripts/rp-counts-backtest.ts), 2-fold by event: a = 0.27 / 0.19 (date
 * halves), 0.15 / 0.31 (parity), b ≈ 2.0–2.2 → Brier 0.1638 (old constants,
 * which over-predicted the 40-60% bin: 0.52 said, 0.26 happened) → 0.151,
 * mean prediction 0.709 vs observed 0.709.
 */
export const SWARM_CALIBRATION = { a: 0.23, b: 2.05 };

export function calibrateSwarm(p: number, c = SWARM_CALIBRATION): number {
    if (p >= 1 - 1e-12) return 1;   // certain (both robots always score) stays certain
    if (p <= 1e-12) return 0;       // impossible (e.g. a robot that never moves) stays impossible
    const z = Math.log(p / (1 - p));
    return 1 / (1 + Math.exp(-(c.a + c.b * z)));
}

/** RP probabilities for a concrete alliance of two teams. */
export function biobuzzAllianceRp(
    a: BiobuzzRpInputs,
    b: BiobuzzRpInputs,
    thresholds: Record<string, number>,
    dispersion: number = BIOBUZZ_TIPS_DISPERSION,
): Record<string, number> {
    const mu = Math.max(0, a.tipsOpr) + Math.max(0, b.tipsOpr);
    return {
        swarm: calibrateSwarm(pSwarm(a.rates, b.rates, thresholds.swarm ?? 16)),
        pollinator1: pAtLeastNegBin(thresholds.pollinator1 ?? 4, mu, dispersion),
        pollinator2: pAtLeastNegBin(thresholds.pollinator2 ?? 7, mu, dispersion),
    };
}

function clamp01(x: number): number {
    return x < 0 ? 0 : x > 1 ? 1 : x;
}
