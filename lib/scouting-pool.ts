import type { BaseMatchScouting } from "@/types/scouting";
import type { GameDefinition, PhaseScore } from "@/types/game-definition";
import { aggregateMatchTeam, type FieldConsensus } from "@/lib/scouting-aggregation";
import { contextOf, isOfficialContext, SCOUTING_CONTEXTS } from "@/lib/scouting-context";

const SCOUTING_CONTEXT_SET = new Set<string>(SCOUTING_CONTEXTS);

/**
 * Federated scouting pool (Fase 2, decision #102) — pure part.
 *
 * Teams share OBJECTIVE observations of robots at an event. The pool is served
 * only by the server (rules can't mask fields, so match_scouting stays
 * own-org); this module decides what may leave it:
 *  - Reciprocity gate: an org sees the pool of an event only after
 *    contributing POOL_UNLOCK_MIN_ENTRIES objective captures there.
 *  - Pseudonymous attribution: sources are letters stable per event ("A",
 *    "B"…). No org id, scout id or scout name ever leaves the server.
 *  - Objective only: super entries, stars, free text and notes stay private;
 *    subjective ratings are never merged across orgs (#38 design).
 *  - Context: official (qual/playoff) and practice are summarized apart.
 */

export const POOL_UNLOCK_MIN_ENTRIES = 5;

/** Field kinds that may be shared: what a camera would agree on. */
const SHAREABLE_KINDS = new Set(["counter", "boolean", "enum"]);

export function shareableFieldIds(def: GameDefinition): string[] {
    return def.sections.flatMap(s => s.fields.filter(f => SHAREABLE_KINDS.has(f.kind)).map(f => f.id));
}

/** Objective (non-super) captures, the unit of contribution. */
export function isObjectiveEntry(e: Pick<BaseMatchScouting, "scoutingMode">): boolean {
    return (e.scoutingMode ?? "match") !== "super";
}

/**
 * Validated objective captures of an org, one per (context, match, robot) —
 * duplicates and practice-field repeats of the same capture don't pad the
 * count. Pass entries already through `validateEntry` + `isPlausible`.
 */
export function contributionCount(entries: BaseMatchScouting[], orgId: string): number {
    const keys = new Set<string>();
    for (const e of entries) {
        if (e.orgId !== orgId || !isObjectiveEntry(e)) continue;
        const ctx = contextOf(e);
        keys.add(ctx === "PRACTICE_FIELD" ? `PF_${e.id ?? keys.size}` : `${ctx}_${e.matchNumber}_${e.teamNumber}`);
    }
    return keys.size;
}

const CONFIDENCES = new Set(["high", "medium", "low"]);

/** Fields the server reads from match_scouting for the pool (Admin `select`). */
export function poolReadFields(def: GameDefinition): string[] {
    return [
        "teamNumber", "eventCode", "matchNumber", "season", "program", "tournamentLevel", "orgId",
        "scoutId", "scouterId", "confidence", "scoutingMode", "timestamp",
        ...shareableFieldIds(def),
    ];
}

/**
 * Hostile-input gate (#102 review): a capture enters the pool only if every
 * shared value is what the season's definition allows — integer counters in
 * range, real booleans, enum values from the options, a known confidence.
 * Anything else drops the whole capture (it would skew means, give NaN
 * weights, or carry free text to other teams). Returns a sanitized copy.
 */
export function validateEntry(raw: Record<string, unknown>, def: GameDefinition, id?: string): BaseMatchScouting | null {
    const team = raw.teamNumber, match = raw.matchNumber;
    if (typeof team !== "number" || !Number.isInteger(team) || team < 1 || team > 99_999) return null;
    if (typeof match !== "number" || !Number.isInteger(match) || match < 0 || match > 999) return null;
    if (raw.season !== def.season || typeof raw.orgId !== "string" || raw.orgId === "") return null;
    if (raw.tournamentLevel !== undefined && raw.tournamentLevel !== null && !SCOUTING_CONTEXT_SET.has(String(raw.tournamentLevel))) return null;
    const ctx = contextOf(raw as { tournamentLevel?: string });
    if (ctx !== "PRACTICE_FIELD" && match < 1) return null;
    if (raw.confidence !== undefined && !CONFIDENCES.has(String(raw.confidence))) return null;
    if (raw.scoutingMode !== undefined && raw.scoutingMode !== "match" && raw.scoutingMode !== "super") return null;

    for (const f of def.sections.flatMap(sec => sec.fields)) {
        if (!(f.id in raw) || raw[f.id] === undefined || raw[f.id] === null) continue;
        const v = raw[f.id];
        if (f.kind === "counter") {
            if (typeof v !== "number" || !Number.isInteger(v) || v < (f.min ?? 0) || v > (f.max ?? 999)) return null;
        } else if (f.kind === "boolean") {
            if (typeof v !== "boolean") return null;
        } else if (f.kind === "enum") {
            if (typeof v !== "string" || !f.options.some(o => o.value === v)) return null;
        }
    }
    const scout = typeof raw.scoutId === "string" ? raw.scoutId : typeof raw.scouterId === "string" ? raw.scouterId : "";
    const ts = raw.timestamp as { seconds?: number; _seconds?: number } | null | undefined;
    const entry = sanitizeEntry({
        ...(raw as unknown as BaseMatchScouting),
        id,
        scoutId: scout,
        scouterId: scout,
        confidence: (raw.confidence as BaseMatchScouting["confidence"]) ?? "high",
        timestamp: { seconds: Number(ts?.seconds ?? ts?._seconds ?? 0) || 0, nanoseconds: 0 },
    }, shareableFieldIds(def));
    return { ...entry, id, scoutingMode: raw.scoutingMode === "super" ? "super" : "match" };
}

export interface EventFrame {
    /** Teams registered or scheduled at the event; empty = not published yet. */
    teams: Set<number>;
    /** Qualification match number → robots on the field; empty = no schedule yet. */
    quals: Map<number, Set<number>>;
}

/**
 * Whether a capture fits the event as FIRST publishes it: the robot is at the
 * event and, for qualification matches, actually played that match. Before
 * FIRST publishes roster/schedule every well-formed capture passes.
 */
export function isPlausible(e: BaseMatchScouting, frame: EventFrame): boolean {
    if (frame.teams.size > 0 && !frame.teams.has(e.teamNumber)) return false;
    if (contextOf(e) === "QUALIFICATION" && frame.quals.size > 0) {
        return frame.quals.get(e.matchNumber)?.has(e.teamNumber) ?? false;
    }
    return true;
}

/**
 * Stable per-event aliases: existing ones are kept, new orgs get the next
 * letter in order of first appearance (A…Z, then A2, B2…).
 */
export function assignAliases(existing: Record<string, string>, orgIds: string[]): Record<string, string> {
    const out = { ...existing };
    let next = Object.keys(out).length;
    for (const org of orgIds) {
        if (out[org]) continue;
        const letter = String.fromCharCode(65 + (next % 26));
        const round = Math.floor(next / 26);
        out[org] = round === 0 ? letter : `${letter}${round + 1}`;
        next++;
    }
    return out;
}

export interface PoolNumericField { kind: "numeric"; mean: number; sd: number; n: number }
export interface PoolCategoricalField { kind: "categorical"; value: string | boolean; share: number; n: number }
export type PoolField = PoolNumericField | PoolCategoricalField;

export interface PoolBucket {
    /** Robot-match observations (practice-field sessions count one each). */
    observations: number;
    /** Raw captures behind them. */
    entries: number;
    /** Pseudonymous sources ("A", "B"…), sorted. */
    sources: string[];
    /** Per shareable field: mean across observations, or majority value. */
    fields: Record<string, PoolField>;
    /** The season's score() over the field means — the robot's typical contribution. */
    score: PhaseScore | null;
    /** Fields where scouts of the same observation disagreed a lot. */
    flagged: string[];
}

export interface PoolTeamSummary {
    teamNumber: number;
    official: PoolBucket | null;
    practice: PoolBucket | null;
}

/** Drops everything private from an entry; keeps ids only for weighting (stripped later). */
export function sanitizeEntry(e: BaseMatchScouting, fieldIds: string[]): BaseMatchScouting {
    const raw = e as unknown as Record<string, unknown>;
    const out: Record<string, unknown> = {
        id: e.id,
        teamNumber: e.teamNumber,
        eventCode: e.eventCode,
        matchNumber: e.matchNumber,
        season: e.season,
        program: e.program,
        tournamentLevel: contextOf(e),
        orgId: e.orgId,
        scoutId: e.scoutId ?? e.scouterId,
        scouterId: e.scoutId ?? e.scouterId,
        scouterName: "",
        confidence: e.confidence,
        scoutingMode: "match",
        notes: "",
        timestamp: e.timestamp,
    };
    for (const id of fieldIds) if (id in raw) out[id] = raw[id];
    return out as unknown as BaseMatchScouting;
}

function groupKey(e: BaseMatchScouting, index: number): string {
    const ctx = contextOf(e);
    // Practice-field sessions have no match number: each capture stands alone.
    return ctx === "PRACTICE_FIELD" ? `PF__${index}` : `${ctx}__${e.matchNumber}`;
}

function summarizeBucket(
    entries: BaseMatchScouting[],
    def: GameDefinition,
    fieldIds: string[],
    reliabilities: Record<string, number>,
    aliases: Record<string, string>,
): PoolBucket | null {
    if (entries.length === 0) return null;
    const groups = new Map<string, BaseMatchScouting[]>();
    entries.forEach((e, i) => {
        const k = groupKey(e, i);
        groups.set(k, [...(groups.get(k) ?? []), e]);
    });

    const perObservation: Record<string, FieldConsensus>[] = [];
    const flagged = new Set<string>();
    for (const group of groups.values()) {
        const agg = aggregateMatchTeam(group, reliabilities);
        if (!agg) continue;
        perObservation.push(agg.fields);
        for (const id of fieldIds) {
            const f = agg.fields[id];
            if (f && (f.kind === "numeric" || f.kind === "categorical") && f.flagged && group.length > 1) flagged.add(id);
        }
    }

    const fields: Record<string, PoolField> = {};
    for (const id of fieldIds) {
        const nums: number[] = [];
        const cats = new Map<string, { value: string | boolean; count: number }>();
        for (const obs of perObservation) {
            const f = obs[id];
            if (f?.kind === "numeric" && f.contributors.length > 0) nums.push(f.value);
            else if (f?.kind === "categorical" && f.contributors.length > 0) {
                const key = String(f.value);
                cats.set(key, { value: f.value, count: (cats.get(key)?.count ?? 0) + 1 });
            }
        }
        if (nums.length > 0) {
            const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
            const sd = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length);
            fields[id] = { kind: "numeric", mean: round2(mean), sd: round2(sd), n: nums.length };
        } else if (cats.size > 0) {
            const total = [...cats.values()].reduce((a, c) => a + c.count, 0);
            const top = [...cats.values()].sort((a, b) => b.count - a.count)[0];
            fields[id] = { kind: "categorical", value: top.value, share: round2(top.count / total), n: total };
        }
    }

    const score = def.score
        ? def.score({
            num: id => (fields[id]?.kind === "numeric" ? (fields[id] as PoolNumericField).mean : 0),
            flag: id => fields[id]?.kind === "categorical" && (fields[id] as PoolCategoricalField).value === true,
            cat: id => {
                const f = fields[id];
                return f?.kind === "categorical" && typeof f.value === "string" ? f.value : undefined;
            },
        })
        : null;

    const sources = [...new Set(entries.map(e => aliases[e.orgId ?? ""] ?? "?"))].sort();
    return {
        observations: perObservation.length,
        entries: entries.length,
        sources,
        fields,
        score: score && { auto: round2(score.auto), teleop: round2(score.teleop), endgame: round2(score.endgame) },
        flagged: [...flagged],
    };
}

function round2(n: number): number {
    return Math.round(n * 100) / 100;
}

/**
 * Builds the shareable per-robot summary of an event. `entries` are the raw
 * match_scouting docs of every org at the event (server-side read).
 */
export function buildEventPool(
    entries: BaseMatchScouting[],
    def: GameDefinition,
    reliabilities: Record<string, number>,
    aliases: Record<string, string>,
    teamNumber?: number,
): PoolTeamSummary[] {
    const fieldIds = shareableFieldIds(def);
    const objective = entries
        .filter(isObjectiveEntry)
        .filter(e => e.season === def.season && (teamNumber === undefined || e.teamNumber === teamNumber))
        .map(e => sanitizeEntry(e, fieldIds));

    const byTeam = new Map<number, BaseMatchScouting[]>();
    for (const e of objective) byTeam.set(e.teamNumber, [...(byTeam.get(e.teamNumber) ?? []), e]);

    return [...byTeam.entries()]
        .sort(([a], [b]) => a - b)
        .map(([team, list]) => ({
            teamNumber: team,
            official: summarizeBucket(list.filter(e => isOfficialContext(contextOf(e))), def, fieldIds, reliabilities, aliases),
            practice: summarizeBucket(list.filter(e => !isOfficialContext(contextOf(e))), def, fieldIds, reliabilities, aliases),
        }));
}
