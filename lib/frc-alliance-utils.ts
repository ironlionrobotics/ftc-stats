import { TeamEvolution } from "@/app/actions/analytics";
import { Alliance } from "@/types/oracle";
import { FRCMatchScouting } from "@/types/scouting";
import { computeTeamSigma, combineSigmas } from "./alliance-utils";

/**
 * Calculates a "Synergy Score" for candidate FRC robots.
 * Applies a knapsack-like heuristic for FRC 2025: Reefscape.
 */
function calculateFRCSynergyScore(
    candidate: TeamEvolution,
    scoutingData: FRCMatchScouting[],
    currentPartners: TeamEvolution[]
): number {
    const candidateScouting = scoutingData.filter(m => m.teamNumber === candidate.teamNumber);
    const hasScouting = candidateScouting.length > 0;

    // 1. Base Score: OPR from TBA gives a predictive floor
    let score = candidate.opr || 0;

    // 2. Qualitative Multiplier (from Scouting)
    if (hasScouting) {
        const avgDriverSkill = candidateScouting.reduce((acc, m) => acc + (m.driverSkill ?? 3), 0) / candidateScouting.length;
        const avgDefense = candidateScouting.reduce((acc, m) => acc + (m.defenseRating ?? 1), 0) / candidateScouting.length;

        // Driver skill acts as a percentage multiplier on their OPR (e.g. 5/5 = 110% effective, 1/5 = 70% effective)
        const driverMultiplier = 0.7 + (avgDriverSkill * 0.08);
        score *= driverMultiplier;

        // If we already have 2 robots (checking for a Pick 2), we might highly value defense
        if (currentPartners.length === 2 && avgDefense > 3) {
            score += (avgDefense * 5); // Flat bonus for good defense in the 3rd pick
        }

        // Deep Climb Synergy
        // If current partners don't climb deep often, we highly value a robot that does.
        const candidateDeepClimbRate = candidateScouting.filter(m => m.endgameClimbState === 'Deep').length / candidateScouting.length;

        // (In a real scenario, we'd also check if current partners can deep climb to avoid diminishing returns if there's limited space, 
        // but for Reefscape we assume multiple can climb or at least having one is vital).
        if (currentPartners.length > 0) {
            score += (candidateDeepClimbRate * 15); // Bonus RP/points projection for Deep Climb reliability
        }

    } else {
        // Penalize slightly if we have NO scouting data and rely purely on TBA, as it's riskier.
        score *= 0.9;
    }

    return score;
}

/**
 * Generates optimal FRC alliances (3 Teams: Captain, Pick 1, Pick 2)
 */
export function generateFRCAlliances(
    teams: TeamEvolution[],
    scoutingData: FRCMatchScouting[],
    count: 2 | 4 | 6 | 8
): Alliance[] {
    const availableTeams = [...teams];
    const alliances: Alliance[] = [];

    // FRC uses 8 alliances typically, but can be configured. 
    // Sort by Rank to determine Initial Captain order
    const sortedByRank = [...availableTeams].sort((a, b) => {
        const rankA = a.events[a.events.length - 1]?.rank || 999;
        const rankB = b.events[b.events.length - 1]?.rank || 999;
        return rankA - rankB;
    });

    const usedTeamNumbers = new Set<number>();

    for (let i = 1; i <= count; i++) {
        // 1. Captain
        const captain = sortedByRank.find(t => !usedTeamNumbers.has(t.teamNumber));
        if (!captain) break;
        usedTeamNumbers.add(captain.teamNumber);

        // 2. Pick 1 
        let bestPick1: TeamEvolution | null = null;
        let bestScore1 = -Infinity;

        for (const candidate of sortedByRank) {
            if (usedTeamNumbers.has(candidate.teamNumber)) continue;
            const score = calculateFRCSynergyScore(candidate, scoutingData, [captain]);
            if (score > bestScore1) {
                bestScore1 = score;
                bestPick1 = candidate;
            }
        }

        if (bestPick1) usedTeamNumbers.add(bestPick1.teamNumber);

        // 3. Pick 2 (Serpentine draft normally implies Pick 2 goes 8 -> 1, but for the Oracle's 
        // pure "best ultimate alliance" projection, we can just pick the next best fit).
        let bestPick2: TeamEvolution | null = null;
        let bestScore2 = -Infinity;

        for (const candidate of sortedByRank) {
            if (usedTeamNumbers.has(candidate.teamNumber)) continue;
            const score = calculateFRCSynergyScore(candidate, scoutingData, [captain, bestPick1].filter(Boolean) as TeamEvolution[]);
            if (score > bestScore2) {
                bestScore2 = score;
                bestPick2 = candidate;
            }
        }

        if (bestPick2) usedTeamNumbers.add(bestPick2.teamNumber);

        // Alliance Assembly
        const members = [captain, bestPick1!, bestPick2!].filter(Boolean);
        const totalOPR = members.reduce((sum, t) => sum + (t.opr || 0), 0);
        const totalAuto = members.reduce((sum, t) => sum + (t.autoOPR || 0), 0);
        const totalTele = members.reduce((sum, t) => sum + ((t.opr || 0) - (t.autoOPR || 0)), 0);
        const totalSigma = combineSigmas(members.map(t => computeTeamSigma(t)));

        alliances.push({
            id: i,
            captain,
            pick1: bestPick1,
            pick2: bestPick2,
            totalOPR,
            totalAuto,
            totalTele,
            totalEndgame: 0, // Could aggregate endgame projected points here
            projectedScore: totalOPR,
            totalSigma,
        });
    }

    // In a real FRC draft, Pick 2 is serpentine (Alliance 8 gets the first Pick 2). 
    // If we wanted to accurately model the outcome of the draft, we would do a 2-pass loop. 
    // The Oracle usually shows "What is the best possible 3-bot combination for Alliance 1?" so a greedy approach is fine for now.

    return alliances;
}
