"use server";

import {
    runGroundTruthValidation,
    fetchReliabilitiesForOrg,
    type ValidationReport,
} from "@/lib/ground-truth-validation";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { toErrorCode, type ErrorCode } from "@/lib/errors";

/**
 * Server action wrapper around runGroundTruthValidation. Verifies the caller is
 * an admin/lead before running (we don't want random scouts trashing reliability
 * scores). Returns the report shape for direct rendering in the UI.
 *
 * Auth model: the client sends its Firebase ID token; we verify it server-side
 * via Admin SDK and look up the caller's role in users/{uid}.
 *
 * Failures come back as stable ErrorCodes, not prose (same rationale as
 * redeemInviteAction): the action has no locale, and an unexpected internal
 * exception must not leak its message to the browser.
 */
export async function validateGroundTruthAction(input: {
    idToken: string;
    season: number;
    eventCode: string;
}): Promise<{ ok: true; report: ValidationReport } | { ok: false; code: ErrorCode }> {
    const { idToken, season, eventCode } = input;
    if (!idToken) return { ok: false, code: "auth.missingToken" };
    if (!eventCode) return { ok: false, code: "groundTruth.missingEventCode" };

    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false, code: "auth.invalidToken" };
    }

    let userSnap;
    try {
        userSnap = await getAdminDb().collection("users").doc(uid).get();
    } catch {
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
    if (!userSnap.exists) return { ok: false, code: "auth.userNotFound" };
    const userData = userSnap.data() ?? {};
    const role = userData.role;
    if (role !== "admin" && role !== "lead") {
        return { ok: false, code: "auth.notAdmin" };
    }
    // Scope the run to the caller's own org (C4): reliability writes must never
    // reach scouts of other orgs. runGroundTruthValidation filters by this orgId.
    const orgId = userData.orgId as string | undefined;
    if (!orgId) return { ok: false, code: "auth.noOrg" };

    try {
        const report = await runGroundTruthValidation(season, eventCode, orgId);
        return { ok: true, report };
    } catch (e) {
        const code = toErrorCode(e);
        if (code === "generic") console.error("[validate-ground-truth]", e);
        return { ok: false, code };
    }
}

/** Lists reliability scores for every user in the caller's org. */
export async function fetchOrgReliabilityAction(input: {
    idToken: string;
}): Promise<
    | { ok: true; scouts: Array<{ scoutId: string; displayName: string; reliability: number; matchesScouted: number }> }
    | { ok: false; code: ErrorCode }
> {
    if (!input.idToken) return { ok: false, code: "auth.missingToken" };
    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(input.idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false, code: "auth.invalidToken" };
    }

    let userSnap;
    try {
        userSnap = await getAdminDb().collection("users").doc(uid).get();
    } catch {
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
    if (!userSnap.exists) return { ok: false, code: "auth.userNotFound" };
    const orgId = userSnap.data()?.orgId;
    if (!orgId) return { ok: false, code: "auth.noOrg" };

    try {
        const scouts = await fetchReliabilitiesForOrg(orgId);
        return { ok: true, scouts };
    } catch (e) {
        const code = toErrorCode(e);
        if (code === "generic") console.error("[fetch-org-reliability]", e);
        return { ok: false, code };
    }
}
