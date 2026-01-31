export interface FTCEvent {
    code: string;
    name: string;
}

export interface TeamRanking {
    rank: number;
    teamNumber: number;
    displayTeamNumber: string;
    teamName: string;
    sortOrder1: number; // RP
    sortOrder2: number; // TBP1
    sortOrder3: number; // TBP2
    sortOrder4: number; // Matches Played
    sortOrder5: number;
    sortOrder6: number;
    wins: number;
    losses: number;
    ties: number;
    qualAverage: number;
    dq: number;
    matchesPlayed: number;
    matchesCounted: number;
}

export interface ExtendedTeamRanking extends TeamRanking {
    eventCode: string;
    eventName: string;
    winRate: number;
    avgNP: number;
    avgAuto: number;
    highScore: number;
}

export interface AdvancementSlot {
    team: number;
    displayTeam: string;
    slot: number;
    criteria: string;
    declined: boolean;
    status: string;
}

export interface AdvancementResponse {
    advancesTo: string;
    slots: number;
    fcmpReserved: number;
    advancement: AdvancementSlot[];
}
export interface AdvancementPoints {
    team: number;
    points: number[]; // [Total, Judging, Playoff, Selection, Qualification, RP, RP2, TBP1, TBP2, ...]
}

export interface AggregatedTeamStats {
    teamNumber: number;
    teamName: string;
    regionalsAttended: number;
    totalRS: number;
    averageRS: number;
    totalMatchPoints: number;
    averageMatchPoints: number;
    totalBasePoints: number;
    averageBasePoints: number;
    totalAutoPoints: number;
    averageAutoPoints: number;
    totalHighScore: number;
    averageHighScore: number;
    totalWins: number;
    totalLosses: number;
    totalTies: number;
    bestRank: number;
    averageRank: number;
    hasAdvanced: boolean;
    advancementPoints: {
        total: number;
        judging: number;
        playoff: number;
        selection: number;
        qualification: number;
    };
    totalNP: number;
    averageNP: number;
    opr: number;
    events: {
        eventCode: string;
        rank: number;
        rs: number;
        matchPoints: number;
    }[];
}

export interface PitScouting {
    teamNumber: number;
    season: number;
    robotName?: string;
    driveTrain?: string;
    dimensions?: string;
    weight?: string;
    motors?: string;
    sensors?: string;
    servoCount?: number; // New for DECODE (limit 10)
    intakeType?: string;
    scoringMechanism?: string;
    patternMechanism?: string;
    visionSensors?: string[];
    canDualPark?: boolean;
    motifDetection?: boolean;
    photoUrl?: string;
    notes?: string;
    lastUpdatedBy?: string;
    lastUpdatedAt?: { seconds: number; nanoseconds: number } | null; // Firestore Timestamp
}

export interface MatchScouting {
    id?: string;
    teamNumber: number;
    eventCode: string;
    matchNumber: number;
    season: number;
    scouterName: string;
    scouterId: string;

    // Auto
    autoParked: boolean;
    autoLaunchLine: boolean;
    autoPurpleArtifacts: number;
    autoGreenArtifacts: number;
    autoMotifStarted: boolean;
    movementRP: boolean;
    autoPoints: number;

    // Teleop
    teleopPurpleArtifacts: number;
    teleopGreenArtifacts: number;
    patternsCompleted: number;
    gatesUsed: boolean;
    driverSkill: number; // 1-5

    // Endgame
    endgameBaseParking: 'None' | 'Partial' | 'Full';
    dualParking: boolean;
    motifCompleted: boolean;
    goalRP: boolean;
    patternRP: boolean;

    // Notes
    notes: string;
    timestamp: { seconds: number; nanoseconds: number } | null;
}

export type ScoutingData = PitScouting;

export interface FTCMatchTeam {
    teamNumber: number;
    station: 'Red1' | 'Red2' | 'Blue1' | 'Blue2';
    dq: boolean;
    onField: boolean;
}

export interface FTCMatch {
    description: string;
    matchNumber: number;
    scoreRedFinal: number;
    scoreBlueFinal: number;
    scoreRedAuto: number;
    scoreBlueAuto: number;
    scoreRedFoul: number;
    scoreBlueFoul: number;
    teams: FTCMatchTeam[];
    actualStartTime?: string;
    postResultTime?: string;
    tournamentLevel: string; // "QUALIFICATION", "PLAYOFF", etc.
}

export interface FTCAward {
    awardId: number;
    teamNumber: number;
    displayTeamNumber: string;
    awardName: string;
    series: number;
    eventCode: string;
}
