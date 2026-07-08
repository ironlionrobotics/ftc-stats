"use client";

import Dexie, { type Table } from "dexie";

/**
 * Client-side stale-while-revalidate cache.
 *
 * Purpose: keep the app useful offline. Server Components compute the home
 * stats, analytics dashboards, etc. — but if the venue Wi-Fi drops mid-event
 * and the user tries to reload, those server fetches fail and the page
 * renders empty. With this cache, the client hydrates from Dexie immediately
 * (instant first paint with last-known data) and revalidates in the
 * background when connectivity returns.
 *
 * Naming convention for keys: `{kind}:{season}:{params}` — e.g.
 *   "home:2025:default", "event:2025:MXTOL", "analytics:2025:MXTOL,MXMTY".
 * Keep keys stable so updates overwrite rather than accumulate.
 *
 * Storage: Dexie (IndexedDB) — distinct from `FTCStatsLocal` (scouting
 * pending) to avoid cross-purpose schema entanglement.
 */

interface CacheRow<T = unknown> {
    key: string;
    payload: T;
    savedAt: number;       // epoch ms
    /** Hint for "fresh enough"; caller can ignore. */
    ttlMs: number;
}

class ClientCacheDB extends Dexie {
    rows!: Table<CacheRow, string>;
    constructor() {
        super("FTCStatsClientCache");
        this.version(1).stores({
            rows: "key, savedAt",
        });
    }
}

let _db: ClientCacheDB | null = null;
function db(): ClientCacheDB {
    if (!_db) _db = new ClientCacheDB();
    return _db;
}

/** Writes payload under a cache key. Use put-style — last write wins. */
export async function cacheSet<T>(key: string, payload: T, ttlMs: number = 24 * 60 * 60 * 1000): Promise<void> {
    try {
        await db().rows.put({ key, payload: payload as unknown, savedAt: Date.now(), ttlMs });
    } catch (e) {
        // IndexedDB can fail in private mode on iOS — best-effort.
        console.warn("[client-cache] set failed:", e instanceof Error ? e.message : e);
    }
}

/**
 * Returns whatever's cached under `key`, plus a `stale` flag. Caller decides
 * whether to use stale data or wait for fresh. Common pattern:
 *
 *   const cached = await cacheGet<HomeData>("home:2025:default");
 *   if (cached) setData(cached.payload);  // instant first paint
 *   const fresh = await fetchOnServer();
 *   if (fresh) {
 *     setData(fresh);
 *     await cacheSet("home:2025:default", fresh);
 *   }
 */
export async function cacheGet<T>(key: string): Promise<{ payload: T; stale: boolean; savedAt: number } | null> {
    try {
        const row = await db().rows.get(key);
        if (!row) return null;
        const stale = Date.now() - row.savedAt > row.ttlMs;
        return { payload: row.payload as T, stale, savedAt: row.savedAt };
    } catch {
        return null;
    }
}

/** Removes a cache entry. */
export async function cacheDelete(key: string): Promise<void> {
    try {
        await db().rows.delete(key);
    } catch {
        // ignore
    }
}

/**
 * Prunes cache entries older than `maxAgeMs`. Safe to call any time;
 * fires-and-forgets so callers don't need to await.
 */
export async function cachePruneOlderThan(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
        const cutoff = Date.now() - maxAgeMs;
        const stale = await db().rows.where("savedAt").below(cutoff).toArray();
        if (stale.length === 0) return 0;
        await db().rows.bulkDelete(stale.map(r => r.key));
        return stale.length;
    } catch {
        return 0;
    }
}

/** Test/dev: clears all cache rows. */
export async function __resetClientCacheForTests(): Promise<void> {
    if (_db) {
        await _db.delete();
        _db = null;
    }
}
