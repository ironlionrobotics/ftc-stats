import { describe, it, expect } from "vitest";
import { groupStats, totalsSeries } from "./practice-stats";
import type { PracticeRun } from "@/types/practice";

const run = (over: Partial<PracticeRun>): PracticeRun => ({
    id: "x", orgId: "1", season: 2026, definitionId: "d", createdBy: "u", runAtMs: 0, mode: "full", location: "workshop",
    robotVersion: "v1", drivers: "A+B", fields: {}, score: { auto: 0, teleop: 0, endgame: 0 }, total: 0, notes: "", ...over,
});

describe("practice stats (#105)", () => {
    const runs = [
        run({ runAtMs: 1, drivers: "A+B", total: 50, score: { auto: 20, teleop: 25, endgame: 5 } }),
        run({ runAtMs: 2, drivers: "A+B", total: 70, score: { auto: 23, teleop: 40, endgame: 7 } }),
        run({ runAtMs: 3, drivers: "C+D", mode: "auto", total: 23, score: { auto: 23, teleop: 0, endgame: 0 } }),
    ];
    it("groups by drivers with avg, best and σ; partial runs don't count on total", () => {
        const g = groupStats(runs, "drivers");
        const ab = g.find(x => x.key === "A+B")!;
        expect(ab.total).toEqual({ n: 2, avg: 60, best: 70, sd: 10 });
        const cd = g.find(x => x.key === "C+D")!;
        expect(cd.total.n).toBe(0);
        expect(cd.auto).toMatchObject({ n: 1, avg: 23 });
        expect(cd.teleop.n).toBe(0);
        expect(g[0].key).toBe("C+D"); // most recent first
    });
    it("trend series is chronological full matches only", () => {
        expect(totalsSeries([...runs].reverse()).map(p => p.total)).toEqual([50, 70]);
    });
});
