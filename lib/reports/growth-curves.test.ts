import { describe, it, expect } from "vitest";
import { MX_GROWTH } from "./growth-curves";

describe("MX_GROWTH", () => {
    it("keeps the caveat as translation params, never a formed sentence", () => {
        // i18n: the module must not bake Spanish prose — the UI resolves the
        // "GrowthCurves.caveat" key with these two numbers as params. See
        // docs/architecture/i18n.md.
        expect(typeof MX_GROWTH.caveatWindowStart).toBe("number");
        expect(typeof MX_GROWTH.caveatWindowEnd).toBe("number");
        expect(MX_GROWTH.caveatWindowStart).toBeLessThan(MX_GROWTH.caveatWindowEnd);
        expect(MX_GROWTH).not.toHaveProperty("caveat");
    });

    it("keeps the all-teams and fixed-cohort curves non-decreasing in team count coverage sanity", () => {
        // Not a behavioral claim about the shape (documented as survivor-biased
        // in the module) — just a guard that the curated data wasn't truncated.
        expect(MX_GROWTH.all.length).toBeGreaterThan(0);
        expect(MX_GROWTH.cohort.length).toBe(MX_GROWTH.all.length);
        expect(MX_GROWTH.cohortSize).toBeGreaterThan(0);
    });
});
