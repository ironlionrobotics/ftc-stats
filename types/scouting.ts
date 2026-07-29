export interface FTCEvent {
    code: string;
    name: string;
    dateStart: string;
    venue?: string;
    city?: string;
    country?: string;
    stateProv?: string;
    countryCode?: string;
    typeName?: string;
    dateEnd?: string;
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
    avgTeleOp: number;
    avgEndGame: number;
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
        // Official FIRST event code (e.g. "MXCIQ") — the namespace scouting
        // entries, event pages, and the FTC API all share. Display strings
        // belong in `abbr`, never here.
        eventCode: string;
        // Optional short label for UI chips (e.g. "CTN").
        abbr?: string;
        // Event dates ("YYYY-MM-DD") so clients can pick the event currently
        // in progress (see lib/active-event.ts) instead of guessing events[0].
        dateStart?: string;
        dateEnd?: string;
        rank: number;
        rs: number;
        matchPoints: number;
    }[];
}

export interface PitScouting {
    teamNumber: number;
    season: number;

    // Federated attribution. One pit_scouting doc per (season, teamNumber, orgId)
    // so each org maintains its own subjective view of the same team.
    // See docs/architecture/collaborative-scouting-model.md §2.5 + §4.2.
    orgId?: string;

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

    // Strategic / internal notes — ONLY visible to the owning org. Never shared.
    notes?: string;

    // Opt-in summary intended for cross-org sharing. Other orgs can read this
    // via getPublicPitSummaries() but cannot read `notes` or any other field.
    // When the user publishes a summary the `publicSummarySharedAt` timestamp
    // tracks when it was last opened to others.
    publicSummary?: string;
    publicSummarySharedAt?: { seconds: number; nanoseconds: number } | null;

    scoutedBy?: string;       // canonical user uid (matches design doc §2.5)
    lastUpdatedBy?: string;   // legacy display name; kept for older docs
    lastUpdatedAt?: { seconds: number; nanoseconds: number } | null;
}

/**
 * Public view of a pit scouting record. Strips private fields (notes,
 * raw scoutedBy uid) so it's safe to expose to other orgs.
 */
export interface PublicPitSummary {
    teamNumber: number;
    season: number;
    orgId: string;
    summary: string;
    sharedAt: { seconds: number; nanoseconds: number } | null;
}

// --- Base Scouting Types ---

// Self-assessed quality of an observation. Scouts pick "low" when they were
// distracted or only caught half the match; high-variance entries flagged as
// "low" weigh less in the federated consensus (see aggregation rules in
// docs/architecture/collaborative-scouting-model.md §3).
export type ScoutConfidence = "high" | "medium" | "low";

// Scouting role / mode of an entry:
//   "match"  → objective stands scout. Counters and per-phase data are valid.
//   "super"  → subjective super-scout. Only driverSkill/defense/reliability/
//              wouldPick/notes are valid; counter fields are intentionally
//              left undefined so they don't dilute the objective consensus.
// Default is "match" for backward compatibility with pre-Sprint 1.5 entries.
export type ScoutingMode = "match" | "super";

// Bumped each season or when the per-game data shape changes incompatibly.
// Readers can use this to migrate old documents on the fly or skip them.
// Current values:
//   1 = FTC Into The Deep (2024-2025)
//   2 = FRC Reefscape (2025)
//   (DECODE 2025-2026 will bump to 3 when implemented)
export const CURRENT_GAME_SCHEMA: Record<'FTC' | 'FRC', number> = {
    FTC: 1,
    FRC: 2,
};

export interface BaseMatchScouting {
    id?: string;

    // ---- Identification of the observed match ----
    teamNumber: number;          // team being scouted
    eventCode: string;
    matchNumber: number;
    season: number;
    program: 'FTC' | 'FRC';
    tournamentLevel?: "QUALIFICATION" | "PLAYOFF";  // optional until backfilled
    alliance?: "Red" | "Blue";   // optional until backfilled

    // ---- Attribution (federated model) ----
    // orgId is the canonical owner of the entry for sharing and conflict
    // resolution. Optional in the type for backward compat with pre-Sprint 1
    // documents; new writes always set it (see lib/scouting-service.ts).
    orgId?: string;
    // scoutId is the canonical scout identifier. scouterId is kept as alias
    // for legacy data — readers should prefer scoutId and fall back to scouterId.
    scoutId?: string;
    scoutName?: string;
    scouterId: string;           // legacy alias of scoutId
    scouterName: string;         // legacy alias of scoutName

    // ---- Provenance / quality ----
    appVersion?: string;
    confidence?: ScoutConfidence;
    gameSchemaVersion?: number;

    // See ScoutingMode jsdoc. Default is "match" when missing on legacy docs.
    scoutingMode?: ScoutingMode;

    notes: string;
    timestamp: { seconds: number; nanoseconds: number } | null;
}

// Helper: returns the canonical scout id from an entry, tolerating legacy
// docs that only have scouterId.
export function scoutIdOf(entry: Pick<BaseMatchScouting, "scoutId" | "scouterId">): string {
    return entry.scoutId ?? entry.scouterId;
}

// Helper: returns the canonical scout display name.
export function scoutNameOf(entry: Pick<BaseMatchScouting, "scoutName" | "scouterName">): string {
    return entry.scoutName ?? entry.scouterName;
}

// --- FTC: Into The Deep (2024-2025) ---
// Numeric/categorical fields are required for objective ("match" mode) entries
// but Super-scouting ("super" mode) entries leave them undefined so they don't
// pollute the federated numeric consensus. The aggregator already skips
// undefined values per field.
export interface FTCDecodeData {
    // Auto
    autoParked?: boolean;
    autoLaunchLine?: boolean;
    autoPurpleArtifacts?: number;
    autoGreenArtifacts?: number;
    autoMotifStarted?: boolean;
    movementRP?: boolean;
    autoPoints?: number;

    // Teleop
    teleopPurpleArtifacts?: number;
    teleopGreenArtifacts?: number;
    patternsCompleted?: number;
    gatesUsed?: boolean;
    driverSkill?: number; // 1-5 — subjective

    // Endgame
    endgameBaseParking?: 'None' | 'Partial' | 'Full';
    dualParking?: boolean;
    motifCompleted?: boolean;
    goalRP?: boolean;
    patternRP?: boolean;

    // Subjective (super-scouting). Per-org buckets; never merged cross-org.
    defenseRating?: number; // 1-5
    reliability?: number;   // 1-5
    wouldPick?: boolean;    // "would your team pick this team in alliance selection?"
}

export interface FTCMatchScouting extends BaseMatchScouting, FTCDecodeData {
    program: 'FTC';
}

// --- FRC: Reefscape (2025) ---
// Same shape contract as FTC DECODE: all numeric/categorical fields are
// optional so super-scouting entries can omit them safely.
export interface FRCReefscapeData {
    // Auto
    autoLeave?: boolean;
    autoCoralL1?: number;
    autoCoralL2?: number;
    autoCoralL3?: number;
    autoCoralL4?: number;
    autoAlgaeProcessor?: number;
    autoAlgaeNet?: number;

    // Teleop
    teleopCoralL1?: number;
    teleopCoralL2?: number;
    teleopCoralL3?: number;
    teleopCoralL4?: number;
    teleopAlgaeProcessor?: number;
    teleopAlgaeNet?: number;
    driverSkill?: number; // 1-5
    defenseRating?: number; // 1-5

    // Endgame
    endgameParked?: boolean;
    endgameClimbState?: 'None' | 'Shallow' | 'Deep';

    // Subjective extras (super scouting)
    reliability?: number;   // 1-5
    wouldPick?: boolean;
}

export interface FRCMatchScouting extends BaseMatchScouting, FRCReefscapeData {
    program: 'FRC';
}

// --- Unified Type ---
// Keep backward compatibility with existing FTC code for now while refactoring
export type MatchScouting = FTCMatchScouting | FRCMatchScouting;


export type ScoutingData = PitScouting;

export interface FTCMatchTeam {
    teamNumber: number;
    station: 'Red1' | 'Red2' | 'Blue1' | 'Blue2';
    dq: boolean;
    onField: boolean;
    yellowCard: boolean;
    redCard: boolean;
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
    scoreRedRp1: number;
    scoreRedRp2: number;
    scoreBlueRp1: number;
    scoreBlueRp2: number;
    teams: FTCMatchTeam[];
    actualStartTime?: string;
    postResultTime?: string;
    tournamentLevel: string; // "QUALIFICATION", "PLAYOFF", etc.
}

/**
 * Entry from the FIRST API "hybrid schedule" endpoint: the full match
 * schedule with results inlined for played matches. Unplayed matches have
 * null scores — that's the signal the UI uses to render a prediction
 * instead of a result.
 */
export interface FTCHybridScheduleMatch {
    description: string;
    matchNumber: number;
    tournamentLevel: string;
    series?: number;
    startTime?: string | null;
    actualStartTime?: string | null;
    scoreRedFinal: number | null;
    scoreBlueFinal: number | null;
    teams: {
        teamNumber: number;
        station: string;
        teamName?: string | null;
        surrogate?: boolean;
    }[];
}

/** One selected playoff alliance from the FIRST API /alliances endpoint. */
export interface FTCAllianceSelection {
    number: number;
    name?: string | null;
    captain: { teamNumber: number; teamName?: string | null } | null;
    round1: { teamNumber: number; teamName?: string | null } | null;
    /** Non-null ⟹ the event runs 3-robot alliances (Championship rule 15.3). */
    round2: { teamNumber: number; teamName?: string | null } | null;
    backup?: { teamNumber: number; teamName?: string | null } | null;
}

export interface FTCAward {
    awardId: number;
    teamNumber: number;
    displayTeamNumber: string;
    awardName: string;
    name?: string;
    series: number;
    eventCode: string;
}
