import { describe, it, expect } from "vitest";
import { applyClaim, releaseScout, matchCoverage, suggestions, claimDocId, type ScheduledMatch, type ClaimDoc } from "./scout-claims";

const m = (n: number, red: number[], blue: number[]): ScheduledMatch => ({ level: "QUALIFICATION", matchNumber: n, description: `Q${n}`, red, blue });

describe("scout claims (#103)", () => {
    it("a scout holds one robot per match; duplicates on a robot are allowed", () => {
        let c = applyClaim({}, 1, { alias: "A", scout: "s1", at: 1 });
        c = applyClaim(c, 1, { alias: "B", scout: "s2", at: 2 });
        expect(c["1"].map(x => x.scout)).toEqual(["s1", "s2"]);
        c = applyClaim(c, 2, { alias: "A", scout: "s1", at: 3 });
        expect(c["1"].map(x => x.scout)).toEqual(["s2"]);
        expect(c["2"].map(x => x.scout)).toEqual(["s1"]);
        expect(releaseScout(c, "s2")).toEqual({ "2": c["2"] });
    });

    it("coverage counts robots with a claim", () => {
        expect(matchCoverage(m(1, [1, 2], [3, 4]), { "1": [{ alias: "A", scout: "x", at: 0 }] })).toEqual({ covered: 1, total: 4 });
        expect(matchCoverage(m(1, [1, 2], [3, 4]), undefined)).toEqual({ covered: 0, total: 4 });
    });

    it("suggests the first free robot of matches the scout isn't in yet", () => {
        const matches = [m(1, [1, 2], [3, 4]), m(2, [5, 6], [7, 8]), m(3, [9, 10], [11, 12])];
        const docs: Record<string, ClaimDoc> = {
            [claimDocId(2026, "MXTLQ", "QUALIFICATION", 1)]: { season: 2026, eventCode: "MXTLQ", level: "QUALIFICATION", matchNumber: 1, claims: { "1": [{ alias: "A", scout: "me", at: 0 }] } },
            [claimDocId(2026, "MXTLQ", "QUALIFICATION", 2)]: { season: 2026, eventCode: "MXTLQ", level: "QUALIFICATION", matchNumber: 2, claims: { "5": [{ alias: "B", scout: "other", at: 0 }] } },
        };
        expect(suggestions(matches, docs, 2026, "MXTLQ", "me", 2).map(s => [s.match.matchNumber, s.team])).toEqual([[2, 6], [3, 9]]);
    });
});
