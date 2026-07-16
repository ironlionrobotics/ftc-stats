import { describe, it, expect, vi } from "vitest";
import { singleFlight, inFlightCount } from "./single-flight";

// M1: single-flight collapses a cache stampede. Concurrent callers for the
// same key must share ONE execution; the map must clean up on settle so it
// neither leaks nor memoises failures. Each test uses a UNIQUE key so the
// module-level map can't bleed state across tests.

function deferred<T>() {
    let resolve!: (v: T) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

describe("singleFlight", () => {
    it("collapses concurrent calls for the same key into a single execution", async () => {
        const d = deferred<number>();
        const fn = vi.fn(() => d.promise);

        const a = singleFlight("k-dedup", fn);
        const b = singleFlight("k-dedup", fn);
        const c = singleFlight("k-dedup", fn);

        // The whole point: three callers, ONE underlying execution. Without the
        // single-flight guard this would be 3 — i.e. 3 hits to the FIRST API.
        expect(fn).toHaveBeenCalledTimes(1);
        expect(inFlightCount()).toBe(1);

        d.resolve(42);
        expect(await a).toBe(42);
        expect(await b).toBe(42);
        expect(await c).toBe(42);

        expect(fn).toHaveBeenCalledTimes(1);
        // Entry cleaned up after settle — no leak.
        expect(inFlightCount()).toBe(0);
    });

    it("runs independently for different keys", async () => {
        const fn = vi.fn((k: string) => Promise.resolve(k));

        const [a, b] = await Promise.all([
            singleFlight("k-iso-1", () => fn("k-iso-1")),
            singleFlight("k-iso-2", () => fn("k-iso-2")),
        ]);

        expect(a).toBe("k-iso-1");
        expect(b).toBe("k-iso-2");
        expect(fn).toHaveBeenCalledTimes(2);
        expect(inFlightCount()).toBe(0);
    });

    it("does not memoise: a call after the previous one settled re-runs fn", async () => {
        const fn = vi
            .fn<() => Promise<string>>()
            .mockResolvedValueOnce("first")
            .mockResolvedValueOnce("second");

        expect(await singleFlight("k-nomemo", fn)).toBe("first");
        // Prior flight already settled and was removed, so this starts fresh.
        expect(await singleFlight("k-nomemo", fn)).toBe("second");
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it("shares a rejection with concurrent callers and cleans up so the next call retries", async () => {
        const d = deferred<number>();
        const fn = vi
            .fn<() => Promise<number>>()
            .mockImplementationOnce(() => d.promise) // first attempt: rejects
            .mockResolvedValueOnce(99); // retry: succeeds

        const a = singleFlight("k-reject", fn);
        const b = singleFlight("k-reject", fn);
        expect(fn).toHaveBeenCalledTimes(1);

        d.reject(new Error("boom"));
        await expect(a).rejects.toThrow("boom");
        await expect(b).rejects.toThrow("boom");

        // A failure is NOT memoised — the entry is gone, so a fresh call retries.
        expect(inFlightCount()).toBe(0);
        expect(await singleFlight("k-reject", fn)).toBe(99);
        expect(fn).toHaveBeenCalledTimes(2);
    });
});
