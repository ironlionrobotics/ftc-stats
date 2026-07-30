import type { GameDefinition } from "@/types/game-definition";

/**
 * FTC DECODE 2025-2026 as a declarative game definition.
 *
 * This IS the production FTC match-scouting form — wired in via
 * `GameScoutingForm` since session 19 (decision #79). The retired
 * hand-written `FTC_DecodeForm` is dead reference code (nothing imports it).
 * When the 2026-2027 game launches in September, create a sibling file
 * (e.g. `ftc-galactic-2026.ts`) and swap which definition
 * `MatchScoutingForm` imports — no React changes needed. See
 * `docs/architecture/game-schema-migration.md`.
 *
 * Field ids are preserved from the existing schema so federation, aggregation
 * and reporting code keep working without migration.
 *
 * **Label convention:** every display string below (section/field labels,
 * helpText, placeholder, enum option labels) is an i18n dot-path key
 * relative to the `Games` catalog namespace, NOT literal prose — the
 * renderer (`DynamicGameForm`/`GameScoutingForm`) resolves it with a
 * `t.has()` + fallback idiom (see `lib/hooks/use-zod-message.ts`), so a
 * definition without a catalog entry still degrades to readable text. The
 * top-level `label: "FTC DECODE"` is the one exception — it's the game's
 * proper name, kept as literal data.
 */
export const FTC_DECODE_2025: GameDefinition = {
    id: "ftc-decode-2025-2026",
    label: "FTC DECODE",
    program: "FTC",
    season: 2025,
    sections: [
        {
            id: "auto",
            label: "decode.sections.auto",
            accent: "primary",
            fields: [
                { id: "autoLaunchLine", kind: "boolean", label: "decode.fields.autoLaunchLine" },
                { id: "autoMotifStarted", kind: "boolean", label: "decode.fields.autoMotifStarted" },
                {
                    id: "autoPurpleArtifacts",
                    kind: "counter",
                    label: "decode.fields.autoPurpleArtifacts",
                    color: "purple",
                    min: 0,
                    max: 50,
                },
                {
                    id: "autoGreenArtifacts",
                    kind: "counter",
                    label: "decode.fields.autoGreenArtifacts",
                    color: "green",
                    min: 0,
                    max: 50,
                },
                { id: "movementRP", kind: "boolean", label: "decode.fields.movementRP" },
            ],
        },
        {
            id: "teleop",
            label: "decode.sections.teleop",
            accent: "primary",
            fields: [
                {
                    id: "teleopPurpleArtifacts",
                    kind: "counter",
                    label: "decode.fields.teleopPurpleArtifacts",
                    color: "purple",
                    min: 0,
                    max: 200,
                },
                {
                    id: "teleopGreenArtifacts",
                    kind: "counter",
                    label: "decode.fields.teleopGreenArtifacts",
                    color: "green",
                    min: 0,
                    max: 200,
                },
                {
                    id: "patternsCompleted",
                    kind: "counter",
                    label: "decode.fields.patternsCompleted",
                    color: "primary",
                    min: 0,
                    max: 20,
                },
                { id: "gatesUsed", kind: "boolean", label: "decode.fields.gatesUsed" },
                {
                    id: "driverSkill",
                    kind: "stars",
                    label: "decode.fields.driverSkill",
                    helpText: "decode.fields.driverSkillHelp",
                    max: 5,
                },
            ],
        },
        {
            id: "endgame",
            label: "decode.sections.endgame",
            accent: "primary",
            fields: [
                {
                    id: "endgameBaseParking",
                    kind: "enum",
                    label: "decode.fields.endgameBaseParking",
                    options: [
                        { value: "None", label: "decode.options.endgameBaseParking.None" },
                        { value: "Partial", label: "decode.options.endgameBaseParking.Partial" },
                        { value: "Full", label: "decode.options.endgameBaseParking.Full" },
                    ],
                },
                { id: "dualParking", kind: "boolean", label: "decode.fields.dualParking" },
                { id: "motifCompleted", kind: "boolean", label: "decode.fields.motifCompleted" },
                { id: "goalRP", kind: "boolean", label: "decode.fields.goalRP" },
                { id: "patternRP", kind: "boolean", label: "decode.fields.patternRP" },
            ],
        },
        {
            id: "notes",
            label: "decode.sections.notes",
            fields: [
                {
                    id: "notes",
                    kind: "textarea",
                    label: "decode.fields.notes",
                    placeholder: "decode.fields.notesPlaceholder",
                    maxLength: 2000,
                },
            ],
        },
    ],
    // Derived entry fields the raw inputs don't carry. Mirrors exactly what the
    // hand-written FTC_DecodeForm.onSubmit set: `autoParked` (consumed by
    // scouting-aggregation as a categorical) and the `autoPoints` placeholder.
    toEntry: (v) => ({
        autoParked: v.endgameBaseParking !== "None",
        autoPoints: 0,
    }),
};
