import { describe, it, expect } from "vitest";
import {
    TieredCache,
    CircuitBreaker,
    MemoryLru,
    docIdFor,
    encodePayload,
    decodePayload,
    withTimeout,
    TimeoutError,
    isInfraFailure,
    normalizeTtl,
    type RemoteStore,
    type RemoteEntry,
} from "./tiered-cache";

/** In-memory RemoteStore with call counters and failure injection. */
class FakeStore implements RemoteStore {
    docs = new Map<string, RemoteEntry & { key: string }>();
    counters = new Map<string, { count: number; expiresAtMs: number }>();
    calls = { get: 0, set: 0, del: 0, acquire: 0, incr: 0 };
    mode: "ok" | "fail" | "hang" | "invalid" = "ok";

    private gate<T>(fn: () => T): Promise<T> {
        if (this.mode === "fail") return Promise.reject(new Error("getaddrinfo ENOTFOUND"));
        if (this.mode === "invalid") return Promise.reject(Object.assign(new Error("INVALID_ARGUMENT"), { code: 3 }));
        if (this.mode === "hang") return new Promise<T>(() => {});
        return Promise.resolve(fn());
    }
    get(id: string) {
        this.calls.get++;
        return this.gate(() => this.docs.get(id) ?? null);
    }
    set(id: string, key: string, data: Uint8Array, expiresAtMs: number) {
        this.calls.set++;
        return this.gate(() => void this.docs.set(id, { key, data, expiresAtMs }));
    }
    del(id: string) {
        this.calls.del++;
        return this.gate(() => void this.docs.delete(id));
    }
    acquire(id: string, _key: string, expiresAtMs: number, nowMs: number) {
        this.calls.acquire++;
        return this.gate(() => {
            const c = this.counters.get(id);
            if (c && c.expiresAtMs > nowMs) return false;
            this.counters.set(id, { count: 1, expiresAtMs });
            return true;
        });
    }
    incrWindow(id: string, _key: string, windowMs: number, nowMs: number) {
        this.calls.incr++;
        return this.gate(() => {
            const c = this.counters.get(id);
            if (!c || c.expiresAtMs <= nowMs) {
                this.counters.set(id, { count: 1, expiresAtMs: nowMs + windowMs });
                return 1;
            }
            c.count++;
            return c.count;
        });
    }
}

function setup(opts: { remote?: FakeStore | null; memoryMaxChars?: number; maxRemoteBytes?: number; memoryTtlCapMs?: number } = {}) {
    let t = 1_000_000;
    const remote = opts.remote === undefined ? new FakeStore() : opts.remote;
    const logs: string[] = [];
    const cache = new TieredCache({
        remote,
        now: () => t,
        readTimeoutMs: 20,
        writeTimeoutMs: 20,
        cooldownMs: 30_000,
        memoryMaxChars: opts.memoryMaxChars,
        maxRemoteBytes: opts.maxRemoteBytes,
        memoryTtlCapMs: opts.memoryTtlCapMs,
        log: m => logs.push(m),
    });
    return { cache, remote, logs, advance: (ms: number) => { t += ms; } };
}

describe("payload encoding", () => {
    it("round-trips JSON through gzip and compresses repetitive API data", async () => {
        const json = JSON.stringify(Array.from({ length: 500 }, (_, i) => ({ teamNumber: i, nameShort: "Iron Lion", city: "Monterrey" })));
        const data = await encodePayload(json);
        expect(decodePayload(data)).toBe(json);
        expect(data.byteLength).toBeLessThan(json.length / 5);
    });
    it("doc ids are fixed-length hex for any key, including hostile ones", () => {
        for (const k of ["ftcapi:team/30311", "x".repeat(5000), "__x__", ".", "..", "\uD800", 'agg:{"region":"MX"}']) {
            expect(docIdFor(k)).toMatch(/^[0-9a-f]{64}$/);
        }
        expect(docIdFor("a")).not.toBe(docIdFor("b"));
    });
    it("normalizeTtl rejects NaN, non-positive and caps absurd values", () => {
        expect(normalizeTtl(NaN)).toBeNull();
        expect(normalizeTtl(0)).toBeNull();
        expect(normalizeTtl(-5)).toBeNull();
        expect(normalizeTtl(1e15)).toBe(365 * 24 * 3600);
        expect(normalizeTtl(60)).toBe(60);
    });
});

describe("TieredCache — happy path", () => {
    it("serves a write from memory without touching the remote", async () => {
        const { cache, remote } = setup();
        expect(await cache.set("k", { a: 1 }, 60)).toBe(true);
        expect(await cache.get("k")).toEqual({ a: 1 });
        expect(remote!.calls.get).toBe(0);
    });

    it("falls through to the remote on a cold instance and warms memory", async () => {
        const store = new FakeStore();
        const a = setup({ remote: store });
        await a.cache.set("k", [1, 2, 3], 60);
        const b = setup({ remote: store }); // another instance, empty memory
        expect(await b.cache.get("k")).toEqual([1, 2, 3]);
        expect(await b.cache.get("k")).toEqual([1, 2, 3]);
        expect(store.calls.get).toBe(1);
    });

    it("returns an isolated copy: mutating a result cannot corrupt the cache", async () => {
        const { cache } = setup();
        await cache.set("k", [3, 1, 2], 60);
        const first = await cache.get<number[]>("k");
        first!.sort();
        first!.push(99);
        expect(await cache.get("k")).toEqual([3, 1, 2]);
    });

    it("expires by TTL in memory and ignores expired remote docs (TTL GC lags)", async () => {
        const { cache, remote, advance } = setup();
        await cache.set("k", "v", 60);
        advance(61_000);
        expect(await cache.get("k")).toBeNull();
        expect(remote!.calls.get).toBe(1); // went to remote, found it expired
    });

    it("del clears memory and remote", async () => {
        const { cache, remote } = setup();
        await cache.set("k", 1, 60);
        await cache.del("k");
        expect(await cache.get("k")).toBeNull();
        expect(remote!.docs.size).toBe(0);
    });

    it("keeps oversized payloads in memory only", async () => {
        const { cache, remote, logs } = setup({ maxRemoteBytes: 10 });
        expect(await cache.set("big", "x".repeat(1000), 60)).toBe(false);
        expect(remote!.calls.set).toBe(0);
        expect(await cache.get("big")).toBe("x".repeat(1000));
        expect(logs[0]).toMatch(/over the remote limit/);
    });

    it("memory-only mode (remote null) still caches and reports not persisted", async () => {
        const { cache } = setup({ remote: null });
        expect(cache.remoteEnabled).toBe(false);
        expect(await cache.set("k", 1, 60)).toBe(false);
        expect(await cache.get("k")).toBe(1);
        expect(await cache.acquire("lock", 60)).toBe(true);
        expect(await cache.acquire("lock", 60)).toBe(false); // per-instance fallback lock
        expect(await cache.incrWindow("rl", 60)).toBe(1);
        expect(await cache.incrWindow("rl", 60)).toBe(2);
    });

    it("invalid TTLs are ignored instead of throwing", async () => {
        const { cache, remote } = setup();
        expect(await cache.set("k", 1, NaN)).toBe(false);
        expect(await cache.set("k", 1, -1)).toBe(false);
        expect(remote!.calls.set).toBe(0);
        expect(await cache.acquire("lock", NaN)).toBe(true);
    });

    it("never throws on unserializable values or corrupt remote JSON", async () => {
        const { cache, remote } = setup();
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(await cache.set("c", cyclic, 60)).toBe(false);
        remote!.docs.set(docIdFor("bad"), { key: "bad", data: await encodePayload("{not json"), expiresAtMs: Infinity });
        expect(await cache.get("bad")).toBeNull();
        remote!.docs.set(docIdFor("gz"), { key: "gz", data: new Uint8Array([1, 2, 3]), expiresAtMs: Infinity });
        expect(await cache.get("gz")).toBeNull();
    });

    it("coalesces concurrent cold reads of the same key into one remote call", async () => {
        const store = new FakeStore();
        await setup({ remote: store }).cache.set("k", { v: 1 }, 60);
        const cold = setup({ remote: store });
        const before = store.calls.get;
        const results = await Promise.all(Array.from({ length: 50 }, () => cold.cache.get("k")));
        expect(results.every(r => (r as { v: number }).v === 1)).toBe(true);
        expect(store.calls.get - before).toBe(1);
    });

    it("caps memory lifetime so instances converge after another instance rewrites a key", async () => {
        const store = new FakeStore();
        const a = setup({ remote: store, memoryTtlCapMs: 300_000 });
        const b = setup({ remote: store, memoryTtlCapMs: 300_000 });
        await a.cache.set("model", { w: 1 }, 30 * 24 * 3600);
        expect(await b.cache.get("model")).toEqual({ w: 1 });
        await a.cache.set("model", { w: 2 }, 30 * 24 * 3600);
        expect(await b.cache.get("model")).toEqual({ w: 1 }); // still in b's memory
        b.advance(300_001);
        expect(await b.cache.get("model")).toEqual({ w: 2 });
    });
});

describe("TieredCache — a dead remote costs one timeout per cooldown", () => {
    it("after one failure, further calls skip the remote until the cooldown ends", async () => {
        const { cache, remote, logs, advance } = setup();
        remote!.mode = "fail";
        expect(await cache.get("a")).toBeNull();
        expect(await cache.get("b")).toBeNull();
        expect(await cache.set("c", 1, 60)).toBe(false);
        expect(remote!.calls.get + remote!.calls.set).toBe(1);
        expect(logs).toHaveLength(1); // logged once, not per call

        advance(30_001);
        remote!.mode = "ok";
        expect(await cache.set("d", 2, 60)).toBe(true); // half-open probe succeeds → closed
        expect(cache.breaker.isOpen).toBe(false);
    });

    it("a hanging remote is cut by the timeout and treated as a failure", async () => {
        const { cache, remote } = setup();
        remote!.mode = "hang";
        const t0 = Date.now();
        expect(await cache.get("k")).toBeNull();
        expect(Date.now() - t0).toBeLessThan(1000);
        expect(cache.breaker.isOpen).toBe(true);
    });

    it("memory hits keep working while the remote is down", async () => {
        const { cache, remote } = setup();
        await cache.set("k", "warm", 60);
        remote!.mode = "fail";
        expect(await cache.get("k")).toBe("warm");
    });

    it("rate limiting degrades to per-instance counting, never unlimited", async () => {
        const { cache, remote } = setup();
        remote!.mode = "fail";
        expect(await cache.acquire("lock", 60)).toBe(true);
        expect(await cache.acquire("lock", 60)).toBe(false);
        expect(await cache.incrWindow("rl", 60)).toBe(1);
        expect(await cache.incrWindow("rl", 60)).toBe(2);
    });

    it("counters have their own breaker: a counter outage doesn't disable the cache", async () => {
        const { cache, remote } = setup();
        remote!.mode = "hang";
        await cache.incrWindow("rl", 60);
        expect(cache.counterBreaker.isOpen).toBe(true);
        expect(cache.breaker.isOpen).toBe(false);
        remote!.mode = "ok";
        expect(await cache.set("k", 1, 60)).toBe(true);
    });

    it("a deterministic per-call error does not open the breaker", async () => {
        const { cache, remote } = setup();
        remote!.mode = "invalid";
        expect(await cache.get("poison")).toBeNull();
        expect(cache.breaker.isOpen).toBe(false);
        remote!.mode = "ok";
        expect(await cache.set("k", 1, 60)).toBe(true);
    });
});

describe("isInfraFailure", () => {
    it("classifies timeouts/network as infra and argument errors as deterministic", () => {
        expect(isInfraFailure(new TimeoutError(1))).toBe(true);
        expect(isInfraFailure(new Error("ECONNRESET"))).toBe(true);
        expect(isInfraFailure(Object.assign(new Error("x"), { code: 14 }))).toBe(true); // UNAVAILABLE
        expect(isInfraFailure(Object.assign(new Error("x"), { code: 3 }))).toBe(false); // INVALID_ARGUMENT
        expect(isInfraFailure(new RangeError("bad timestamp"))).toBe(false);
    });
});

describe("TieredCache — counters and locks", () => {
    it("acquire is an expiring lock", async () => {
        const { cache, advance } = setup();
        expect(await cache.acquire("discord:30311", 60)).toBe(true);
        expect(await cache.acquire("discord:30311", 60)).toBe(false);
        advance(60_001);
        expect(await cache.acquire("discord:30311", 60)).toBe(true);
    });

    it("incrWindow counts within a fixed window and resets after it", async () => {
        const { cache, advance } = setup();
        expect(await cache.incrWindow("ai:u1", 60)).toBe(1);
        expect(await cache.incrWindow("ai:u1", 60)).toBe(2);
        advance(60_001);
        expect(await cache.incrWindow("ai:u1", 60)).toBe(1);
    });
});

describe("CircuitBreaker", () => {
    it("lets exactly one probe through when half-open", () => {
        let t = 0;
        const b = new CircuitBreaker(100, () => t);
        const e0 = b.tryAcquire()!;
        expect(e0).not.toBeNull();
        expect(b.failure(e0)).toBe(true);
        expect(b.tryAcquire()).toBeNull();
        t = 101;
        const probe = b.tryAcquire()!;
        expect(probe).not.toBeNull();
        expect(b.tryAcquire()).toBeNull(); // probe in flight
        expect(b.failure(probe)).toBe(false); // re-open is not a new outage
        t = 202;
        const probe2 = b.tryAcquire()!;
        b.success(probe2);
        expect(b.tryAcquire()).not.toBeNull();
        expect(b.tryAcquire()).not.toBeNull();
    });

    it("ignores a late success from before the outage", () => {
        let t = 0;
        const b = new CircuitBreaker(100, () => t);
        const slow = b.tryAcquire()!; // started while closed
        const fast = b.tryAcquire()!;
        b.failure(fast); // outage detected
        b.success(slow); // slow call returns late
        expect(b.isOpen).toBe(true);
        t = 50;
        expect(b.tryAcquire()).toBeNull();
    });
});

describe("MemoryLru", () => {
    it("evicts least-recently-used entries beyond the char budget", () => {
        const m = new MemoryLru(10);
        m.put("a", "aaaa", Infinity);
        m.put("b", "bbbb", Infinity);
        m.get("a", 0); // a is now most recent
        m.put("c", "cccc", Infinity);
        expect(m.get("b", 0)).toBeNull();
        expect(m.get("a", 0)).toBe("aaaa");
        expect(m.get("c", 0)).toBe("cccc");
    });
    it("never stores a single entry larger than the budget", () => {
        const m = new MemoryLru(3);
        m.put("a", "aaaa", Infinity);
        expect(m.size).toBe(0);
    });
});

describe("withTimeout", () => {
    it("rejects with TimeoutError", async () => {
        await expect(withTimeout(new Promise(() => {}), 5)).rejects.toBeInstanceOf(TimeoutError);
    });
    it("passes through a fast result", async () => {
        await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
    });
});
