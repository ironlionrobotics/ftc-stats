import { db } from "./firebase";
import {
    collection, doc, query, where, onSnapshot, setDoc, addDoc, updateDoc, deleteDoc, serverTimestamp,
    type Unsubscribe,
} from "firebase/firestore";
import type { InventoryItem, EventPresence, LendRequest, Loan, RequestStatus } from "@/lib/lending";

/**
 * Client side of pit lending (#104). Reads are live listeners; inventory,
 * presence and requests are written directly (rules bound them to the
 * caller's own team), loans only through app/actions/lending.ts.
 */

export type WithId<T> = T & { id: string };

function listen<T>(q: ReturnType<typeof query>, cb: (rows: WithId<T>[]) => void, label: string): Unsubscribe {
    return onSnapshot(q, snap => {
        cb(snap.docs.map(d => ({ id: d.id, ...(d.data() as T) })));
    }, err => {
        console.error(`[lending] ${label} listener failed:`, err);
        cb([]);
    });
}

export const listenMyInventory = (orgId: string, cb: (rows: WithId<InventoryItem>[]) => void) =>
    listen<InventoryItem>(query(collection(db, "org_inventory"), where("orgId", "==", orgId)), cb, "inventory");

/** Every team's lendable items (the rules only allow this query shape for others' items). */
export const listenLendableItems = (cb: (rows: WithId<InventoryItem>[]) => void) =>
    listen<InventoryItem>(query(collection(db, "org_inventory"), where("lendable", "==", true)), cb, "lendable");

export async function saveInventoryItem(orgId: string, itemId: string | null, item: Omit<InventoryItem, "orgId" | "updatedAt">): Promise<void> {
    const id = itemId ?? `${orgId}_${crypto.randomUUID().slice(0, 12)}`;
    await setDoc(doc(db, "org_inventory", id), { ...item, orgId, updatedAt: serverTimestamp() });
}

export const deleteInventoryItem = (itemId: string) => deleteDoc(doc(db, "org_inventory", itemId));

export const listenPresence = (season: number, eventCode: string, cb: (rows: WithId<EventPresence>[]) => void) =>
    listen<EventPresence>(query(collection(db, "event_presence"), where("season", "==", season), where("eventCode", "==", eventCode)), cb, "presence");

export async function checkIn(p: Omit<EventPresence, "updatedAt">): Promise<void> {
    await setDoc(doc(db, "event_presence", `${p.season}_${p.eventCode}_${p.orgId}`), { ...p, updatedAt: serverTimestamp() });
}

export const listenRequests = (season: number, eventCode: string, cb: (rows: WithId<LendRequest>[]) => void) =>
    listen<LendRequest>(query(collection(db, "lend_requests"), where("season", "==", season), where("eventCode", "==", eventCode)), cb, "requests");

export async function createRequest(r: Omit<LendRequest, "status" | "createdAt">): Promise<void> {
    await addDoc(collection(db, "lend_requests"), { ...r, status: "open", createdAt: serverTimestamp() });
}

export const setRequestStatus = (id: string, status: RequestStatus) =>
    updateDoc(doc(db, "lend_requests", id), { status, updatedAt: serverTimestamp() });

export const listenMyLoans = (orgId: string, cb: (rows: WithId<Loan>[]) => void) =>
    listen<Loan>(query(collection(db, "loans"), where("parties", "array-contains", orgId)), cb, "loans");
