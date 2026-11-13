import { describe, it, expect } from "vitest";
import { classifyBiobuzzArchetype } from "./biobuzz-archetype";

describe("classifyBiobuzzArchetype", () => {
    it("Unknown without entries", () => expect(classifyBiobuzzArchetype([])).toBe("Unknown"));
    it("Tipper by tips", () =>
        expect(classifyBiobuzzArchetype([{ autoHiveTips: 1, teleopHiveTips: 1 }])).toBe("Tipper"));
    it("Tipper by dominant cell launches", () =>
        expect(classifyBiobuzzArchetype([{ teleopCellLaunches: 5, teleopGardenElements: 1 }])).toBe("Tipper"));
    it("Gardener", () =>
        expect(classifyBiobuzzArchetype([{ teleopGardenElements: 3, flowerElementsPlaced: 1 }])).toBe("Gardener"));
    it("Florist", () =>
        expect(classifyBiobuzzArchetype([{ teleopGardenElements: 1, flowerElementsPlaced: 3 }])).toBe("Florist"));
    it("Balanced when nothing dominates", () =>
        expect(classifyBiobuzzArchetype([{ teleopGardenElements: 2, flowerElementsPlaced: 2 }])).toBe("Balanced"));
});
