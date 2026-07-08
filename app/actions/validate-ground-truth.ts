"use server";

import {
    runGroundTruthValidation,
    fetchReliabilitiesForOrg,
    type ValidationReport,
} from "@/lib/ground-truth-validation";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";

/**
 * Server action wrapper around runGroundTruthValidation. Verifies the caller is
 * an admin/lead before running (we don't want random scouts trashing reliability
 * scores). Returns the report shape for direct rendering in the UI.
 *
 * Auth model: the client sends its Firebase ID token; we verify it server-side
 * via Admin SDK and look up the caller's role in users/{uid}.
 */
export async function validateGroundTruthAction(input: {
    idToken: string;
    season: number;
    eventCode: string;
}): Promise<{ ok: true; report: ValidationReport } | { ok: false; error: string }> {
    const { idToken, season, eventCode } = input;
    if (!idToken) return { ok: false, error: "Falta token de autenticación" };
    if (!eventCode) return { ok: false, error: "Falta eventCode" };

    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false, error: "Token inválido o expirado" };
    }

    const userSnap = await getAdminDb().collection("users").doc(uid).get();
    if (!userSnap.exists) return { ok: false, error: "Usuario no encontrado" };
    const userData = userSnap.data() ?? {};
    const role = userData.role;
    if (role !== "admin" && role !== "lead") {
        return { ok: false, error: "Solo admins/leads pueden ejecutar validación" };
    }
    // Scope the run to the caller's own org (C4): reliability writes must never
    // reach scouts of other orgs. runGroundTruthValidation filters by this orgId.
    const orgId = userData.orgId as string | undefined;
    if (!orgId) return { ok: false, error: "Sin equipo asignado" };

    try {
        const report = await runGroundTruthValidation(season, eventCode, orgId);
        return { ok: true, report };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Error desconocido";
        return { ok: false, error: message };
    }
}

/** Lists reliability scores for every user in the caller's org. */
export async function fetchOrgReliabilityAction(input: {
    idToken: string;
}): Promise<
    | { ok: true; scouts: Array<{ scoutId: string; displayName: string; reliability: number; matchesScouted: number }> }
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
    const orgId = userSnap.data()?.orgId;
    if (!orgId) return { ok: false, error: "Sin equipo asignado" };

    try {
        const scouts = await fetchReliabilitiesForOrg(orgId);
        return { ok: true, scouts };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Error desconocido";
        return { ok: false, error: message };
    }
}
