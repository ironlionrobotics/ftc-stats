import { db } from "./firebase";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";
import type { TeamProfile } from "@/types/team-profile";
import { emptyTeamProfile } from "@/types/team-profile";
import type { TeamProfileFormValues } from "@/lib/schemas/team-profile";

const COLLECTION = "team_profiles";

/** Coerce a possibly-string form value to a non-negative integer. */
function num(v: unknown): number {
    const n = Math.trunc(Number(v));
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Deterministic, one-per-(season, team) doc id. */
function profileId(season: number, teamNumber: number): string {
    return `${season}_${teamNumber}`;
}

/**
 * Reads a team's published card. PUBLIC read (firestore.rules) — any authed
 * user can fetch any team's card, since a self-report is meant to be seen.
 * Returns null when the team hasn't published one.
 */
export async function getTeamProfile(
    season: number,
    teamNumber: number,
): Promise<TeamProfile | null> {
    const snap = await getDoc(doc(db, COLLECTION, profileId(season, teamNumber)));
    return snap.exists() ? (snap.data() as TeamProfile) : null;
}

/**
 * Publishes the card. WRITE is gated by firestore.rules to your OWN team
 * (teamNumber == myOrgId), so a client can only ever write its own profile.
 * The document carries only public fields — private notes never belong here.
 */
export async function saveTeamProfile(profile: TeamProfile): Promise<void> {
    const ref = doc(db, COLLECTION, profileId(profile.season, profile.teamNumber));
    await setDoc(
        ref,
        { ...profile, updatedAt: Timestamp.now() },
        { merge: true },
    );
}

// --- form <-> profile mapping (single source of truth for both directions) ---

export function profileToForm(p: TeamProfile): TeamProfileFormValues {
    return {
        canClimb: p.capabilities.canClimb,
        climbLevel: p.capabilities.climbLevel,
        scoresNear: p.capabilities.scoresNear,
        scoresFar: p.capabilities.scoresFar,
        groundIntake: p.capabilities.groundIntake,
        sourceIntake: p.capabilities.sourceIntake,
        drivetrain: p.capabilities.drivetrain,
        autoLow: p.points.auto.low,
        autoHigh: p.points.auto.high,
        teleopLow: p.points.teleop.low,
        teleopHigh: p.points.teleop.high,
        endgameLow: p.points.endgame.low,
        endgameHigh: p.points.endgame.high,
        robot: p.descriptions.robot,
        autonomous: p.descriptions.autonomous,
        strategy: p.descriptions.strategy,
        photoUrl: p.photoUrl,
    };
}

export function formToProfile(
    v: TeamProfileFormValues,
    teamNumber: number,
    season: number,
): TeamProfile {
    return {
        teamNumber,
        season,
        capabilities: {
            canClimb: v.canClimb,
            climbLevel: v.climbLevel,
            scoresNear: v.scoresNear,
            scoresFar: v.scoresFar,
            groundIntake: v.groundIntake,
            sourceIntake: v.sourceIntake,
            drivetrain: v.drivetrain,
        },
        // Coerce: RHF number inputs can hand back strings mid-edit (the live
        // preview reads watched values before Zod coercion runs on submit).
        points: {
            auto: { low: num(v.autoLow), high: num(v.autoHigh) },
            teleop: { low: num(v.teleopLow), high: num(v.teleopHigh) },
            endgame: { low: num(v.endgameLow), high: num(v.endgameHigh) },
        },
        descriptions: { robot: v.robot, autonomous: v.autonomous, strategy: v.strategy },
        photoUrl: v.photoUrl,
    };
}

export { emptyTeamProfile };
