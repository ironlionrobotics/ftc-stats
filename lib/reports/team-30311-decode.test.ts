import { describe, it, expect } from "vitest";
import { TEAM_30311_DECODE } from "./team-30311-decode";

/**
 * i18n regression guard: every prose field this module produces (awards,
 * takeaways, learnings, sources, skill labels) must be a translation key +
 * params object, never a formed Spanish sentence. See
 * docs/architecture/i18n.md and lib/draft-odds.ts for the reference pattern.
 */
describe("TEAM_30311_DECODE — structured i18n shape", () => {
    it("skills carry a semantic key, not a hardcoded label", () => {
        for (const s of TEAM_30311_DECODE.skills) {
            expect(["tot", "auto", "dc", "eg"]).toContain(s.key);
            expect(s).not.toHaveProperty("label");
        }
    });

    it("event awards are key+params objects, never strings", () => {
        for (const e of TEAM_30311_DECODE.events) {
            for (const a of e.awards) {
                expect(typeof a).toBe("object");
                expect(typeof a.key).toBe("string");
                expect(["award", "winningAlliancePick", "playoffsPick"]).toContain(a.key);
            }
        }
        // At least one of every awards-bearing kind is exercised across the season.
        const keys = new Set(TEAM_30311_DECODE.events.flatMap(e => e.awards.map(a => a.key)));
        expect(keys.has("award")).toBe(true);
        expect(keys.has("winningAlliancePick")).toBe(true);
        expect(keys.has("playoffsPick")).toBe(true);
    });

    it("rookie-row awards are key+params objects, never strings", () => {
        const allRows = [
            ...TEAM_30311_DECODE.rookies.national.rows,
            ...TEAM_30311_DECODE.rookies.international.rows,
            TEAM_30311_DECODE.rookies.international.self,
        ];
        for (const row of allRows) {
            for (const a of row.awards) {
                expect(typeof a).toBe("object");
                expect(["award", "bare", "multiplier", "winningAlliance"]).toContain(a.key);
            }
        }
    });

    it("national headline is not baked into the data — resolved from a fixed translation key at the call site", () => {
        expect(TEAM_30311_DECODE.rookies.national).not.toHaveProperty("headline");
    });

    it("inspireCountries is structured country codes + counts, not a formatted sentence", () => {
        const { top, others } = TEAM_30311_DECODE.rookies.international.inspireCountries;
        expect(Array.isArray(top)).toBe(true);
        expect(Array.isArray(others)).toBe(true);
        for (const t of top) {
            expect(typeof t.code).toBe("string");
            expect(typeof t.count).toBe("number");
        }
        for (const code of others) {
            expect(typeof code).toBe("string");
        }
    });

    it("takeaways are key+params objects, one per curated headline", () => {
        expect(TEAM_30311_DECODE.takeaways.length).toBe(8);
        for (const tk of TEAM_30311_DECODE.takeaways) {
            expect(typeof tk).toBe("object");
            expect(typeof tk.key).toBe("string");
        }
        const keys = TEAM_30311_DECODE.takeaways.map(t => t.key);
        expect(new Set(keys).size).toBe(keys.length); // all distinct
    });

    it("learnings are key+params objects, params already rounded", () => {
        expect(TEAM_30311_DECODE.learnings.length).toBe(4);
        for (const l of TEAM_30311_DECODE.learnings) {
            expect(typeof l).toBe("object");
            expect(typeof l.key).toBe("string");
            expect(l).not.toHaveProperty("title");
            expect(l).not.toHaveProperty("body");
        }
    });

    it("sources are key+params objects carrying their own url", () => {
        for (const s of TEAM_30311_DECODE.sources) {
            expect(typeof s.key).toBe("string");
            expect(typeof s.url).toBe("string");
            expect(s).not.toHaveProperty("label");
        }
    });

    it("worldTop5 carries a country code, not a hardcoded country name", () => {
        for (const team of TEAM_30311_DECODE.worldTop5) {
            expect(typeof team.country).toBe("string");
            expect(team.country.length).toBeLessThanOrEqual(3); // ISO-ish code, not "Rumania"
        }
    });
});
