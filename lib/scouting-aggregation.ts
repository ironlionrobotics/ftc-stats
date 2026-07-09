/**
 * Federated scouting aggregation — applies the conflict-resolution rules from
 * docs/architecture/collaborative-scouting-model.md §3 to combine multiple
 * scout observations of the same (match, team) into a single consensus value
 * per field.
 *
 * Rules (summarized):
 *   - Numeric fields → weighted mean by (scoutReliability × confidenceWeight);
 *     flagged if coefficient of variation exceeds the threshold.
 *   - Categorical (booleans, enums) → weighted majority; tie broken by latest.
 *   - Subjective (driverSkill, defenseRating, reliabilityRating) → NOT merged
 *     across orgs (each org's scale is calibrated differently); kept per-org.
 *   - Notes → listed all with attribution.
 *
 * This module is pure: no Firestore, no React, no DOM. Use it from both server
 * (Server Components, Server Actions) and client (after subscribing to entries
 * via the existing listener).
 */

import type { BaseMatchScouting, ScoutConfidence } from "@/types/scouting";
import { scoutIdOf, scoutNameOf } from "@/types/scouting";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type FieldKind = "numeric" | "categorical" | "subjective" | "text-list";

export type FieldDescriptor = { kind: FieldKind };

export interface NumericConsensus {
    kind: "numeric";
    value: number;          // weighted mean
    variance: number;       // weighted variance (population)
    stddev: number;
    coefOfVariation: number; // stddev / |mean| (capped at 1e6 when mean ≈ 0)
    flagged: boolean;        // true when scouts disagree more than threshold
    contributors: Contributor<number>[];
}

export interface CategoricalConsensus<T = string | boolean> {
    kind: "categorical";
    value: T;
    confidence: number;     // 0–1: fraction of weight backing the winner
    flagged: boolean;        // true if confidence < 0.66
    contributors: Contributor<T>[];
}

export interface SubjectiveConsensus<T = number> {
    kind: "subjective";
    // Per-org buckets — NOT merged across orgs by design.
    perOrg: Record<string, {
        value: T;       // mean within the org
        count: number;
    }>;
}

export interface NotesConsensus {
    kind: "text-list";
    entries: Array<{
        orgId: string;
        scoutId: string;
        scoutName: string;
        timestamp: number;   // epoch seconds; 0 if unknown
        text: string;
    }>;
}

export type FieldConsensus =
    | NumericConsensus
    | CategoricalConsensus
    | SubjectiveConsensus
    | NotesConsensus;

export interface Contributor<T> {
    scoutId: string;
    orgId: string;
    value: T;
    weight: number;          // effective weight applied in aggregation
}

export interface MatchTeamAggregation {
    teamNumber: number;
    matchNumber: number;
    season: number;
    eventCode: string;
    program: "FTC" | "FRC";

    fields: Record<string, FieldConsensus>;

    // Provenance summary so the UI can show "data from N entries across M orgs"
    sourceSummary: {
        entryCount: number;
        orgCount: number;
        scoutCount: number;
        orgIds: string[];
        latestEntryAt: number; // epoch seconds; 0 if unknown
    };
}

// ---------------------------------------------------------------------------
// Field maps per program/game. Each game's per-game data block lists every
// field we know how to aggregate. Anything missing here is silently skipped.
//
// Bumped together with CURRENT_GAME_SCHEMA in types/scouting.ts when the game
// shape changes.
// ---------------------------------------------------------------------------

export const FTC_INTODEEP_FIELDS: Record<string, FieldDescriptor> = {
    autoParked: { kind: "categorical" },
    autoLaunchLine: { kind: "categorical" },
    autoPurpleArtifacts: { kind: "numeric" },
    autoGreenArtifacts: { kind: "numeric" },
    autoMotifStarted: { kind: "categorical" },
    movementRP: { kind: "categorical" },
    autoPoints: { kind: "numeric" },
    teleopPurpleArtifacts: { kind: "numeric" },
    teleopGreenArtifacts: { kind: "numeric" },
    patternsCompleted: { kind: "numeric" },
    gatesUsed: { kind: "categorical" },
    driverSkill: { kind: "subjective" },
    defenseRating: { kind: "subjective" },
    reliability: { kind: "subjective" },
    wouldPick: { kind: "categorical" },
    endgameBaseParking: { kind: "categorical" },
    dualParking: { kind: "categorical" },
    motifCompleted: { kind: "categorical" },
    goalRP: { kind: "categorical" },
    patternRP: { kind: "categorical" },
};

export const FRC_REEFSCAPE_FIELDS: Record<string, FieldDescriptor> = {
    autoLeave: { kind: "categorical" },
    autoCoralL1: { kind: "numeric" },
    autoCoralL2: { kind: "numeric" },
    autoCoralL3: { kind: "numeric" },
    autoCoralL4: { kind: "numeric" },
    autoAlgaeProcessor: { kind: "numeric" },
    autoAlgaeNet: { kind: "numeric" },
    teleopCoralL1: { kind: "numeric" },
    teleopCoralL2: { kind: "numeric" },
    teleopCoralL3: { kind: "numeric" },
    teleopCoralL4: { kind: "numeric" },
    teleopAlgaeProcessor: { kind: "numeric" },
    teleopAlgaeNet: { kind: "numeric" },
    driverSkill: { kind: "subjective" },
    defenseRating: { kind: "subjective" },
    reliability: { kind: "subjective" },
    wouldPick: { kind: "categorical" },
    endgameParked: { kind: "categorical" },
    endgameClimbState: { kind: "categorical" },
};

export function fieldsForProgram(program: "FTC" | "FRC"): Record<string, FieldDescriptor> {
    return program === "FTC" ? FTC_INTODEEP_FIELDS : FRC_REEFSCAPE_FIELDS;
}

// ---------------------------------------------------------------------------
// Tuning constants — exposed so tests and future calibration can adjust.
// ---------------------------------------------------------------------------

export const CONFIDENCE_WEIGHTS: Record<ScoutConfidence, number> = {
    high: 1.0,
    medium: 0.6,
    low: 0.3,
};

/** CoV above this threshold flags a numeric consensus as "scouts disagree". */
export const NUMERIC_FLAG_COV_THRESHOLD = 0.5;

/** Categorical winner share below this flags the consensus. */
export const CATEGORICAL_FLAG_THRESHOLD = 0.66;

/** Default scout reliability when we don't yet have ground-truth data. */
export const DEFAULT_SCOUT_RELIABILITY = 1.0;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function entryWeight(
    entry: BaseMatchScouting,
    scoutReliabilities: Record<string, number>,
): number {
    const confidence = entry.confidence ?? "high";
    const cw = CONFIDENCE_WEIGHTS[confidence];
    const scoutId = scoutIdOf(entry);
    const reliability = scoutReliabilities[scoutId] ?? DEFAULT_SCOUT_RELIABILITY;
    // Multiply factors; clamp to non-negative so a buggy reliability of -1
    // doesn't flip the consensus sign.
    return Math.max(0, cw * reliability);
}

function timestampSeconds(entry: BaseMatchScouting): number {
    return entry.timestamp?.seconds ?? 0;
}

function weightedMeanAndVariance(values: number[], weights: number[]): { mean: number; variance: number } {
    const totalW = weights.reduce((a, b) => a + b, 0);
    if (totalW <= 0) return { mean: 0, variance: 0 };
    let mean = 0;
    for (let i = 0; i < values.length; i++) mean += values[i] * weights[i];
    mean /= totalW;
    let variance = 0;
    for (let i = 0; i < values.length; i++) variance += weights[i] * (values[i] - mean) ** 2;
    variance /= totalW;
    return { mean, variance };
}

// ---------------------------------------------------------------------------
// Per-kind aggregators
// ---------------------------------------------------------------------------

export function aggregateNumeric(
    entries: BaseMatchScouting[],
    fieldName: string,
    scoutReliabilities: Record<string, number>,
): NumericConsensus {
    const contributors: Contributor<number>[] = [];
    const values: number[] = [];
    const weights: number[] = [];

    for (const e of entries) {
        const raw = (e as unknown as Record<string, unknown>)[fieldName];
        if (typeof raw !== "number" || Number.isNaN(raw)) continue;
        const w = entryWeight(e, scoutReliabilities);
        if (w === 0) continue;
        contributors.push({
            scoutId: scoutIdOf(e),
            orgId: e.orgId ?? "unknown",
            value: raw,
            weight: w,
        });
        values.push(raw);
        weights.push(w);
    }

    if (values.length === 0) {
        return {
            kind: "numeric",
            value: 0,
            variance: 0,
            stddev: 0,
            coefOfVariation: 0,
            flagged: false,
            contributors: [],
        };
    }

    const { mean, variance } = weightedMeanAndVariance(values, weights);
    const stddev = Math.sqrt(variance);
    const coefOfVariation = Math.abs(mean) < 1e-6 ? (stddev > 0 ? 1e6 : 0) : stddev / Math.abs(mean);
    const flagged = values.length > 1 && coefOfVariation > NUMERIC_FLAG_COV_THRESHOLD;

    return { kind: "numeric", value: mean, variance, stddev, coefOfVariation, flagged, contributors };
}

export function aggregateCategorical<T extends string | boolean>(
    entries: BaseMatchScouting[],
    fieldName: string,
    scoutReliabilities: Record<string, number>,
): CategoricalConsensus<T> {
    const tally = new Map<T, { weight: number; latest: number }>();
    const contributors: Contributor<T>[] = [];

    for (const e of entries) {
        const raw = (e as unknown as Record<string, unknown>)[fieldName];
        if (raw === undefined || raw === null) continue;
        const value = raw as T;
        const w = entryWeight(e, scoutReliabilities);
        if (w === 0) continue;
        const t = timestampSeconds(e);
        const bucket = tally.get(value) ?? { weight: 0, latest: 0 };
        bucket.weight += w;
        bucket.latest = Math.max(bucket.latest, t);
        tally.set(value, bucket);
        contributors.push({
            scoutId: scoutIdOf(e),
            orgId: e.orgId ?? "unknown",
            value,
            weight: w,
        });
    }

    if (tally.size === 0) {
        // Fall back to a sensible empty value — false for booleans, "" for strings.
        return {
            kind: "categorical",
            value: (false as unknown) as T,
            confidence: 0,
            flagged: true,
            contributors: [],
        };
    }

    // Find max weight; on tie, latest timestamp wins.
    let winnerValue: T | null = null;
    let winnerWeight = -1;
    let winnerLatest = -1;
    let totalWeight = 0;
    for (const [value, { weight, latest }] of tally) {
        totalWeight += weight;
        const beats =
            weight > winnerWeight ||
            (weight === winnerWeight && latest > winnerLatest);
        if (beats) {
            winnerValue = value;
            winnerWeight = weight;
            winnerLatest = latest;
        }
    }

    const confidence = winnerWeight / totalWeight;
    return {
        kind: "categorical",
        value: winnerValue as T,
        confidence,
        flagged: contributors.length > 1 && confidence < CATEGORICAL_FLAG_THRESHOLD,
        contributors,
    };
}

export function aggregateSubjective(
    entries: BaseMatchScouting[],
    fieldName: string,
): SubjectiveConsensus {
    const perOrg: Record<string, { sum: number; count: number }> = {};

    for (const e of entries) {
        const raw = (e as unknown as Record<string, unknown>)[fieldName];
        if (typeof raw !== "number" || Number.isNaN(raw)) continue;
        const orgId = e.orgId ?? "unknown";
        const bucket = perOrg[orgId] ?? { sum: 0, count: 0 };
        bucket.sum += raw;
        bucket.count += 1;
        perOrg[orgId] = bucket;
    }

    const out: SubjectiveConsensus = { kind: "subjective", perOrg: {} };
    for (const [orgId, { sum, count }] of Object.entries(perOrg)) {
        out.perOrg[orgId] = { value: sum / count, count };
    }
    return out;
}

export function aggregateNotes(entries: BaseMatchScouting[]): NotesConsensus {
    return {
        kind: "text-list",
        entries: entries
            .filter(e => typeof e.notes === "string" && e.notes.trim().length > 0)
            .map(e => ({
                orgId: e.orgId ?? "unknown",
                scoutId: scoutIdOf(e),
                scoutName: scoutNameOf(e),
                timestamp: timestampSeconds(e),
                text: e.notes,
            }))
            .sort((a, b) => b.timestamp - a.timestamp),
    };
}

// ---------------------------------------------------------------------------
// Top-level entry point
// ---------------------------------------------------------------------------

/**
 * Aggregates a set of MatchScouting entries that all share the same
 * (season, eventCode, matchNumber, teamNumber, program). Pass scout reliability
 * scores from users/{uid}.reliability (defaults to 1.0 if missing).
 *
 * The returned object has one entry per field declared in the program's field
 * map, plus a `notes` aggregation, plus sourceSummary.
 */
export function aggregateMatchTeam(
    entries: BaseMatchScouting[],
    scoutReliabilities: Record<string, number> = {},
): MatchTeamAggregation | null {
    if (entries.length === 0) return null;

    const first = entries[0];
    const program = first.program;
    const descriptors = fieldsForProgram(program);

    // Super-scouting entries intentionally leave numeric/categorical counters
    // undefined so they don't pollute the objective consensus. We still keep
    // them in the entry list for subjective fields and notes.
    const objectiveEntries = entries.filter(e => (e.scoutingMode ?? "match") !== "super");

    const fields: Record<string, FieldConsensus> = {};
    for (const [name, descriptor] of Object.entries(descriptors)) {
        switch (descriptor.kind) {
            case "numeric":
                fields[name] = aggregateNumeric(objectiveEntries, name, scoutReliabilities);
                break;
            case "categorical":
                // wouldPick is super-scouting only — use full entries for it.
                // Other categorical fields use objective-only.
                fields[name] = aggregateCategorical(
                    name === "wouldPick" ? entries : objectiveEntries,
                    name,
                    scoutReliabilities,
                );
                break;
            case "subjective":
                fields[name] = aggregateSubjective(entries, name);
                break;
            case "text-list":
                // Notes are handled separately below — text-list descriptors are
                // currently unused for game data fields, but the switch is here
                // for symmetry.
                break;
        }
    }
    fields["notes"] = aggregateNotes(entries);

    const orgIds = Array.from(new Set(entries.map(e => e.orgId ?? "unknown")));
    const scoutIds = new Set(entries.map(e => scoutIdOf(e)));
    const latest = entries.reduce((acc, e) => Math.max(acc, timestampSeconds(e)), 0);

    return {
        teamNumber: first.teamNumber,
        matchNumber: first.matchNumber,
        season: first.season,
        eventCode: first.eventCode,
        program,
        fields,
        sourceSummary: {
            entryCount: entries.length,
            orgCount: orgIds.length,
            scoutCount: scoutIds.size,
            orgIds,
            latestEntryAt: latest,
        },
    };
}

/**
 * Groups a flat array of entries by (matchNumber, teamNumber) and aggregates
 * each group. Useful for building an event-wide view from the listener stream.
 */
export function aggregateEventEntries(
    entries: BaseMatchScouting[],
    scoutReliabilities: Record<string, number> = {},
): MatchTeamAggregation[] {
    const groups = new Map<string, BaseMatchScouting[]>();
    for (const e of entries) {
        const key = `${e.matchNumber}__${e.teamNumber}`;
        const bucket = groups.get(key) ?? [];
        bucket.push(e);
        groups.set(key, bucket);
    }
    const out: MatchTeamAggregation[] = [];
    for (const group of groups.values()) {
        const agg = aggregateMatchTeam(group, scoutReliabilities);
        if (agg) out.push(agg);
    }
    return out;
}
