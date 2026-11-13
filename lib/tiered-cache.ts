import { createHash } from "node:crypto";
import { gzip, gunzipSync } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);

/**
 * Two-tier server cache: per-instance memory (L1) in front of a shared remote
 * store (L2, Firestore in production — see lib/server-cache.ts).
 *
 * Why this exists (decision #89): the previous Upstash Redis free database was
 * deleted after 14 days of inactivity, and the Upstash client retried every
 * failed call ~5 times (~4 s each), so a dead cache made pages take 48–65 s.
 * The contract here is the opposite: **a broken remote costs at most one
 * timeout per cooldown window per instance**, then the app runs from memory,
 * and **no cache method ever throws**.
 *
 *  - L1 stores the JSON *string*, not the object, so callers that mutate what
 *    they get back (sort in place, push) can never corrupt the cache — the
 *    same isolation Redis gave by deserializing on every read. L1 lifetime is
 *    capped (MEMORY_TTL_CAP) so instances re-read L2 and converge after
 *    another instance rewrites a long-lived key (e.g. a retrained RP model).
 *  - Doc IDs are sha256(key): fixed length and charset, so user-controlled
 *    key parts (URL filters, event codes) can't produce an invalid ID.
 *  - Only infrastructure failures (timeouts, network, auth, quota) open the
 *    breaker; a deterministic error tied to one call (bad argument) does not,
 *    so a crafted request can't switch the shared cache off for everyone.
 *  - L2 payloads are gzipped JSON (Firestore documents cap at 1 MiB; JSON from
 *    the FIRST API compresses ~5–10×). Oversized payloads stay L1-only.
 *  - Expiry is checked on read (Firestore TTL deletion lags up to ~24 h; the
 *    TTL policy is only garbage collection).
 *  - Counters/locks (rate limits) have their own breaker and fall back to a
 *    per-instance counter, so a cache hiccup never removes the rate limit.
 *
 * Pure module (no Firebase import) so it is unit-testable with a fake store.
 */

export interface RemoteEntry {
    data: Uint8Array;
    expiresAtMs: number;
}

export interface RemoteStore {
    get(id: string): Promise<RemoteEntry | null>;
    set(id: string, key: string, data: Uint8Array, expiresAtMs: number): Promise<void>;
    del(id: string): Promise<void>;
    /** Atomically take a lock that expires; false if a live one exists. */
    acquire(id: string, key: string, expiresAtMs: number, nowMs: number): Promise<boolean>;
    /** Atomic fixed-window counter; returns the count after incrementing. */
    incrWindow(id: string, key: string, windowMs: number, nowMs: number): Promise<number>;
}

export interface TieredCacheOptions {
    /** Remote store, or null to run memory-only (tests, kill switch). */
    remote: RemoteStore | null;
    now?: () => number;
    /** Budget for one remote read; a cold Firestore channel can take ~1 s. */
    readTimeoutMs?: number;
    writeTimeoutMs?: number;
    /** How long to skip the remote after an infrastructure failure. */
    cooldownMs?: number;
    /** Approximate L1 budget in UTF-16 chars of JSON. */
    memoryMaxChars?: number;
    /** Upper bound on how long an entry lives in L1 before re-reading L2. */
    memoryTtlCapMs?: number;
    /** Largest compressed payload written to the remote. */
    maxRemoteBytes?: number;
    log?: (msg: string) => void;
}

/** Longest accepted TTL (1 year) — keeps Timestamp math finite and sane. */
const MAX_TTL_SECONDS = 365 * 24 * 3600;

/** Valid TTL in seconds, or null for NaN / non-positive / absurd values. */
export function normalizeTtl(ttlSeconds: number): number | null {
    if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) return null;
    return Math.min(ttlSeconds, MAX_TTL_SECONDS);
}

/** Fixed-length, Firestore-safe document ID for any key. */
export function docIdFor(key: string): string {
    return createHash("sha256").update(key, "utf8").digest("hex");
}

export async function encodePayload(json: string): Promise<Uint8Array> {
    return gzipAsync(Buffer.from(json, "utf8"));
}

export function decodePayload(data: Uint8Array): string {
    return gunzipSync(data).toString("utf8");
}

export class TimeoutError extends Error {
    constructor(ms: number) {
        super(`timed out after ${ms} ms`);
        this.name = "TimeoutError";
    }
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new TimeoutError(ms)), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

/**
 * gRPC status codes that describe the call itself, not the backend's health
 * (INVALID_ARGUMENT, NOT_FOUND, ALREADY_EXISTS, FAILED_PRECONDITION,
 * OUT_OF_RANGE). Plus local programming/argument errors.
 */
const DETERMINISTIC_GRPC_CODES = new Set([3, 5, 6, 9, 11]);

export function isInfraFailure(e: unknown): boolean {
    if (e instanceof TimeoutError) return true;
    if (e instanceof RangeError || e instanceof TypeError || e instanceof URIError || e instanceof SyntaxError) return false;
    const code = (e as { code?: unknown } | null)?.code;
    if (typeof code === "number" && DETERMINISTIC_GRPC_CODES.has(code)) return false;
    return true;
}

/**
 * Closed → (failure) → open for `cooldownMs` → half-open: exactly one probe
 * goes through; its outcome closes or re-opens the circuit. Every call gets
 * the epoch it started in; results from an older epoch are ignored, so a slow
 * success that began before an outage can't close the circuit mid-outage.
 */
export class CircuitBreaker {
    private openUntil = 0;
    private probing = false;
    private epoch = 0;

    constructor(private readonly cooldownMs: number, private readonly now: () => number) {}

    /** Epoch token if the caller may hit the remote now, else null. */
    tryAcquire(): number | null {
        if (this.openUntil === 0) return this.epoch;
        if (this.now() < this.openUntil || this.probing) return null;
        this.probing = true;
        return this.epoch;
    }

    /** True while calls would be skipped (cheap check, consumes nothing). */
    get blocked(): boolean {
        return this.openUntil !== 0 && (this.now() < this.openUntil || this.probing);
    }

    success(epoch: number): void {
        if (epoch !== this.epoch) return;
        this.openUntil = 0;
        this.probing = false;
    }

    /** Returns true when this failure opened the circuit (a new outage). */
    failure(epoch: number): boolean {
        if (epoch !== this.epoch) return false;
        const wasClosed = this.openUntil === 0;
        this.epoch++;
        this.openUntil = this.now() + this.cooldownMs;
        this.probing = false;
        return wasClosed;
    }

    /** A call finished with a non-infra error: health unknown, just release a probe. */
    release(epoch: number): void {
        if (epoch === this.epoch) this.probing = false;
    }

    get isOpen(): boolean {
        return this.openUntil !== 0;
    }
}

/** Insertion-ordered Map as LRU, bounded by total JSON length. */
export class MemoryLru {
    private readonly map = new Map<string, { json: string; expiresAtMs: number }>();
    private total = 0;

    constructor(private readonly maxChars: number) {}

    get(key: string, nowMs: number): string | null {
        const e = this.map.get(key);
        if (!e) return null;
        if (e.expiresAtMs <= nowMs) {
            this.delete(key);
            return null;
        }
        this.map.delete(key);
        this.map.set(key, e);
        return e.json;
    }

    put(key: string, json: string, expiresAtMs: number): void {
        this.delete(key);
        if (json.length > this.maxChars) return;
        this.map.set(key, { json, expiresAtMs });
        this.total += json.length;
        for (const [k] of this.map) {
            if (this.total <= this.maxChars) break;
            this.delete(k);
        }
    }

    delete(key: string): void {
        const e = this.map.get(key);
        if (!e) return;
        this.total -= e.json.length;
        this.map.delete(key);
    }

    get size(): number {
        return this.map.size;
    }
}

function parseOrNull<T>(json: string): T | null {
    try {
        return JSON.parse(json) as T;
    } catch {
        return null;
    }
}

export class TieredCache {
    private readonly remote: RemoteStore | null;
    private readonly now: () => number;
    private readonly readTimeoutMs: number;
    private readonly writeTimeoutMs: number;
    private readonly maxRemoteBytes: number;
    private readonly memoryTtlCapMs: number;
    private readonly log: (msg: string) => void;
    private readonly memory: MemoryLru;
    private readonly inflightReads = new Map<string, Promise<string | null>>();
    private readonly localCounters = new Map<string, { count: number; expiresAtMs: number }>();
    /** Breaker for cache reads/writes. */
    readonly breaker: CircuitBreaker;
    /** Separate breaker for counters/locks (transactions contend differently). */
    readonly counterBreaker: CircuitBreaker;

    constructor(opts: TieredCacheOptions) {
        this.remote = opts.remote;
        this.now = opts.now ?? Date.now;
        this.readTimeoutMs = opts.readTimeoutMs ?? 2500;
        this.writeTimeoutMs = opts.writeTimeoutMs ?? 4000;
        this.maxRemoteBytes = opts.maxRemoteBytes ?? 1_000_000;
        this.memoryTtlCapMs = opts.memoryTtlCapMs ?? 300_000;
        this.log = opts.log ?? (() => {});
        this.memory = new MemoryLru(opts.memoryMaxChars ?? 64 * 1024 * 1024);
        this.breaker = new CircuitBreaker(opts.cooldownMs ?? 30_000, this.now);
        this.counterBreaker = new CircuitBreaker(opts.cooldownMs ?? 30_000, this.now);
    }

    /**
     * Runs a remote call under a breaker + timeout. Never throws:
     * `undefined` = skipped or failed.
     */
    private async guarded<T>(
        breaker: CircuitBreaker,
        op: string,
        key: string,
        ms: number,
        fn: (r: RemoteStore) => Promise<T>,
    ): Promise<T | undefined> {
        if (!this.remote) return undefined;
        const epoch = breaker.tryAcquire();
        if (epoch === null) return undefined;
        try {
            const out = await withTimeout(fn(this.remote), ms);
            breaker.success(epoch);
            return out;
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (!isInfraFailure(e)) {
                breaker.release(epoch);
                this.log(`[cache] remote ${op} rejected for ${key.slice(0, 120)}: ${msg}`);
            } else if (breaker.failure(epoch)) {
                this.log(`[cache] remote ${op} failed for ${key.slice(0, 120)} — skipping remote for a while: ${msg}`);
            }
            return undefined;
        }
    }

    private memoryExpiry(expiresAtMs: number): number {
        return Math.min(expiresAtMs, this.now() + this.memoryTtlCapMs);
    }

    async get<T>(key: string): Promise<T | null> {
        const hot = this.memory.get(key, this.now());
        if (hot !== null) return parseOrNull<T>(hot);
        const json = await this.readRemote(key);
        return json === null ? null : parseOrNull<T>(json);
    }

    /** L2 read with per-key coalescing: concurrent cold reads share one round-trip. */
    private readRemote(key: string): Promise<string | null> {
        const pending = this.inflightReads.get(key);
        if (pending) return pending;
        const id = docIdFor(key);
        const p = (async () => {
            const entry = await this.guarded(this.breaker, "read", key, this.readTimeoutMs, r => r.get(id));
            if (!entry || entry.expiresAtMs <= this.now()) return null;
            let json: string;
            try {
                json = decodePayload(entry.data);
            } catch {
                return null; // corrupt payload behaves as a miss; the next set overwrites it
            }
            if (parseOrNull(json) === null && json !== "null") return null;
            this.memory.put(key, json, this.memoryExpiry(entry.expiresAtMs));
            return json;
        })().finally(() => this.inflightReads.delete(key));
        this.inflightReads.set(key, p);
        return p;
    }

    /** Returns true when the value was persisted to the shared remote store. */
    async set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
        const ttl = normalizeTtl(ttlSeconds);
        if (ttl === null) return false;
        let json: string | undefined;
        try {
            json = JSON.stringify(value);
        } catch {
            return false;
        }
        if (json === undefined) return false;
        const expiresAtMs = this.now() + ttl * 1000;
        this.memory.put(key, json, this.memoryExpiry(expiresAtMs));
        if (!this.remote || this.breaker.blocked) return false;

        let data: Uint8Array;
        try {
            data = await encodePayload(json);
        } catch {
            return false;
        }
        if (data.byteLength > this.maxRemoteBytes) {
            this.log(`[cache] ${key.slice(0, 120)} is ${data.byteLength} B compressed — over the remote limit, kept in memory only`);
            return false;
        }
        const id = docIdFor(key);
        const ok = await this.guarded(this.breaker, "write", key, this.writeTimeoutMs, r =>
            r.set(id, key, data, expiresAtMs).then(() => true));
        return ok === true;
    }

    /** Drops the key from this instance's memory only (no remote call). */
    forgetLocal(key: string): void {
        this.memory.delete(key);
    }

    async del(key: string): Promise<void> {
        this.memory.delete(key);
        const id = docIdFor(key);
        await this.guarded(this.breaker, "delete", key, this.writeTimeoutMs, r => r.del(id));
    }

    /**
     * Expiring lock (SET NX EX). Falls back to a per-instance lock when the
     * remote is unavailable, so the limit degrades to per-instance instead of
     * disappearing.
     */
    async acquire(key: string, ttlSeconds: number): Promise<boolean> {
        const ttl = normalizeTtl(ttlSeconds) ?? 1;
        const now = this.now();
        const id = docIdFor(key);
        const got = await this.guarded(this.counterBreaker, "acquire", key, this.writeTimeoutMs, r =>
            r.acquire(id, key, now + ttl * 1000, now));
        if (got !== undefined) return got;
        return this.localCount(key, ttl, now) === 1;
    }

    /**
     * Fixed-window counter (INCR + EXPIRE). Falls back to a per-instance
     * counter when the remote is unavailable — never "unlimited".
     */
    async incrWindow(key: string, windowSeconds: number): Promise<number> {
        const win = normalizeTtl(windowSeconds) ?? 1;
        const now = this.now();
        const id = docIdFor(key);
        const n = await this.guarded(this.counterBreaker, "incr", key, this.writeTimeoutMs, r =>
            r.incrWindow(id, key, win * 1000, now));
        return n ?? this.localCount(key, win, now);
    }

    private localCount(key: string, windowSeconds: number, now: number): number {
        const c = this.localCounters.get(key);
        if (!c || c.expiresAtMs <= now) {
            if (this.localCounters.size > 10_000) {
                for (const [k, v] of this.localCounters) if (v.expiresAtMs <= now) this.localCounters.delete(k);
            }
            this.localCounters.set(key, { count: 1, expiresAtMs: now + windowSeconds * 1000 });
            return 1;
        }
        c.count++;
        return c.count;
    }

    get remoteEnabled(): boolean {
        return this.remote !== null;
    }
}
