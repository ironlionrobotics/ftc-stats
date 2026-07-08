import {
    collection,
    doc,
    getDoc,
    setDoc,
    onSnapshot,
    Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Picklist } from "@/types/picklist";

const COLLECTION = "picklists";

function picklistId(orgId: string, eventCode: string): string {
    return `${orgId}_${eventCode}`;
}

/**
 * Loads or creates a picklist for the given (org, event). On first load all
 * teams seed into the ordered list in their current ranking order, so the
 * strategy lead has a sensible starting point instead of a blank slate.
 */
export async function loadOrCreatePicklist(opts: {
    orgId: string;
    eventCode: string;
    season: number;
    creatorUid: string;
    initialTeamOrder: number[];
}): Promise<Picklist> {
    const id = picklistId(opts.orgId, opts.eventCode);
    const ref = doc(db, COLLECTION, id);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        return { id, ...(snap.data() as Omit<Picklist, "id">) };
    }
    const fresh: Omit<Picklist, "id"> = {
        orgId: opts.orgId,
        eventCode: opts.eventCode,
        season: opts.season,
        teams: [...opts.initialTeamOrder],
        doNotPick: [],
        selected: [],
        declined: [],
        createdBy: opts.creatorUid,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
        updatedBy: opts.creatorUid,
    };
    await setDoc(ref, fresh);
    return { id, ...fresh };
}

/**
 * Real-time listener. Returns the unsubscribe function. Multiple strategy
 * leads of the same org all see updates within ~200ms; last-write-wins for
 * concurrent edits which is acceptable for live alliance selection where
 * the dominant editor is usually a single person at a time.
 */
export function listenToPicklist(
    orgId: string,
    eventCode: string,
    callback: (picklist: Picklist | null) => void,
) {
    const id = picklistId(orgId, eventCode);
    const ref = doc(db, COLLECTION, id);
    return onSnapshot(ref, snap => {
        if (!snap.exists()) {
            callback(null);
            return;
        }
        callback({ id, ...(snap.data() as Omit<Picklist, "id">) });
    });
}

/**
 * Persists changes to the picklist. Performs an atomic overwrite of the
 * tracked fields (teams / doNotPick / selected / declined) with the updater's
 * timestamp + uid, so the audit trail shows who last touched it.
 */
export async function updatePicklist(
    picklist: Picklist,
    updaterUid: string,
    patch: Partial<Pick<Picklist, "teams" | "doNotPick" | "selected" | "declined">>,
): Promise<void> {
    const ref = doc(db, COLLECTION, picklist.id);
    await setDoc(
        ref,
        {
            ...picklist,
            ...patch,
            updatedAt: Timestamp.now(),
            updatedBy: updaterUid,
        },
        { merge: true },
    );
}
