"use server";

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { validateInvite, normalizeInviteCode, type InviteDoc } from "@/lib/invite-redemption";
import type { Org } from "@/types/orgs";

/**
 * Redeems an org invite code SERVER-SIDE via the Admin SDK (M4 vector-2 fix).
 *
 * Why this exists: `users/{uid}.orgId` is the membership boundary. Firestore
 * rules can't safely let a client set its own orgId to an *arbitrary* org — a
 * scout could then self-join a rival org and read its picklists / private pit
 * notes. So the client rule now forbids client-set orgId to any org the user
 * didn't create (see firestore.rules → users/{uid}), and the ONLY way to join
 * an existing org is this action: it verifies the caller's ID token, validates
 * the invite, and writes orgId with the Admin SDK (which bypasses rules).
 *
 * Runs in a Firestore transaction so the invite validation, the `uses`
 * increment, and the membership write are atomic — this also closes the small
 * race the old client path had (concurrent redemptions could exceed maxUses).
 */
export async function redeemInviteAction(input: {
    idToken: string;
    code: string;
}): Promise<{ ok: true; org: Org } | { ok: false; error: string }> {
    const { idToken } = input;
    if (!idToken) return { ok: false, error: "Falta token de autenticación" };

    const code = normalizeInviteCode(input.code ?? "");
    if (code.length < 4) return { ok: false, error: "Código demasiado corto" };

    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false, error: "Token inválido o expirado" };
    }

    const db = getAdminDb();
    const inviteRef = db.collection("org_invites").doc(code);
    const userRef = db.collection("users").doc(uid);

    try {
        const org = await db.runTransaction(async (tx) => {
            // All reads first (Firestore transaction requirement).
            const inviteSnap = await tx.get(inviteRef);
            const invite = inviteSnap.exists ? (inviteSnap.data() as InviteDoc) : null;

            // Need the invite's orgId to locate the org; bail early if missing.
            if (!invite) throw new Error("Código de invitación no encontrado");

            const orgRef = db.collection("orgs").doc(invite.orgId);
            const orgSnap = await tx.get(orgRef);
            const userSnap = await tx.get(userRef);

            const validation = validateInvite(invite, orgSnap.exists, Date.now());
            if (!validation.ok) throw new Error(validation.error);

            if (!userSnap.exists) throw new Error("Usuario no encontrado");

            // Writes.
            tx.update(inviteRef, { uses: FieldValue.increment(1) });
            tx.update(userRef, { orgId: invite.orgId, role: "scout" });

            return { id: invite.orgId, ...(orgSnap.data() as Omit<Org, "id">) };
        });
        return { ok: true, org };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Error al usar el código";
        return { ok: false, error: message };
    }
}
