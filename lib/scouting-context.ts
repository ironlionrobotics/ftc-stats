import { levelsMatch } from "@/lib/scoring-utils";

/**
 * Where an observation was taken (decision #101). Stored on match_scouting
 * entries as `tournamentLevel` (the field already existed for QUAL/PLAYOFF).
 *
 * - PRACTICE_FIELD: the event's practice field — no official match, no number.
 * - PRACTICE: a practice match on the schedule — no official score either.
 * - QUALIFICATION / PLAYOFF: official matches, verifiable against FIRST scores.
 *
 * Only official contexts feed ground-truth validation (scout reliability);
 * practice data is shown separately and weighs less in the shared pool.
 */
export const SCOUTING_CONTEXTS = ["PRACTICE_FIELD", "PRACTICE", "QUALIFICATION", "PLAYOFF"] as const;
export type ScoutingContext = (typeof SCOUTING_CONTEXTS)[number];

export const DEFAULT_SCOUTING_CONTEXT: ScoutingContext = "QUALIFICATION";

export function isScoutingContext(v: unknown): v is ScoutingContext {
    return typeof v === "string" && (SCOUTING_CONTEXTS as readonly string[]).includes(v);
}

/** Context of an entry; legacy entries without the field were qualification scouting. */
export function contextOf(entry: { tournamentLevel?: string | null }): ScoutingContext {
    return isScoutingContext(entry.tournamentLevel) ? entry.tournamentLevel : DEFAULT_SCOUTING_CONTEXT;
}

/** Official matches have a FIRST score to validate against. */
export function isOfficialContext(ctx: ScoutingContext): boolean {
    return ctx === "QUALIFICATION" || ctx === "PLAYOFF";
}

/** The practice field has no match numbers. */
export function contextHasMatchNumber(ctx: ScoutingContext): boolean {
    return ctx !== "PRACTICE_FIELD";
}

/** Weight of an observation in the shared consensus: practice counts half. */
export function contextWeight(ctx: ScoutingContext): number {
    return isOfficialContext(ctx) ? 1 : 0.5;
}

/**
 * Whether a scouting entry observed this official FIRST match: same number,
 * same level, and an official context. Without the level check a practice
 * or playoff entry #3 would be validated against qualification #3.
 */
export function entryObservedMatch(
    entry: { matchNumber: number; tournamentLevel?: string | null },
    match: { matchNumber: number; tournamentLevel: string },
): boolean {
    const ctx = contextOf(entry);
    return isOfficialContext(ctx)
        && entry.matchNumber === match.matchNumber
        && levelsMatch(ctx, match.tournamentLevel);
}
