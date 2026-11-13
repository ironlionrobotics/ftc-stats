import type { PhaseScore } from "@/types/game-definition";
import type { ClockMode } from "@/lib/match-clock";

/**
 * A workshop practice run (decision #105). PRIVATE to the team: own-org rules,
 * never part of the shared pool or ground-truth validation.
 */
export interface PracticeRun {
    id: string;
    orgId: string;
    season: number;
    definitionId: string;
    createdBy: string;
    runAtMs: number;
    mode: ClockMode;
    location: "workshop" | "event";
    /** Free label, e.g. "v2 new intake". */
    robotVersion: string;
    /** Team-internal alias of the driver pair, e.g. "Ana+Leo". Stays in the team. */
    drivers: string;
    /** Game fields of the season's definition (counters, booleans, enums). */
    fields: Record<string, number | boolean | string>;
    score: PhaseScore;
    total: number;
    notes: string;
}
