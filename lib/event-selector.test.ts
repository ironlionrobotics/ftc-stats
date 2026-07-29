import { describe, it, expect } from "vitest";
import { projectAtEvent, estimateAlliances, strategyNote, EventProfile } from "./event-selector";

const profile = (over: Partial<EventProfile> = {}): EventProfile => ({
    season: 2025, code: "TEST", name: "Test Event", type: "Premier", region: "MX",
    teams: 32, oprMean: 70, oprSd: 25, oprTop: 150, sigma: 45, ...over,
});

describe("estimateAlliances", () => {
    it("maps field size to standard bracket sizes", () => {
        expect(estimateAlliances(16)).toBe(4);
        expect(estimateAlliances(32)).toBe(6);
        expect(estimateAlliances(60)).toBe(8);
    });
});

describe("projectAtEvent", () => {
    it("a team at the field mean sits mid-pack", () => {
        const p = projectAtEvent(70, profile());
        expect(p.percentile).toBeCloseTo(50, 0);
        expect(p.expectedSeed).toBeGreaterThan(12);
        expect(p.expectedSeed).toBeLessThan(20);
    });

    it("a dominant team projects as probable captain", () => {
        const p = projectAtEvent(140, profile());
        expect(p.verdict).toBe("capitan");
        expect(p.expectedSeed).toBeLessThanOrEqual(6);
    });

    it("a weak team projects out of playoffs", () => {
        const p = projectAtEvent(20, profile());
        expect(p.verdict).toBe("fuera");
        expect(p.percentile).toBeLessThan(15);
    });

    it("mirrors the #58 counterfactual: 80.8 at a Worlds-strength field is out", () => {
        // Worlds division shape: 56 teams, mean ~115, top ~238 (decisions #58).
        const p = projectAtEvent(80.8, profile({ teams: 56, oprMean: 115, oprSd: 45, oprTop: 238 }));
        expect(p.verdict).toBe("fuera");
        expect(p.percentile).toBeLessThan(35);
    });

    it("volatility classes follow the sigma thresholds", () => {
        expect(projectAtEvent(70, profile({ sigma: 33 })).volatility).toBe("ordenado");
        expect(projectAtEvent(70, profile({ sigma: 50 })).volatility).toBe("medio");
        expect(projectAtEvent(70, profile({ sigma: 92 })).volatility).toBe("caotico");
    });

    it("degenerate field (sd 0) doesn't blow up", () => {
        const p = projectAtEvent(70, profile({ oprSd: 0 }));
        expect(Number.isFinite(p.percentile)).toBe(true);
    });
});

describe("strategyNote", () => {
    it("returns a non-empty note for every verdict × volatility combo", () => {
        for (const opr of [20, 65, 90, 150]) {
            for (const sigma of [33, 50, 92]) {
                const note = strategyNote(projectAtEvent(opr, profile({ sigma })));
                expect(note.length).toBeGreaterThan(10);
            }
        }
    });
});
