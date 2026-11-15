import { describe, it, expect } from "vitest";
import { chooseActiveEvent, isEventLive } from "./active-event-context";
import type { FTCEvent } from "@/types/scouting";

const ev = (code: string, start: string, end = start): FTCEvent => ({ code, name: code, dateStart: start, dateEnd: end } as FTCEvent);
const NOW = Date.parse("2026-11-27T18:00:00Z");
const MXMOQ = ev("MXMOQ", "2026-11-27", "2026-11-28");
const MXTLQ = ev("MXTLQ", "2026-11-27", "2026-11-28");
const OLD = ev("MXOLD", "2026-10-10", "2026-10-11");
const NEXT = ev("MXNEXT", "2026-12-11", "2026-12-12");
const options = [OLD, MXMOQ, MXTLQ, NEXT];

describe("chooseActiveEvent (#116)", () => {
    it("an explicit current choice wins", () => {
        expect(chooseActiveEvent({ options, requested: "MXTLQ", teamEvents: [MXMOQ], now: NOW })?.code).toBe("MXTLQ");
    });
    it("a stale choice yields to the followed team's live event", () => {
        expect(chooseActiveEvent({ options, requested: "MXOLD", teamEvents: [MXMOQ], now: NOW })?.code).toBe("MXMOQ");
    });
    it("a stale choice is kept when nothing is current", () => {
        const later = Date.parse("2027-03-01T00:00:00Z");
        expect(chooseActiveEvent({ options, requested: "MXOLD", teamEvents: [], now: later })?.code).toBe("MXOLD");
    });
    it("without a choice, the followed team's event beats the region's", () => {
        // Region pick among simultaneous live events is by start then code; the team decides.
        expect(chooseActiveEvent({ options, requested: null, teamEvents: [MXMOQ], now: NOW })?.code).toBe("MXMOQ");
    });
    it("the team's next event when it isn't live yet", () => {
        const before = Date.parse("2026-11-20T12:00:00Z");
        expect(chooseActiveEvent({ options, requested: null, teamEvents: [OLD, NEXT], now: before })?.code).toBe("MXNEXT");
    });
    it("no team: the region's live event", () => {
        expect(["MXMOQ", "MXTLQ"]).toContain(chooseActiveEvent({ options, requested: null, teamEvents: [], now: NOW })?.code);
    });
    it("an unknown requested code falls through", () => {
        expect(chooseActiveEvent({ options, requested: "ZZZZ", teamEvents: [MXMOQ], now: NOW })?.code).toBe("MXMOQ");
    });
    it("isEventLive covers the whole last day", () => {
        expect(isEventLive(MXMOQ, Date.parse("2026-11-29T05:00:00Z"))).toBe(true);
        expect(isEventLive(MXMOQ, Date.parse("2026-11-30T12:00:00Z"))).toBe(false);
    });
});

describe("chooseActiveEvent — review fixes", () => {
    const today = Date.parse("2026-11-14T18:00:00Z");
    it("a past remembered choice is kept while nothing is LIVE (an upcoming event doesn't count)", () => {
        expect(chooseActiveEvent({ options, requested: "MXOLD", teamEvents: [], now: today })?.code).toBe("MXOLD");
    });
    it("a shared ?event= link always wins, even when stale and something is live", () => {
        expect(chooseActiveEvent({ options, requested: null, forced: "MXOLD", teamEvents: [MXMOQ], now: NOW })?.code).toBe("MXOLD");
    });
    it("an unknown ?event= falls back to the remembered choice", () => {
        expect(chooseActiveEvent({ options, requested: "MXTLQ", forced: "ZZZZ", teamEvents: [MXMOQ], now: NOW })?.code).toBe("MXTLQ");
    });
});

describe("summarizeEvent", () => {
    it("empty dateEnd falls back to dateStart and phases are computed", async () => {
        const { summarizeEvent } = await import("./active-event-context");
        const s = summarizeEvent({ code: "X", name: "X", dateStart: "2026-12-11", dateEnd: "" } as FTCEvent, Date.parse("2026-11-14T00:00:00Z"));
        expect(s.dateEnd).toBe("2026-12-11");
        expect(s.phase).toBe("upcoming");
    });
});
