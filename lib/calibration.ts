import "server-only";
import { getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";

// One entry per (eventCode, matchNumber) prediction. Logged at predict time
// with the predicted probabilities; updated at settle time with the actual
// outcome pulled from ftc-events. From this collection we derive Brier score,
// log loss, and calibration plots in Sprint 5.
//
// See docs/architecture/collaborative-scouting-model.md §2.7 for the full
// schema rationale and §4.4 for visibility rules.

const COLLECTION = "calibration_log";

export type PredictionLog = {
    season: number;
    eventCode: string;
    matchNumber: number;
    orgId: string;
    predictedWinProb: number;       // P(Red wins), in [0, 1]
    predictedRedScore: number;
    predictedBlueScore: number;
    modelVersion?: string;          // bump when projection.ts logic changes
};

export type SettledOutcome = {
    actualOutcome: "red" | "blue" | "tie";
    actualRedScore: number;
    actualBlueScore: number;
};

function entryId(season: number, eventCode: string, matchNumber: number, orgId: string): string {
    return `${season}_${eventCode}_${matchNumber}_${orgId}`;
}

/**
 * Log a prediction. Safe to call repeatedly — the doc is keyed deterministically
 * so re-predicting overwrites the prior log for the same (event, match, org).
 *
 * Fails silently if firebase-admin isn't configured (e.g., local dev without
 * service account); we don't want calibration logging to block predictions.
 */
export async function logPrediction(p: PredictionLog): Promise<void> {
    try {
        const db = getAdminDb();
        const id = entryId(p.season, p.eventCode, p.matchNumber, p.orgId);
        await db.collection(COLLECTION).doc(id).set(
            {
                ...p,
                predictedAt: FieldValue.serverTimestamp(),
                modelVersion: p.modelVersion ?? "v3-bayesian",
            },
            { merge: true },
        );
    } catch (e) {
        console.warn("[calibration] logPrediction failed:", e instanceof Error ? e.message : e);
    }
}

/**
 * Mark a prediction as settled with the actual outcome. Idempotent.
 * Called from the ground-truth validation job (Sprint 1.7) after pulling
 * official scores from ftc-events.
 */
export async function settleOutcome(
    season: number,
    eventCode: string,
    matchNumber: number,
    orgId: string,
    outcome: SettledOutcome,
): Promise<void> {
    try {
        const db = getAdminDb();
        const id = entryId(season, eventCode, matchNumber, orgId);
        await db.collection(COLLECTION).doc(id).set(
            {
                ...outcome,
                settledAt: FieldValue.serverTimestamp(),
            },
            { merge: true },
        );
    } catch (e) {
        console.warn("[calibration] settleOutcome failed:", e instanceof Error ? e.message : e);
    }
}

/**
 * Compute Brier score over a set of settled predictions.
 *
 *   BS = (1/N) * Σ (p_i - y_i)²
 *
 * where p_i is predicted P(Red wins) and y_i is 1 if Red won, 0 if Blue won,
 * 0.5 if tied. Lower is better; a model that always predicts 0.5 gets BS=0.25.
 *
 * Returns null if there are no settled predictions yet.
 */
export function brierScore(
    settled: Array<{ predictedWinProb: number; actualOutcome: "red" | "blue" | "tie" }>,
): number | null {
    if (settled.length === 0) return null;
    const sse = settled.reduce((acc, row) => {
        const y = row.actualOutcome === "red" ? 1 : row.actualOutcome === "blue" ? 0 : 0.5;
        return acc + (row.predictedWinProb - y) ** 2;
    }, 0);
    return sse / settled.length;
}

/**
 * Compute log loss (cross-entropy) over settled predictions. Penalizes
 * confident-and-wrong predictions much more heavily than Brier.
 *
 *   LL = -(1/N) * Σ [y log(p) + (1-y) log(1-p)]
 *
 * Clamps probabilities away from 0/1 to avoid -Infinity.
 */
export function logLoss(
    settled: Array<{ predictedWinProb: number; actualOutcome: "red" | "blue" | "tie" }>,
): number | null {
    if (settled.length === 0) return null;
    const eps = 1e-6;
    const total = settled.reduce((acc, row) => {
        const y = row.actualOutcome === "red" ? 1 : row.actualOutcome === "blue" ? 0 : 0.5;
        const p = Math.min(1 - eps, Math.max(eps, row.predictedWinProb));
        return acc - (y * Math.log(p) + (1 - y) * Math.log(1 - p));
    }, 0);
    return total / settled.length;
}

/**
 * Reliability diagram bins: groups predictions into confidence buckets and
 * reports the empirical accuracy of each bucket. A well-calibrated model has
 * empirical ≈ predicted for every bin.
 */
export function reliabilityBins(
    settled: Array<{ predictedWinProb: number; actualOutcome: "red" | "blue" | "tie" }>,
    binCount: number = 10,
): Array<{ binLow: number; binHigh: number; predicted: number; empirical: number; count: number }> {
    const bins = Array.from({ length: binCount }, (_, i) => ({
        binLow: i / binCount,
        binHigh: (i + 1) / binCount,
        predictedSum: 0,
        empiricalSum: 0,
        count: 0,
    }));

    for (const row of settled) {
        const idx = Math.min(binCount - 1, Math.floor(row.predictedWinProb * binCount));
        const y = row.actualOutcome === "red" ? 1 : row.actualOutcome === "blue" ? 0 : 0.5;
        bins[idx].predictedSum += row.predictedWinProb;
        bins[idx].empiricalSum += y;
        bins[idx].count += 1;
    }

    return bins.map(b => ({
        binLow: b.binLow,
        binHigh: b.binHigh,
        predicted: b.count > 0 ? b.predictedSum / b.count : 0,
        empirical: b.count > 0 ? b.empiricalSum / b.count : 0,
        count: b.count,
    }));
}

/**
 * Fetch all settled predictions for an org (and optionally a season/event).
 * Used by the calibration dashboard in Sprint 5.
 */
export async function fetchSettledPredictions(
    orgId: string,
    opts?: { season?: number; eventCode?: string },
): Promise<Array<PredictionLog & SettledOutcome>> {
    try {
        const db = getAdminDb();
        let q = db.collection(COLLECTION).where("orgId", "==", orgId).where("actualOutcome", "in", ["red", "blue", "tie"]);
        if (opts?.season) q = q.where("season", "==", opts.season);
        if (opts?.eventCode) q = q.where("eventCode", "==", opts.eventCode);
        const snap = await q.get();
        return snap.docs.map(d => d.data() as PredictionLog & SettledOutcome);
    } catch (e) {
        console.warn("[calibration] fetchSettledPredictions failed:", e instanceof Error ? e.message : e);
        return [];
    }
}
