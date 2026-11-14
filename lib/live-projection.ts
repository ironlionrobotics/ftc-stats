import type { TeamRanking, FTCMatch } from "@/types/scouting";
import { componentOpr } from "@/lib/component-opr";
import { winProbabilityFromNormalModel } from "@/lib/win-probability";
import { estimateAlliances } from "@/lib/event-selector";

/**
 * Live ranking projection during an event (v2, decision #95).
 *
 * Question answered: "if the rest of quals is played, where does each team
 * finish?" — the input to "push for RP or play safe", "can we still seed
 * top 4", and alliance-selection prep.
 *
 * v1 bug this replaces: FTC's Ranking Score (sortOrder1) is ALREADY the
 * average RP per match, but v1 treated it as a running total and
 * extrapolated it (RS + RS/played × remaining). That inflated teams with
 * fewer matches played. v1 also held only one tiebreaker.
 *
 * Model:
 *  - Team strength: event OPR on non-penalty alliance score (final minus
 *    foul points RECEIVED — decision #48), ridge (lib/component-opr.ts),
 *    from the quals played so far (eventStrengthModel).
 *  - Win probability of each remaining qual: Φ(Δμ/σ_diff) with σ_diff =
 *    √2 · RMS(residuals) of the played quals — the same normal model the
 *    Oracle uses, backtested at 75.6% on 2026 playoffs (decision #94).
 *  - Bonus RP: each team's observed bonus rate (RS minus its win/tie RP per
 *    match); an alliance's bonus RPs are drawn as Binomial(3, mean rate / 3).
 *  - Uncertainty: each run perturbs every team's strength by N(0, SE) with
 *    SE = σ_alliance / √(matches played) — without it (and with bonus RP as
 *    a fixed expectation) the 80% ranges covered only 62–76% in simulation.
 *  - 1,000 seeded Monte Carlo runs of the remaining schedule. Final RS =
 *    total RP / matches; ranks by RS, then the official tiebreakers in the
 *    order the FIRST API reports them (sortOrder2…5, held at current values),
 *    then a random draw (the manual's last tiebreaker).
 *  - Output: projected rank (position by mean simulated rank), p10–p90 range,
 *    and P(captain) for the event's alliance count (4 / 6 / 8).
 *
 * Limitations: tiebreaker averages are held constant; bonus rates don't react
 * to the opponent; a remaining match that will turn out to be a team's
 * surrogate appearance is counted as a real one.
 */

export interface RankingProjection {
    teamNumber: number;
    teamName: string;
    currentRank: number;
    /** Total RP so far (RS × matches played). */
    currentRP: number;
    /** Current Ranking Score = average RP per match (FIRST sortOrder1). */
    avgRPperMatch: number;
    currentTBP1: number;
    matchesPlayed: number;
    matchesScheduled: number;
    matchesRemaining: number;
    /** Expected total RP at the end of quals. */
    projectedFinalRP: number;
    /** Expected final Ranking Score (average RP per match). */
    projectedFinalRS: number;
    /** Median simulated final rank. */
    projectedFinalRank: number;
    /** 10th–90th percentile of the simulated final rank. */
    rankRange: [number, number];
    /** Probability of finishing as an alliance captain (top `captainSlots`). */
    pCaptain: number;
    /** Positive = climbed (improved from current rank). Negative = dropped. */
    rankDelta: number;
}

export interface LiveProjectionResult {
    eventCode: string;
    teamProjections: RankingProjection[];
    qualMatchesTotal: number;
    qualMatchesPlayed: number;
    /** Set when no qualification matches have been played yet (or the
     *  match list is unavailable). Caller shows "not enough data". */
    insufficientData: boolean;
    /** Alliance captains at this event (4 / 6 / 8 by team count). */
    captainSlots: number;
}

export interface ProjectionOptions {
    /** RP for a win / tie (BIOBUZZ and DECODE: 3 / 1). */
    winRp?: number;
    tieRp?: number;
    simulations?: number;
    seed?: number;
}

/** Bonus RPs available per match (BIOBUZZ: SWARM + 2 POLLINATOR; DECODE: 3). */
const BONUS_RP_SLOTS = 3;

function isMatchPlayed(m: FTCMatch): boolean {
    if (m.postResultTime && m.postResultTime.length > 0) return true;
    return (m.scoreRedFinal ?? 0) + (m.scoreBlueFinal ?? 0) > 0;
}

/** Deterministic PRNG (mulberry32) so the projection is stable across renders. */
function rng(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function quantile(sorted: number[], q: number): number {
    if (!sorted.length) return 0;
    const i = Math.min(sorted.length - 1, Math.max(0, Math.round(q * (sorted.length - 1))));
    return sorted[i];
}

const allianceOf = (m: FTCMatch, color: "Red" | "Blue") =>
    m.teams.filter(t => t.station.startsWith(color) && t.onField !== false).map(t => t.teamNumber);

/** A disqualified alliance's score (0) is a penalty, not a measure of how it played (#113). */
export const sideDisqualified = (m: FTCMatch, color: "Red" | "Blue") =>
    m.teams.some(t => t.station.startsWith(color) && t.dq === true);

/** Non-penalty score of an alliance: its final minus the foul points it
 *  RECEIVED, which the API reports on the opponent's field (decision #48). */
export function npScore(m: FTCMatch, color: "Red" | "Blue"): number {
    return color === "Red"
        ? (m.scoreRedFinal ?? 0) - (m.scoreBlueFoul ?? 0)
        : (m.scoreBlueFinal ?? 0) - (m.scoreRedFoul ?? 0);
}

export interface StrengthModel {
    /** Event OPR on non-penalty score. */
    strength: (team: number) => number;
    /** σ of the score difference between two alliances. */
    sigmaDiff: number;
    /**
     * P(red alliance beats blue) under the normal model, with σ widened for
     * how little the robots have played (LIVE_QUAL_UNCERTAINTY, decision #109).
     */
    pRed: (red: number[], blue: number[]) => number;
    /** Teams with an OPR estimate (played at least one counted match). */
    teams: number[];
    /** σ of a single alliance score (sigmaDiff / √2). */
    sigmaAlliance: number;
}

/**
 * Team strength at an event from its played qualification matches: ridge OPR
 * on non-penalty alliance score, σ_diff = √2 · RMS(residuals) with a floor of
 * 20% of the mean score (few matches overfit to ~0 residual). Shared by the
 * ranking projection and "Today"'s next-match odds.
 */
/**
 * Parameter uncertainty of an early-event OPR (decision #109): the next-match
 * σ is σ_diff · √(1 + A / n̄), n̄ = mean quals already played by the robots in
 * the match. Fitted on 101 finished BIOBUZZ events, held out on 101 others
 * (scripts/live-quals-backtest.ts): log loss 0.578 → 0.544, and the "90–100%"
 * bucket went from 88% real wins to 96%. With <2 matches per robot the raw
 * model was worse than a coin flip (0.715 vs 0.693) — the 95% misses seen live
 * at USMIRHQ. Ranking Monte Carlo keeps its own strength sampling.
 */
export const LIVE_QUAL_UNCERTAINTY = 4;

export function eventStrengthModel(playedQuals: FTCMatch[]): StrengthModel {
    const rows = playedQuals.flatMap(m => (["Red", "Blue"] as const)
        .filter(color => !sideDisqualified(m, color))
        .map(color => ({
            teams: allianceOf(m, color),
            value: npScore(m, color),
        }))).filter(r => r.teams.length > 0);
    const opr = componentOpr(rows, { lambda: 1 });
    // Teams with no counted match yet: the "average robot" prior, not 0.
    const meanSize = rows.length ? rows.reduce((s, r) => s + r.teams.length, 0) / rows.length : 2;
    const priorStrength = rows.length ? rows.reduce((s, r) => s + r.value, 0) / rows.length / meanSize : 0;
    const strength = (t: number) => opr.get(t) ?? priorStrength;
    const residuals = rows.map(r => r.value - r.teams.reduce((s, t) => s + strength(t), 0));
    const rms = residuals.length ? Math.sqrt(residuals.reduce((s, x) => s + x * x, 0) / residuals.length) : 0;
    const meanScore = rows.length ? rows.reduce((s, r) => s + r.value, 0) / rows.length : 0;
    const sigmaDiff = Math.SQRT2 * Math.max(rms, 0.2 * meanScore, 1);
    const mu = (a: number[]) => a.reduce((s, t) => s + strength(t), 0);
    const played = new Map<number, number>();
    for (const r of rows) for (const t of r.teams) played.set(t, (played.get(t) ?? 0) + 1);
    // Each played qual adds one Red row and one Blue row, so a robot's count is its matches played.
    const sigmaFor = (robots: number[]) => {
        const nbar = robots.length ? robots.reduce((s, t) => s + (played.get(t) ?? 0), 0) / robots.length : 0;
        return sigmaDiff * Math.sqrt(1 + LIVE_QUAL_UNCERTAINTY / Math.max(nbar, 0.5));
    };
    return {
        strength,
        sigmaDiff,
        pRed: (red, blue) => winProbabilityFromNormalModel(mu(red), mu(blue), sigmaFor([...red, ...blue])),
        teams: [...opr.keys()],
        sigmaAlliance: sigmaDiff / Math.SQRT2,
    };
}

export function projectFinalRankings(
    rankings: TeamRanking[],
    matches: FTCMatch[],
    eventCode: string,
    opts: ProjectionOptions = {},
): LiveProjectionResult {
    const winRp = opts.winRp ?? 3;
    const tieRp = opts.tieRp ?? 1;
    const N = opts.simulations ?? 1000;

    const quals = matches.filter(m => m.tournamentLevel === "QUALIFICATION");
    const played = quals.filter(isMatchPlayed);
    const remaining = quals.filter(m => !isMatchPlayed(m));

    const captainSlots = estimateAlliances(rankings.length);
    // Also "insufficient" when rankings show play but the match list is empty:
    // fetchMatches returns [] on a transient API failure, and simulating an
    // empty schedule would print false certainty (100% / 0%).
    const insufficientData = rankings.length === 0
        || rankings.every(r => (r.matchesPlayed ?? 0) === 0)
        || quals.length === 0;
    if (insufficientData) {
        return { eventCode, teamProjections: [], qualMatchesTotal: quals.length, qualMatchesPlayed: played.length, insufficientData: true, captainSlots };
    }

    // Matches each team still has to play. The final RS denominator is
    // matches played (as FIRST counts them — surrogate appearances excluded)
    // plus these; counting the whole schedule would include surrogates.
    const toPlay = new Map<number, number>();
    for (const m of remaining) for (const t of m.teams) toPlay.set(t.teamNumber, (toPlay.get(t.teamNumber) ?? 0) + 1);

    // --- Team strength from the played quals ---------------------------------
    const { strength, sigmaDiff, sigmaAlliance } = eventStrengthModel(played);

    // --- Per-team state -------------------------------------------------------
    interface TeamState { r: TeamRanking; played: number; scheduledN: number; rpTotal: number; bonusRate: number; tb: number[] }
    const states: TeamState[] = rankings.map(r => {
        const playedN = r.matchesPlayed ?? 0;
        const rs = r.sortOrder1 ?? 0;
        const winRpPerMatch = playedN > 0 ? (winRp * (r.wins ?? 0) + tieRp * (r.ties ?? 0)) / playedN : 0;
        return {
            r,
            played: playedN,
            scheduledN: playedN + (toPlay.get(r.teamNumber) ?? 0),
            rpTotal: rs * playedN,
            bonusRate: Math.max(0, rs - winRpPerMatch),
            tb: [r.sortOrder2 ?? 0, r.sortOrder3 ?? 0, r.sortOrder4 ?? 0, r.sortOrder5 ?? 0],
        };
    });
    const idx = new Map(states.map((s, i) => [s.r.teamNumber, i]));

    // Precompute each remaining match: alliances (indices into states) and the
    // per-bonus-RP success probability of each alliance (mean of its teams'
    // rates, spread over BONUS_RP_SLOTS independent bonus RPs).
    const sims = remaining.map(m => {
        const red = allianceOf(m, "Red").map(t => idx.get(t)).filter((i): i is number => i !== undefined);
        const blue = allianceOf(m, "Blue").map(t => idx.get(t)).filter((i): i is number => i !== undefined);
        const bonusP = (a: number[]) => (a.length ? Math.min(1, a.reduce((s, i) => s + states[i].bonusRate, 0) / a.length / BONUS_RP_SLOTS) : 0);
        return { red, blue, bonusPRed: bonusP(red), bonusPBlue: bonusP(blue) };
    });
    const baseStrength = states.map(s => strength(s.r.teamNumber));
    // Uncertainty of each team's strength: SE ≈ σ_alliance / √(matches played).
    const strengthSe = states.map(s => sigmaAlliance / Math.sqrt(Math.max(1, s.played)));

    // --- Monte Carlo -----------------------------------------------------------
    const rand = rng(opts.seed ?? 20261113);
    const n = states.length;
    const rankSamples: number[][] = states.map(() => []);
    const rpSum = new Float64Array(n);
    const captain = new Float64Array(n);
    const runStrength = new Float64Array(n);
    const gauss = () => {
        // Box–Muller on the seeded PRNG.
        const u = Math.max(rand(), 1e-12), v = rand();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    };
    const bonusDraw = (p: number) => {
        let k = 0;
        for (let j = 0; j < BONUS_RP_SLOTS; j++) if (rand() < p) k++;
        return k;
    };
    const runs = remaining.length ? N : 1;
    const order = states.map((_, i) => i);
    const rs = new Float64Array(n);
    const tiebreak = new Float64Array(n);

    for (let run = 0; run < runs; run++) {
        const rp = states.map(s => s.rpTotal);
        // This run's "true" strengths: estimates are uncertain, more so for
        // teams with few matches. Without this the ranges were overconfident.
        for (let i = 0; i < n; i++) runStrength[i] = baseStrength[i] + strengthSe[i] * gauss();
        for (const m of sims) {
            const muR = m.red.reduce((s, i) => s + runStrength[i], 0);
            const muB = m.blue.reduce((s, i) => s + runStrength[i], 0);
            const redWins = rand() < winProbabilityFromNormalModel(muR, muB, sigmaDiff);
            const bonusRed = bonusDraw(m.bonusPRed), bonusBlue = bonusDraw(m.bonusPBlue);
            for (const i of m.red) rp[i] += (redWins ? winRp : 0) + bonusRed;
            for (const i of m.blue) rp[i] += (redWins ? 0 : winRp) + bonusBlue;
        }
        for (let i = 0; i < n; i++) {
            rs[i] = states[i].scheduledN > 0 ? rp[i] / states[i].scheduledN : 0;
            rpSum[i] += rp[i];
            tiebreak[i] = rand();
        }
        order.sort((a, b) => {
            if (rs[b] !== rs[a]) return rs[b] - rs[a];
            for (let k = 0; k < 4; k++) {
                const d = states[b].tb[k] - states[a].tb[k];
                if (d !== 0) return d;
            }
            return tiebreak[b] - tiebreak[a];
        });
        order.forEach((i, pos) => {
            rankSamples[i].push(pos + 1);
            if (pos < captainSlots) captain[i] += 1;
        });
    }

    const projections: RankingProjection[] = states.map((s, i) => {
        const ranks = rankSamples[i].sort((a, b) => a - b);
        const finalRp = rpSum[i] / runs;
        const projectedFinalRank = 0; // set below from the mean-rank order
        return {
            teamNumber: s.r.teamNumber,
            teamName: s.r.teamName,
            currentRank: s.r.rank,
            currentRP: s.rpTotal,
            avgRPperMatch: s.r.sortOrder1 ?? 0,
            currentTBP1: s.tb[0],
            matchesPlayed: s.played,
            matchesScheduled: s.scheduledN,
            matchesRemaining: Math.max(0, s.scheduledN - s.played),
            projectedFinalRP: finalRp,
            projectedFinalRS: s.scheduledN > 0 ? finalRp / s.scheduledN : 0,
            projectedFinalRank,
            rankRange: [quantile(ranks, 0.1), quantile(ranks, 0.9)],
            pCaptain: captain[i] / runs,
            rankDelta: 0, // set below with projectedFinalRank
        };
    });

    // Projected rank = position in the mean-simulated-rank order, so the column
    // is a real 1..N ranking (medians repeat: 3,3,6,6…). The p10–p90 range
    // keeps the spread.
    const meanRank = new Map(states.map((s, i) => [s.r.teamNumber, rankSamples[i].reduce((a, b) => a + b, 0) / rankSamples[i].length]));
    projections.sort((a, b) => meanRank.get(a.teamNumber)! - meanRank.get(b.teamNumber)! || a.currentRank - b.currentRank);
    projections.forEach((p, pos) => {
        p.projectedFinalRank = pos + 1;
        p.rankDelta = p.currentRank - p.projectedFinalRank;
    });

    return {
        eventCode,
        teamProjections: projections,
        qualMatchesTotal: quals.length,
        qualMatchesPlayed: played.length,
        insufficientData: false,
        captainSlots,
    };
}
