import type { GameDefinition } from "@/types/game-definition";
import { fieldMapOf } from "@/types/game-definition";

/**
 * Maps validated form values → the GAME-SPECIFIC portion of a match_scouting
 * entry: every field the definition declares, plus whatever `def.toEntry`
 * derives (e.g. DECODE's `autoParked`). The base/attribution fields
 * (teamNumber, orgId, scoutId, matchNumber, timestamp, …) are the wrapper's
 * job — this returns only what varies by game.
 *
 * This is the single source of truth the generic GameScoutingForm and the
 * parity tests both use, so "does the declarative path produce the same entry
 * as the hand-written form?" is answerable without rendering React.
 *
 * `matchNumber` is intentionally excluded even if present in `values`: it's a
 * base field set by the wrapper, not a per-game field.
 */
export function buildEntryGameFields(
    def: GameDefinition,
    values: Record<string, unknown>,
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const id of Object.keys(fieldMapOf(def))) {
        out[id] = values[id];
    }
    return { ...out, ...(def.toEntry?.(values) ?? {}) };
}
