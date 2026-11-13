import { db } from "./firebase";
import { collection, doc, query, where, onSnapshot, setDoc, deleteDoc, type Unsubscribe } from "firebase/firestore";
import type { PracticeRun } from "@/types/practice";
import {
    savePracticeToLocal, getPendingPracticeRows, markPracticeSynced, recordPracticeSyncFailure,
} from "@/lib/localDatabase";

/**
 * Workshop practice runs (#105): private to the team (own-org rules). Every
 * run lands in Dexie first, so a workshop without signal loses nothing; the
 * Firestore write uses the same id, so retries never duplicate.
 */

const COLLECTION = "practice_runs";

/** Firestore keeps retrying offline writes forever; give up waiting after `ms`. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("timeout")), ms);
        p.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
    });
}
const MAX_ATTEMPTS = 5;

export function newPracticeId(): string {
    return `pr_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 8)}`;
}

/** Saves locally, then tries the server. Returns where it ended up. */
export async function savePracticeRun(run: PracticeRun): Promise<"cloud" | "local"> {
    await savePracticeToLocal(run);
    try {
        await withTimeout(setDoc(doc(db, COLLECTION, run.id), run), 8000);
        await markPracticeSynced(run.id);
        return "cloud";
    } catch (e) {
        await recordPracticeSyncFailure(run.id, e instanceof Error ? e.message : String(e));
        return "local";
    }
}

/** Pushes queued runs of this team; returns how many are still pending. */
export async function drainPracticeQueue(orgId: string): Promise<number> {
    const rows = await getPendingPracticeRows(orgId);
    let pending = 0;
    for (const row of rows) {
        if (row.syncAttempts >= MAX_ATTEMPTS) { pending++; continue; }
        try {
            await withTimeout(setDoc(doc(db, COLLECTION, row.id), row.data), 8000);
            await markPracticeSynced(row.id);
        } catch (e) {
            await recordPracticeSyncFailure(row.id, e instanceof Error ? e.message : String(e));
            pending++;
        }
    }
    return pending;
}

/** Queued-but-unsynced runs, shown in the history until they reach the server. */
export async function pendingPracticeRuns(orgId: string): Promise<PracticeRun[]> {
    return (await getPendingPracticeRows(orgId)).map(r => r.data);
}

export function listenPracticeRuns(orgId: string, season: number, cb: (runs: PracticeRun[]) => void): Unsubscribe {
    const q = query(collection(db, COLLECTION), where("orgId", "==", orgId), where("season", "==", season));
    return onSnapshot(q, snap => cb(snap.docs.map(d => ({ ...(d.data() as PracticeRun), id: d.id }))), err => {
        console.error("[practice] listener failed:", err);
        cb([]);
    });
}

export const deletePracticeRun = (id: string) => deleteDoc(doc(db, COLLECTION, id));
