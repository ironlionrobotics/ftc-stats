/**
 * Declarative game definition. Lets a new season's scouting form be added
 * without writing React: define sections + fields in TypeScript, generate
 * a Zod schema automatically, render via DynamicGameForm.
 *
 * Status: production for FTC (decision #79). `MatchScoutingForm` resolves the
 * definition per season via `gameDefinitionFor()` (lib/games/registry.ts).
 * FRC still uses the hand-written `FRC_ReefscapeForm`. A definition owns its
 * fields, its derived entry fields (`toEntry`) AND its scoring (`score`), so
 * a new season is one new file plus one registry line.
 */

import type { OrgProgram } from "./orgs";

export interface GameDefinition {
    /** Stable identifier, e.g. "ftc-decode-2025-2026". */
    id: string;
    /** Display name for the form header, e.g. "FTC DECODE". */
    label: string;
    program: OrgProgram;
    /** Season year per FTC convention (Sept-Aug season → start year). */
    season: number;
    sections: GameSection[];
    /**
     * Optional game-specific derivation. Returns the entry fields that are NOT
     * direct form inputs — values computed from other fields, or constants the
     * persisted document needs. Merged into the entry AFTER the raw field
     * values, so it can add or override.
     *
     * DECODE derives `autoParked` from `endgameBaseParking` (read by
     * lib/scouting-aggregation.ts) and pins `autoPoints: 0`. Keeping these on
     * the definition is exactly what makes a new season a single-file change:
     * its derivations travel with it instead of living inside a React form.
     */
    toEntry?: (values: Record<string, unknown>) => Record<string, unknown>;
    /**
     * Aggregation kind of every key `toEntry` adds, so the federated field map
     * can be derived from the definition (lib/scouting-aggregation.ts
     * fieldsFor). Declared fields need no entry here — their kind follows
     * from the field kind.
     */
    derivedFields?: Record<string, "numeric" | "categorical">;
    /**
     * Value persisted as `gameSchemaVersion` on every entry this definition
     * produces. Historical note: DECODE entries were written with 1 (the
     * constant was never bumped), so readers discriminate by `entry.season`,
     * not by this number — it is provenance, not a routing key.
     */
    schemaVersion: number;
    /**
     * Point contribution of ONE robot, reconstructed from its scouted fields.
     * THE single source of truth for scouted-score math: projections (raw
     * entries) and ground-truth validation (federated consensus) both call it
     * through a `ScoreInputs` adapter (lib/games/score-inputs.ts), so a new
     * season's scoring rules travel with its definition instead of being
     * re-typed in every consumer.
     *
     * Alliance-level points that no single robot owns (e.g. BIOBUZZ elements
     * left in the top CELL) are deliberately NOT included — they come from
     * the official score breakdown.
     */
    score?: (s: ScoreInputs) => PhaseScore;
    /**
     * Questions a team answers about ITS OWN robot (Trading Card self-report,
     * decision #101). Typical-match counters reuse the scouting field ids, so
     * `score()` turns a team's claim into points and the claim lines up field
     * by field with what other teams observed in the shared pool.
     */
    selfReport?: GameSection[];
}

/** The self-report questions as a renderable definition, or null if the season has none. */
export function selfReportDefinition(def: GameDefinition | null | undefined): GameDefinition | null {
    if (!def?.selfReport?.length) return null;
    return { ...def, sections: def.selfReport };
}

/** Points split by match phase. `endgame` is "late-match" for games without
 *  a formal endgame period (BIOBUZZ: last 60 s — FLOWER + final park). */
export interface PhaseScore {
    auto: number;
    teleop: number;
    endgame: number;
}

/**
 * Read-only view over one robot's observation, independent of whether it
 * comes from a single raw entry or from a federated consensus.
 *   num  → numeric value (0 when absent)
 *   flag → boolean value (false when absent)
 *   cat  → categorical value (undefined when absent)
 */
export interface ScoreInputs {
    num(id: string): number;
    flag(id: string): boolean;
    cat(id: string): string | undefined;
}

/** Sum of the three phases — convenience for callers that need the total. */
export function totalOf(p: PhaseScore): number {
    return p.auto + p.teleop + p.endgame;
}

export interface GameSection {
    id: string;
    label: string;
    /** Optional accent color for the section header. Tailwind color name. */
    accent?: "primary" | "purple" | "green" | "amber" | "cyan";
    fields: GameField[];
}

export type GameField =
    | CounterField
    | BooleanField
    | StarsField
    | EnumField
    | TextField;

interface BaseField {
    /**
     * Field id == the key the value is persisted under in match_scouting.
     * Pick names that survive across seasons when the concept is the same
     * (e.g., `autoPoints` rather than `decodeAutoArtifacts`).
     */
    id: string;
    label: string;
    helpText?: string;
}

export interface CounterField extends BaseField {
    kind: "counter";
    /** Visual accent — same vocabulary as scouting forms today. */
    color?: "primary" | "purple" | "green" | "cyan" | "amber";
    min?: number;     // defaults 0
    max?: number;     // defaults 999
}

export interface BooleanField extends BaseField {
    kind: "boolean";
}

export interface StarsField extends BaseField {
    kind: "stars";
    /** 1-5 by default. Set max=10 for finer-grained ratings. */
    max?: number;
}

export interface EnumField extends BaseField {
    kind: "enum";
    options: Array<{ value: string; label: string }>;
}

export interface TextField extends BaseField {
    kind: "text" | "textarea";
    placeholder?: string;
    maxLength?: number;
}

/** Walk the definition and return every field flat (id-keyed). */
export function fieldMapOf(def: GameDefinition): Record<string, GameField> {
    const out: Record<string, GameField> = {};
    for (const section of def.sections) {
        for (const field of section.fields) {
            out[field.id] = field;
        }
    }
    return out;
}

/** Default value for a field — what RHF should initialize with. */
export function defaultValueFor(field: GameField): unknown {
    switch (field.kind) {
        case "counter":
            return field.min ?? 0;
        case "boolean":
            return false;
        case "stars":
            return Math.ceil((field.max ?? 5) / 2);  // mid-rating
        case "enum":
            return field.options[0]?.value ?? "";
        case "text":
        case "textarea":
            return "";
    }
}

/** Returns initial RHF default values for the entire definition. */
export function defaultsForDefinition(def: GameDefinition): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const section of def.sections) {
        for (const field of section.fields) {
            out[field.id] = defaultValueFor(field);
        }
    }
    return out;
}
