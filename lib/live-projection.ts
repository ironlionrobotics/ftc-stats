import type { TeamRanking, FTCMatch } from "@/types/scouting";
import { componentOpr } from "@/lib/component-opr";
import { winProbabilityFromNormalModel } from "@/lib/win-probability";

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
 *  - Team strength: event OPR on non-penalty alliance score (ridge,
 *    lib/component-opr.ts) from the quals played so far.
 *  - Win probability of each remaining qual: Φ(Δμ/σ_diff) with σ_diff =
 *    √2 · RMS(residuals) of the played quals — the same normal model the
 *    Oracle uses, backtested at 75.6% on 2026 playoffs (decision #94).
 *  - Bonus RP: each team's observed bonus rate (RS minus its win/tie RP
 *    per match); an alliance earns the mean of its two teams' rates.
 *  - 1,000 seeded Monte Carlo runs of the remaining schedule. Final RS =
 *    total RP / matches; ranks by RS, then the official tiebreakers in the
 *    order the FIRST API reports them (sortOrder2…5, held at current values),
 *    then a random draw (the manual's last tiebreaker).
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
    /** Probability of finishing in the top 4 (alliance captains at most qualifiers). */
    pTop4: number;
    /** Positive = climbed (improved from current rank). Negative = dropped. */
    rankDelta: number;
}

export interface LiveProjectionResult {
    eventCode: string;
    teamProjections: RankingProjection[];
    qualMatchesTotal: number;
    qualMatchesPlayed: number;
    /** Set when no qualification matches have been played yet. Caller can
     *  show "not enough data" instead of an all-zeros table. */
    insufficientData: boolean;
}

export interface ProjectionOptions {
    /** RP for a win / tie (BIOBUZZ and DECODE: 3 / 1). */
    winRp?: number;
    tieRp?: number;
    simulations?: number;
    seed?: number;
}

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

    const insufficientData = rankings.length === 0 || rankings.every(r => (r.matchesPlayed ?? 0) === 0);
    if (insufficientData) {
        return { eventCode, teamProjections: [], qualMatchesTotal: quals.length, qualMatchesPlayed: played.length, insufficientData: true };
    }

    // Matches each team still has to play. The final RS denominator is
    // matches played (as FIRST counts them — surrogate appearances excluded)
    // plus these; counting the whole schedule would include surrogates.
    const toPlay = new Map<number, number>();
    for (const m of remaining) for (const t of m.teams) toPlay.set(t.teamNumber, (toPlay.get(t.teamNumber) ?? 0) + 1);

    // --- Team strength: non-penalty OPR from played quals -------------------
    const oprRows = played.flatMap(m => (["Red", "Blue"] as const).map(color => ({
        teams: allianceOf(m, color),
        value: color === "Red" ? (m.scoreRedFinal ?? 0) - (m.scoreRedFoul ?? 0) : (m.scoreBlueFinal ?? 0) - (m.scoreBlueFoul ?? 0),
    }))).filter(r => r.teams.length > 0);
    const opr = componentOpr(oprRows, { lambda: 1 });
    const strength = (t: number) => opr.get(t) ?? 0;
    const residuals = oprRows.map(r => r.value - r.teams.reduce((s, t) => s + strength(t), 0));
    const rms = residuals.length ? Math.sqrt(residuals.reduce((s, x) => s + x * x, 0) / residuals.length) : 0;
    // σ for one alliance score; diff of two independent alliances → ×√2.
    // With very few matches residuals are ~0 (overfit): floor at 20% of the mean score.
    const meanScore = oprRows.length ? oprRows.reduce((s, r) => s + r.value, 0) / oprRows.length : 0;
    const sigmaDiff = Math.SQRT2 * Math.max(rms, 0.2 * meanScore, 1);

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

    // Precompute each remaining match: alliances (indices into states), P(red wins), bonus RP.
    const sims = remaining.map(m => {
        const red = allianceOf(m, "Red").map(t => idx.get(t)).filter((i): i is number => i !== undefined);
        const blue = allianceOf(m, "Blue").map(t => idx.get(t)).filter((i): i is number => i !== undefined);
        const mu = (a: number[]) => a.reduce((s, i) => s + strength(states[i].r.teamNumber), 0);
        const bonus = (a: number[]) => (a.length ? a.reduce((s, i) => s + states[i].bonusRate, 0) / a.length : 0);
        return { red, blue, pRed: winProbabilityFromNormalModel(mu(red), mu(blue), sigmaDiff), bonusRed: bonus(red), bonusBlue: bonus(blue) };
    });

    // --- Monte Carlo -----------------------------------------------------------
    const rand = rng(opts.seed ?? 20261113);
    const n = states.length;
    const rankSamples: number[][] = states.map(() => []);
    const rpSum = new Float64Array(n);
    const top4 = new Float64Array(n);
    const runs = remaining.length ? N : 1;
    const order = states.map((_, i) => i);
    const rs = new Float64Array(n);
    const tiebreak = new Float64Array(n);

    for (let run = 0; run < runs; run++) {
        const rp = states.map(s => s.rpTotal);
        for (const m of sims) {
            const redWins = rand() < m.pRed;
            for (const i of m.red) rp[i] += (redWins ? winRp : 0) + m.bonusRed;
            for (const i of m.blue) rp[i] += (redWins ? 0 : winRp) + m.bonusBlue;
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
            if (pos < 4) top4[i] += 1;
        });
    }

    const projections: RankingProjection[] = states.map((s, i) => {
        const ranks = rankSamples[i].sort((a, b) => a - b);
        const finalRp = rpSum[i] / runs;
        const projectedFinalRank = quantile(ranks, 0.5);
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
            pTop4: top4[i] / runs,
            rankDelta: s.r.rank - projectedFinalRank,
        };
    });

    // Display order: by mean simulated rank (more stable than the median for ties).
    const meanRank = new Map(states.map((s, i) => [s.r.teamNumber, rankSamples[i].reduce((a, b) => a + b, 0) / rankSamples[i].length]));
    projections.sort((a, b) => meanRank.get(a.teamNumber)! - meanRank.get(b.teamNumber)! || a.currentRank - b.currentRank);

    return {
        eventCode,
        teamProjections: projections,
        qualMatchesTotal: quals.length,
        qualMatchesPlayed: played.length,
        insufficientData: false,
    };
}
