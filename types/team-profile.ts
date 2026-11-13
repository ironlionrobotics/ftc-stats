/**
 * Team self-report profile — the "Trading Card". A team describes ITSELF, and
 * the result is a shareable card. This is the inverted scouting primitive
 * (decision #76): instead of orgs observing each other, each team publishes
 * facts about itself.
 *
 * Distinct from PitScouting: pit is one org's PRIVATE observation of some team
 * (own-org read under the Phase 1 lockdown). A TeamProfile is PUBLIC by design
 * — the team opted to publish it — and can only be written for your OWN team
 * (firestore.rules: teamNumber == myOrgId). Because it's public and rules can't
 * field-mask, this document holds ONLY shareable fields; nothing private ever
 * goes here (private robot notes stay in pit_scouting).
 *
 * The differentiator over pure self-report tools (e.g. WikiScout): the card
 * renders the team's self-claimed point ranges next to the MEASURED stats
 * derived from official FIRST scores (see MeasuredStats + app/actions/team-card).
 * Claim and ground truth sit side by side.
 */

/** FTC phase point range a team claims it can score. */
export interface PhasePoints {
    low: number;
    high: number;
}

/**
 * Common-FTC robot capabilities. Kept game-agnostic on purpose (climbing,
 * scoring at range, intake style recur across seasons); season-specific match
 * data lives in the declarative game engine, not here.
 */
export interface RobotCapabilities {
    canClimb: boolean;
    /** Free label for how high it climbs, e.g. "Low", "High", "Deep". "" = n/a. */
    climbLevel: string;
    scoresNear: boolean;
    scoresFar: boolean;
    groundIntake: boolean;
    sourceIntake: boolean;
    /** Drivetrain family, e.g. "Mecanum", "Tank", "Swerve". "" = unset. */
    drivetrain: string;
}

/** Public, shareable descriptions written by the team. */
export interface CardDescriptions {
    robot: string;
    autonomous: string;
    strategy: string;
}

/** The persisted, PUBLIC self-report document (team_profiles/{season}_{team}). */
export interface TeamProfile {
    teamNumber: number;
    season: number;
    capabilities: RobotCapabilities;
    points: {
        auto: PhasePoints;
        teleop: PhasePoints;
        endgame: PhasePoints;
    };
    descriptions: CardDescriptions;
    /** Public photo URL (self-hosted or a link). Empty until uploaded. */
    photoUrl: string;
    /** Server timestamp of the last publish. */
    updatedAt?: { seconds: number; nanoseconds: number } | null;
}

/**
 * Ground-truth-derived stats for the card, computed from official FIRST scores
 * — NOT self-reported. This is what a viewer checks the team's claims against.
 * All fields optional: the API may be unreachable or the team may not yet have
 * played, in which case the card renders the self-report alone.
 */
export interface MeasuredStats {
    rank?: number;
    totalTeams?: number;
    opr?: number;
    /** Strength of schedule (alliance matchup luck). */
    sos?: number;
    record?: { wins: number; losses: number; ties: number };
    avgScore?: number;
    eventCode?: string;
    eventName?: string;
}

/** Empty profile for a team that hasn't published one yet. */
export function emptyTeamProfile(teamNumber: number, season: number): TeamProfile {
    return {
        teamNumber,
        season,
        capabilities: {
            canClimb: false,
            climbLevel: "",
            scoresNear: false,
            scoresFar: false,
            groundIntake: false,
            sourceIntake: false,
            drivetrain: "",
        },
        points: {
            auto: { low: 0, high: 0 },
            teleop: { low: 0, high: 0 },
            endgame: { low: 0, high: 0 },
        },
        descriptions: { robot: "", autonomous: "", strategy: "" },
        photoUrl: "",
        updatedAt: null,
    };
}
