import "server-only";
import { getAdminDb } from "@/lib/firebase-admin";
import { assignAliases } from "@/lib/scouting-pool";

/**
 * Stable per-event pseudonyms (org → "A", "B"…) in server-only
 * pool_aliases/{season}_{event} (#102). Shared by the pool and the
 * scout-claims board so a team is the same letter in both.
 */
export async function ensureAliases(season: number, eventCode: string, orgIds: string[]): Promise<Record<string, string>> {
    const db = getAdminDb();
    const ref = db.collection("pool_aliases").doc(`${season}_${eventCode}`);
    return db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const existing = (snap.exists ? (snap.data()?.aliases as Record<string, string>) : undefined) ?? {};
        const next = assignAliases(existing, orgIds);
        if (Object.keys(next).length !== Object.keys(existing).length) {
            tx.set(ref, { aliases: next, season, eventCode, updatedAt: new Date() });
        }
        return next;
    });
}
