import { describe, it, expect } from "vitest";
import { parseFollows, serializeFollows, toggleFollow, mergeFollows, normalizeFollows, MAX_FOLLOWS, EMPTY_FOLLOWS, sameFollows } from "./follows";

describe("follows (#110)", () => {
    it("round-trips through the compact cookie", () => {
        const f = { events: ["USMIRHQ", "MXTLQ"], teams: [30311, 12887] };
        expect(parseFollows(serializeFollows(f))).toEqual(f);
    });

    it("drops garbage and duplicates, normalizes codes", () => {
        expect(parseFollows("not json")).toEqual(EMPTY_FOLLOWS);
        expect(parseFollows(undefined)).toEqual(EMPTY_FOLLOWS);
        expect(normalizeFollows({ events: ["mxtlq", "MXTLQ", "<script>", 3], teams: [30311, "30311", -1, 1e9, "x"] }))
            .toEqual({ events: ["MXTLQ"], teams: [30311] });
    });

    it("toggles and respects the cap", () => {
        let f = EMPTY_FOLLOWS;
        f = toggleFollow(f, "event", "mxtlq").follows;
        expect(f.events).toEqual(["MXTLQ"]);
        f = toggleFollow(f, "event", "MXTLQ").follows;
        expect(f.events).toEqual([]);
        const full = { events: [], teams: Array.from({ length: MAX_FOLLOWS }, (_, i) => 100 + i) };
        const r = toggleFollow(full, "team", 30311);
        expect(r.capped).toBe(true);
        expect(r.follows).toBe(full);
        expect(toggleFollow(full, "team", 100).follows.teams).not.toContain(100); // removing still works when full
    });

    it("merges device and account lists without exceeding the cap", () => {
        const a = { events: ["A1"], teams: [1, 2] }, b = { events: ["A1", "B2"], teams: [2, 3] };
        expect(mergeFollows(a, b)).toEqual({ events: ["A1", "B2"], teams: [1, 2, 3] });
        expect(sameFollows(mergeFollows(a, b), { events: ["B2", "A1"], teams: [3, 2, 1] })).toBe(true);
    });
});
