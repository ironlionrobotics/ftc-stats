import type { ScoreInputs } from "@/types/game-definition";
import type {
    FieldConsensus,
    NumericConsensus,
    CategoricalConsensus,
} from "@/lib/scouting-aggregation";

/**
 * Adapters that let a `GameDefinition.score()` read either a single raw
 * scouting entry or a federated consensus through the same interface.
 */

/** View over one raw match_scouting entry. */
export function inputsFromEntry(entry: object): ScoreInputs {
    const e = entry as Record<string, unknown>;
    return {
        num: (id) => {
            const v = e[id];
            return typeof v === "number" && Number.isFinite(v) ? v : 0;
        },
        flag: (id) => e[id] === true,
        cat: (id) => {
            const v = e[id];
            return typeof v === "string" ? v : undefined;
        },
    };
}

/**
 * View over a federated consensus (aggregateMatchTeam().fields). Numeric
 * fields read the weighted mean; categorical fields read the majority value.
 * Subjective fields are never part of a score and read as absent.
 */
export function inputsFromConsensus(fields: Record<string, FieldConsensus>): ScoreInputs {
    const categorical = (id: string): string | boolean | undefined => {
        const c = fields[id];
        return c?.kind === "categorical" ? (c as CategoricalConsensus).value : undefined;
    };
    return {
        num: (id) => {
            const c = fields[id];
            return c?.kind === "numeric" ? (c as NumericConsensus).value : 0;
        },
        flag: (id) => categorical(id) === true,
        cat: (id) => {
            const v = categorical(id);
            return typeof v === "string" ? v : undefined;
        },
    };
}
