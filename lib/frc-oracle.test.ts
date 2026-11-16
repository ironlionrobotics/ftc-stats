import { describe, it, expect } from "vitest";
import { alliancesFromOfficial, bestFieldedLineup, generateAlliances, runMonteCarloSimulation, seededRandom } from "./alliance-utils";
import type { TeamEvolution } from "@/app/actions/analytics";

const team = (n: number, opr: number, rank = n) => ({ teamNumber: n, opr, autoOPR: 0, sigma: 10, events: [{ rank }] }) as unknown as TeamEvolution;

describe("FRC alliances: 3 robots on the field (#118)", () => {
    it("fields all 3, or the best 3 of 4", () => {
        const m = [team(1, 30), team(2, 20), team(3, 10), team(4, 25)];
        expect(bestFieldedLineup(m.slice(0, 3), 3).score).toBe(60);
        expect(bestFieldedLineup(m, 3).pair.map(t => t.teamNumber).sort()).toEqual([1, 2, 4]);
        expect(bestFieldedLineup(m.slice(0, 3), 2).pair).toHaveLength(2); // FTC unchanged
    });

    it("official FRC alliances sum the three robots", () => {
        const teams = [team(1, 30), team(2, 20), team(3, 10)];
        const [a] = alliancesFromOfficial([{ number: 1, captain: { teamNumber: 1 }, round1: { teamNumber: 2 }, round2: { teamNumber: 3 } }], teams, 3);
        expect(a.totalOPR).toBe(60);
    });

    it("snake draft builds 8 alliances of 3", () => {
        const pool = Array.from({ length: 30 }, (_, i) => team(100 + i, 60 - i, i + 1));
        const al = generateAlliances(pool, 8, 3, 3);
        expect(al).toHaveLength(8);
        expect(al.every(a => a.pick1 && a.pick2)).toBe(true);
        expect(new Set(al.flatMap(a => [a.captain, a.pick1, a.pick2].map(t => t!.teamNumber))).size).toBe(24);
    });
});

describe("best-of-3 finals (#118)", () => {
    it("favors the stronger alliance more than a single final", () => {
        const pool = Array.from({ length: 24 }, (_, i) => team(200 + i, 50 - i, i + 1));
        const al = generateAlliances(pool, 8, 3, 3);
        const p = (bo: 1 | 3) => runMonteCarloSimulation(al, 8, 6000, { random: seededRandom(9), finalsBestOf: bo }).find(r => r.allianceId === 1)!.championProbability;
        expect(p(3)).toBeGreaterThan(p(1));
    });
});

describe("best-of-3 finals with real games (#118)", () => {
    const pool8 = Array.from({ length: 24 }, (_, i) => team(400 + i, 60 - 2 * i, i + 1));
    const al8 = generateAlliances(pool8, 8, 3, 3);
    const redWins = { realRed: 100, realBlue: 50 };
    const bracket = Object.fromEntries(Array.from({ length: 13 }, (_, i) => [`M${i + 1}`, redWins]));
    const run = (extra: Record<string, { realRed: number; realBlue: number }>) =>
        runMonteCarloSimulation(al8, 8, 3000, { random: seededRandom(5), finalsBestOf: 3, adjustments: { ...bracket, ...extra } as never });

    it("one real final game leaves the series open; two decide it", () => {
        const finalists = run({}).filter(r => r.finalsProbability > 0.99);
        expect(finalists).toHaveLength(2);
        const afterOne = run({ M14: { realRed: 50, realBlue: 100 } }).filter(r => r.finalsProbability > 0.99);
        expect(afterOne.every(r => r.championProbability > 0 && r.championProbability < 1)).toBe(true);
        const afterTwo = run({ M14: { realRed: 50, realBlue: 100 }, "M14-2": { realRed: 40, realBlue: 90 } });
        expect(Math.max(...afterTwo.map(r => r.championProbability))).toBe(1);
    });
});
