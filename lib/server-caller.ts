import "server-only";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { serverCache } from "@/lib/server-cache";
import { isSuperadminEmail } from "@/lib/app-config-schema";
import type { ErrorCode } from "@/lib/errors";
import type { OrgRole } from "@/types/orgs";

/**
 * Identity of the caller of a team-scoped server action: the uid comes from
 * the verified ID token and the team from users/{uid} (written only by the
 * server), never from the input. Shared by the federation, scout-claim and
 * lending actions (#102–#104).
 */
export interface Caller {
    uid: string;
    orgId: string;
    role: OrgRole;
}

export async function callerWithTeam(idToken: string | undefined): Promise<{ ok: true; caller: Caller } | { ok: false; code: ErrorCode }> {
    if (!idToken) return { ok: false, code: "auth.missingToken" };
    let uid: string;
    try {
        uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
    } catch {
        return { ok: false, code: "auth.invalidToken" };
    }
    try {
        const snap = await getAdminDb().collection("users").doc(uid).get();
        if (!snap.exists) return { ok: false, code: "auth.userNotFound" };
        const data = snap.data() as { orgId?: string | null; role?: OrgRole };
        if (!data.orgId) return { ok: false, code: "auth.noOrg" };
        return { ok: true, caller: { uid, orgId: String(data.orgId), role: data.role ?? "scout" } };
    } catch (e) {
        console.error("[caller] users lookup failed:", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
}

/** Per-user fixed-window limit for authenticated actions (counter in server_counters). */
export async function allowUser(bucket: string, uid: string, maxPerMinute: number): Promise<boolean> {
    const n = await serverCache.incrWindow(`rl:${bucket}:${uid}`, 60);
    return n <= maxPerMinute;
}

/** Superadmin by verified email allow-list (SUPERADMIN_EMAILS), same gate as team claims (#90). */
export async function superadminFromToken(idToken: unknown): Promise<{ ok: true; uid: string } | { ok: false; code: ErrorCode }> {
    if (!idToken || typeof idToken !== "string") return { ok: false, code: "auth.missingToken" };
    try {
        const d = await getAdminAuth().verifyIdToken(idToken);
        if (!d.email_verified || !isSuperadminEmail(d.email, process.env.SUPERADMIN_EMAILS)) {
            return { ok: false, code: "auth.notSuperadmin" };
        }
        return { ok: true, uid: d.uid };
    } catch {
        return { ok: false, code: "auth.invalidToken" };
    }
}
