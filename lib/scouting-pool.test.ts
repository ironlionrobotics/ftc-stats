import { describe, it, expect } from "vitest";
import { buildEventPool, assignAliases, contributionCount, shareableFieldIds, validateEntry, isPlausible, POOL_UNLOCK_MIN_ENTRIES } from "./scouting-pool";
import { FTC_BIOBUZZ_2026 } from "@/lib/games/ftc-biobuzz-2026";
import type { BaseMatchScouting } from "@/types/scouting";

const entry = (over: Partial<BaseMatchScouting> & Record<string, unknown>): BaseMatchScouting => ({
    teamNumber: 30311, eventCode: "MXTLQ", matchNumber: 1, season: 2026, program: "FTC",
    orgId: "111", scoutId: "s1", scoutName: "Ana", scouterId: "s1", scouterName: "Ana",
    notes: "private note", timestamp: { seconds: 1, nanoseconds: 0 },
    ...over,
} as BaseMatchScouting);

describe("scouting pool (#102)", () => {
    it("aliases are stable and sequential", () => {
        const a = assignAliases({}, ["111", "222"]);
        expect(a).toEqual({ "111": "A", "222": "B" });
        expect(assignAliases(a, ["333", "111"])).toEqual({ "111": "A", "222": "B", "333": "C" });
        const many = assignAliases({}, Array.from({ length: 27 }, (_, i) => String(i)));
        expect(many["26"]).toBe("A2");
    });

    it("counts only the org's objective captures", () => {
        const es = [entry({}), entry({ scoutingMode: "super" }), entry({ orgId: "222" })];
        expect(contributionCount(es, "111")).toBe(1);
        expect(POOL_UNLOCK_MIN_ENTRIES).toBeGreaterThan(0);
    });

    it("shares only objective field kinds", () => {
        const ids = shareableFieldIds(FTC_BIOBUZZ_2026);
        expect(ids).toContain("autoHiveTips");
        expect(ids).not.toContain("driverSkill"); // stars
        expect(ids).not.toContain("notes");
    });

    it("never leaks private fields, ids or names", () => {
        const pool = buildEventPool([
            entry({ autoHiveTips: 1, driverSkill: 5, autoLeave: true }),
            entry({ orgId: "222", scoutId: "s2", scouterId: "s2", autoHiveTips: 2, autoLeave: true }),
            entry({ scoutingMode: "super", driverSkill: 1, notes: "secret" }),
        ], FTC_BIOBUZZ_2026, {}, { "111": "A", "222": "B" });
        const json = JSON.stringify(pool);
        for (const leak of ["private note", "secret", "Ana", "s1", "s2", "\"111\"", "\"222\"", "driverSkill"]) {
            expect(json).not.toContain(leak);
        }
        expect(pool[0].official?.sources).toEqual(["A", "B"]);
        expect(pool[0].official?.fields.autoHiveTips).toMatchObject({ kind: "numeric", mean: 1.5, n: 1 });
    });

    it("keeps practice apart from official matches", () => {
        const pool = buildEventPool([
            entry({ teleopGardenElements: 10 }),
            entry({ tournamentLevel: "PRACTICE", teleopGardenElements: 2 }),
            entry({ tournamentLevel: "PRACTICE_FIELD", matchNumber: 0, teleopGardenElements: 4 }),
            entry({ tournamentLevel: "PRACTICE_FIELD", matchNumber: 0, teleopGardenElements: 6 }),
        ], FTC_BIOBUZZ_2026, {}, { "111": "A" });
        expect(pool[0].official?.fields.teleopGardenElements).toMatchObject({ mean: 10, n: 1 });
        expect(pool[0].practice?.observations).toBe(3); // 1 practice match + 2 field sessions
        expect(pool[0].practice?.fields.teleopGardenElements).toMatchObject({ mean: 4, n: 3 });
    });

    it("prices the robot with the season score()", () => {
        const pool = buildEventPool([entry({ autoLeave: true, autoHiveTips: 1, teleopPark: true })], FTC_BIOBUZZ_2026, {}, { "111": "A" });
        expect(pool[0].official?.score).toEqual({ auto: 23, teleop: 0, endgame: 5 });
    });

    it("filters by team when asked", () => {
        const pool = buildEventPool([entry({}), entry({ teamNumber: 12345 })], FTC_BIOBUZZ_2026, {}, { "111": "A" }, 12345);
        expect(pool.map(p => p.teamNumber)).toEqual([12345]);
    });
});

describe("pool hostile input (#102 review)", () => {
    const ok = { teamNumber: 30311, matchNumber: 2, season: 2026, orgId: "111", scoutId: "s1", eventCode: "MXTLQ", program: "FTC" };
    it("accepts a well-formed capture and strips everything private", () => {
        const e = validateEntry({ ...ok, autoHiveTips: 1, autoLeave: true, notes: "secret", scoutName: "Ana" }, FTC_BIOBUZZ_2026, "d1");
        expect(e).not.toBeNull();
        expect(JSON.stringify(e)).not.toContain("secret");
        expect(JSON.stringify(e)).not.toContain("Ana");
        expect(e?.id).toBe("d1");
    });
    it("rejects out-of-range counters, non-boolean flags, unknown enums and confidences", () => {
        expect(validateEntry({ ...ok, autoHiveTips: 1e12 }, FTC_BIOBUZZ_2026)).toBeNull();
        expect(validateEntry({ ...ok, autoHiveTips: 1.5 }, FTC_BIOBUZZ_2026)).toBeNull();
        expect(validateEntry({ ...ok, autoLeave: "yes" }, FTC_BIOBUZZ_2026)).toBeNull();
        expect(validateEntry({ ...ok, defense: "you are bad" }, FTC_BIOBUZZ_2026)).toBeNull();
        expect(validateEntry({ ...ok, confidence: "x" }, FTC_BIOBUZZ_2026)).toBeNull();
        expect(validateEntry({ ...ok, orgId: null }, FTC_BIOBUZZ_2026)).toBeNull();
        expect(validateEntry({ ...ok, season: 2025 }, FTC_BIOBUZZ_2026)).toBeNull();
        expect(validateEntry({ ...ok, tournamentLevel: "FINAL" }, FTC_BIOBUZZ_2026)).toBeNull();
        expect(validateEntry({ ...ok, matchNumber: 0 }, FTC_BIOBUZZ_2026)).toBeNull();
        expect(validateEntry({ ...ok, matchNumber: 0, tournamentLevel: "PRACTICE_FIELD" }, FTC_BIOBUZZ_2026)).not.toBeNull();
    });
    it("plausibility follows FIRST's roster and qualification schedule once published", () => {
        const e = validateEntry({ ...ok }, FTC_BIOBUZZ_2026)!;
        expect(isPlausible(e, { teams: new Set(), quals: new Map() })).toBe(true);
        expect(isPlausible(e, { teams: new Set([1]), quals: new Map() })).toBe(false);
        expect(isPlausible(e, { teams: new Set([30311]), quals: new Map([[2, new Set([30311])]]) })).toBe(true);
        expect(isPlausible(e, { teams: new Set([30311]), quals: new Map([[2, new Set([5])]]) })).toBe(false);
    });
    it("duplicates don't pad the contribution count", () => {
        const dup = [validateEntry({ ...ok }, FTC_BIOBUZZ_2026, "a")!, validateEntry({ ...ok }, FTC_BIOBUZZ_2026, "b")!];
        expect(contributionCount(dup, "111")).toBe(1);
    });
});
