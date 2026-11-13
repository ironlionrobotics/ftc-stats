"use server";

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { FieldValue } from "firebase-admin/firestore";
import { isSuperadminEmail } from "@/lib/app-config-schema";
import { CodedError, toErrorCode, type ErrorCode } from "@/lib/errors";
import {
    canDecide,
    canFileClaim,
    canUserOpenAnotherClaim,
    validateClaimInput,
    type ClaimStatus,
    type TeamClaimDoc,
} from "@/lib/team-claims";

/**
 * Team claims (decision #90). See lib/team-claims.ts for the model.
 *
 *  - claimTeamAction: a signed-in user without a team asks to become admin of
 *    team N. Creates `team_claims/{N}` (pending). Never creates the org.
 *  - getMyTeamClaimAction: the caller's open claim, for the onboarding modal.
 *  - listTeamClaimsAction / decideTeamClaimAction: superadmin review queue in
 *    /admin. Approval creates `orgs/{N}` and makes the requester its admin,
 *    atomically, with the Admin SDK (client rules forbid creating orgs).
 *
 * Errors travel as ErrorCodes (translated by the client).
 */

type Fail = { ok: false; code: ErrorCode };

const CLAIMS = "team_claims";

async function uidFromToken(idToken: unknown): Promise<{ uid: string; email: string; name: string } | Fail> {
    if (!idToken || typeof idToken !== "string") return { ok: false, code: "auth.missingToken" };
    try {
        const d = await getAdminAuth().verifyIdToken(idToken);
        return { uid: d.uid, email: d.email ?? "", name: typeof d.name === "string" ? d.name : "" };
    } catch {
        return { ok: false, code: "auth.invalidToken" };
    }
}

async function requireSuperadmin(idToken: unknown): Promise<{ uid: string; email: string } | Fail> {
    if (!idToken || typeof idToken !== "string") return { ok: false, code: "auth.missingToken" };
    try {
        const d = await getAdminAuth().verifyIdToken(idToken);
        // email_verified: the allow-list is keyed by email, so it must be proven.
        if (!d.email_verified || !isSuperadminEmail(d.email, process.env.SUPERADMIN_EMAILS)) {
            return { ok: false, code: "auth.notSuperadmin" };
        }
        return { uid: d.uid, email: d.email! };
    } catch {
        return { ok: false, code: "auth.invalidToken" };
    }
}

export interface MyClaim {
    teamNumber: number;
    displayName: string;
    status: ClaimStatus;
}

export async function claimTeamAction(input: {
    idToken: string;
    teamNumber: number | string;
    displayName: string;
    program: string;
}): Promise<{ ok: true; claim: MyClaim } | Fail> {
    const who = await uidFromToken(input?.idToken);
    if ("ok" in who) return who;
    const v = validateClaimInput(input);
    if (!v.ok) return v;
    const { teamNumber, displayName, program } = v.value;

    const db = getAdminDb();
    try {
        const claimRef = db.collection(CLAIMS).doc(String(teamNumber));
        const orgRef = db.collection("orgs").doc(String(teamNumber));
        const userRef = db.collection("users").doc(who.uid);
        await db.runTransaction(async tx => {
            const [claimSnap, orgSnap, userSnap] = await Promise.all([tx.get(claimRef), tx.get(orgRef), tx.get(userRef)]);
            if (!userSnap.exists) throw new CodedError("auth.userNotFound");
            if (userSnap.data()?.orgId) throw new CodedError("claim.alreadyInTeam");
            // One open claim per user, enforced in-transaction via users/{uid}.
            const openTeam = typeof userSnap.data()?.openClaimTeam === "number" ? userSnap.data()!.openClaimTeam as number : null;
            if (!canUserOpenAnotherClaim(openTeam, teamNumber)) throw new CodedError("claim.alreadyOpen");
            const existing = claimSnap.exists ? (claimSnap.data() as TeamClaimDoc) : null;
            const allowed = canFileClaim(who.uid, orgSnap.exists, existing);
            if (!allowed.ok) throw new CodedError(allowed.code);
            const doc: TeamClaimDoc = {
                teamNumber,
                displayName,
                program,
                status: "pending",
                requestedBy: who.uid,
                requestedEmail: who.email,
                requestedName: who.name,
                requestedAtMs: Date.now(),
            };
            tx.set(claimRef, doc);
            tx.update(userRef, { openClaimTeam: teamNumber });
        });
        return { ok: true, claim: { teamNumber, displayName, status: "pending" } };
    } catch (e) {
        const code = toErrorCode(e);
        if (code === "generic") console.error("[team-claims] claim", e);
        return { ok: false, code };
    }
}

async function claimsOf(uid: string): Promise<TeamClaimDoc[]> {
    const snap = await getAdminDb().collection(CLAIMS).where("requestedBy", "==", uid).limit(20).get();
    return snap.docs.map(d => d.data() as TeamClaimDoc);
}

/** The requester withdraws their own pending claim (e.g. a mistyped number). */
export async function cancelMyTeamClaimAction(idToken: string): Promise<{ ok: true } | Fail> {
    const who = await uidFromToken(idToken);
    if ("ok" in who) return who;
    const db = getAdminDb();
    const userRef = db.collection("users").doc(who.uid);
    try {
        await db.runTransaction(async tx => {
            const userSnap = await tx.get(userRef);
            const team = userSnap.data()?.openClaimTeam;
            if (typeof team !== "number") throw new CodedError("claim.notFound");
            const claimRef = db.collection(CLAIMS).doc(String(team));
            const claimSnap = await tx.get(claimRef);
            const claim = claimSnap.exists ? (claimSnap.data() as TeamClaimDoc) : null;
            if (claim && claim.status === "pending" && claim.requestedBy === who.uid) tx.delete(claimRef);
            tx.update(userRef, { openClaimTeam: FieldValue.delete() });
        });
        return { ok: true };
    } catch (e) {
        const code = toErrorCode(e);
        if (code === "generic") console.error("[team-claims] cancel", e);
        return { ok: false, code };
    }
}

export async function getMyTeamClaimAction(idToken: string): Promise<{ ok: true; claim: MyClaim | null } | Fail> {
    const who = await uidFromToken(idToken);
    if ("ok" in who) return who;
    try {
        // A pending claim wins; otherwise the latest rejection (approved
        // claims are irrelevant here — the user already has an orgId).
        const mine = (await claimsOf(who.uid)).filter(c => c.status !== "approved");
        const c = mine.find(x => x.status === "pending")
            ?? mine.sort((a, b) => b.requestedAtMs - a.requestedAtMs)[0];
        return { ok: true, claim: c ? { teamNumber: c.teamNumber, displayName: c.displayName, status: c.status } : null };
    } catch (e) {
        console.error("[team-claims] mine", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
}

export interface ClaimForReview {
    teamNumber: number;
    displayName: string;
    program: string;
    requestedEmail: string;
    requestedName: string;
    requestedAtMs: number;
}

export async function listTeamClaimsAction(idToken: string): Promise<{ ok: true; claims: ClaimForReview[] } | Fail> {
    const admin = await requireSuperadmin(idToken);
    if ("ok" in admin) return admin;
    try {
        // Oldest first, sorted in memory (an orderBy here would need a
        // composite index); the pilot queue stays far below this cap.
        const snap = await getAdminDb().collection(CLAIMS).where("status", "==", "pending").limit(500).get();
        const claims = snap.docs
            .map(d => d.data() as TeamClaimDoc)
            .map(c => ({
                teamNumber: c.teamNumber,
                displayName: c.displayName,
                program: c.program,
                requestedEmail: c.requestedEmail,
                requestedName: c.requestedName,
                requestedAtMs: c.requestedAtMs,
            }))
            .sort((a, b) => a.requestedAtMs - b.requestedAtMs);
        return { ok: true, claims };
    } catch (e) {
        console.error("[team-claims] list", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
}

export async function decideTeamClaimAction(input: {
    idToken: string;
    teamNumber: number;
    approve: boolean;
}): Promise<{ ok: true } | Fail> {
    const admin = await requireSuperadmin(input?.idToken);
    if ("ok" in admin) return admin;
    const teamNumber = Number(input?.teamNumber);
    if (!Number.isInteger(teamNumber) || teamNumber < 1) return { ok: false, code: "validation.teamNumber" };
    const approve = input?.approve === true;

    const db = getAdminDb();
    const claimRef = db.collection(CLAIMS).doc(String(teamNumber));
    const orgRef = db.collection("orgs").doc(String(teamNumber));
    try {
        await db.runTransaction(async tx => {
            const [claimSnap, orgSnap] = await Promise.all([tx.get(claimRef), tx.get(orgRef)]);
            const claim = claimSnap.exists ? (claimSnap.data() as TeamClaimDoc) : null;
            const allowed = canDecide(claim, orgSnap.exists);
            if (!allowed.ok) throw new CodedError(allowed.code);
            const now = Date.now();
            const userRef = db.collection("users").doc(claim!.requestedBy);
            const userSnap = await tx.get(userRef);
            // Either way the requester's claim slot is freed.
            const freeSlot = userSnap.exists && userSnap.data()?.openClaimTeam === teamNumber;
            if (!approve) {
                tx.update(claimRef, { status: "rejected", decidedAtMs: now, decidedBy: admin.email });
                if (freeSlot) tx.update(userRef, { openClaimTeam: FieldValue.delete() });
                return;
            }
            if (!userSnap.exists) throw new CodedError("auth.userNotFound");
            if (userSnap.data()?.orgId) throw new CodedError("claim.alreadyInTeam");
            tx.set(orgRef, {
                teamNumber,
                displayName: claim!.displayName,
                program: claim!.program,
                createdAt: new Date(now),
                createdBy: claim!.requestedBy,
                // Who approved stays in team_claims (server-only): orgs/* is
                // readable by every signed-in user.
            });
            tx.update(userRef, { orgId: String(teamNumber), role: "admin", openClaimTeam: FieldValue.delete() });
            tx.update(claimRef, { status: "approved", decidedAtMs: now, decidedBy: admin.email });
        });
        console.info(`[team-claims] ${approve ? "approved" : "rejected"} team ${teamNumber}`);
        return { ok: true };
    } catch (e) {
        const code = toErrorCode(e);
        if (code === "generic") console.error("[team-claims] decide", e);
        return { ok: false, code };
    }
}
