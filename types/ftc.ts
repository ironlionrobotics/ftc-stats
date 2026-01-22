export interface FTCEvent {
    eventCode: string;
    name?: string;
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
    events: {
        eventCode: string;
        rank: number;
        rs: number;
        matchPoints: number;
    }[];
}

export interface ScoutingData {
    teamNumber: number;
    robotName: string;
    chassisType: 'Mecano' | 'Tanque' | 'Omnidireccional' | 'Otros';
    chassisWidth: number;
    chassisLength: number;
    chassisUnit: 'cm' | 'in';
    robotHeight: number;

    // Autonomous
    canLeaveLaunchZone: 'No, de ninguno' | 'Si, sale del triángulo grande' | 'Si, sale del triángulo pequeño' | 'Si, ambos';
    preferredLaunchZone: 'Triángulo grande' | 'Triángulo pequeño';
    autoParsings: {
        triangleBigRed: boolean;
        triangleSmallRed: boolean;
        triangleBigBlue: boolean;
        triangleSmallBlue: boolean;
    };
    autoArtifacts: number;
    spikeMarkSource: {
        near: boolean;
        medium: boolean;
        far: boolean;
        none: boolean;
    };
    sensors: 'Ninguno' | 'Visión' | 'Odometría' | 'Ambos' | 'Otros';
    organizesPattern: boolean;
    autoRating: number;

    // Tele-Op
    teleopFocus: 'Tiros largos' | 'Tiros cortos' | 'Defensa / Obstrucción';
    artifactSource: {
        ground: boolean;
        humanPlayer: boolean;
    };
    artifactsPerCycle: number;
    cyclesCount: number;

    // End Game
    endGamePreference: 'Ciclos rápidos de Artifacts' | 'Buscar el pattern';
    parkingStatus: 'Robot entra completamente y no sobra espacio' | 'Robot entra completo y sobran de 2 a 4 pulgadas' | 'Robot entra completo y sobran mas de 4 pulgadas';
    canHang: boolean;
    elevationType: 'Elevador' | 'Giro 90 grados' | 'Otros' | '';
    photoUrl?: string;
    notes?: string;
}
