import type { GameDefinition, GameField, GameSection } from "@/types/game-definition";

/**
 * Trading Card questions that hold in EVERY FTC season (decision #107):
 * robot hardware, software and how the team plays. Season-specific scoring
 * questions live in each GameDefinition.selfReport instead — a field like
 * "can climb" only exists in seasons whose game has a climb.
 *
 * Same GameSection shape as the game engine, so DynamicGameForm renders it
 * and zodSchemaFromDefinition validates it. Labels are keys under
 * `Games.general` (the catalog DynamicGameForm reads).
 *
 * Research (13-nov-2026, ~9 real pit-scouting forms/apps): drivetrain, auto
 * routines, preferred role, cycle time, weight/expansion, language,
 * localization, framework, vision, defense, drive experience. Team facts
 * (rookie year, city, awards) come from the FIRST API, never asked here.
 * Never ask people's names (minors, #92).
 */

const opt = (group: string, values: string[]) =>
    values.map(v => ({ value: v, label: `general.options.${group}.${v}` }));

const ROLE_FIELD: GameField = {
    id: "preferredRole",
    kind: "enum",
    label: "general.fields.preferredRole",
    options: opt("preferredRole", ["Scorer", "Defender", "Support", "Flexible"]),
};

export const GENERAL_SECTIONS: GameSection[] = [
    {
        id: "generalRobot",
        label: "general.sections.robot",
        accent: "cyan",
        fields: [
            { id: "drivetrain", kind: "enum", label: "general.fields.drivetrain", options: opt("drivetrain", ["Mecanum", "Tank", "Swerve", "OmniX", "Other"]) },
            { id: "weightLb", kind: "counter", label: "general.fields.weightLb", min: 0, max: 60, color: "cyan" },
            { id: "expandsBeyond18", kind: "boolean", label: "general.fields.expandsBeyond18" },
            { id: "buildSystem", kind: "enum", label: "general.fields.buildSystem", options: opt("buildSystem", ["goBILDA", "REV", "AndyMark", "Mixed", "Custom"]) },
        ],
    },
    {
        id: "generalSoftware",
        label: "general.sections.software",
        accent: "primary",
        fields: [
            { id: "language", kind: "enum", label: "general.fields.language", options: opt("language", ["AndroidStudioJava", "OnBotJava", "Blocks", "Kotlin"]) },
            { id: "localization", kind: "enum", label: "general.fields.localization", options: opt("localization", ["None", "DriveEncoders", "OdometryPods", "Pinpoint", "AprilTags"]) },
            { id: "pathFramework", kind: "enum", label: "general.fields.pathFramework", options: opt("pathFramework", ["None", "RoadRunner", "PedroPathing", "FTCLib", "Custom"]) },
            { id: "camera", kind: "enum", label: "general.fields.camera", options: opt("camera", ["None", "Webcam", "Limelight3A", "HuskyLens", "Other"]) },
        ],
    },
    {
        id: "generalPlay",
        label: "general.sections.play",
        accent: "green",
        fields: [
            { id: "autoRoutines", kind: "counter", label: "general.fields.autoRoutines", min: 0, max: 10, color: "green" },
            ROLE_FIELD,
            { id: "cycleTimeS", kind: "counter", label: "general.fields.cycleTimeS", helpText: "general.fields.cycleTimeHelp", min: 0, max: 60, color: "green" },
            { id: "canPlayDefense", kind: "boolean", label: "general.fields.canPlayDefense" },
            { id: "driveExperience", kind: "enum", label: "general.fields.driveExperience", options: opt("driveExperience", ["Rookie", "TwoToFour", "FivePlus"]) },
        ],
    },
    {
        id: "generalNotes",
        label: "general.sections.notes",
        accent: "amber",
        fields: [
            { id: "strengthsLimits", kind: "textarea", label: "general.fields.strengthsLimits", placeholder: "general.fields.strengthsLimitsPlaceholder", maxLength: 200 },
            { id: "bigChanges", kind: "boolean", label: "general.fields.bigChanges" },
            { id: "bigChangesNote", kind: "text", label: "general.fields.bigChangesNote", maxLength: 120 },
        ],
    },
];

/** Bump when the general questions change meaning (stored with the answers). */
export const GENERAL_QUESTIONS_VERSION = 1;

/**
 * General questions for a season: the generic preferred role is dropped when
 * the season defines its own (`seasonRole`, e.g. BIOBUZZ HIVE/FLOWERS).
 */
export function generalQuestions(season: GameDefinition | null | undefined): GameDefinition {
    const seasonHasRole = !!season?.selfReport?.some(s => s.fields.some(f => f.id === "seasonRole"));
    const sections = GENERAL_SECTIONS.map(s => ({
        ...s,
        fields: seasonHasRole ? s.fields.filter(f => f.id !== ROLE_FIELD.id) : s.fields,
    }));
    return {
        id: `general-v${GENERAL_QUESTIONS_VERSION}`,
        label: "general",
        program: "FTC",
        season: season?.season ?? 0,
        schemaVersion: GENERAL_QUESTIONS_VERSION,
        sections,
    };
}
