import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { predictionLedger, scorecard, TOSSUP } from "./prediction-ledger";
import { eventStrengthModel } from "./live-projection";
import type { FTCMatch } from "@/types/scouting";

const fx = JSON.parse(readFileSync(join(__dirname, "../test/fixtures/notify/fpemx-2025.json"), "utf8")) as { matches: FTCMatch[] };
const quals = [...fx.matches].sort((a, b) => a.matchNumber - b.matchNumber);

describe("predictionLedger (#111)", () => {
    const rows = predictionLedger(fx.matches);

    it("forecasts each match only from the matches before it", () => {
        expect(rows).toHaveLength(quals.length);
        expect(rows[0].pRed).toBeNull();
        expect(rows[1].pRed).toBeNull();
        const k = 20, m = quals[k];
        const side = (c: string) => m.teams.filter(t => t.station.startsWith(c)).map(t => t.teamNumber);
        expect(rows[k].pRed).toBeCloseTo(eventStrengthModel(quals.slice(0, k)).pRed(side("Red"), side("Blue")), 10);
    });

    it("a later result never changes an earlier forecast", () => {
        const truncated = predictionLedger(quals.slice(0, 25));
        expect(truncated.map(r => r.pRed)).toEqual(rows.slice(0, 25).map(r => r.pRed));
    });

    it("marks right, wrong and toss-up consistently", () => {
        for (const r of rows) {
            if (r.pRed === null || Math.abs(r.pRed - 0.5) < TOSSUP) expect(r.predicted).toBeNull();
            if (r.predicted && r.winner !== "Tie") expect(r.correct).toBe(r.predicted === r.winner);
        }
        const card = scorecard(rows);
        expect(card.hits).toBe(rows.filter(r => r.correct).length);
        expect(card.calls).toBe(rows.filter(r => r.predicted !== null && r.pRed !== null && r.winner !== "Tie").length);
        expect(card.brier!).toBeLessThan(0.25); // better than a coin flip on a real event
    });
});
