import { describe, it, expect } from "vitest";
import { levelsMatch, computeStdDev } from "./scoring-utils";

describe("levelsMatch", () => {
    it("matches FTCMatch's all-caps tournamentLevel against a title-cased matchLevel", () => {
        expect(levelsMatch("QUALIFICATION", "Qualification")).toBe(true);
        expect(levelsMatch("PLAYOFF", "Playoff")).toBe(true);
    });

    it("matches regardless of the score entry's own casing", () => {
        expect(levelsMatch("QUALIFICATION", "QUALIFICATION")).toBe(true);
        expect(levelsMatch("QUALIFICATION", "qualification")).toBe(true);
    });

    it("does not cross-match qualification and playoff levels", () => {
        expect(levelsMatch("QUALIFICATION", "Playoff")).toBe(false);
        expect(levelsMatch("PLAYOFF", "Qualification")).toBe(false);
    });

    it("matches via a 4-char prefix so longer/renamed level strings still align", () => {
        // e.g. FIRST API sometimes returns "Qualifications" (plural) or similar variants.
        expect(levelsMatch("QUALIFICATION", "Qualifications")).toBe(true);
    });
});

describe("computeStdDev", () => {
    it("returns 0 for an empty scores list instead of NaN", () => {
        expect(computeStdDev([], 0)).toBe(0);
    });

    it("returns 0 for a single-element list (no variance)", () => {
        expect(computeStdDev([42], 42)).toBe(0);
    });

    it("computes the population standard deviation for a known distribution", () => {
        // Scores [2,4,4,4,5,5,7,9], mean=5 -> variance=4 -> stdDev=2
        const scores = [2, 4, 4, 4, 5, 5, 7, 9];
        const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
        expect(computeStdDev(scores, mean)).toBeCloseTo(2, 10);
    });
});
