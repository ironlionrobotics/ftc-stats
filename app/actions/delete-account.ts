"use server";

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import type { ErrorCode } from "@/lib/errors";

/**
 * Self-service account deletion (plan "PRIDE abierta al público" §4.3,
 * decision #97). Most users are minors; they (or their coach) must be able to
 * remove their personal data without asking us.
 *
 * What it does, server-side with the Admin SDK:
 *  1. Scouting the user captured stays with their TEAM (it is the team's
 *     data and other scouts' consensus depends on it), but is de-identified:
 *     scoutName/scouterName → "Deleted scout". The uid in scoutId/scouterId
 *     is kept because reliability scores and dedup key on it — it no longer
 *     resolves to any person once the auth account is gone.
 *  2. Pending team claims by the user are deleted (they hold the email).
 *  3. users/{uid} is deleted (email, display name, team membership).
 *  4. The Firebase Auth account is deleted (Google identity link).
 *
 * The caller must type the confirmation word; the client then signs out.
 * Known gap: if the user is the only admin of their team, the team keeps no
 * admin — a superadmin reassigns it (documented in docs/PENDING.md).
 */
const DELETED_NAME = "Deleted scout";
const BATCH = 400;

export async function deleteMyAccountAction(input: { idToken: string; confirm: string }): Promise<{ ok: true } | { ok: false; code: ErrorCode }> {
    if (!input?.idToken) return { ok: false, code: "auth.missingToken" };
    if (input.confirm !== "DELETE") return { ok: false, code: "account.confirmRequired" };

    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(input.idToken, true);
        uid = decoded.uid;
    } catch {
        return { ok: false, code: "auth.invalidToken" };
    }

    const db = getAdminDb();
    try {
        // 1. De-identify scouting (both field generations).
        for (const field of ["scoutId", "scouterId"] as const) {
            const snap = await db.collection("match_scouting").where(field, "==", uid).get();
            for (let i = 0; i < snap.docs.length; i += BATCH) {
                const batch = db.batch();
                for (const d of snap.docs.slice(i, i + BATCH)) {
                    batch.update(d.ref, { scoutName: DELETED_NAME, scouterName: DELETED_NAME });
                }
                await batch.commit();
            }
        }
        // Pit scouting: the legacy display-name field (`lastUpdatedBy`).
        const pits = await db.collection("pit_scouting").where("scoutedBy", "==", uid).get();
        for (let i = 0; i < pits.docs.length; i += BATCH) {
            const batch = db.batch();
            for (const d of pits.docs.slice(i, i + BATCH)) {
                if (d.data().lastUpdatedBy) batch.update(d.ref, { lastUpdatedBy: DELETED_NAME });
            }
            await batch.commit();
        }
        // 2. Pending team claims (hold the requester's email).
        const claims = await db.collection("team_claims").where("requestedBy", "==", uid).get();
        for (const d of claims.docs) {
            if (d.data().status === "pending") await d.ref.delete();
            else await d.ref.update({ requestedEmail: "", requestedName: "" });
        }
        // 3. Profile.
        await db.collection("users").doc(uid).delete();
    } catch (e) {
        console.error("[delete-account] firestore", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }

    // 4. Auth identity last: if Firestore cleanup failed the user can retry.
    try {
        await getAdminAuth().deleteUser(uid);
    } catch (e) {
        console.error("[delete-account] auth", e);
        return { ok: false, code: "generic" };
    }
    console.info("[delete-account] account deleted");
    return { ok: true };
}
