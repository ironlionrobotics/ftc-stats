import { describe, it, expect } from "vitest";
import { programCapabilities } from "./program";

describe("programCapabilities", () => {
    it("FTC: 2-robot alliances, single final, /event", () => {
        expect(programCapabilities("FTC")).toEqual({ allianceSize: 2, fieldSize: 2, finalsBestOf: 1, eventBase: "/event" });
    });
    it("FRC: 3-robot alliances all fielded, best-of-3 finals, /frc/event", () => {
        expect(programCapabilities("FRC")).toEqual({ allianceSize: 3, fieldSize: 3, finalsBestOf: 3, eventBase: "/frc/event" });
    });
});
