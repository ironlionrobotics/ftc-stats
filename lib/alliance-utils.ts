import { TeamEvolution } from "@/app/actions/analytics";
import { Alliance, PlayoffMatch } from "@/types/oracle";
import {
    playoffWinProbability,
    consistencyMarginAdjustment,
    PLAYOFF_SIGMA_INFLATION,
    PLAYOFF_FORM_K,
    type AllianceConsistency,
} from "@/lib/win-probability";
import { seasonRulesFor } from "@/lib/games/season-rules";
import { SEASON } from "@/lib/constants";

// --- Per-team sigma estimation ---

const SIGMA_MIN = 8;   // floor — even a "consistent" team has some match noise
const SIGMA_MAX = 60;  // cap — prevents pathological tails in Monte Carlo
const SIGMA_FALLBACK = 30; // legacy default when we lack any historical signal

/**
 * Estimates per-team score sigma from event history. Two paths in priority:
 *
 *  1. If the team played 2+ events, use the between-event sample stddev of
 *     `avgPoints`. This captures real "how consistent are they event-to-event"
 *     behavior. Sample stddev (Bessel's correction with n-1) because we have
 *     a sample, not the population.
 *
 *  2. If only 1 event is on record, fall back to `(maxPoints - avgPoints) / 2`
 *     as a rough range/2 estimate. Less accurate but better than σ=30 global.
 *
 *  3. No events → fallback to 30 (legacy global).
 *
 * Always clamps to [SIGMA_MIN, SIGMA_MAX] to keep simulation behavior sane.
 *
 * Limitations:
 *  - Between-event variance is an upper-bound proxy for within-event match
 *    variance. A team that's consistent within events but improves across
 *    them will get a higher sigma than is "true" match-to-match. Acceptable
 *    tradeoff; the data we'd need for true within-event variance (per-match
 *    scores) isn't surfaced in TeamEvolution.
 */
export function computeTeamSigma(team: TeamEvolution): number {
    const events = team.events ?? [];

    if (events.length >= 2) {
        const avgs = events
            .map(e => e.avgPoints)
            .filter(p => typeof p === "number" && p > 0);
        if (avgs.length >= 2) {
            const mean = avgs.reduce((a, b) => a + b, 0) / avgs.length;
            const sumSquares = avgs.reduce((s, v) => s + (v - mean) ** 2, 0);
            const variance = sumSquares / (avgs.length - 1);
            return clamp(Math.sqrt(variance), SIGMA_MIN, SIGMA_MAX);
        }
    }

    if (events.length === 1) {
        const e = events[0];
        const avg = e.avgPoints ?? 0;
        const max = e.maxPoints ?? avg;
        if (avg > 0) {
            const rangeHalf = Math.abs(max - avg) / 2;
            return clamp(rangeHalf, SIGMA_MIN, SIGMA_MAX);
        }
    }

    return SIGMA_FALLBACK;
}

/**
 * Combines per-team sigmas into an alliance sigma, assuming the per-team
 * contributions are independent (uncorrelated). Variance adds; stddev is
 * sqrt of the sum. Same identity used by Statbotics for alliance-level
 * EPA variance.
 */
export function combineSigmas(sigmas: number[]): number {
    const sumOfSquares = sigmas.reduce((acc, s) => acc + s * s, 0);
    return Math.sqrt(sumOfSquares);
}

function clamp(x: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, x));
}

// --- Alliance Generation Logic ---

/**
 * Best fieldable pair of an alliance. In 3-robot alliances (Championship /
 * some Premier Events, Competition Manual §15.3) only 2 of the 3 robots play
 * each match, at the captain's discretion — so the alliance's projected
 * strength is its strongest PAIR, never the sum of all three.
 */
export function bestFieldedPair(members: TeamEvolution[]): { pair: TeamEvolution[]; score: number } {
    if (members.length <= 2) {
        return {
            pair: members,
            score: members.length === 2 ? calculateSynergyScore(members[0], members[1]) : (members[0]?.opr ?? 0),
        };
    }
    let best: { pair: TeamEvolution[]; score: number } | null = null;
    for (let a = 0; a < members.length; a++) {
        for (let b = a + 1; b < members.length; b++) {
            const score = calculateSynergyScore(members[a], members[b]);
            if (!best || score > best.score) best = { pair: [members[a], members[b]], score };
        }
    }
    return best!;
}

/**
 * Generates optimal alliances based on a "Greedy Oracle" approach.
 * Alliance 1 gets the best possible partners from the pool, Alliance 2 the
 * best remaining, and so on.
 *
 * `allianceSize` (Competition Manual):
 *  - 2 (default, §13.7.1): captain + 1 pick, single round in seed order.
 *  - 3 (§15.3, Championship and Premier Events that adopt it): a second
 *    selection round runs in REVERSED order (last alliance picks first —
 *    serpentine), and projections use the best fieldable pair since only
 *    2 of the 3 robots play each match.
 */
export function generateAlliances(teams: TeamEvolution[], count: 2 | 4 | 6 | 8, allianceSize: 2 | 3 = 2): Alliance[] {
    const availableTeams = [...teams];

    // Sort by Rank to determine Initial Captain order
    const sortedByRank = [...availableTeams].sort((a, b) => {
        const rankA = a.events[a.events.length - 1]?.rank || 999;
        const rankB = b.events[b.events.length - 1]?.rank || 999;
        return rankA - rankB;
    });

    const usedTeamNumbers = new Set<number>();
    const drafts: { id: number; captain: TeamEvolution; pick1: TeamEvolution | null; pick2: TeamEvolution | null }[] = [];

    // Round 1 — seed order (1 → count).
    for (let i = 1; i <= count; i++) {
        // Highest ranked available team becomes captain. This naturally handles
        // the rule where accepting an invite promotes the next ranked team.
        const captain = sortedByRank.find(t => !usedTeamNumbers.has(t.teamNumber));
        if (!captain) break;
        usedTeamNumbers.add(captain.teamNumber);

        let bestPick1: TeamEvolution | null = null;
        let bestScore1 = -Infinity;
        for (const candidate of sortedByRank) {
            if (usedTeamNumbers.has(candidate.teamNumber)) continue;
            const score = calculateSynergyScore(captain, candidate);
            if (score > bestScore1) {
                bestScore1 = score;
                bestPick1 = candidate;
            }
        }
        if (bestPick1) usedTeamNumbers.add(bestPick1.teamNumber);

        drafts.push({ id: i, captain, pick1: bestPick1, pick2: null });
    }

    // Round 2 (3-robot format only) — reversed order per §15.3: the last
    // alliance picks first. Each alliance takes the candidate that most
    // improves its best fieldable pair (which also covers pure-backup value).
    if (allianceSize === 3) {
        for (let d = drafts.length - 1; d >= 0; d--) {
            const draft = drafts[d];
            const current = [draft.captain, draft.pick1].filter(Boolean) as TeamEvolution[];
            let bestPick2: TeamEvolution | null = null;
            let bestScore2 = -Infinity;
            for (const candidate of sortedByRank) {
                if (usedTeamNumbers.has(candidate.teamNumber)) continue;
                const score = bestFieldedPair([...current, candidate]).score;
                if (score > bestScore2) {
                    bestScore2 = score;
                    bestPick2 = candidate;
                }
            }
            if (bestPick2) {
                usedTeamNumbers.add(bestPick2.teamNumber);
                draft.pick2 = bestPick2;
            }
        }
    }

    return drafts.map(draft => {
        const members = [draft.captain, draft.pick1, draft.pick2].filter(Boolean) as TeamEvolution[];
        // Projection always reflects the robots actually on the field: the
        // whole alliance for size 2, the strongest pair for size 3.
        const fielded = bestFieldedPair(members).pair;
        const totalOPR = fielded.reduce((sum, t) => sum + (t.opr || 0), 0);
        const totalAuto = fielded.reduce((sum, t) => sum + (t.autoOPR || 0), 0);
        const totalTele = fielded.reduce((sum, t) => sum + ((t.opr || 0) - (t.autoOPR || 0)), 0);
        // Per-team sigmas combined assuming independent contributions.
        const teamSigmas = fielded.map(t => computeTeamSigma(t));
        const totalSigma = combineSigmas(teamSigmas);
        const meanSigma = teamSigmas.length
            ? teamSigmas.reduce((a, b) => a + b, 0) / teamSigmas.length
            : 0;

        return {
            id: draft.id,
            captain: draft.captain,
            pick1: draft.pick1,
            pick2: draft.pick2,
            totalOPR,
            totalAuto,
            totalTele,
            totalEndgame: 0,
            projectedScore: totalOPR,
            totalSigma,
            meanSigma,
        };
    });
}

/**
 * Builds Alliance objects from the OFFICIAL selection published by the FIRST
 * API, resolving team numbers against the event's TeamEvolution stats.
 * Projections follow the same fielded-pair semantics as generateAlliances.
 * Alliances whose captain isn't in `teams` (shouldn't happen) are dropped.
 */
export function alliancesFromOfficial(
    official: import("@/types/scouting").FTCAllianceSelection[],
    teams: TeamEvolution[],
): Alliance[] {
    const byNumber = new Map(teams.map(t => [t.teamNumber, t]));
    const resolve = (m: { teamNumber: number } | null | undefined) =>
        m ? byNumber.get(m.teamNumber) ?? null : null;

    return official
        .map((a, i) => {
            const captain = resolve(a.captain);
            if (!captain) return null;
            const pick1 = resolve(a.round1);
            const pick2 = resolve(a.round2);
            const members = [captain, pick1, pick2].filter(Boolean) as TeamEvolution[];
            const fielded = bestFieldedPair(members).pair;
            const totalOPR = fielded.reduce((s, t) => s + (t.opr || 0), 0);
            const totalAuto = fielded.reduce((s, t) => s + (t.autoOPR || 0), 0);
            return {
                id: a.number ?? i + 1,
                captain,
                pick1,
                pick2,
                totalOPR,
                totalAuto,
                totalTele: fielded.reduce((s, t) => s + ((t.opr || 0) - (t.autoOPR || 0)), 0),
                totalEndgame: 0,
                projectedScore: totalOPR,
                totalSigma: combineSigmas(fielded.map(t => computeTeamSigma(t))),
                meanSigma: fielded.length
                    ? fielded.reduce((s2, t) => s2 + computeTeamSigma(t), 0) / fielded.length
                    : 0,
            } as Alliance;
        })
        .filter((a): a is Alliance => a !== null);
}

/**
 * Why a pair's synergy score is what it is — as a translation KEY plus its
 * (already rounded) params, NOT formed prose. The analysis layer must not
 * bake a language in: the UI renders these via next-intl (namespace
 * "AllianceUtils"). Same pattern as lib/draft-odds.ts — see
 * docs/architecture/i18n.md.
 */
export type SynergyReason =
    | { key: "combinedPower"; opr1: number; opr2: number; combinedOPR: number }
    | { key: "dominantAuto"; autoSynergy: number }
    | { key: "foulRisk"; risk: number; penalty: number }
    | { key: "disciplinedDuo"; risk: number };

/**
 * Synergy score for a pair, with the human-readable justification derived from
 * the SAME computation (no LLM, no post-hoc narrative: each reason is emitted
 * exactly when its factor fires, with the real numbers). Deterministic and
 * offline-safe — critical for venue use.
 */
export function explainSynergyScore(t1: TeamEvolution, t2: TeamEvolution): { score: number; reasons: SynergyReason[] } {
    const reasons: SynergyReason[] = [];
    const combinedOPR = (t1.opr || 0) + (t2.opr || 0);
    reasons.push({
        key: "combinedPower",
        opr1: Math.round(t1.opr || 0),
        opr2: Math.round(t2.opr || 0),
        combinedOPR: Math.round(combinedOPR),
    });

    // Auto Synergy
    const autoSynergy = (t1.autoOPR || 0) + (t2.autoOPR || 0);
    let synergyBonus = 0;
    if (autoSynergy > 30) {
        synergyBonus += 10;
        reasons.push({ key: "dominantAuto", autoSynergy: Math.round(autoSynergy) });
    }

    // Discipline Penalty
    const risk = (t1.netDiscipline || 0) + (t2.netDiscipline || 0);
    if (risk < -5) {
        const penalty = Math.min(Math.abs(risk) * 0.8, 30);
        synergyBonus -= penalty;
        reasons.push({ key: "foulRisk", risk: Math.round(risk), penalty: Math.round(penalty) });
    } else if (risk > 5) {
        reasons.push({ key: "disciplinedDuo", risk: Math.round(risk) });
    }

    return { score: combinedOPR + synergyBonus, reasons };
}

/**
 * Re-uses the logic from AlliancePredictor to score a pair.
 * Simplified for pure calculation without UI strings.
 * Exported for the live-draft board (partner ranking over available teams).
 * Delegates to explainSynergyScore so score and explanation never diverge.
 */
export function calculateSynergyScore(t1: TeamEvolution, t2: TeamEvolution): number {
    return explainSynergyScore(t1, t2).score;
}

// --- Playoff Bracket Logic ---

// --- Playoff Bracket Logic ---

export function initializeBracket(type: 2 | 4 | 6 | 8): PlayoffMatch[] {
    const matches: PlayoffMatch[] = [];

    if (type === 2) {
        // Finals Best of 3
        // Start directly with Alliance 1 vs Alliance 2
        matches.push({ id: "M1", name: "Finals 1", nextMatchWinner: undefined, nextMatchLoser: undefined, redAllianceId: 1, blueAllianceId: 2, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M2", name: "Finals 2", nextMatchWinner: undefined, nextMatchLoser: undefined, redAllianceId: 1, blueAllianceId: 2, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M3", name: "Finals 3 (If Needed)", nextMatchWinner: undefined, nextMatchLoser: undefined, redAllianceId: 1, blueAllianceId: 2, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
    } else if (type === 4) {
        // Semi-Finals
        matches.push({ id: "M1", name: "Semi-Final 1", nextMatchWinner: "M3", nextMatchLoser: "M4", redAllianceId: 1, blueAllianceId: 4, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M2", name: "Semi-Final 2", nextMatchWinner: "M3", nextMatchLoser: "M4", redAllianceId: 2, blueAllianceId: 3, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Full Double Elimination for 4
        matches.push({ id: "M3", name: "Upper Final", nextMatchWinner: "M6", nextMatchLoser: "M5", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M4", name: "Lower Round 1", nextMatchWinner: "M5", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null }); // Loser eliminated
        matches.push({ id: "M5", name: "Lower Final", nextMatchWinner: "M6", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M6", name: "Grand Final", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

    } else if (type === 6) {
        // Base structure for 6 Alliance (Double Elim)
        // Round 1
        matches.push({ id: "M1", name: "Round 1-1", nextMatchWinner: "M3", nextMatchLoser: "M6", redAllianceId: 4, blueAllianceId: 5, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M2", name: "Round 1-2", nextMatchWinner: "M4", nextMatchLoser: "M5", redAllianceId: 3, blueAllianceId: 6, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Round 2
        matches.push({ id: "M3", name: "Upper Semi 1", nextMatchWinner: "M7", nextMatchLoser: "M5", redAllianceId: 1, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M4", name: "Upper Semi 2", nextMatchWinner: "M7", nextMatchLoser: "M6", redAllianceId: 2, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Round 3 (Lower Bracket)
        matches.push({ id: "M5", name: "Lower Round 2-1", nextMatchWinner: "M8", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M6", name: "Lower Round 2-2", nextMatchWinner: "M8", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Round 4
        matches.push({ id: "M7", name: "Upper Final", nextMatchWinner: "M10", nextMatchLoser: "M9", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M8", name: "Lower Round 3", nextMatchWinner: "M9", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Round 5
        matches.push({ id: "M9", name: "Lower Final", nextMatchWinner: "M10", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Finals
        matches.push({ id: "M10", name: "Grand Final", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

    } else if (type === 8) {
        // Round 1
        matches.push({ id: "M1", name: "Upper Round 1-1", nextMatchWinner: "M7", nextMatchLoser: "M5", redAllianceId: 1, blueAllianceId: 8, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M2", name: "Upper Round 1-2", nextMatchWinner: "M7", nextMatchLoser: "M5", redAllianceId: 4, blueAllianceId: 5, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M3", name: "Upper Round 1-3", nextMatchWinner: "M8", nextMatchLoser: "M6", redAllianceId: 2, blueAllianceId: 7, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M4", name: "Upper Round 1-4", nextMatchWinner: "M8", nextMatchLoser: "M6", redAllianceId: 3, blueAllianceId: 6, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Lower Round 1
        matches.push({ id: "M5", name: "Lower Round 1-1", nextMatchWinner: "M10", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M6", name: "Lower Round 1-2", nextMatchWinner: "M9", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Upper Round 2
        matches.push({ id: "M7", name: "Upper Semi 1", nextMatchWinner: "M11", nextMatchLoser: "M9", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M8", name: "Upper Semi 2", nextMatchWinner: "M11", nextMatchLoser: "M10", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Lower Round 2
        matches.push({ id: "M9", name: "Lower Round 2-1", nextMatchWinner: "M12", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
        matches.push({ id: "M10", name: "Lower Round 2-2", nextMatchWinner: "M12", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Upper Final
        matches.push({ id: "M11", name: "Upper Final", nextMatchWinner: "M14", nextMatchLoser: "M13", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Lower Round 3
        matches.push({ id: "M12", name: "Lower Round 3", nextMatchWinner: "M13", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Lower Final
        matches.push({ id: "M13", name: "Lower Final", nextMatchWinner: "M14", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });

        // Grand Final
        matches.push({ id: "M14", name: "Grand Final", redAllianceId: null, blueAllianceId: null, winProbabilityRed: 0.5, winnerId: null, overriddenWinnerId: null });
    }

    return matches;
}

/**
 * Major-foul value for the CURRENT season (BIOBUZZ: 20, DECODE: 15). Per-season
 * values live in lib/games/season-rules.ts — use seasonRulesFor(season).fouls
 * when the season is known.
 */
export const MAJOR_FOUL_POINTS = seasonRulesFor(SEASON).fouls.major;

/** Legacy `foulsRed/foulsBlue` counts were recorded under DECODE (× 15). */
export const LEGACY_MAJOR_FOUL_POINTS = 15;

/**
 * Per-match what-if/reality adjustments for the playoff bracket:
 *  - realRed/realBlue: the REAL final score once the match was played. When
 *    both are present the bracket propagates the real winner (beats any
 *    probability or manual override) and the UI can compare estimate vs real.
 *  - failRed/failBlue: robot-failure incident — the alliance is projected at
 *    its best SINGLE robot instead of the pair (a dead robot can't be
 *    forecast; this reproduces it after the fact).
 *  - foulsRed/foulsBlue: legacy MAJOR-foul COUNTS recorded under DECODE;
 *    each awards LEGACY_MAJOR_FOUL_POINTS (15) to the opponent.
 */
export interface MatchAdjustment {
    realRed?: number | null;
    realBlue?: number | null;
    /** Team number of the robot that failed (either robot can die — the
     *  survivor keeps playing, so the alliance projects at the REMAINING
     *  robots' strength). null/undefined = no failure. */
    failedTeamRed?: number | null;
    failedTeamBlue?: number | null;
    /** @deprecated legacy boolean failure (assumed best robot survives). */
    failRed?: boolean;
    failBlue?: boolean;
    /** Foul POINTS committed by that alliance (awarded to the opponent).
     *  BIOBUZZ: minor = 5, major = 20 (DECODE: 5 / 15) — any total is accepted,
     *  matching the official "Penalty Points Committed" stat. */
    foulPointsRed?: number;
    foulPointsBlue?: number;
    /** Alliance disqualified in this match: its real score (0) doesn't count as playoff form (#113). */
    dqRed?: boolean;
    dqBlue?: boolean;
    /** @deprecated legacy major-foul count (× 15 pts). */
    foulsRed?: number;
    foulsBlue?: number;
}

function allianceMembers(a: Alliance): TeamEvolution[] {
    return [a.captain, a.pick1, a.pick2].filter((t): t is TeamEvolution => !!t);
}

/** Alliance strength after a robot failure: the surviving robots' output. */
function survivingOpr(a: Alliance, failedTeam?: number | null, legacyFail?: boolean): number {
    const members = allianceMembers(a);
    if (failedTeam != null) {
        const rest = members.filter(t => t.teamNumber !== failedTeam);
        if (rest.length === 0) return 0;
        if (rest.length === 1) return rest[0].opr || 0;
        return bestFieldedPair(rest).pair.reduce((s, t) => s + (t.opr || 0), 0);
    }
    if (legacyFail) {
        return members.length ? Math.max(...members.map(t => t.opr || 0)) : 0;
    }
    return a.totalOPR;
}

function committedFoulPoints(adj: MatchAdjustment | undefined, side: "red" | "blue"): number {
    if (!adj) return 0;
    if (side === "red") return adj.foulPointsRed ?? (adj.foulsRed ?? 0) * LEGACY_MAJOR_FOUL_POINTS;
    return adj.foulPointsBlue ?? (adj.foulsBlue ?? 0) * LEGACY_MAJOR_FOUL_POINTS;
}

function adjustedPredictions(red: Alliance, blue: Alliance, adj?: MatchAdjustment): { r: number; b: number } {
    let r = survivingOpr(red, adj?.failedTeamRed, adj?.failRed);
    let b = survivingOpr(blue, adj?.failedTeamBlue, adj?.failBlue);
    r += committedFoulPoints(adj, "blue"); // blue's fouls award points to red
    b += committedFoulPoints(adj, "red");
    return { r, b };
}

/**
 * Playoff form (decision #113): what an alliance has ACTUALLY scored in this
 * playoff, versus what its quals strength projected. Each played match adds
 * one residual (real score − projection for that match, so a recorded robot
 * failure or foul points are already part of the expectation); the next
 * forecast moves by the residual mean shrunk toward 0:
 *     offset = Σ residuals / (PLAYOFF_FORM_K + n)
 * One great or awful match moves the forecast a little; a trend moves it a
 * lot. K lives in lib/win-probability.ts (shared with the prediction ledger).
 */
export { PLAYOFF_FORM_K };

export interface AllianceForm {
    /** Playoff matches with a real score. */
    n: number;
    /** Σ (real − projected) points. */
    sum: number;
    /** Points added to the alliance's projection for its next match. */
    offset: number;
}

const formOffset = (f?: { n: number; sum: number }) => (f && f.n > 0 ? f.sum / (PLAYOFF_FORM_K + f.n) : 0);

function realWinnerOf(m: PlayoffMatch, adj?: MatchAdjustment): number | null {
    if (!adj || adj.realRed == null || adj.realBlue == null || adj.realRed === adj.realBlue) return null;
    if (!m.redAllianceId || !m.blueAllianceId) return null;
    return adj.realRed > adj.realBlue ? m.redAllianceId : m.blueAllianceId;
}

function addForm(form: Map<number, { n: number; sum: number }>, m: PlayoffMatch, adj: MatchAdjustment | undefined, r: number, b: number) {
    if (!adj || adj.realRed == null || adj.realBlue == null || !m.redAllianceId || !m.blueAllianceId) return;
    for (const [id, real, pred, dq] of [[m.redAllianceId, adj.realRed, r, adj.dqRed], [m.blueAllianceId, adj.realBlue, b, adj.dqBlue]] as const) {
        if (dq) continue; // a DQ's 0 is a penalty, not form
        const f = form.get(id) ?? { n: 0, sum: 0 };
        f.n++; f.sum += real - pred;
        form.set(id, f);
    }
}

/** Form of every alliance after all the real results recorded in `bracket` (pass the updateBracket output). */
export function playoffForm(bracket: PlayoffMatch[], alliances: Alliance[], adjustments?: Record<string, MatchAdjustment>): Map<number, AllianceForm> {
    const byId = new Map(alliances.map(a => [a.id, a]));
    const form = new Map<number, { n: number; sum: number }>();
    for (const m of bracket) {
        const red = m.redAllianceId ? byId.get(m.redAllianceId) : undefined;
        const blue = m.blueAllianceId ? byId.get(m.blueAllianceId) : undefined;
        if (!red || !blue) continue;
        const { r, b } = adjustedPredictions(red, blue, adjustments?.[m.id]);
        addForm(form, m, adjustments?.[m.id], r, b);
    }
    return new Map([...form].map(([id, f]) => [id, { ...f, offset: formOffset(f) }]));
}

export function updateBracket(matches: PlayoffMatch[], alliances: Alliance[], adjustments?: Record<string, MatchAdjustment>): PlayoffMatch[] {
    const allianceMap = new Map(alliances.map(a => [a.id, a]));
    const updatedMatches = [...matches];
    const matchMap = new Map(updatedMatches.map(m => [m.id, m]));

    // Determine bracket type
    const bracketType = matches.length === 3 ? 2 : matches.length === 6 ? 4 : matches.length === 10 ? 6 : 8;

    // Helper to get winner ID
    const getWinner = (m: PlayoffMatch): number | null => {
        // A recorded REAL result is ground truth — it beats probability AND
        // manual overrides.
        const real = realWinnerOf(m, adjustments?.[m.id]);
        if (real) return real;
        if (m.overriddenWinnerId) return m.overriddenWinnerId;
        // Default to higher probability
        if (!m.redAllianceId || !m.blueAllianceId) return null;
        return m.winProbabilityRed >= 0.5 ? m.redAllianceId : m.blueAllianceId;
    };

    const getLoser = (m: PlayoffMatch): number | null => {
        const w = getWinner(m);
        if (!w) return null;
        if (w === m.redAllianceId) return m.blueAllianceId;
        return m.redAllianceId;
    };

    // Special logic for Best of 3 (Type 2)
    if (bracketType === 2) {
        // Matches are in play order: each forecast learns from the results before it.
        const form = new Map<number, { n: number; sum: number }>();
        ['M1', 'M2', 'M3'].forEach(id => {
            const m = matchMap.get(id);
            if (!m) return;
            // Always A1 vs A2
            const red = allianceMap.get(1);
            const blue = allianceMap.get(2);
            if (red && blue) {
                const adj = adjustments?.[id];
                const { r, b } = adjustedPredictions(red, blue, adj);
                m.redScorePrediction = r + formOffset(form.get(1));
                m.blueScorePrediction = b + formOffset(form.get(2));
                m.winProbabilityRed = calculateWinProbability(red, blue, m.redScorePrediction, m.blueScorePrediction);
                m.redAllianceId = 1;
                m.blueAllianceId = 2;
                m.winnerId = getWinner(m);
                addForm(form, m, adj, r, b);
            }
        });

        // If someone has 2 wins, they are the champion.
        // But the simulator logic usually looks at the "last match winner".
        // For BO3, we can consider M3 as the "Decider" if needed, or M2 if 2-0.
        // Effectively, the M3 winner is the series winner ONLY if played.

        // Simulating the Series Logic for the visuals/propagation isn't strictly needed for the static bracket
        // unless we want to grey out M3 if M1 & M2 are same winner.
        if (updatedMatches[0].winnerId && updatedMatches[0].winnerId === updatedMatches[1].winnerId) {
            // Sweep 2-0
            updatedMatches[2].winnerId = null; // M3 not played
            updatedMatches[2].winProbabilityRed = 0.5; // Reset prob display?
        }

        return updatedMatches;
    }

    // Propagate
    // We iterate multiple times to ensure flow (simple approach for DAG)
    // 3 passes should be enough for 8-alliance depth
    for (let i = 0; i < 4; i++) {
        // Bracket ids are in play order (M1, M2, …), so each forecast only
        // learns from the results recorded before it (#113).
        const form = new Map<number, { n: number; sum: number }>();
        updatedMatches.forEach(match => {
            // Calculate Probabilities if both alliances valid
            if (match.redAllianceId && match.blueAllianceId) {
                const red = allianceMap.get(match.redAllianceId);
                const blue = allianceMap.get(match.blueAllianceId);
                if (red && blue) {
                    const adj = adjustments?.[match.id];
                    const { r, b } = adjustedPredictions(red, blue, adj);
                    match.redScorePrediction = r + formOffset(form.get(red.id));
                    match.blueScorePrediction = b + formOffset(form.get(blue.id));
                    match.winProbabilityRed = calculateWinProbability(red, blue, match.redScorePrediction, match.blueScorePrediction);
                    addForm(form, match, adj, r, b);
                }
            } else {
                match.winProbabilityRed = 0.5; // Unknown
                match.redScorePrediction = undefined;
                match.blueScorePrediction = undefined;
            }

            match.winnerId = getWinner(match);

            // Propagate to Next
            if (match.winnerId) {
                if (match.nextMatchWinner) {
                    const nextM = matchMap.get(match.nextMatchWinner);
                    if (nextM) {
                        setSlotInNextMatch(nextM, match.winnerId, match.id, bracketType);
                    }
                }
                if (match.nextMatchLoser) {
                    const nextM = matchMap.get(match.nextMatchLoser);
                    if (nextM) {
                        setSlotInNextMatch(nextM, getLoser(match)!, match.id, bracketType);
                    }
                }
            }
        });
    }

    return updatedMatches;
}

// Logic to determine if a team goes to Red or Blue in the next match
function setSlotInNextMatch(nextMatch: PlayoffMatch, teamId: number, sourceMatchId: string, type: 2 | 4 | 6 | 8) {
    const key = `${sourceMatchId}_${nextMatch.id}`;
    let slot: 'red' | 'blue' | undefined;

    if (type === 4) {
        const map: Record<string, 'red' | 'blue'> = {
            'M1_M3': 'red', 'M2_M3': 'blue',
            'M1_M4': 'red', 'M2_M4': 'blue',
            'M3_M6': 'red', 'M5_M6': 'blue',
            'M4_M5': 'blue',
            'M3_M5': 'red',
        };
        slot = map[key];
    } else if (type === 6) {
        const map: Record<string, 'red' | 'blue'> = {
            'M1_M3': 'blue', 'M2_M4': 'blue',
            'M1_M6': 'blue', 'M2_M5': 'blue',
            'M3_M7': 'red', 'M3_M5': 'red',
            'M4_M7': 'blue', 'M4_M6': 'red',
            'M5_M8': 'blue', 'M6_M8': 'red',
            'M7_M10': 'red', 'M7_M9': 'red',
            'M8_M9': 'blue', 'M9_M10': 'blue',
        };
        slot = map[key];
    } else if (type === 8) {
        const map: Record<string, 'red' | 'blue'> = {
            'M1_M7': 'red', 'M2_M7': 'blue',
            'M3_M8': 'red', 'M4_M8': 'blue',
            'M1_M5': 'red', 'M2_M5': 'blue',
            'M3_M6': 'red', 'M4_M6': 'blue',
            'M7_M11': 'red', 'M8_M11': 'blue',
            'M7_M9': 'red', 'M8_M10': 'red',
            'M6_M9': 'blue', 'M5_M10': 'blue',
            'M9_M12': 'blue', 'M10_M12': 'red',
            'M11_M14': 'red', 'M11_M13': 'red',
            'M12_M13': 'blue', 'M13_M14': 'blue'
        };
        slot = map[key];
    }

    if (slot === 'red') nextMatch.redAllianceId = teamId;
    else if (slot === 'blue') nextMatch.blueAllianceId = teamId;
}


/**
 * Analytic win probability for the static bracket, from the shared model in
 * lib/win-probability.ts.
 *
 * Uses the normal score-noise entry point with the SAME per-alliance sigmas
 * the Monte Carlo simulation samples from (getSimulatedScore), so the
 * analytic bracket probability and the simulated championship odds are two
 * views of one model instead of two disagreeing formulas. (Previously this
 * was an Elo base-10 curve with a fixed 80-point divisor — unscaled to the
 * season's score level and inconsistent with both projections.ts and the
 * simulator in this very file.)
 */
function calculateWinProbability(red: Alliance, blue: Alliance, redMean = red.totalOPR, blueMean = blue.totalOPR): number {
    const sigmaDiff = combineSigmas([
        red.totalSigma || SIGMA_FALLBACK,
        blue.totalSigma || SIGMA_FALLBACK,
    ]);
    // Playoff context: elimination-calibrated noise (see PLAYOFF_SIGMA_INFLATION)
    // plus the volatility effect (CONSISTENCY_MARGIN_WEIGHT).
    return playoffWinProbability(redMean, blueMean, sigmaDiff, consistencyOf(red, blue));
}


/**
 * Per-alliance mean σ for the volatility effect, or undefined when either side
 * lacks it — the effect is a DIFFERENCE, so half the data would bias it toward
 * whichever alliance happens to have been built with sigma tracking.
 */
function consistencyOf(red: Alliance, blue: Alliance): AllianceConsistency | undefined {
    const r = red.meanSigma, b = blue.meanSigma;
    if (!r || !b || !Number.isFinite(r) || !Number.isFinite(b)) return undefined;
    return { redMeanSigma: r, blueMeanSigma: b };
}

// --- Monte Carlo Simulation ---

export interface SimulationResult {
    allianceId: number;
    championProbability: number; // 0-1
    finalsProbability: number; // 0-1
}

export interface MonteCarloOptions {
    /** Reality layer: matches with a real score are FIXED (never re-simulated); incidents shape the rest. */
    adjustments?: Record<string, MatchAdjustment>;
    /** Manual "what if X wins" overrides: fixed like real results. */
    overrides?: Record<string, number>;
    /** Uniform [0, 1) source. Seed it (seededRandom) to make the result a pure function of its inputs. */
    random?: () => number;
}

/**
 * Championship odds from the CURRENT state of the playoff: what already
 * happened (real results, forced winners) is fixed, every remaining match is
 * sampled, and each alliance plays at its quals strength plus its playoff form
 * (#113). Before any result it's the classic pre-playoff simulation.
 */
export function runMonteCarloSimulation(alliances: Alliance[], type: 2 | 4 | 6 | 8, iterations: number = 2000, opts: MonteCarloOptions = {}): SimulationResult[] {
    const { adjustments, overrides, random = Math.random } = opts;
    const championCounts: Record<number, number> = {};
    const finalsCounts: Record<number, number> = {};
    alliances.forEach(a => { championCounts[a.id] = 0; finalsCounts[a.id] = 0; });
    const allianceMap = new Map(alliances.map(a => [a.id, a]));

    // Form after every recorded result (the deterministic bracket resolves who played whom).
    const form = adjustments && Object.keys(adjustments).length
        ? playoffForm(updateBracket(initializeBracket(type).map(m => ({ ...m, overriddenWinnerId: overrides?.[m.id] ?? null })), alliances, adjustments), alliances, adjustments)
        : new Map<number, AllianceForm>();
    const offset = (id: number) => form.get(id)?.offset ?? 0;

    for (let i = 0; i < iterations; i++) {
        const bracket = initializeBracket(type);
        const matchMap = new Map(bracket.map(m => [m.id, m]));

        // Ids are in play order and every slot is filled by an earlier match,
        // so one ordered pass resolves the whole bracket.
        for (let pass = 0; pass < 6; pass++) {
            bracket.forEach(match => {
                if (match.winnerId) return; // Already resolved
                if (!match.redAllianceId || !match.blueAllianceId) return;
                const red = allianceMap.get(match.redAllianceId)!;
                const blue = allianceMap.get(match.blueAllianceId)!;
                const adj = adjustments?.[match.id];
                const forced = overrides?.[match.id];

                const real = realWinnerOf(match, adj);
                if (real) {
                    match.winnerId = real;
                } else if (forced === match.redAllianceId || forced === match.blueAllianceId) {
                    match.winnerId = forced;
                } else {
                    // Same normals the analytic bracket integrates: playoff-calibrated
                    // noise (PLAYOFF_SIGMA_INFLATION) + the volatility shift.
                    const { r, b } = adjustedPredictions(red, blue, adj);
                    const consAdj = consistencyMarginAdjustment(consistencyOf(red, blue));
                    const redScore = getSimulatedScore(r + offset(red.id) + consAdj, (red.totalSigma || SIGMA_FALLBACK) * PLAYOFF_SIGMA_INFLATION, random);
                    const blueScore = getSimulatedScore(b + offset(blue.id), (blue.totalSigma || SIGMA_FALLBACK) * PLAYOFF_SIGMA_INFLATION, random);
                    match.winnerId = redScore > blueScore ? match.redAllianceId : match.blueAllianceId;
                }

                if (match.nextMatchWinner) {
                    const nextM = matchMap.get(match.nextMatchWinner);
                    if (nextM) setSlotInNextMatch(nextM, match.winnerId!, match.id, type);
                }
                if (match.nextMatchLoser) { // Loser drops
                    const loserId = match.winnerId === match.redAllianceId ? match.blueAllianceId : match.redAllianceId;
                    const nextM = matchMap.get(match.nextMatchLoser);
                    if (nextM) setSlotInNextMatch(nextM, loserId!, match.id, type);
                }
            });
        }

        if (type === 2) {
            // Best of 3: first to 2 wins (M3 only counts when the series is split).
            const wins: Record<number, number> = {};
            for (const id of ["M1", "M2", "M3"]) {
                const w = matchMap.get(id)?.winnerId;
                if (w) wins[w] = (wins[w] || 0) + 1;
                const champ = Object.keys(wins).find(k => wins[Number(k)] >= 2);
                if (champ) { championCounts[Number(champ)]++; break; }
            }
            finalsCounts[1]++;
            finalsCounts[2]++;
            continue;
        }

        const finalMatchId = type === 4 ? 'M6' : type === 6 ? 'M10' : 'M14';
        const finalMatch = matchMap.get(finalMatchId);
        if (finalMatch?.winnerId) championCounts[finalMatch.winnerId]++;
        if (finalMatch?.redAllianceId) finalsCounts[finalMatch.redAllianceId]++;
        if (finalMatch?.blueAllianceId) finalsCounts[finalMatch.blueAllianceId]++;
    }

    return alliances.map(a => ({
        allianceId: a.id,
        championProbability: championCounts[a.id] / iterations,
        finalsProbability: finalsCounts[a.id] / iterations
    })).sort((a, b) => b.championProbability - a.championProbability);
}

/** Deterministic uniform [0, 1) generator (mulberry32) — same seed, same simulation. */
export function seededRandom(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// Box-Muller transform: returns a sample from N(mean, sigma²). Falls back to
// σ=30 when sigma is missing or zero (e.g. empty alliances during manual setup
// before any team is picked). Per-alliance sigma comes from combineSigmas of
// per-team variance (see computeTeamSigma).
function getSimulatedScore(mean: number, sigma: number = 30, random: () => number = Math.random) {
    if (!sigma || sigma <= 0) sigma = 30;
    // 1 − random() ∈ (0, 1]: Math.random() can return exactly 0, and
    // log(0) = −Infinity would corrupt the sample (and that iteration's
    // comparison). log(1) = 0 is harmless (z = 0).
    const u1 = 1 - random();
    const u2 = random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z * sigma;
}
