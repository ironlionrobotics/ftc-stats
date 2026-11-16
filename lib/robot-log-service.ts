import { app, db } from "./firebase";
import { getStorage, ref, uploadBytes, getBlob, deleteObject } from "firebase/storage";
import { collection, doc, query, where, onSnapshot, setDoc, updateDoc, deleteDoc, type Unsubscribe } from "firebase/firestore";
import type { RobotLogDoc } from "@/types/robot-log";
import { logFolder } from "@/lib/robot-logs/paths";

/**
 * Client side of "Salud del robot" (#120). The CSV is parsed and summarized
 * in the browser (lib/robot-logs), uploaded to Storage under the team's
 * private folder, then the metadata + summary doc is written. Files are read
 * back with getBlob() under Storage rules (own team only); never public URLs.
 */

const COLLECTION = "robot_logs";
const DOC_TIMEOUT_MS = 15_000;
const storage = () => getStorage(app);

export function newRobotLogId(): string {
    return doc(collection(db, COLLECTION)).id;
}

export class RobotLogUploadError extends Error {
    constructor(public readonly code: "offline" | "upload" | "save") {
        super(code);
    }
}

/** Uploads the CSV first, then the doc; a failed doc write removes the orphan file. */
export async function uploadRobotLog(log: RobotLogDoc, csv: Blob): Promise<void> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new RobotLogUploadError("offline");
    const path = `${logFolder(log.season, log.teamNumber, log.id)}/${log.files[0]}`;
    try {
        await uploadBytes(ref(storage(), path), csv, { contentType: "text/csv", cacheControl: "private, max-age=86400" });
    } catch {
        throw new RobotLogUploadError("upload");
    }
    try {
        // Offline, setDoc never rejects (it queues): bound it so the UI doesn't
        // hang and the orphan file is cleaned up instead of left behind.
        await Promise.race([
            setDoc(doc(db, COLLECTION, log.id), log),
            new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), DOC_TIMEOUT_MS)),
        ]);
    } catch {
        await deleteObject(ref(storage(), path)).catch(() => undefined);
        throw new RobotLogUploadError("save");
    }
}

export function listenRobotLogs(orgId: string, season: number, cb: (logs: RobotLogDoc[]) => void): Unsubscribe {
    const q = query(collection(db, COLLECTION), where("orgId", "==", orgId), where("season", "==", season));
    return onSnapshot(q, snap => cb(snap.docs.map(d => d.data() as RobotLogDoc).sort((a, b) => a.recordedAt - b.recordedAt)), err => {
        console.error("[robot-logs] listener failed:", err);
        cb([]);
    });
}

export function listenRobotLog(id: string, cb: (log: RobotLogDoc | null) => void): Unsubscribe {
    return onSnapshot(doc(db, COLLECTION, id), snap => cb(snap.exists() ? (snap.data() as RobotLogDoc) : null), () => cb(null));
}

/** The run's CSV text (rules-checked read). */
export async function readRobotLogCsv(log: RobotLogDoc): Promise<string> {
    const blob = await getBlob(ref(storage(), `${logFolder(log.season, log.teamNumber, log.id)}/${log.files[0]}`));
    return blob.text();
}

export type RobotLogLabels = Pick<RobotLogDoc, "label" | "kind" | "eventCode" | "match" | "practiceRunId">;

export const updateRobotLogLabels = (id: string, labels: RobotLogLabels) => updateDoc(doc(db, COLLECTION, id), { ...labels });

/**
 * Deletes the files, then the doc. A file that is already gone is fine; any
 * other Storage error aborts before touching the doc, so a run never ends up
 * listed without its CSV.
 */
export async function deleteRobotLog(log: RobotLogDoc): Promise<void> {
    const folder = logFolder(log.season, log.teamNumber, log.id);
    await Promise.all(log.files.map(f => deleteObject(ref(storage(), `${folder}/${f}`)).catch(e => {
        if ((e as { code?: string })?.code !== "storage/object-not-found") throw e;
    })));
    await deleteDoc(doc(db, COLLECTION, log.id));
}
