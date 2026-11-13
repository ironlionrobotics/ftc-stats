"use server";

import { getStorage } from "firebase-admin/storage";
import { getAdminApp, getAdminDb } from "@/lib/firebase-admin";
import { superadminFromToken } from "@/lib/server-caller";
import type { ErrorCode } from "@/lib/errors";
import type { TeamMedia } from "@/lib/team-media";

/**
 * Superadmin review of reported Trading Card media (#106). Reports are
 * write-only for teams; only these actions (Admin SDK) read them, remove the
 * item (Storage files + metadata + profile reference) or dismiss the reports.
 */

export interface ReportedMedia {
    media: TeamMedia;
    reports: number;
    lastReportAtMs: number;
}

type Result<T = object> = ({ ok: true } & T) | { ok: false; code: ErrorCode };

export async function listMediaReportsAction(idToken: string): Promise<Result<{ items: ReportedMedia[] }>> {
    const who = await superadminFromToken(idToken);
    if (!who.ok) return who;
    try {
        const db = getAdminDb();
        const snap = await db.collection("media_reports").limit(500).get();
        const byMedia = new Map<string, { n: number; last: number }>();
        for (const d of snap.docs) {
            const r = d.data() as { mediaId?: string; createdAt?: { toMillis?: () => number } };
            if (!r.mediaId) continue;
            const cur = byMedia.get(r.mediaId) ?? { n: 0, last: 0 };
            byMedia.set(r.mediaId, { n: cur.n + 1, last: Math.max(cur.last, r.createdAt?.toMillis?.() ?? 0) });
        }
        const ids = [...byMedia.keys()];
        const docs = ids.length ? await db.getAll(...ids.map(id => db.collection("team_media").doc(id))) : [];
        const items: ReportedMedia[] = docs.filter(d => d.exists).map(d => {
            const data = d.data() as Omit<TeamMedia, "id"> & { createdAt?: unknown };
            const { createdAt: _drop, ...rest } = data;
            void _drop;
            const meta = byMedia.get(d.id)!;
            return { media: { ...rest, id: d.id } as TeamMedia, reports: meta.n, lastReportAtMs: meta.last };
        }).sort((a, b) => b.reports - a.reports || b.lastReportAtMs - a.lastReportAtMs);
        return { ok: true, items };
    } catch (e) {
        console.error("[media-moderation] list failed:", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
}

async function deleteReportsFor(mediaId: string): Promise<void> {
    const db = getAdminDb();
    const snap = await db.collection("media_reports").where("mediaId", "==", mediaId).get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
}

export async function removeMediaAction(input: { idToken: string; mediaId: string }): Promise<Result> {
    const who = await superadminFromToken(input.idToken);
    if (!who.ok) return who;
    if (typeof input.mediaId !== "string" || !/^[A-Za-z0-9]{1,40}$/.test(input.mediaId)) return { ok: false, code: "generic" };
    try {
        const db = getAdminDb();
        const ref = db.collection("team_media").doc(input.mediaId);
        const snap = await ref.get();
        if (snap.exists) {
            const m = snap.data() as TeamMedia;
            const bucket = getStorage(getAdminApp()).bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET);
            for (const p of [m.path, m.thumbPath]) if (p) await bucket.file(p).delete({ ignoreNotFound: true });
            const profileRef = db.collection("team_profiles").doc(`${m.season}_${m.teamNumber}`);
            await db.runTransaction(async tx => {
                const prof = await tx.get(profileRef);
                if (prof.exists && prof.data()?.profileMediaId === input.mediaId) tx.update(profileRef, { profileMediaId: null });
                tx.delete(ref);
            });
        }
        await deleteReportsFor(input.mediaId);
        return { ok: true };
    } catch (e) {
        console.error("[media-moderation] remove failed:", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
}

export async function dismissMediaReportsAction(input: { idToken: string; mediaId: string }): Promise<Result> {
    const who = await superadminFromToken(input.idToken);
    if (!who.ok) return who;
    if (typeof input.mediaId !== "string" || !/^[A-Za-z0-9]{1,40}$/.test(input.mediaId)) return { ok: false, code: "generic" };
    try {
        await deleteReportsFor(input.mediaId);
        return { ok: true };
    } catch (e) {
        console.error("[media-moderation] dismiss failed:", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
}
