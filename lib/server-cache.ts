import "server-only";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import { TieredCache, type RemoteStore } from "@/lib/tiered-cache";

/**
 * Shared server cache backed by Firestore (replaced Upstash Redis, decision #89).
 *
 * Collections (Admin SDK only — firestore.rules denies all client access):
 *  - `server_cache/{sha256(key)}`: { k, v: gzip(JSON) bytes, size, expiresAt }
 *  - `server_counters/{sha256(key)}`: { k, count, expiresAt } for rate limits / locks
 *
 * Both have a TTL policy on `expiresAt` (firestore.indexes.json fieldOverrides)
 * so expired docs are garbage-collected; reads still check expiry themselves.
 *
 * Kill switch: SERVER_CACHE=off runs memory-only (per instance; rate limits
 * become per-instance counters).
 */

const CACHE = "server_cache";
const COUNTERS = "server_counters";

function toMillis(v: unknown): number {
    return v instanceof Timestamp ? v.toMillis() : 0;
}

function firestoreStore(): RemoteStore {
    const col = (name: string) => getAdminDb().collection(name);
    return {
        async get(id) {
            const snap = await col(CACHE).doc(id).get();
            if (!snap.exists) return null;
            const d = snap.data()!;
            if (!(d.v instanceof Uint8Array)) return null;
            return { data: d.v, expiresAtMs: toMillis(d.expiresAt) };
        },
        async set(id, key, data, expiresAtMs) {
            await col(CACHE).doc(id).set({
                k: key,
                v: Buffer.from(data),
                size: data.byteLength,
                expiresAt: Timestamp.fromMillis(expiresAtMs),
            });
        },
        async del(id) {
            await col(CACHE).doc(id).delete();
        },
        async acquire(id, key, expiresAtMs, nowMs) {
            const ref = col(COUNTERS).doc(id);
            return getAdminDb().runTransaction(async tx => {
                const snap = await tx.get(ref);
                if (snap.exists && toMillis(snap.data()!.expiresAt) > nowMs) return false;
                tx.set(ref, { k: key, count: 1, expiresAt: Timestamp.fromMillis(expiresAtMs) });
                return true;
            });
        },
        async incrWindow(id, key, windowMs, nowMs) {
            const ref = col(COUNTERS).doc(id);
            return getAdminDb().runTransaction(async tx => {
                const snap = await tx.get(ref);
                const d = snap.exists ? snap.data()! : undefined;
                if (!d || toMillis(d.expiresAt) <= nowMs) {
                    tx.set(ref, { k: key, count: 1, expiresAt: Timestamp.fromMillis(nowMs + windowMs) });
                    return 1;
                }
                const count = (typeof d.count === "number" ? d.count : 0) + 1;
                tx.update(ref, { count });
                return count;
            });
        },
    };
}

const remoteDisabled = process.env.NODE_ENV === "test" || process.env.SERVER_CACHE === "off";

export const serverCache = new TieredCache({
    remote: remoteDisabled ? null : firestoreStore(),
    log: msg => console.warn(msg),
});
