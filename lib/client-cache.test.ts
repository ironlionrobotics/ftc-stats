import "fake-indexeddb/auto";
import { describe, it, expect, beforeEach } from "vitest";
import {
    cacheSet,
    cacheGet,
    cacheDelete,
    cachePruneOlderThan,
    __resetClientCacheForTests,
} from "./client-cache";

beforeEach(async () => {
    await __resetClientCacheForTests();
});

describe("client-cache", () => {
    it("round-trips a payload", async () => {
        await cacheSet("foo", { hello: "world" });
        const got = await cacheGet<{ hello: string }>("foo");
        expect(got?.payload).toEqual({ hello: "world" });
        expect(got?.stale).toBe(false);
    });

    it("returns null for missing keys", async () => {
        const got = await cacheGet("nope");
        expect(got).toBeNull();
    });

    it("marks entries as stale once ttl elapses", async () => {
        await cacheSet("k", { v: 1 }, 1); // 1ms TTL
        await new Promise(r => setTimeout(r, 5));
        const got = await cacheGet<{ v: number }>("k");
        expect(got?.stale).toBe(true);
        expect(got?.payload).toEqual({ v: 1 }); // still returns the payload
    });

    it("overwrites under the same key (put semantics)", async () => {
        await cacheSet("k", { v: 1 });
        await cacheSet("k", { v: 2 });
        const got = await cacheGet<{ v: number }>("k");
        expect(got?.payload).toEqual({ v: 2 });
    });

    it("cacheDelete removes the entry", async () => {
        await cacheSet("k", "stuff");
        await cacheDelete("k");
        expect(await cacheGet("k")).toBeNull();
    });

    it("cachePruneOlderThan removes entries past maxAge", async () => {
        await cacheSet("old", "x", 1000);
        await new Promise(r => setTimeout(r, 5));
        await cacheSet("new", "y", 1000);
        const pruned = await cachePruneOlderThan(3);  // anything > 3ms old
        expect(pruned).toBe(1);
        expect(await cacheGet("old")).toBeNull();
        expect(await cacheGet("new")).not.toBeNull();
    });
});
