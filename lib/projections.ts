import { AggregatedTeamStats, MatchScouting, PitScouting } from "@/types/ftc";

/**
 * SIMULATED ML WEIGHTS
 * In a production ML environment, these weights would be updated daily 
 * by comparing predictions vs actual API results via a Firebase Cloud Function.
 */
const ML_WEIGHTS = {
    apiHistoricWeight: 0.6,    // How much we trust the long-term OPR
    scoutingLiveWeight: 0.4,   // How much we trust recent observer data
    driverSkillImpact: 0.15,   // Max % swing based on driver quality
    mechanicalRiskPenalty: 0.4, // Reduction if red flags in pits
    autoMultiplier: 1.2,       // Autonomous points are more predictive of wins
};

export interface TeamProjection {
    teamNumber: number;
    projectedPoints: number;
    breakdown: {
        auto: number;
        teleop: number;
        endgame: number;
    };
    confidence: number; // 0-1
    reliability: "high" | "medium" | "low";
    redFlags: string[];
}

export interface MatchProjection {
    redAlliance: {
        score: number;
        teams: TeamProjection[];
    };
    blueAlliance: {
        score: number;
        teams: TeamProjection[];
    };
    winProbability: number; // For Red Alliance (0-1)
    insights: string[];
}

/**
 * Hybrid Projection Engine (V2)
 * Combines statistical OPR with live observation data.
 */
export function calculateTeamProjection(
    team: AggregatedTeamStats,
    scoutingEntries: MatchScouting[],
    pitData: PitScouting | null
): TeamProjection {
    const redFlags: string[] = [];

    // 1. Base Score from OPR/API
    // We assume the API base already includes the total average
    const apiBase = team.averageMatchPoints;

    // 2. Scout Score (Live Performance)
    let scoutPoints = apiBase;
    if (scoutingEntries.length > 0) {
        // Points estimation for Into The Deep season
        const avgMatchScout = scoutingEntries.reduce((acc, match) => {
            const auto = (match.autoSampleScored * 4) + (match.autoSpecimenScored * 6) + (match.autoParked ? 3 : 0);
            const tele = (match.teleopSamples * 4) + (match.teleopSpecimens * 6);
            const end = match.teleopHangLevel * 10; // Level 1=10, 2=20, 3=30
            return acc + auto + tele + end;
        }, 0) / scoutingEntries.length;

        scoutPoints = avgMatchScout;
    }

    // 3. Hybrid Merge (Weighted based on data availability)
    const scoutConfidence = Math.min(scoutingEntries.length / 5, 1.0); // Full confidence at 5 matches
    const hybridBase = (apiBase * (1 - (ML_WEIGHTS.scoutingLiveWeight * scoutConfidence))) +
        (scoutPoints * (ML_WEIGHTS.scoutingLiveWeight * scoutConfidence));

    // 4. Qualitative Modifiers
    let multiplier = 1.0;

    // Driver Impact
    if (scoutingEntries.length > 0) {
        const avgSkill = scoutingEntries.reduce((acc, e) => acc + e.driverSkill, 0) / scoutingEntries.length;
        // Swing from -7.5% to +7.5% based on skill
        multiplier += (avgSkill - 3) * (ML_WEIGHTS.driverSkillImpact / 2);
    }

    // Mechanical Risk
    if (pitData?.notes?.toLowerCase().includes("fallo") || pitData?.notes?.toLowerCase().includes("broken")) {
        redFlags.push("Riesgo Mecánico Detectado");
        multiplier *= (1 - ML_WEIGHTS.mechanicalRiskPenalty);
    }

    const projectedTotal = hybridBase * multiplier;

    return {
        teamNumber: team.teamNumber,
        projectedPoints: Math.round(projectedTotal),
        breakdown: {
            auto: team.averageAutoPoints || (projectedTotal * 0.25),
            teleop: projectedTotal * 0.6,
            endgame: projectedTotal * 0.15
        },
        confidence: scoutingEntries.length > 0 ? 0.7 + (scoutingEntries.length * 0.05) : 0.5,
        reliability: scoutingEntries.length >= 4 ? "high" : scoutingEntries.length > 0 ? "medium" : "low",
        redFlags
    };
}

/**
 * Win Probability Engine (Logarithmic Margin)
 */
export function predictMatch(
    redTeams: TeamProjection[],
    blueTeams: TeamProjection[]
): MatchProjection {
    const redScore = redTeams.reduce((a, b) => a + b.projectedPoints, 0);
    const blueScore = blueTeams.reduce((a, b) => a + b.projectedPoints, 0);

    const diff = redScore - blueScore;
    const avgScore = (redScore + blueScore) / 2;

    // Win logic: Logistical curve to simulate sports probability
    // A 20 point lead in a 100pt game is different than in a 400pt game
    const spreadRequirement = avgScore * 0.15; // 15% lead for "clear favorite"
    const probability = 0.5 + (diff / (spreadRequirement * 4));
    const winProbability = Math.min(Math.max(probability, 0.02), 0.98);

    const insights: string[] = [];

    // Strategic Insights
    const redAuto = redTeams.reduce((a, b) => a + b.breakdown.auto, 0);
    const blueAuto = blueTeams.reduce((a, b) => a + b.breakdown.auto, 0);

    if (redAuto > blueAuto * 1.25) insights.push("Ventaja crítica: Alianza Roja domina en período Autónomo.");
    if (blueAuto > redAuto * 1.25) insights.push("Ventaja crítica: Alianza Azul tiene un mejor inicio autónomo.");

    const highConfidence = redTeams.every(t => t.reliability === "high") && blueTeams.every(t => t.reliability === "high");
    if (highConfidence) insights.push("Predicción de alta precisión: Basada en abundantes datos de scouting.");

    if (Math.abs(diff) < avgScore * 0.05) insights.push("Empate técnico: El match se decidirá por penalizaciones o endgame.");

    return {
        redAlliance: { score: redScore, teams: redTeams },
        blueAlliance: { score: blueScore, teams: blueTeams },
        winProbability,
        insights
    };
}
