/**
 * BIOBUZZ Ranking Point probabilities from count models.
 *
 * BIOBUZZ RPs are deterministic functions of counts (Competition Manual TU09,
 * Tables 10-2/10-3), so we model the counts directly instead of running a
 * logistic regression over phase points:
 *
 *  - POLLINATOR k: alliance HIVE TIPS >= k. TIPS are over-dispersed (season
 *    sample at 2026-11-13: mean 1.16, var 1.61), so a Negative Binomial with
 *    mean μ = tipsOPR(A) + tipsOPR(B) and season dispersion r.
 *  - SWARM: alliance LEAVE (3) + AUTO PARK (5) + final PARK (5) per robot,
 *    summed over both robots, >= threshold (16). Exact enumeration of the
 *    2^6 outcomes of per-robot Bernoullis.
 *
 * Pure module — no I/O. Inputs are built in app/actions/analytics.ts from the
 * official /scores breakdowns (lib/score-breakdown.ts).
 */

/** Season defaults (FTCScout sample, 203 events, 2026-11-13). */
export const BIOBUZZ_TIPS_MEAN = 1.16;
export const BIOBUZZ_TIPS_VAR = 1.61;

/** NB size parameter from mean/variance; large (≈ Poisson) when not over-dispersed. */
export function nbDispersion(mean: number, variance: number): number {
    return variance > mean + 1e-9 ? (mean * mean) / (variance - mean) : 1e6;
}

export const BIOBUZZ_TIPS_DISPERSION = nbDispersion(BIOBUZZ_TIPS_MEAN, BIOBUZZ_TIPS_VAR);

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

/** RP probabilities for a concrete alliance of two teams. */
export function biobuzzAllianceRp(
    a: BiobuzzRpInputs,
    b: BiobuzzRpInputs,
    thresholds: Record<string, number>,
    dispersion: number = BIOBUZZ_TIPS_DISPERSION,
): Record<string, number> {
    const mu = Math.max(0, a.tipsOpr) + Math.max(0, b.tipsOpr);
    return {
        swarm: pSwarm(a.rates, b.rates, thresholds.swarm ?? 16),
        pollinator1: pAtLeastNegBin(thresholds.pollinator1 ?? 4, mu, dispersion),
        pollinator2: pAtLeastNegBin(thresholds.pollinator2 ?? 7, mu, dispersion),
    };
}

function clamp01(x: number): number {
    return x < 0 ? 0 : x > 1 ? 1 : x;
}
