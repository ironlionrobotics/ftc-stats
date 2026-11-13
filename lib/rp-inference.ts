/**
 * Ranking-Point (RP) inference.
 *
 * Two model families, chosen per season by seasonRulesFor(season).rpTargets:
 *  - "logistic" (DECODE 2025): logistic regression over an alliance's
 *    (auto, tele, end) profile, trained by app/actions/train-rp-models.ts and
 *    cached in the server cache; falls back to the team's empirical RP rate.
 *  - count models (BIOBUZZ 2026): lib/rp-counts.ts — no training needed.
 *
 * LABELS come from the official /scores breakdown (movementRP / goalRP /
 * patternRP; swarmRP / pollinator1RP / pollinator2RP), attached to matches
 * via withRpObservations(). Until 2026-11, labels were read from
 * `scoreRedRp1/Rp2` on /matches — fields the API never returns — so no model
 * ever trained and every heuristic RP rate was 0.
 */

import type { FTCMatch } from "@/types/scouting";
import type { LogisticModel } from "./logistic-regression";
import { predictLogistic } from "./logistic-regression";
import { seasonRulesFor } from "@/lib/games/season-rules";
import {
    type AllianceScoreBreakdown,
    type MatchScoreEntry,
    biobuzzRobotOutcomes,
    biobuzzTips,
    robotSlotsFor,
} from "@/lib/score-breakdown";
import { levelsMatch } from "@/lib/scoring-utils";

/** RP target id — one of seasonRulesFor(season).rpTargets[].id. */
export type RPTarget = string;

/** Per-robot LEAVE/PARK outcome (BIOBUZZ) attributed to a team. */
export interface RobotOutcome {
    teamNumber: number;
    leave: boolean;
    autoPark: boolean;
    teleopPark: boolean;
}

/** Compact, serializable RP observation for one alliance of one match. */
export interface AllianceRpObs {
    /** target id → RP earned (from the official breakdown). */
    rp: Record<string, boolean>;
    /** BIOBUZZ: alliance HIVE TIPS (auto + teleop). */
    tips?: number;
    /** BIOBUZZ: per-robot outcomes in station order. */
    robots?: RobotOutcome[];
}

/** An FTCMatch enriched with its official RP observations. */
export type RpLabeledMatch = FTCMatch & { redRp?: AllianceRpObs; blueRp?: AllianceRpObs };

/** Builds the RP observation of one alliance from its official breakdown. */
export function allianceRpObs(
    season: number,
    b: AllianceScoreBreakdown | undefined,
    match: Pick<FTCMatch, "teams">,
    alliance: "Red" | "Blue",
): AllianceRpObs | undefined {
    if (!b || Object.keys(b).length === 0) return undefined;
    const raw = b as Record<string, unknown>;
    const rp: Record<string, boolean> = {};
    for (const t of seasonRulesFor(season).rpTargets) rp[t.id] = raw[t.breakdownKey] === true;
    if (season < 2026) return { rp };
    const slots = robotSlotsFor(match.teams ?? [], alliance);
    const robots: RobotOutcome[] = [];
    slots.forEach((team, i) => {
        if (team != null) robots.push({ teamNumber: team, ...biobuzzRobotOutcomes(b, (i + 1) as 1 | 2) });
    });
    return { rp, tips: biobuzzTips(b), robots };
}

/** Attaches redRp/blueRp to every match that has an official breakdown. */
export function withRpObservations(
    season: number,
    matches: FTCMatch[],
    scores: MatchScoreEntry[],
): RpLabeledMatch[] {
    return matches.map(m => {
        const forMatch = scores.filter(s => s.matchNumber === m.matchNumber && levelsMatch(m.tournamentLevel, s.matchLevel));
        const red = forMatch.find(s => s.alliance.toLowerCase() === "red")?.scoreBreakdown;
        const blue = forMatch.find(s => s.alliance.toLowerCase() === "blue")?.scoreBreakdown;
        return { ...m, redRp: allianceRpObs(season, red, m, "Red"), blueRp: allianceRpObs(season, blue, m, "Blue") };
    });
}

/**
 * Feature vector for an alliance-match observation. Order matters — same order
 * is used for training and inference. Bumping this requires retraining all
 * cached models.
 *
 *   [0] = avgAuto    (alliance points from autonomous)
 *   [1] = avgTele    (alliance points from teleop)
 *   [2] = avgEnd     (alliance endgame contribution)
 */
export const RP_FEATURE_NAMES = ["avgAuto", "avgTele", "avgEnd"] as const;
export const RP_FEATURE_COUNT = RP_FEATURE_NAMES.length;

export interface AllianceObservation {
    features: number[]; // length === RP_FEATURE_COUNT
    label: 0 | 1;
}

/** One alliance's score decomposed into the RP feature components. */
export interface AllianceComponents {
    auto: number;
    tele: number;
    end: number;
}

/**
 * Decomposes one alliance's score into (auto, tele, end) components.
 *
 * THE single source of truth for the RP feature decomposition. Training
 * (extractObservations, below) and serving (the team profiles built in
 * app/actions/analytics.ts) must both build their vectors through this
 * function — if the two sides decompose differently, the model is trained on
 * one distribution and queried with another (train-serve skew).
 *
 * The FTC API guarantees final/auto/foul; some payloads additionally break
 * out scoreXTeleOp / scoreXEndgame (present on the raw payload but not on the
 * canonical FTCMatch type — treated as optional). Rules:
 *   - end  = scoreEndgame when present, else 0.
 *   - tele = scoreTeleOp when present, else max(0, final − auto − foul − end).
 *
 * Subtracting `end` in the tele fallback is what prevents endgame from being
 * double-counted when the API provides scoreEndgame but not scoreTeleOp.
 * (M8 fix: the previous training-side fallback omitted that subtraction, so
 * at training time tele silently swallowed endgame while inference-side
 * profiles subtracted it — the two sides only agreed by luck of the payload.)
 */
export function allianceScoreComponents(
    match: FTCMatch,
    side: "red" | "blue",
): AllianceComponents {
    const raw = match as unknown as Record<string, number | undefined>;
    const isRed = side === "red";
    const final = (isRed ? match.scoreRedFinal : match.scoreBlueFinal) ?? 0;
    const auto = (isRed ? match.scoreRedAuto : match.scoreBlueAuto) ?? 0;
    // Penalties RECEIVED by this alliance = the OPPONENT's committed fouls
    // (scoreXFoul = committed by X — verified vs the official score display).
    const foul = (isRed ? match.scoreBlueFoul : match.scoreRedFoul) ?? 0;
    const end = (isRed ? raw.scoreRedEndgame : raw.scoreBlueEndgame) ?? 0;
    const teleRaw = isRed ? raw.scoreRedTeleOp : raw.scoreBlueTeleOp;
    const tele = teleRaw ?? Math.max(0, final - auto - foul - end);
    return { auto, tele, end };
}

/**
 * Extracts training observations from a single FTCMatch — produces TWO rows
 * (one per alliance). Discards matches that haven't been played yet or have
 * missing per-component scores.
 *
 * `target` selects which RP slot becomes the label.
 */
export function extractObservations(
    match: RpLabeledMatch,
    target: RPTarget,
): AllianceObservation[] {
    if (!isMatchScored(match)) return [];
    const out: AllianceObservation[] = [];
    for (const side of ["red", "blue"] as const) {
        const label = labelFor(match, side, target);
        if (label === null) continue;
        const c = allianceScoreComponents(match, side);
        out.push({ features: [c.auto, c.tele, c.end], label });
    }
    return out;
}

function labelFor(match: RpLabeledMatch, side: "red" | "blue", target: RPTarget): 0 | 1 | null {
    const obs = side === "red" ? match.redRp : match.blueRp;
    if (!obs || !(target in obs.rp)) return null;
    return obs.rp[target] ? 1 : 0;
}

function isMatchScored(match: FTCMatch): boolean {
    if (match.postResultTime && match.postResultTime.length > 0) return true;
    return (match.scoreRedFinal ?? 0) + (match.scoreBlueFinal ?? 0) > 0;
}

/**
 * Walks a list of FTCMatch results and extracts (features, labels) for one
 * RP target. Useful as input to trainLogistic.
 */
export function extractTrainingSet(
    matches: RpLabeledMatch[],
    target: RPTarget,
): { features: number[][]; labels: number[] } {
    const features: number[][] = [];
    const labels: number[] = [];
    for (const m of matches) {
        for (const obs of extractObservations(m, target)) {
            features.push(obs.features);
            labels.push(obs.label);
        }
    }
    return { features, labels };
}

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

export interface TeamRpProfile {
    /** Team's average autonomous-period points across known matches. */
    avgAuto: number;
    /** Average teleop-period points. */
    avgTele: number;
    /** Average endgame points. */
    avgEnd: number;
    /**
     * Heuristic fallback: the team's empirical RP rate per target (from the
     * official breakdowns). Used when no logistic model is available.
     */
    heuristic?: Record<string, number>;
}

/**
 * P(RP=1) for a logistic-family target given a team's average score profile.
 * Without a model, returns the empirical rate. (The former 0.7 "pattern"
 * dampening is gone: pattern now has its own official label and model.)
 */
export function inferTeamRpProbability(
    profile: TeamRpProfile,
    target: RPTarget,
    model: LogisticModel | null | undefined,
): number {
    if (!model) return profile.heuristic?.[target] ?? 0;
    return predictLogistic(model, [profile.avgAuto, profile.avgTele, profile.avgEnd]);
}

/**
 * Stable cache key for storing trained model weights in the server cache.
 * Format: `rp-model:{season}:{target}:vN`. Bump the version suffix whenever
 * the feature order OR semantics change — stale models trained under the old
 * decomposition must not be served against new inference vectors.
 *
 * Version history:
 *   v1 — original; training-side tele fallback did NOT subtract endgame.
 *   v2 — M8 fix: shared allianceScoreComponents() decomposition on both
 *        sides; tele fallback subtracts endgame. v1 models are incompatible
 *        (inference transparently falls back to the heuristic until retrain).
 *   v3 — labels from the official /scores breakdown (v2 never trained: its
 *        labels came from nonexistent /matches fields) and real tele/end
 *        splits from phaseSplit(). DECODE targets: movement / goal / pattern.
 */
export function rpModelCacheKey(season: number, target: RPTarget): string {
    return `rp-model:${season}:${target}:v3`;
}
