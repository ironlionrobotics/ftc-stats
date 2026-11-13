import type { GameDefinition } from "@/types/game-definition";
import type { OrgProgram } from "@/types/orgs";
import { FTC_DECODE_2025 } from "./ftc-decode-2025";
import { FTC_BIOBUZZ_2026 } from "./ftc-biobuzz-2026";

/**
 * Season → game definition. THE place a new season is registered.
 *
 * Entries are routed by `entry.season`, never by `gameSchemaVersion` (DECODE
 * entries were persisted with version 1, colliding with Into The Deep).
 *
 * FRC returns undefined: it still uses the hand-written FRC_ReefscapeForm and
 * its own literal field map / scoring branch.
 */
const FTC_BY_SEASON: Array<{ from: number; def: GameDefinition }> = [
    // Sorted descending by `from`; first match wins.
    { from: 2026, def: FTC_BIOBUZZ_2026 },
    { from: 0, def: FTC_DECODE_2025 },
];

export function gameDefinitionFor(program: OrgProgram, season: number): GameDefinition | undefined {
    if (program !== "FTC") return undefined;
    // A missing/NaN season (malformed legacy doc) falls back to the oldest
    // modeled game rather than to "no definition" (which would route an FTC
    // entry to the FRC field map).
    return FTC_BY_SEASON.find(e => season >= e.from)?.def ?? FTC_BY_SEASON[FTC_BY_SEASON.length - 1].def;
}

export const ALL_GAME_DEFINITIONS: readonly GameDefinition[] = FTC_BY_SEASON.map(e => e.def);
