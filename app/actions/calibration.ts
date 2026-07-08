"use server";

import {
    fetchSettledPredictions,
    brierScore,
    logLoss,
    reliabilityBins,
    logPrediction as logPredictionImpl,
    type PredictionLog,
} from "@/lib/calibration";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

/**
 * Bundle of calibration metrics for an org. Computed server-side from
 * settled predictions in `calibration_log`. Returns null fields when there
 * isn't enough data yet so the UI can show a clear empty state.
 */
export interface CalibrationSnapshot {
    season?: number;
    eventCode?: string;
    sampleSize: number;
    brier: number | null;
    logLoss: number | null;
    accuracy: number | null;
    bins: Array<{
        binLow: number;
        binHigh: number;
        predicted: number;
        empirical: number;
        count: number;
    }>;
}

/**
 * Returns calibration metrics for the caller's org. Optionally filters by
 * season + eventCode. Caller must be admin/lead — calibration data exposes
 * how accurate the model is, which is org-private.
 */
export async function fetchCalibrationAction(input: {
    idToken: string;
    season?: number;
    eventCode?: string;
}): Promise<
    | { ok: true; snapshot: CalibrationSnapshot }
    | { ok: false; error: string }
> {
    if (!input.idToken) return { ok: false, error: "Falta token de autenticación" };
    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(input.idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false, error: "Token inválido o expirado" };
    }

    const userSnap = await getAdminDb().collection("users").doc(uid).get();
    if (!userSnap.exists) return { ok: false, error: "Usuario no encontrado" };
    const data = userSnap.data() ?? {};
    const orgId = data.orgId as string | undefined;
    if (!orgId) return { ok: false, error: "Sin equipo asignado" };
    const role = data.role;
    if (role !== "admin" && role !== "lead") {
        return { ok: false, error: "Solo admins/leads pueden ver calibración" };
    }

    try {
        const predictions = await fetchSettledPredictions(orgId, {
            season: input.season,
            eventCode: input.eventCode,
        });

        if (predictions.length === 0) {
            return {
                ok: true,
                snapshot: {
                    season: input.season,
                    eventCode: input.eventCode,
                    sampleSize: 0,
                    brier: null,
                    logLoss: null,
                    accuracy: null,
                    bins: [],
                },
            };
        }

        // Accuracy = fraction of predictions where the higher-probability side won.
        const correct = predictions.filter(p => {
            const pickedRed = p.predictedWinProb >= 0.5;
            return (pickedRed && p.actualOutcome === "red") || (!pickedRed && p.actualOutcome === "blue");
        }).length;

        return {
            ok: true,
            snapshot: {
                season: input.season,
                eventCode: input.eventCode,
                sampleSize: predictions.length,
                brier: brierScore(predictions),
                logLoss: logLoss(predictions),
                accuracy: correct / predictions.length,
                bins: reliabilityBins(predictions, 10),
            },
        };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Error desconocido" };
    }
}

/**
 * Logs a prediction made by an authenticated user. Wraps the server-only
 * `logPrediction` so client code (MatchBriefingCard, MatchSimulator) can
 * persist predictions without touching firebase-admin directly.
 *
 * Returns silently on failure — calibration logging is best-effort and must
 * never block the UI.
 */
export async function logPredictionAction(input: {
    idToken: string;
    prediction: Omit<PredictionLog, "orgId">;
}): Promise<{ ok: boolean }> {
    if (!input.idToken) return { ok: false };
    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(input.idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false };
    }

    const userSnap = await getAdminDb().collection("users").doc(uid).get();
    if (!userSnap.exists) return { ok: false };
    const orgId = userSnap.data()?.orgId as string | undefined;
    if (!orgId) return { ok: false };

    await logPredictionImpl({ ...input.prediction, orgId });
    return { ok: true };
}
