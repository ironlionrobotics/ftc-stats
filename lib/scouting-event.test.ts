import { describe, it, expect } from "vitest";
import { scoutingEventOptions, pickScoutingEvent } from "./scouting-event";
import type { FTCEvent } from "@/types/scouting";

const ev = (code: string, dateStart: string, dateEnd = dateStart, extra: Partial<FTCEvent> = {}): FTCEvent => ({
    code, name: code, dateStart, dateEnd, country: "Mexico", typeName: "Qualifier", ...extra,
});

const SEASON = [
    ev("MXBJKO", "2026-09-12", "2026-09-12", { typeName: "Kickoff", name: "Kickoff CDMX" }),
    ev("MXTLQ", "2026-11-27", "2026-11-28"),
    ev("MXMOQ", "2026-11-27", "2026-11-28"),
    ev("MXCUQ", "2026-12-09", "2026-12-10"),
    ev("USCAQ", "2026-11-20", "2026-11-20", { country: "USA", countryCode: "US" }),
];
const at = (iso: string) => Date.parse(iso);

describe("scoutingEventOptions", () => {
    it("keeps competitive MX events, oldest first, without kickoffs or other countries", () => {
        expect(scoutingEventOptions(SEASON, "MX").map(e => e.code)).toEqual(["MXMOQ", "MXTLQ", "MXCUQ"]);
    });
    it("keeps an explicitly requested event outside the region", () => {
        expect(scoutingEventOptions(SEASON, "MX", "USCAQ").map(e => e.code)).toContain("USCAQ");
    });
});

describe("pickScoutingEvent", () => {
    const opts = scoutingEventOptions(SEASON, "MX");
    it("honours a requested event that is an option", () => {
        expect(pickScoutingEvent(opts, "MXTLQ", at("2026-11-13T12:00:00Z"))?.code).toBe("MXTLQ");
    });
    it("ignores an unknown requested code (stale cookie, other season)", () => {
        expect(pickScoutingEvent(opts, "MXTOL", at("2026-12-01T12:00:00Z"))?.code).toBe("MXCUQ");
    });
    it("picks the next upcoming event before the season starts", () => {
        expect(pickScoutingEvent(opts, null, at("2026-11-13T12:00:00Z"))?.code).toBe("MXMOQ");
    });
    it("picks the live event during it (from the day before to two days after)", () => {
        expect(pickScoutingEvent(opts, null, at("2026-12-08T09:00:00Z"))?.code).toBe("MXCUQ");
        expect(pickScoutingEvent(opts, null, at("2026-12-12T09:00:00Z"))?.code).toBe("MXCUQ");
    });
    it("falls back to the latest past event after the season", () => {
        expect(pickScoutingEvent(opts, null, at("2027-03-01T00:00:00Z"))?.code).toBe("MXCUQ");
    });
    it("returns null with no events", () => {
        expect(pickScoutingEvent([], null, at("2026-11-13T00:00:00Z"))).toBeNull();
    });
});
