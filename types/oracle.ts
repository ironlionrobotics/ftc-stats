import { TeamEvolution } from "@/app/actions/analytics";

export interface Alliance {
    id: number; // 1, 2, 3...
    captain: TeamEvolution;
    pick1: TeamEvolution | null;
    pick2: TeamEvolution | null;
    totalOPR: number;
    totalAuto: number;
    totalTele: number;
    totalEndgame: number;
    projectedScore: number;
    /**
     * Per-alliance score sigma for Monte Carlo simulation. Computed as
     * sqrt(Σ σ_team²) assuming independent team contributions.
     * Replaces the previous σ=30 global default.
     */
    totalSigma: number;
}

export type PlayoffMatchType = 'Winner' | 'Loser' | 'Final';

export interface PlayoffMatch {
    id: string; // "M1", "M2", etc.
    name: string; // "Match 1", "Semi-Final 1"
    nextMatchWinner?: string; // ID of next match for winner
    nextMatchLoser?: string; // ID of next match for loser
    redAllianceId: number | null;
    blueAllianceId: number | null;
    redScorePrediction?: number;
    blueScorePrediction?: number;
    winProbabilityRed: number; // 0-1
    winnerId: number | null; // Alliance ID
    overriddenWinnerId: number | null; // If user manually sets winner
}

export interface SimulationState {
    alliances: Alliance[];
    matches: PlayoffMatch[];
    type: 4 | 6 | 8;
}
