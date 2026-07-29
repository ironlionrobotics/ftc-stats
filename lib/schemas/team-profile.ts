import { z } from "zod";

/**
 * Form schema for the Trading Card editor. Messages are intentionally omitted
 * (no baked-in language) — the form is validated on realistic ranges and any
 * surfaced error is rendered by the component. See docs/architecture/i18n.md
 * for why the analysis/validation layers don't carry prose.
 */

const points = z.coerce.number().int().min(0).max(500);
const shortText = z.string().max(40).default("");
const longText = z.string().max(1000).default("");

export const teamProfileFormSchema = z.object({
    canClimb: z.boolean().default(false),
    climbLevel: shortText,
    scoresNear: z.boolean().default(false),
    scoresFar: z.boolean().default(false),
    groundIntake: z.boolean().default(false),
    sourceIntake: z.boolean().default(false),
    drivetrain: shortText,

    autoLow: points.default(0),
    autoHigh: points.default(0),
    teleopLow: points.default(0),
    teleopHigh: points.default(0),
    endgameLow: points.default(0),
    endgameHigh: points.default(0),

    robot: longText,
    autonomous: longText,
    strategy: longText,

    photoUrl: z.string().max(500).default(""),
});

export type TeamProfileFormValues = z.infer<typeof teamProfileFormSchema>;
