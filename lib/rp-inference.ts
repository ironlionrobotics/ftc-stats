/**
 * Ranking-Point (RP) inference. Replaces the previous "empirical rate per
 * match" heuristic with logistic-regression predictions, with a graceful
 * fallback to the heuristic when no model is trained yet.
 *
 * Models are trained offline by app/actions/train-rp-models.ts and persisted
 * in Upstash Redis (per season). At inference time we load the model and
 * compute P(RP=1) given an alliance's average score profile.
 *
 * Why this matters:
 *   - Heuristic: every alliance with rate > X gets a fixed prob → loses
 *     granularity. Two alliances on the same "side" of the threshold are
 *     treated identically.
 *   - Logistic: continuous P(RP) as a function of features → ranks alliances
 *     correctly. A team scoring 20% above the average matches with RP gets
 *     a higher P than one barely above.
 *
 * Targets supported (DECODE 2025-2026):
 *   - "movement" → RP1 (alliance achieves Movement RP — sortOrder maps to
 *     scoreRedRp1 / scoreBlueRp1)
 *   - "artifact" → RP2 (Artifact / Goal scoring threshold)
 *   - "pattern"  → derived from artifact at 70% (no separate RP slot; the
 *     same heuristic-derived correlation factor)
 */

import type { FTCMatch } from "@/types/scouting";
import type { LogisticModel } from "./logistic-regression";
import { predictLogistic } from "./logistic-regression";

export type RPTarget = "movement" | "artifact" | "pattern";

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
    match: FTCMatch,
    target: RPTarget,
): AllianceObservation[] {
    if (!isMatchScored(match)) return [];
    const red = allianceScoreComponents(match, "red");
    const blue = allianceScoreComponents(match, "blue");
    return [
        {
            features: [red.auto, red.tele, red.end],
            label: labelFor(match, "red", target),
        },
        {
            features: [blue.auto, blue.tele, blue.end],
            label: labelFor(match, "blue", target),
        },
    ];
}

function labelFor(match: FTCMatch, side: "red" | "blue", target: RPTarget): 0 | 1 {
    // DECODE 2025-2026: scoreRedRp1 = Movement, scoreRedRp2 = Artifact (Goal).
    // Pattern doesn't have its own RP slot in DECODE — we proxy it as the
    // same outcome as Artifact at training time and post-multiply by 0.7 at
    // inference (matches the legacy heuristic in analytics.ts).
    const rp1 = side === "red" ? (match.scoreRedRp1 ?? 0) : (match.scoreBlueRp1 ?? 0);
    const rp2 = side === "red" ? (match.scoreRedRp2 ?? 0) : (match.scoreBlueRp2 ?? 0);
    if (target === "movement") return rp1 >= 1 ? 1 : 0;
    return rp2 >= 1 ? 1 : 0;  // "artifact" or "pattern" share the same training label
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
    matches: FTCMatch[],
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
     * Heuristic fallback: empirical RP rate per match across the season.
     * Used when no logistic model is available (e.g., fresh season).
     */
    heuristicMovementProb?: number;
    heuristicArtifactProb?: number;
}

/**
 * Returns P(RP=1) for a single team given its average score profile and an
 * optional trained model. When `model` is undefined, falls back to the
 * supplied heuristic — preserving the pre-logistic behavior so the app keeps
 * working before any model is trained.
 *
 * The 0.7 multiplier on `pattern` is a legacy correction inherited from
 * `app/actions/analytics.ts` — Pattern RP correlates with Artifact RP but
 * not 1:1.
 */
export function inferTeamRpProbability(
    profile: TeamRpProfile,
    target: RPTarget,
    model: LogisticModel | null | undefined,
): number {
    if (!model) {
        // Heuristic fallback — return whatever the caller already had.
        if (target === "movement") return profile.heuristicMovementProb ?? 0;
        if (target === "artifact") return profile.heuristicArtifactProb ?? 0;
        // Pattern: 70% of artifact (legacy)
        return (profile.heuristicArtifactProb ?? 0) * 0.7;
    }

    const features = [profile.avgAuto, profile.avgTele, profile.avgEnd];
    const p = predictLogistic(model, features);

    // Pattern shares the artifact-trained model but is dampened to keep
    // parity with the empirical correlation factor.
    if (target === "pattern") return p * 0.7;
    return p;
}

/**
 * Stable cache key for storing trained model weights in Redis.
 * Format: `rp-model:{season}:{target}:vN`. Bump the version suffix whenever
 * the feature order OR semantics change — stale models trained under the old
 * decomposition must not be served against new inference vectors.
 *
 * Version history:
 *   v1 — original; training-side tele fallback did NOT subtract endgame.
 *   v2 — M8 fix: shared allianceScoreComponents() decomposition on both
 *        sides; tele fallback subtracts endgame. v1 models are incompatible
 *        (inference transparently falls back to the heuristic until retrain).
 */
export function rpModelCacheKey(season: number, target: RPTarget): string {
    return `rp-model:${season}:${target}:v2`;
}
