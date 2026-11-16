import { describe, it, expect, beforeEach } from "vitest";
import { getStartingPoints } from "./starting-points-server";
import table from "@/lib/data/starting-history-2026.json";
import { HISTORY_COEFS } from "./starting-points";

describe("history table (#117)", () => {
    it("is complete and was built with the current coefficients", () => {
        expect(Object.keys(table.z).length).toBeGreaterThan(8000);
        expect(table.rookieAbove).toBeGreaterThan(25000);
        // Rebuild with scripts/build-history-table.ts whenever HISTORY_COEFS change.
        expect(table.coefs).toBe(HISTORY_COEFS.join(","));
    });
});

describe("getStartingPoints (#117)", () => {
    beforeEach(() => { delete process.env.STARTING_POINTS; });

    it("history for every robot of the event, centered on them", async () => {
        const known = Object.keys(table.z).slice(0, 3).map(Number);
        const rookie = table.rookieAbove + 9000;
        const sp = await getStartingPoints(2026, "2026-11-27T00:00:00", [...known, rookie]);
        expect(sp).not.toBeNull();
        expect(Object.keys(sp!.history).map(Number).sort((a, b) => a - b)).toEqual([...known, rookie].sort((a, b) => a - b));
        const vals = Object.values(sp!.history);
        expect(vals.reduce((a, b) => a + b, 0) / vals.length).toBeCloseTo(0, 2);
        expect(sp!.inSeason).toEqual({});
        expect(sp!.mu0Hint).toBeGreaterThan(0);
    });

    it("a team with a strong history starts above a rookie", async () => {
        const [best] = Object.entries(table.z).sort((a, b) => b[1] - a[1])[0];
        const sp = await getStartingPoints(2026, "2026-11-27", [Number(best), table.rookieAbove + 9000]);
        expect(sp!.history[Number(best)]).toBeGreaterThan(sp!.history[table.rookieAbove + 9000]);
    });

    it("null without a table for the season, without inputs, or with the kill switch", async () => {
        expect(await getStartingPoints(2019, "2019-11-27", [100])).toBeNull();
        expect(await getStartingPoints(2026, "2026-11-27", [])).toBeNull();
        process.env.STARTING_POINTS = "off";
        expect(await getStartingPoints(2026, "2026-11-27", [100, 200])).toBeNull();
    });
});
