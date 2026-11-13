import { describe, it, expect } from "vitest";
import { contextOf, isOfficialContext, contextHasMatchNumber, contextWeight, entryObservedMatch, isScoutingContext } from "./scouting-context";

describe("scouting context (#101)", () => {
    it("reads legacy entries without the field as qualification", () => {
        expect(contextOf({})).toBe("QUALIFICATION");
        expect(contextOf({ tournamentLevel: null })).toBe("QUALIFICATION");
        expect(contextOf({ tournamentLevel: "bogus" })).toBe("QUALIFICATION");
        expect(contextOf({ tournamentLevel: "PRACTICE_FIELD" })).toBe("PRACTICE_FIELD");
    });

    it("only qualification and playoff are official", () => {
        expect(isOfficialContext("QUALIFICATION")).toBe(true);
        expect(isOfficialContext("PLAYOFF")).toBe(true);
        expect(isOfficialContext("PRACTICE")).toBe(false);
        expect(isOfficialContext("PRACTICE_FIELD")).toBe(false);
    });

    it("practice weighs half and the practice field has no match number", () => {
        expect(contextWeight("QUALIFICATION")).toBe(1);
        expect(contextWeight("PRACTICE")).toBe(0.5);
        expect(contextHasMatchNumber("PRACTICE_FIELD")).toBe(false);
        expect(contextHasMatchNumber("PRACTICE")).toBe(true);
    });

    it("matches an entry to an official match only at the same level", () => {
        const qual3 = { matchNumber: 3, tournamentLevel: "QUALIFICATION" };
        const playoff3 = { matchNumber: 3, tournamentLevel: "PLAYOFF" };
        expect(entryObservedMatch({ matchNumber: 3 }, qual3)).toBe(true); // legacy = qual
        expect(entryObservedMatch({ matchNumber: 3 }, playoff3)).toBe(false);
        expect(entryObservedMatch({ matchNumber: 3, tournamentLevel: "PLAYOFF" }, playoff3)).toBe(true);
        expect(entryObservedMatch({ matchNumber: 3, tournamentLevel: "PRACTICE" }, qual3)).toBe(false);
        expect(entryObservedMatch({ matchNumber: 4, tournamentLevel: "QUALIFICATION" }, qual3)).toBe(false);
    });

    it("validates values", () => {
        expect(isScoutingContext("PLAYOFF")).toBe(true);
        expect(isScoutingContext("FINAL")).toBe(false);
    });
});
