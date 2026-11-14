import { describe, it, expect } from "vitest";
import { liveAndUpcoming } from "./event-windows";
import type { FTCEvent } from "@/types/scouting";

const ev = (code: string, start: string, end: string, extra: Partial<FTCEvent> = {}): FTCEvent =>
    ({ code, name: `${code} Qualifier`, dateStart: `${start}T00:00:00`, dateEnd: `${end}T00:00:00`, country: code.startsWith("MX") ? "Mexico" : "USA", typeName: "Qualifier", ...extra });

const NOW = Date.parse("2026-11-14T20:00:00Z");
const EVENTS = [
    ev("USMIRHQ", "2026-11-13", "2026-11-14"),
    ev("MXTLQ", "2026-11-27", "2026-11-28"),
    ev("MXMOQ", "2026-11-20", "2026-11-21"),
    ev("MXOLD", "2026-10-01", "2026-10-02"),
    ev("MXKICK", "2026-11-15", "2026-11-15", { name: "Mexico Kickoff", typeName: "Kickoff" }),
    ev("USFAR", "2026-12-20", "2026-12-20"),
];

describe("liveAndUpcoming (#110)", () => {
    it("lists live first, then upcoming within the horizon, region-filtered", () => {
        const all = liveAndUpcoming(EVENTS, NOW, { region: "all" });
        expect(all.map(e => e.code)).toEqual(["USMIRHQ", "MXMOQ"]);
        expect(all[0].phase).toBe("live");
        expect(all[1]).toMatchObject({ phase: "upcoming", inDays: 6 });
        expect(liveAndUpcoming(EVENTS, NOW, { region: "MX", horizonDays: 14 }).map(e => e.code)).toEqual(["MXMOQ", "MXTLQ"]);
    });

    it("skips kickoffs, past and far events; search is accent/case-insensitive", () => {
        const codes = liveAndUpcoming(EVENTS, NOW, { region: "all", horizonDays: 60 }).map(e => e.code);
        expect(codes).not.toContain("MXKICK");
        expect(codes).not.toContain("MXOLD");
        expect(codes).toContain("USFAR");
        expect(liveAndUpcoming(EVENTS, NOW, { region: "all", query: "rhq" }).map(e => e.code)).toEqual(["USMIRHQ"]);
    });

    it("always shows followed events even outside the region filter", () => {
        expect(liveAndUpcoming(EVENTS, NOW, { region: "MX", always: ["USMIRHQ"] }).map(e => e.code)).toEqual(["USMIRHQ", "MXMOQ"]);
    });
});
