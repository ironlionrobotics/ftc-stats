/**
 * Declarative game definition. Lets a new season's scouting form be added
 * without writing React: define sections + fields in TypeScript, generate
 * a Zod schema automatically, render via DynamicGameForm.
 *
 * Status: infrastructure ready, NOT wired to production forms. The current
 * `FTC_IntoTheDeepForm` and `FRC_ReefscapeForm` continue to be used until a
 * post-Premier QA pass validates the dynamic renderer produces identical
 * output. Switching is a one-import change in `MatchScoutingForm` once
 * ready. See `lib/games/ftc-decode-2025.ts` for a reference definition.
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
