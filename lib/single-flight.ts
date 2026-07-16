/**
 * In-process single-flight (request coalescing / stampede guard).
 *
 * When multiple callers ask for the same key while a call is already in
 * flight, they all await the SAME underlying promise instead of each starting
 * their own work. This collapses a cache stampede (thundering herd): at an
 * event, dozens of scouts on the venue Wi-Fi load the same event page within
 * the same second when the Redis entry is cold or has just expired — without
 * this guard that is N identical calls to the rate-limited FIRST API, exactly
 * when the network is worst.
 *
 * Scope is the current server process (a module-level Map). It does NOT
 * coordinate across multiple server instances; that would require a Redis
 * lock, whose added latency and failure modes (lock expiry, deadlock) aren't
 * warranted here — in-process de-dup already collapses the dominant burst (one
 * instance serving a flood of concurrent requests).
 *
 * The in-flight entry is removed as soon as the promise settles — success OR
 * failure — so:
 *   - the Map only ever holds currently-running keys (bounded by concurrency,
 *     never grows unbounded — no leak),
 *   - a failure is NOT memoised: the next caller after it settles starts a
 *     fresh attempt rather than inheriting a transient error.
 */
const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` under single-flight de-duplication keyed by `key`. Concurrent
 * callers with the same key share one execution and one result (or rejection).
 */
export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const existing = inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;

    // The async IIFE begins executing `fn()` synchronously up to its first
    // await, so `fn` is invoked before we return. The `finally` (cleanup) can
    // only run on a later microtask — after `inFlight.set` below — so there is
    // no window where a concurrent caller in the same tick misses the entry.
    const p = (async () => {
        try {
            return await fn();
        } finally {
            inFlight.delete(key);
        }
    })();

    inFlight.set(key, p);
    return p;
}

/** Test/diagnostic only: number of currently in-flight keys. */
export function inFlightCount(): number {
    return inFlight.size;
}
