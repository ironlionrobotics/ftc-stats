import { describe, it, expect } from "vitest";
import { playoffForecaster, oracleRobotSigma, LIVE_PLAYOFF_SIGMA_INFLATION } from "./playoff-form";
import { initializeBracket, updateBracket, alliancesFromOfficial } from "./alliance-utils";
import { predictionLedger } from "./prediction-ledger";
import { winProbabilityFromNormalModel, PLAYOFF_FORM_K } from "./win-probability";
import type { StrengthModel } from "./live-projection";
import type { FTCMatch } from "@/types/scouting";

// Flat quals model: every robot is worth 50 np points, σ_diff 20.
const flat: StrengthModel = {
    strength: () => 50,
    sigmaDiff: 20,
    pRed: () => 0.5,
    teams: [],
    sigmaAlliance: 20 / Math.SQRT2,
};

function match(level: "QUALIFICATION" | "PLAYOFF", series: number, red: number[], blue: number[], rs: number, bs: number, t: string): FTCMatch {
    return {
        tournamentLevel: level, matchNumber: 1, series, description: `M${series}`,
        actualStartTime: t, postResultTime: t,
        scoreRedFinal: rs, scoreBlueFinal: bs, scoreRedFoul: 0, scoreBlueFoul: 0,
        teams: [...red.map((n, i) => ({ teamNumber: n, station: `Red${i + 1}` })), ...blue.map((n, i) => ({ teamNumber: n, station: `Blue${i + 1}` }))],
    } as unknown as FTCMatch;
}

describe("playoffForecaster (#113)", () => {
    it("before any playoff result it is the quals model with the live playoff σ", () => {
        const fc = playoffForecaster(flat);
        expect(fc.mu([1, 2])).toBe(100);
        expect(fc.pRed([1, 2], [3, 4])).toBeCloseTo(0.5, 6);
        expect(fc.formOf(1)).toBeNull();
    });

    it("an alliance that outscores its projection carries a shrunk offset into its next match", () => {
        const fc = playoffForecaster(flat, [match("PLAYOFF", 1, [1, 2], [3, 4], 160, 90, "2026-11-14T22:00:00Z")]);
        const up = 60 / (PLAYOFF_FORM_K + 1), down = -10 / (PLAYOFF_FORM_K + 1);
        expect(fc.formOf(2)!.offset).toBeCloseTo(up, 10);
        expect(fc.mu([1, 2])).toBeCloseTo(100 + up, 10);
        expect(fc.mu([3, 4])).toBeCloseTo(100 + down, 10);
        expect(fc.pRed([1, 2], [3, 4])).toBeCloseTo(
            winProbabilityFromNormalModel(100 + up, 100 + down, 20 * LIVE_PLAYOFF_SIGMA_INFLATION), 10);
    });

    it("3-robot alliances: a rotated pair still reads its alliance's form", () => {
        const fc = playoffForecaster(flat, [
            match("PLAYOFF", 1, [1, 2], [4, 5], 140, 100, "2026-11-14T22:00:00Z"),
            match("PLAYOFF", 3, [2, 3], [6, 7], 140, 100, "2026-11-14T22:10:00Z"),
        ]);
        // 1, 2 and 3 are one alliance: two matches at +40 each.
        expect(fc.formOf(1)).toEqual(fc.formOf(3));
        expect(fc.formOf(1)!.n).toBe(2);
        expect(fc.mu([1, 3])).toBeCloseTo(100 + 80 / (PLAYOFF_FORM_K + 2), 10);
    });

    it("the ledger's playoff forecasts only learn from earlier playoff matches", () => {
        const quals = Array.from({ length: 6 }, (_, i) =>
            match("QUALIFICATION", 0, [1 + (i % 4), 5 + (i % 3)], [9 + (i % 2), 11 + (i % 4)], 100 + i, 90 + i, `2026-11-14T1${i}:00:00Z`))
            .map((m, i) => ({ ...m, matchNumber: i + 1 }));
        const po = [
            match("PLAYOFF", 1, [1, 5], [9, 11], 200, 60, "2026-11-14T20:00:00Z"),
            match("PLAYOFF", 2, [1, 5], [2, 6], 90, 80, "2026-11-14T20:10:00Z"),
        ];
        const rows = predictionLedger([...quals, ...po]).filter(r => r.level === "PLAYOFF");
        const onlyFirst = predictionLedger([...quals, po[0]]).filter(r => r.level === "PLAYOFF");
        expect(rows[0].pRed).toBe(onlyFirst[0].pRed); // a later result never rewrites an earlier forecast
        // The second forecast saw [1,5] put up 200: its projection moved up.
        expect(rows[1].muRed!).toBeGreaterThan(onlyFirst[0].muRed!);
    });
});

describe("disqualifications (#113)", () => {
    it("a DQ'd side's 0 is not counted as playoff form", () => {
        const m = match("PLAYOFF", 9, [1, 2], [3, 4], 102, 0, "2026-11-14T23:22:00Z");
        m.teams = m.teams.map(t => (t.station.startsWith("Blue") ? { ...t, dq: true } : t));
        const fc = playoffForecaster(flat, [m]);
        expect(fc.formOf(3)).toBeNull();        // no residual recorded for the DQ'd alliance
        expect(fc.formOf(1)!.n).toBe(1);        // the other side still counts
        expect(fc.mu([3, 4])).toBe(100);
    });
});

describe("Oracle bracket reproduces the live model (#113)", () => {
    it("same strengths + oracleRobotSigma → same P(red) as playoffForecaster", () => {
        const strength: Record<number, number> = { 1: 70, 2: 50, 3: 40, 4: 45 };
        const model: StrengthModel = { ...flat, strength: t => strength[t] ?? 50, sigmaDiff: 30, sigmaAlliance: 30 / Math.SQRT2 };
        const team = (n: number) => ({ teamNumber: n, teamName: `T${n}`, isAdvanced: false, events: [], consistencyScore: 0, trend: "stable" as const, powerScore: 0, opr: strength[n], sigma: oracleRobotSigma(model) });
        const pick = (n: number) => ({ teamNumber: n });
        const alliances = alliancesFromOfficial(
            [{ number: 1, captain: pick(1), round1: pick(2) }, { number: 2, captain: pick(3), round1: pick(4) }] as never,
            [1, 2, 3, 4].map(team),
        );
        const bracket = updateBracket(initializeBracket(2), alliances);
        expect(bracket[0].winProbabilityRed).toBeCloseTo(playoffForecaster(model).pRed([1, 2], [3, 4]), 10);
    });
});
