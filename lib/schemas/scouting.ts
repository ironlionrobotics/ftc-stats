import { z } from "zod";

/**
 * Zod schemas for scouting forms. These are the source of truth for:
 *   1. RHF form validation (passes `zodResolver(schema)` to useForm).
 *   2. Server-side validation before writes (parse at the boundary).
 *   3. TypeScript types via `z.infer<>` so the type and the runtime check
 *      can't drift apart.
 *
 * Schemas live separate from types/scouting.ts because the latter is the
 * persisted document shape (lenient — older docs may lack fields). Zod schemas
 * are the FORM shape with strict validation at the moment of capture.
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

const matchNumber = z.coerce.number().int().positive("Match # debe ser positivo");
const teamNumber = z.coerce.number().int().positive();
const season = z.coerce.number().int().min(2000).max(2100);
const eventCode = z.string().min(1, "Falta evento").max(20);
const likert = z.coerce.number().int().min(1, "1-5").max(5, "1-5");
const counter = z.coerce.number().int().min(0).max(999);

// ---------------------------------------------------------------------------
// FTC IntoTheDeep — match scouting form
// ---------------------------------------------------------------------------

export const ftcIntoTheDeepFormSchema = z.object({
    matchNumber,
    // Auto
    autoLaunchLine: z.boolean().default(false),
    autoPurpleArtifacts: counter.default(0),
    autoGreenArtifacts: counter.default(0),
    autoMotifStarted: z.boolean().default(false),
    movementRP: z.boolean().default(false),
    // Teleop
    teleopPurpleArtifacts: counter.default(0),
    teleopGreenArtifacts: counter.default(0),
    patternsCompleted: counter.default(0),
    gatesUsed: z.boolean().default(false),
    driverSkill: likert.default(3),
    // Endgame
    endgameBaseParking: z.enum(["None", "Partial", "Full"]).default("None"),
    dualParking: z.boolean().default(false),
    motifCompleted: z.boolean().default(false),
    goalRP: z.boolean().default(false),
    patternRP: z.boolean().default(false),
    notes: z.string().max(2000, "Máx 2000 caracteres").default(""),
});

export type FTCIntoTheDeepFormValues = z.infer<typeof ftcIntoTheDeepFormSchema>;

// ---------------------------------------------------------------------------
// FRC Reefscape — match scouting form
// ---------------------------------------------------------------------------

export const frcReefscapeFormSchema = z.object({
    matchNumber,
    autoLeave: z.boolean().default(false),
    autoCoralL1: counter.default(0),
    autoCoralL2: counter.default(0),
    autoCoralL3: counter.default(0),
    autoCoralL4: counter.default(0),
    autoAlgaeProcessor: counter.default(0),
    autoAlgaeNet: counter.default(0),
    teleopCoralL1: counter.default(0),
    teleopCoralL2: counter.default(0),
    teleopCoralL3: counter.default(0),
    teleopCoralL4: counter.default(0),
    teleopAlgaeProcessor: counter.default(0),
    teleopAlgaeNet: counter.default(0),
    driverSkill: likert.default(3),
    defenseRating: likert.default(1),
    endgameParked: z.boolean().default(false),
    endgameClimbState: z.enum(["None", "Shallow", "Deep"]).default("None"),
    notes: z.string().max(2000).default(""),
});

export type FRCReefscapeFormValues = z.infer<typeof frcReefscapeFormSchema>;

// ---------------------------------------------------------------------------
// Super scouting (FTC + FRC, same shape — only subjective fields)
// ---------------------------------------------------------------------------

export const superScoutingFormSchema = z.object({
    matchNumber,
    driverSkill: likert.default(3),
    defenseRating: likert.default(1),
    reliability: likert.default(3),
    wouldPick: z.boolean({
        message: "Indica si recomendarías escoger este equipo",
    }),
    notes: z.string().max(2000).default(""),
});

export type SuperScoutingFormValues = z.infer<typeof superScoutingFormSchema>;

// ---------------------------------------------------------------------------
// Pit scouting
// ---------------------------------------------------------------------------

export const pitScoutingFormSchema = z.object({
    teamNumber,
    season,
    robotName: z.string().max(100).default(""),
    driveTrain: z.string().max(50).default("Mecano"),
    dimensions: z.string().max(50).default(""),
    weight: z.string().max(20).default(""),
    motors: z.string().max(200).default(""),
    sensors: z.string().max(200).default(""),
    servoCount: z.coerce.number().int().min(0).max(20).default(0),
    intakeType: z.string().max(50).default("Fricción"),
    scoringMechanism: z.string().max(50).default("Lanzador"),
    patternMechanism: z.string().max(100).default("Rampa"),
    canDualPark: z.boolean().default(false),
    motifDetection: z.boolean().default(false),
    photoUrl: z.string().max(500).default(""),
    notes: z.string().max(5000, "Máx 5000 caracteres").default(""),
    publicSummary: z.string().max(1000, "Máx 1000 caracteres").default(""),
});

export type PitScoutingFormValues = z.infer<typeof pitScoutingFormSchema>;
