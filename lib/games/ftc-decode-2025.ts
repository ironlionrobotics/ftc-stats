import type { GameDefinition } from "@/types/game-definition";

/**
 * FTC DECODE 2025-2026 as a declarative game definition.
 *
 * Mirrors the field set the hand-written FTC_DecodeForm captures today.
 * NOT yet wired to production (the hand-rolled form keeps shipping until a
 * post-Premier QA pass validates the DynamicGameForm renderer produces
 * identical entries). When the 2026-2027 game launches in September,
 * create a sibling file (e.g. `ftc-galactic-2026.ts`) and swap which
 * definition `MatchScoutingForm` imports — no React changes needed.
 *
 * Field ids are preserved from the existing schema so federation, aggregation
 * and reporting code keep working without migration.
 */
export const FTC_DECODE_2025: GameDefinition = {
    id: "ftc-decode-2025-2026",
    label: "FTC DECODE",
    program: "FTC",
    season: 2025,
    sections: [
        {
            id: "auto",
            label: "Periodo Autónomo",
            accent: "primary",
            fields: [
                { id: "autoLaunchLine", kind: "boolean", label: "Salió Launch Line" },
                { id: "autoMotifStarted", kind: "boolean", label: "Detectó Motif Pattern" },
                {
                    id: "autoPurpleArtifacts",
                    kind: "counter",
                    label: "Purple Art. (Auto)",
                    color: "purple",
                    min: 0,
                    max: 50,
                },
                {
                    id: "autoGreenArtifacts",
                    kind: "counter",
                    label: "Green Art. (Auto)",
                    color: "green",
                    min: 0,
                    max: 50,
                },
                { id: "movementRP", kind: "boolean", label: "Movement RP Achieved" },
            ],
        },
        {
            id: "teleop",
            label: "Driver Controlled (TeleOp)",
            accent: "primary",
            fields: [
                {
                    id: "teleopPurpleArtifacts",
                    kind: "counter",
                    label: "Purple Artifacts",
                    color: "purple",
                    min: 0,
                    max: 200,
                },
                {
                    id: "teleopGreenArtifacts",
                    kind: "counter",
                    label: "Green Artifacts",
                    color: "green",
                    min: 0,
                    max: 200,
                },
                {
                    id: "patternsCompleted",
                    kind: "counter",
                    label: "Patrones/Motifs",
                    color: "primary",
                    min: 0,
                    max: 20,
                },
                { id: "gatesUsed", kind: "boolean", label: "Usó Gates (Limpieza Rampa)" },
                {
                    id: "driverSkill",
                    kind: "stars",
                    label: "Driver Skill",
                    helpText: "¿Qué tan bien manejaba el robot?",
                    max: 5,
                },
            ],
        },
        {
            id: "endgame",
            label: "Endgame & Rankings",
            accent: "primary",
            fields: [
                {
                    id: "endgameBaseParking",
                    kind: "enum",
                    label: "Base Parking",
                    options: [
                        { value: "None", label: "N/A" },
                        { value: "Partial", label: "Parcial" },
                        { value: "Full", label: "Full" },
                    ],
                },
                { id: "dualParking", kind: "boolean", label: "Dual Parking (Aliado)" },
                { id: "motifCompleted", kind: "boolean", label: "Motif Final Completado" },
                { id: "goalRP", kind: "boolean", label: "Possible Goal RP" },
                { id: "patternRP", kind: "boolean", label: "Possible Pattern RP" },
            ],
        },
        {
            id: "notes",
            label: "Notas",
            fields: [
                {
                    id: "notes",
                    kind: "textarea",
                    label: "Notas Críticas del Partido",
                    placeholder: "Ej: Problemas de conexión en el minuto 1:20, defensa muy agresiva...",
                    maxLength: 2000,
                },
            ],
        },
    ],
};
