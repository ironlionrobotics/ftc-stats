"use client";

import { useEffect, useState } from "react";
import { cacheGet, cacheSet } from "@/lib/client-cache";

/**
 * Stale-while-revalidate hook backed by IndexedDB. On mount:
 *   1. Reads the cache synchronously-ish (microtask), shows cached data immediately
 *      with `stale: true|false`.
 *   2. Calls the `fresh` fetcher (typically a server action) in parallel and,
 *      when it resolves, replaces cached data and persists to Dexie.
 *
 * Designed for server-action-backed data that's expensive to fetch on every
 * page mount (e.g., `getAggregatedStats`) so the user gets perceived-instant
 * loads on repeat visits + complete offline coverage.
 */
export function useCachedSWR<T>(
    key: string,
    fresh: () => Promise<T>,
    opts?: { ttlMs?: number; enabled?: boolean },
): {
    data: T | null;
    isLoading: boolean;
    isStale: boolean;
    error: Error | null;
    refresh: () => void;
} {
    const ttlMs = opts?.ttlMs ?? 60 * 60 * 1000; // 1h default
    const enabled = opts?.enabled ?? true;

    const [data, setData] = useState<T | null>(null);
    const [isStale, setIsStale] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<Error | null>(null);
    const [nonce, setNonce] = useState(0); // bumped by refresh()

    useEffect(() => {
        if (!enabled) {
            setIsLoading(false);
            return;
        }
        let cancelled = false;

        (async () => {
            // 1. Hydrate from cache (instant if anything's there).
            const cached = await cacheGet<T>(key);
            if (cancelled) return;
            if (cached) {
                setData(cached.payload);
                setIsStale(cached.stale);
            }

            // 2. Revalidate from source. If offline, this throws and we keep
            //    the cached payload visible (stale or not). If online but
            //    server is down, same behavior.
            try {
                const next = await fresh();
                if (cancelled) return;
                setData(next);
                setIsStale(false);
                setError(null);
                cacheSet(key, next, ttlMs);
            } catch (e) {
                if (cancelled) return;
                // Keep showing cached data; surface error to the UI so it can
                // show "offline / using cache" indicator if cached exists.
                setError(e instanceof Error ? e : new Error(String(e)));
            } finally {
                if (!cancelled) setIsLoading(false);
            }
        })();

        return () => { cancelled = true; };
    }, [key, enabled, nonce, ttlMs, fresh]);

    return { data, isLoading, isStale, error, refresh: () => setNonce(n => n + 1) };
}
