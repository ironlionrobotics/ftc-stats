import type { GameDefinition, GameField, GameSection } from "@/types/game-definition";

/**
 * FTC BIOBUZZ™ presented by RTX (FIRST CANOPY, 2026-2027) as a declarative
 * game definition. Served for FTC season >= 2026 by `gameDefinitionFor()`.
 *
 * Point values: Competition Manual TU09, Table 10-2. Fouls: Table 10-4
 * (minor 5 / major 20, credited to the opponent). Research and sources:
 * docs/research/2026-11-13-biobuzz.md.
 *
 * Design decisions:
 * - HIVE TIPs (20 pts) are an ALLIANCE achievement — both robots fill the
 *   CELL. To avoid double counting between the two scouts of an alliance, a
 *   robot is credited a TIP only if ITS launch flipped the CELL (helpText).
 *   Launches made/missed are captured too, so tips can later be re-attributed
 *   by launch share against the official alliance tip count.
 * - Ranking Points are NOT captured: they are deterministic, alliance-level
 *   and come from the official /scores breakdown (swarmRP, pollinator1RP,
 *   pollinator2RP). Hand-entering them only adds noise to the consensus.
 * - Elements left in the top CELL (2 pts each, alliance-level, evaluated at
 *   match end) are not scouted — read from the API (teleopHivePollenNectar).
 * - No formal ENDGAME period exists; the "endgame" section is the last 60 s
 *   when FLOWER scoring opens (G410) and all NECTAR is released (G426.B).
 *
 * Labels are i18n keys under the `Games` catalog namespace (see the label
 * convention note in ftc-decode-2025.ts).
 */
const BIOBUZZ_SCOUTING_SECTIONS: GameSection[] = [
    {
        id: "auto",
        label: "biobuzz.sections.auto",
        accent: "primary",
        fields: [
            { id: "autoLeave", kind: "boolean", label: "biobuzz.fields.autoLeave" },
            {
                id: "autoCellLaunches",
                kind: "counter",
                label: "biobuzz.fields.autoCellLaunches",
                helpText: "biobuzz.fields.cellLaunchesHelp",
                color: "amber",
                min: 0,
                max: 30,
            },
            {
                id: "autoCellMisses",
                kind: "counter",
                label: "biobuzz.fields.autoCellMisses",
                color: "purple",
                min: 0,
                max: 30,
            },
            {
                id: "autoHiveTips",
                kind: "counter",
                label: "biobuzz.fields.autoHiveTips",
                helpText: "biobuzz.fields.hiveTipsHelp",
                color: "green",
                min: 0,
                max: 4,
            },
            { id: "autoPark", kind: "boolean", label: "biobuzz.fields.autoPark" },
        ],
    },
    {
        id: "teleop",
        label: "biobuzz.sections.teleop",
        accent: "primary",
        fields: [
            {
                id: "teleopCellLaunches",
                kind: "counter",
                label: "biobuzz.fields.teleopCellLaunches",
                helpText: "biobuzz.fields.cellLaunchesHelp",
                color: "amber",
                min: 0,
                max: 100,
            },
            {
                id: "teleopCellMisses",
                kind: "counter",
                label: "biobuzz.fields.teleopCellMisses",
                color: "purple",
                min: 0,
                max: 100,
            },
            {
                id: "teleopHiveTips",
                kind: "counter",
                label: "biobuzz.fields.teleopHiveTips",
                helpText: "biobuzz.fields.hiveTipsHelp",
                color: "green",
                min: 0,
                max: 12,
            },
            {
                id: "teleopGardenElements",
                kind: "counter",
                label: "biobuzz.fields.teleopGardenElements",
                color: "cyan",
                min: 0,
                max: 40,
            },
            {
                id: "driverSkill",
                kind: "stars",
                label: "biobuzz.fields.driverSkill",
                helpText: "biobuzz.fields.driverSkillHelp",
                max: 5,
            },
        ],
    },
    {
        id: "endgame",
        label: "biobuzz.sections.endgame",
        accent: "primary",
        fields: [
            {
                id: "flowerElementsPlaced",
                kind: "counter",
                label: "biobuzz.fields.flowerElementsPlaced",
                helpText: "biobuzz.fields.flowerElementsPlacedHelp",
                color: "amber",
                min: 0,
                max: 40,
            },
            {
                id: "flowersClaimed",
                kind: "counter",
                label: "biobuzz.fields.flowersClaimed",
                helpText: "biobuzz.fields.flowersClaimedHelp",
                color: "green",
                min: 0,
                max: 4,
            },
            {
                id: "bottomNectarBonuses",
                kind: "counter",
                label: "biobuzz.fields.bottomNectarBonuses",
                helpText: "biobuzz.fields.bottomNectarBonusesHelp",
                color: "primary",
                min: 0,
                max: 4,
            },
            { id: "teleopPark", kind: "boolean", label: "biobuzz.fields.teleopPark" },
            {
                id: "defense",
                kind: "enum",
                label: "biobuzz.fields.defense",
                options: [
                    { value: "None", label: "biobuzz.options.defense.None" },
                    { value: "Some", label: "biobuzz.options.defense.Some" },
                    { value: "Heavy", label: "biobuzz.options.defense.Heavy" },
                ],
            },
            {
                id: "robotIssue",
                kind: "enum",
                label: "biobuzz.fields.robotIssue",
                options: [
                    { value: "None", label: "biobuzz.options.robotIssue.None" },
                    { value: "NoShow", label: "biobuzz.options.robotIssue.NoShow" },
                    { value: "Died", label: "biobuzz.options.robotIssue.Died" },
                    { value: "TippedOver", label: "biobuzz.options.robotIssue.TippedOver" },
                ],
            },
            {
                id: "minorFouls",
                kind: "counter",
                label: "biobuzz.fields.minorFouls",
                min: 0,
                max: 20,
            },
            {
                id: "majorFouls",
                kind: "counter",
                label: "biobuzz.fields.majorFouls",
                min: 0,
                max: 10,
            },
        ],
    },
    {
        id: "notes",
        label: "biobuzz.sections.notes",
        fields: [
            {
                id: "notes",
                kind: "textarea",
                label: "biobuzz.fields.notes",
                placeholder: "biobuzz.fields.notesPlaceholder",
                maxLength: 2000,
            },
        ],
    },
];

/** Scouting field by id, so the self-report reuses ids, labels and limits. */
function field(id: string): GameField {
    for (const section of BIOBUZZ_SCOUTING_SECTIONS) {
        const f = section.fields.find(x => x.id === id);
        if (f) return f;
    }
    throw new Error(`BIOBUZZ field ${id} not found`);
}

/**
 * Trading Card questions (#101). Counters are the team's TYPICAL match, with
 * the same ids as scouting, so score() prices the claim and the shared pool
 * can be compared field by field.
 */
const BIOBUZZ_SELF_REPORT: GameSection[] = [
    {
        id: "selfAuto",
        label: "biobuzz.selfReport.sections.auto",
        accent: "primary",
        fields: [field("autoLeave"), field("autoCellLaunches"), field("autoHiveTips"), field("autoPark")],
    },
    {
        id: "selfTeleop",
        label: "biobuzz.selfReport.sections.teleop",
        accent: "primary",
        fields: [field("teleopCellLaunches"), field("teleopHiveTips"), field("teleopGardenElements")],
    },
    {
        id: "selfEndgame",
        label: "biobuzz.selfReport.sections.endgame",
        accent: "green",
        fields: [field("flowerElementsPlaced"), field("bottomNectarBonuses"), field("teleopPark")],
    },
    {
        id: "selfRobot",
        label: "biobuzz.selfReport.sections.robot",
        accent: "cyan",
        fields: [
            {
                id: "drivetrain",
                kind: "enum",
                label: "biobuzz.selfReport.fields.drivetrain",
                options: [
                    { value: "Mecanum", label: "biobuzz.selfReport.options.drivetrain.Mecanum" },
                    { value: "Tank", label: "biobuzz.selfReport.options.drivetrain.Tank" },
                    { value: "Swerve", label: "biobuzz.selfReport.options.drivetrain.Swerve" },
                    { value: "Other", label: "biobuzz.selfReport.options.drivetrain.Other" },
                ],
            },
            {
                id: "intake",
                kind: "enum",
                label: "biobuzz.selfReport.fields.intake",
                options: [
                    { value: "Ground", label: "biobuzz.selfReport.options.intake.Ground" },
                    { value: "HumanPlayer", label: "biobuzz.selfReport.options.intake.HumanPlayer" },
                    { value: "Both", label: "biobuzz.selfReport.options.intake.Both" },
                ],
            },
            { id: "autoRoutines", kind: "counter", label: "biobuzz.selfReport.fields.autoRoutines", min: 0, max: 10, color: "primary" },
            { id: "canPlayDefense", kind: "boolean", label: "biobuzz.selfReport.fields.canPlayDefense" },
            {
                id: "knownLimits",
                kind: "textarea",
                label: "biobuzz.selfReport.fields.knownLimits",
                placeholder: "biobuzz.selfReport.fields.knownLimitsPlaceholder",
                maxLength: 500,
            },
        ],
    },
];

export const FTC_BIOBUZZ_2026: GameDefinition = {
    id: "ftc-biobuzz-2026-2027",
    label: "FTC BIOBUZZ",
    program: "FTC",
    season: 2026,
    schemaVersion: 3,
    sections: BIOBUZZ_SCOUTING_SECTIONS,
    selfReport: BIOBUZZ_SELF_REPORT,
    // `autoParked` is the cross-season categorical scouting-aggregation reads.
    toEntry: (v) => ({ autoParked: v.autoPark === true }),
    derivedFields: { autoParked: "categorical" },
    // Per-robot points (Table 10-2). FLOWER elements are credited at 2 each
    // assuming the alliance owns the FLOWER; ownership is contested and
    // decided at match end, so this is an upper bound until calibrated
    // against the official FLOWER arrays.
    score: (s) => ({
        auto: (s.flag("autoLeave") ? 3 : 0) + (s.flag("autoPark") ? 5 : 0) + 20 * s.num("autoHiveTips"),
        teleop: 20 * s.num("teleopHiveTips") + s.num("teleopGardenElements"),
        endgame:
            2 * s.num("flowerElementsPlaced") +
            5 * s.num("bottomNectarBonuses") +
            (s.flag("teleopPark") ? 5 : 0),
    }),
};
