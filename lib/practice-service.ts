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

const isOffline = () => typeof navigator !== "undefined" && navigator.onLine === false;

/**
 * Only a real rejection (e.g. permission denied) counts toward the retry
 * budget; being offline or timing out on venue Wi-Fi never does, or a few
 * saves without signal would park the run forever (#105 review).
 */
async function pushRun(id: string, run: PracticeRun): Promise<boolean> {
    if (isOffline()) return false;
    try {
        await withTimeout(setDoc(doc(db, COLLECTION, id), run), 8000);
        await markPracticeSynced(id);
        return true;
    } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg !== "timeout" && !isOffline()) await recordPracticeSyncFailure(id, msg);
        return false;
    }
}

/** Saves locally, then tries the server. Returns where it ended up. */
export async function savePracticeRun(run: PracticeRun): Promise<"cloud" | "local"> {
    await savePracticeToLocal(run);
    return (await pushRun(run.id, run)) ? "cloud" : "local";
}

/** Pushes this user's queued runs; returns how many are still pending. */
export async function drainPracticeQueue(orgId: string, uid: string): Promise<number> {
    let pending = 0;
    for (const row of await getPendingPracticeRows(orgId, uid)) {
        if (row.syncAttempts >= MAX_ATTEMPTS || !(await pushRun(row.id, row.data))) pending++;
    }
    return pending;
}

/** Queued-but-unsynced runs, shown in the history until they reach the server. */
export async function pendingPracticeRuns(orgId: string, uid: string): Promise<PracticeRun[]> {
    return (await getPendingPracticeRows(orgId, uid)).map(r => r.data);
}

export function listenPracticeRuns(orgId: string, season: number, cb: (runs: PracticeRun[]) => void): Unsubscribe {
    const q = query(collection(db, COLLECTION), where("orgId", "==", orgId), where("season", "==", season));
    return onSnapshot(q, snap => cb(snap.docs.map(d => ({ ...(d.data() as PracticeRun), id: d.id }))), err => {
        console.error("[practice] listener failed:", err);
        cb([]);
    });
}

export const deletePracticeRun = (id: string) => deleteDoc(doc(db, COLLECTION, id));
