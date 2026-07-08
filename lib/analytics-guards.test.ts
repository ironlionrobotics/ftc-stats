import { describe, it, expect } from "vitest";
import { sanitizeEventCodes, MAX_ANALYSIS_EVENTS } from "./analytics-guards";

describe("sanitizeEventCodes (M5)", () => {
    it("returns [] for non-array input", () => {
        expect(sanitizeEventCodes(undefined)).toEqual([]);
        expect(sanitizeEventCodes("MXTOL")).toEqual([]);
        expect(sanitizeEventCodes(null)).toEqual([]);
    });

    it("trims and drops empty / non-string entries", () => {
        expect(sanitizeEventCodes(["  MXTOL  ", "", "   ", 42, null, "MXGDL"])).toEqual([
            "MXTOL",
            "MXGDL",
        ]);
    });

    it("de-dupes while preserving first-occurrence order", () => {
        expect(sanitizeEventCodes(["A", "B", "A", "C", "B"])).toEqual(["A", "B", "C"]);
    });

    it("caps the list at MAX_ANALYSIS_EVENTS", () => {
        const many = Array.from({ length: MAX_ANALYSIS_EVENTS + 20 }, (_, i) => `EV${i}`);
        const out = sanitizeEventCodes(many);
        expect(out).toHaveLength(MAX_ANALYSIS_EVENTS);
        expect(out[0]).toBe("EV0");
        expect(out[MAX_ANALYSIS_EVENTS - 1]).toBe(`EV${MAX_ANALYSIS_EVENTS - 1}`);
    });

    it("counts unique codes toward the cap, not raw length", () => {
        // 40 entries but only 3 distinct → all 3 kept.
        const dupes = Array.from({ length: 40 }, (_, i) => `E${i % 3}`);
        expect(sanitizeEventCodes(dupes)).toEqual(["E0", "E1", "E2"]);
    });
});
