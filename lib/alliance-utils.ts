import { TeamEvolution } from "@/app/actions/analytics";
import { Alliance, PlayoffMatch } from "@/types/oracle";
import { winProbabilityFromNormalModel } from "@/lib/win-probability";

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
 * Generates optimal alliances based on a "Greedy Oracle" approach.
 * Alliance 1 gets the best possible partners from the pool.
 * Alliance 2 gets the best possible partners from the remaining pool.
 * And so on.
 */
export function generateAlliances(teams: TeamEvolution[], count: 2 | 4 | 6 | 8): Alliance[] {
    const availableTeams = [...teams];
    const alliances: Alliance[] = [];

    // Sort by Rank to determine Initial Captain order
    const sortedByRank = [...availableTeams].sort((a, b) => {
        const rankA = a.events[a.events.length - 1]?.rank || 999;
        const rankB = b.events[b.events.length - 1]?.rank || 999;
        return rankA - rankB;
    });

    const usedTeamNumbers = new Set<number>();

    for (let i = 1; i <= count; i++) {
        // 1. Find Captain (Highest ranked available team)
        // This naturally handles the logic where if Rank 1 picks Rank 2, 
        // Rank 3 becomes the next captain because Rank 2 is already in 'usedTeamNumbers'.
        const captain = sortedByRank.find(t => !usedTeamNumbers.has(t.teamNumber));
        if (!captain) break;
        usedTeamNumbers.add(captain.teamNumber);

        // 2. Find Best Partner (Pick 1) from ENTIRE remaining pool
        // Heuristic: Highest Combined OPR + Synergy
        let bestPick1: TeamEvolution | null = null;
        let bestScore1 = -Infinity;

        for (const candidate of sortedByRank) { // Iterate sorted to favor higher rank in ties?
            if (usedTeamNumbers.has(candidate.teamNumber)) continue;

            const score = calculateSynergyScore(captain, candidate);
            if (score > bestScore1) {
                bestScore1 = score;
                bestPick1 = candidate;
            }
        }

        if (bestPick1) usedTeamNumbers.add(bestPick1.teamNumber);

        // Create Alliance Object (2 Teams Only)
        const members = [captain, bestPick1!].filter(Boolean);
        const totalOPR = members.reduce((sum, t) => sum + (t.opr || 0), 0);
        const totalAuto = members.reduce((sum, t) => sum + (t.autoOPR || 0), 0);
        // Tele is OPR - Auto roughly
        const totalTele = members.reduce((sum, t) => sum + ((t.opr || 0) - (t.autoOPR || 0)), 0);
        // Per-team sigmas combined assuming independent contributions.
        const totalSigma = combineSigmas(members.map(t => computeTeamSigma(t)));

        alliances.push({
            id: i,
            captain,
            pick1: bestPick1,
            pick2: null, // No 3rd member
            totalOPR,
            totalAuto,
            totalTele,
            totalEndgame: 0,
            projectedScore: totalOPR,
            totalSigma,
        });
    }

    return alliances;
}

/**
 * Re-uses the logic from AlliancePredictor to score a pair.
 * Simplified for pure calculation without UI strings.
 */
function calculateSynergyScore(t1: TeamEvolution, t2: TeamEvolution): number {
    const combinedOPR = (t1.opr || 0) + (t2.opr || 0);

    // Auto Synergy
    const autoSynergy = (t1.autoOPR || 0) + (t2.autoOPR || 0);
    let synergyBonus = 0;
    if (autoSynergy > 30) synergyBonus += 10;

    // Discipline Penalty
    const risk = (t1.netDiscipline || 0) + (t2.netDiscipline || 0);
    if (risk < -5) {
        synergyBonus -= Math.min(Math.abs(risk) * 0.8, 30);
    }

    return combinedOPR + synergyBonus;
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

export function updateBracket(matches: PlayoffMatch[], alliances: Alliance[]): PlayoffMatch[] {
    const allianceMap = new Map(alliances.map(a => [a.id, a]));
    const updatedMatches = [...matches];
    const matchMap = new Map(updatedMatches.map(m => [m.id, m]));

    // Determine bracket type
    const bracketType = matches.length === 3 ? 2 : matches.length === 6 ? 4 : matches.length === 10 ? 6 : 8;

    // Helper to get winner ID
    const getWinner = (m: PlayoffMatch): number | null => {
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
        // Calculate Win Prob for M1
        ['M1', 'M2', 'M3'].forEach(id => {
            const m = matchMap.get(id);
            if (!m) return;
            // Always A1 vs A2
            const red = allianceMap.get(1);
            const blue = allianceMap.get(2);
            if (red && blue) {
                m.winProbabilityRed = calculateWinProbability(red, blue);
                m.redAllianceId = 1;
                m.blueAllianceId = 2;
                m.winnerId = getWinner(m);
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
        updatedMatches.forEach(match => {
            // Calculate Probabilities if both alliances valid
            if (match.redAllianceId && match.blueAllianceId) {
                const red = allianceMap.get(match.redAllianceId);
                const blue = allianceMap.get(match.blueAllianceId);
                if (red && blue) {
                    const prob = calculateWinProbability(red, blue);
                    match.winProbabilityRed = prob;
                    match.redScorePrediction = red.totalOPR;
                    match.blueScorePrediction = blue.totalOPR;
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
function calculateWinProbability(red: Alliance, blue: Alliance): number {
    const sigmaDiff = combineSigmas([
        red.totalSigma || SIGMA_FALLBACK,
        blue.totalSigma || SIGMA_FALLBACK,
    ]);
    return winProbabilityFromNormalModel(red.totalOPR, blue.totalOPR, sigmaDiff);
}

// --- Monte Carlo Simulation ---

export interface SimulationResult {
    allianceId: number;
    championProbability: number; // 0-1
    finalsProbability: number; // 0-1
}

export function runMonteCarloSimulation(alliances: Alliance[], type: 2 | 4 | 6 | 8, iterations: number = 2000): SimulationResult[] {
    const championCounts: Record<number, number> = {};
    const finalsCounts: Record<number, number> = {};

    alliances.forEach(a => {
        championCounts[a.id] = 0;
        finalsCounts[a.id] = 0;
    });

    for (let i = 0; i < iterations; i++) {
        const bracket = initializeBracket(type);
        const allianceMap = new Map(alliances.map(a => [a.id, a]));
        const matchMap = new Map(bracket.map(m => [m.id, m]));

        // Resolve bracket
        // Iterative propagation until all matches resolved
        // Since it's a DAG, we can just iterate enough times or topologically.
        // Simple iteration 5 times is safe.
        for (let pass = 0; pass < 6; pass++) {
            bracket.forEach(match => {
                if (match.winnerId) return; // Already resolved

                if (match.redAllianceId && match.blueAllianceId) {
                    const red = allianceMap.get(match.redAllianceId)!;
                    const blue = allianceMap.get(match.blueAllianceId)!;

                    // Simulate Match — per-alliance sigma derived from team variance.
                    const redScore = getSimulatedScore(red.totalOPR, red.totalSigma);
                    const blueScore = getSimulatedScore(blue.totalOPR, blue.totalSigma);

                    match.winnerId = redScore > blueScore ? match.redAllianceId : match.blueAllianceId;

                    // Propagate
                    if (match.winnerId && match.nextMatchWinner) {
                        const nextM = matchMap.get(match.nextMatchWinner);
                        if (nextM) setSlotInNextMatch(nextM, match.winnerId, match.id, type);
                    }
                    if (match.nextMatchLoser) { // Loser drops
                        const loserId = match.winnerId === match.redAllianceId ? match.blueAllianceId : match.redAllianceId;
                        const nextM = matchMap.get(match.nextMatchLoser);
                        if (nextM) setSlotInNextMatch(nextM, loserId!, match.id, type);
                    }
                }
            });
        }

        // Record Stats
        // Champion is winner of last match
        // For type 2 (Best of 3), M2 or M3 determines the winner, but our `initializeBracket` creates 3 matches.
        // In this simple boolean simulation, if M1 and M2 same winner, series over. If split, M3 winner is champion.
        // Or simpler: count match wins.
        const finalMatchId = type === 2 ? 'M2' : type === 4 ? 'M6' : type === 6 ? 'M10' : 'M14';

        if (type === 2) {
            const m1 = matchMap.get('M1');
            const m2 = matchMap.get('M2');
            const m3 = matchMap.get('M3');

            // Count wins
            const wins: Record<number, number> = {};
            [m1, m2, m3].forEach(m => {
                if (m?.winnerId) wins[m.winnerId] = (wins[m.winnerId] || 0) + 1;
            });

            // Find who has 2 wins
            const champ = Object.keys(wins).find(id => wins[Number(id)] >= 2);
            if (champ) {
                championCounts[Number(champ)]++;
                // Finalists are always 1 and 2
                finalsCounts[1]++;
                finalsCounts[2]++;
            }
            continue; // Skip standard logic for type 2
        }

        const finalMatch = matchMap.get(finalMatchId);
        if (finalMatch?.winnerId) {
            championCounts[finalMatch.winnerId]++;
        }

        // Finalists (participants of last match)
        if (finalMatch?.redAllianceId) finalsCounts[finalMatch.redAllianceId]++;
        if (finalMatch?.blueAllianceId) finalsCounts[finalMatch.blueAllianceId]++;
    }

    return alliances.map(a => ({
        allianceId: a.id,
        championProbability: championCounts[a.id] / iterations,
        finalsProbability: finalsCounts[a.id] / iterations
    })).sort((a, b) => b.championProbability - a.championProbability);
}

// Box-Muller transform: returns a sample from N(mean, sigma²). Falls back to
// σ=30 when sigma is missing or zero (e.g. empty alliances during manual setup
// before any team is picked). Per-alliance sigma comes from combineSigmas of
// per-team variance (see computeTeamSigma).
function getSimulatedScore(mean: number, sigma: number = 30) {
    if (!sigma || sigma <= 0) sigma = 30;
    // 1 − random() ∈ (0, 1]: Math.random() can return exactly 0, and
    // log(0) = −Infinity would corrupt the sample (and that iteration's
    // comparison). log(1) = 0 is harmless (z = 0).
    const u1 = 1 - Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
    return mean + z * sigma;
}
