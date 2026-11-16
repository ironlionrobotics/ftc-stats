import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FTCMatch } from "@/types/scouting";
import table from "@/lib/data/starting-history-2026.json";
import { HISTORY_COEFS } from "./starting-points";

// Memory-only server cache and a fake FIRST API (no network in unit tests).
// The superadmin flag (#119) reads Firestore; tests run with it on.
vi.mock("@/lib/app-config", () => ({ flagOn: async () => true }));
vi.mock("@/lib/server-cache", () => {
    const m = new Map<string, unknown>();
    return { serverCache: { get: async (k: string) => m.get(k) ?? null, set: async (k: string, v: unknown) => { m.set(k, v); return true; } } };
});
const api = vi.hoisted(() => ({ fail: false, slow: false }));
const q = (n: number, red: number[], blue: number[], rs: number, bs: number) => ({
    matchNumber: n, tournamentLevel: "QUALIFICATION", postResultTime: "x", scoreRedFinal: rs, scoreBlueFinal: bs, scoreRedFoul: 0, scoreBlueFoul: 0,
    teams: [...red.map((t, i) => ({ teamNumber: t, station: `Red${i + 1}`, dq: false, onField: true })), ...blue.map((t, i) => ({ teamNumber: t, station: `Blue${i + 1}`, dq: false, onField: true }))],
}) as unknown as FTCMatch;
vi.mock("@/lib/ftc-api", () => ({
    fetchTeamEvents: async (_s: number, t: number) => {
        if (api.fail) throw new Error("down");
        if (api.slow) await new Promise(r => setTimeout(r, 4000));
        return t === 999 ? [] : [{ code: "EARLY", dateStart: "2026-11-01T00:00:00", dateEnd: "2026-11-01T00:00:00" }, { code: "SAMEDAY", dateStart: "2026-11-27T00:00:00", dateEnd: "2026-11-27T00:00:00" }, { code: "LATER", dateStart: "2026-12-05T00:00:00", dateEnd: "2026-12-05T00:00:00" }];
    },
    fetchMatches: async (_s: number, code: string) => code === "EARLY"
        ? [q(1, [101], [102], 90, 30), q(2, [101], [103], 80, 40), q(3, [102], [103], 50, 45), q(4, [101], [102], 85, 35), q(5, [103], [101], 30, 95), q(6, [102], [103], 55, 50)]
        : Array.from({ length: 8 }, (_, i) => q(i + 1, [102], i % 2 ? [101] : [103], 500, 0)), // same day / after: must be ignored
}));

describe("history table (#117)", () => {
    it("is complete and was built with the current coefficients", () => {
        expect(Object.keys(table.z).length).toBeGreaterThan(8000);
        expect(table.rookieAbove).toBeGreaterThan(25000);
        // Rebuild with scripts/build-history-table.ts whenever HISTORY_COEFS change.
        expect(table.coefs).toBe(HISTORY_COEFS.join(","));
    });
});

describe("getStartingPoints (#117)", () => {
    beforeEach(() => { delete process.env.STARTING_POINTS; api.fail = false; api.slow = false; vi.resetModules(); });
    const load = async () => (await import("./starting-points-server")).getStartingPoints;

    it("in-season prior from earlier events only, history for everyone", async () => {
        const sp = (await (await load())(2026, "2026-11-27T00:00:00", [101, 102, 103, 999], { eventCode: "EVA" }))!;
        expect(sp.inSeason[101]).toBeGreaterThan(sp.inSeason[102]); // 101 dominated EARLY; SAMEDAY/LATER (102's blowouts) don't count
        expect(sp.inSeason[999]).toBeUndefined();
        expect(Object.keys(sp.history).map(Number).sort((a, b) => a - b)).toEqual([101, 102, 103, 999]);
        expect(sp.mu0Hint).toBeGreaterThan(0);
    });

    it("FIRST down or slow: history only, never an error", async () => {
        api.fail = true;
        const sp = (await (await load())(2026, "2026-11-27", [101, 102], { eventCode: "EVB" }))!;
        expect(sp.inSeason).toEqual({});
        expect(Object.keys(sp.history)).toHaveLength(2);
    });

    it("over the time budget: history only", async () => {
        api.slow = true;
        const sp = (await (await load())(2026, "2026-11-28", [101, 102], { eventCode: "EVC" }))!;
        expect(sp.inSeason).toEqual({});
    }, 6000);

    it("bulk callers read the per-event cache and never fetch", async () => {
        const get = await load();
        api.fail = true; // any FIRST call would fail
        expect((await get(2026, "2026-11-27", [101, 102], { eventCode: "EVD", fetch: false }))!.inSeason).toEqual({});
        api.fail = false;
        await get(2026, "2026-11-27", [101, 102, 103], { eventCode: "EVD" }); // the event page warms it
        api.fail = true;
        const bulk = (await get(2026, "2026-11-27", [101, 102], { eventCode: "EVD", fetch: false }))!;
        expect(bulk.inSeason[101]).toBeGreaterThan(bulk.inSeason[102]);
    });

    it("null without a table and without in-season data, without teams, or with the kill switch", async () => {
        const get = await load();
        expect(await get(2019, null, [100])).toBeNull();
        expect(await get(2026, "2026-11-27", [])).toBeNull();
        process.env.STARTING_POINTS = "off";
        expect(await get(2026, "2026-11-27", [100, 200])).toBeNull();
    });
});
