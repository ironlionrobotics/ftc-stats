import { describe, it, expect } from "vitest";
import {
    computeTeamSigma,
    combineSigmas,
    initializeBracket,
    updateBracket,
    runMonteCarloSimulation,
    explainSynergyScore,
    calculateSynergyScore,
} from "./alliance-utils";
import { playoffWinProbability } from "./win-probability";
import type { TeamEvolution } from "@/app/actions/analytics";
import type { Alliance } from "@/types/oracle";

function teamWith(events: Array<{ avgPoints?: number; maxPoints?: number }> = []): TeamEvolution {
    return {
        teamNumber: 1,
        teamName: "T",
        isAdvanced: false,
        events: events.map((e, i) => ({
            eventCode: `EV${i}`,
            rank: 5,
            avgPoints: e.avgPoints ?? 0,
            avgAuto: 0,
            avgTeleOp: 0,
            avgEndGame: 0,
            avgFoul: 0,
            maxPoints: e.maxPoints ?? 0,
            rankingPoints: 0,
            matchesPlayed: 5,
            wins: 0,
            losses: 0,
            ties: 0,
            awards: [],
        })),
        consistencyScore: 0,
        trend: "stable",
        powerScore: 0,
    };
}

describe("computeTeamSigma — 2+ events", () => {
    it("returns floor (8) for perfectly consistent teams", () => {
        const t = teamWith([
            { avgPoints: 80 },
            { avgPoints: 80 },
            { avgPoints: 80 },
        ]);
        expect(computeTeamSigma(t)).toBe(8);
    });

    it("returns higher sigma for inconsistent teams", () => {
        const t = teamWith([
            { avgPoints: 40 },
            { avgPoints: 100 },
            { avgPoints: 70 },
        ]);
        const sigma = computeTeamSigma(t);
        expect(sigma).toBeGreaterThan(15);
        expect(sigma).toBeLessThanOrEqual(60);
    });

    it("caps at 60 for pathologically variable teams", () => {
        const t = teamWith([
            { avgPoints: 5 },
            { avgPoints: 200 },
            { avgPoints: 10 },
            { avgPoints: 180 },
        ]);
        expect(computeTeamSigma(t)).toBe(60);
    });

    it("uses sample stddev (Bessel's n-1) — verified against R", () => {
        // R: sd(c(50, 70, 90)) = 20
        const t = teamWith([{ avgPoints: 50 }, { avgPoints: 70 }, { avgPoints: 90 }]);
        expect(computeTeamSigma(t)).toBeCloseTo(20, 5);
    });
});

describe("computeTeamSigma — 1 event fallback", () => {
    it("estimates from (max - avg) / 2 when there's only 1 event", () => {
        const t = teamWith([{ avgPoints: 60, maxPoints: 100 }]);
        // range/2 = 20
        expect(computeTeamSigma(t)).toBe(20);
    });

    it("clamps to floor when max ≈ avg (uniform performance in single event)", () => {
        const t = teamWith([{ avgPoints: 60, maxPoints: 60 }]);
        expect(computeTeamSigma(t)).toBe(8);
    });

    it("clamps to cap when max >> avg (one huge outlier)", () => {
        const t = teamWith([{ avgPoints: 30, maxPoints: 200 }]);
        // range/2 = 85, capped at 60
        expect(computeTeamSigma(t)).toBe(60);
    });
});

describe("computeTeamSigma — empty fallback", () => {
    it("returns 30 (legacy default) when no events are on record", () => {
        const t = teamWith([]);
        expect(computeTeamSigma(t)).toBe(30);
    });

    it("returns 30 when avgPoints are all 0 (no signal)", () => {
        const t = teamWith([{ avgPoints: 0 }, { avgPoints: 0 }]);
        expect(computeTeamSigma(t)).toBe(30);
    });
});

describe("combineSigmas", () => {
    it("returns sqrt(sum of squares) for independent teams", () => {
        expect(combineSigmas([3, 4])).toBe(5); // 3-4-5 right triangle
        expect(combineSigmas([10, 10])).toBeCloseTo(Math.sqrt(200), 5);
    });

    it("handles empty / single team correctly", () => {
        expect(combineSigmas([])).toBe(0);
        expect(combineSigmas([15])).toBe(15);
    });

    it("matches the pre-change behavior when all teams have σ=30 (3-team)", () => {
        // For backward sanity: a 3-team alliance with σ=30 each → 51.96 total.
        // Previous global σ=30 (single alliance score) is roughly comparable but
        // not identical — the change is intentional: alliances of consistent
        // teams should have lower variance than alliances of erratic teams.
        expect(combineSigmas([30, 30, 30])).toBeCloseTo(Math.sqrt(2700), 5);
    });
});

// ---------------------------------------------------------------------------
// explainSynergyScore — reasons are translation keys + rounded params, never
// prose (see docs/architecture/i18n.md).
// ---------------------------------------------------------------------------

function evo(overrides: Partial<TeamEvolution> = {}): TeamEvolution {
    return {
        ...teamWith([]),
        opr: 0,
        autoOPR: 0,
        netDiscipline: 0,
        ...overrides,
    };
}

describe("explainSynergyScore", () => {
    it("always includes combinedPower with rounded params, never prose", () => {
        const t1 = evo({ opr: 60.4 });
        const t2 = evo({ opr: 40.6 });
        const { score, reasons } = explainSynergyScore(t1, t2);
        expect(reasons[0]).toEqual({ key: "combinedPower", opr1: 60, opr2: 41, combinedOPR: 101 });
        expect(score).toBeCloseTo(101, 5);
    });

    it("adds dominantAuto when combined auto OPR exceeds 30", () => {
        const t1 = evo({ opr: 50, autoOPR: 20 });
        const t2 = evo({ opr: 50, autoOPR: 15 });
        const { reasons } = explainSynergyScore(t1, t2);
        expect(reasons).toContainEqual({ key: "dominantAuto", autoSynergy: 35 });
    });

    it("does not add dominantAuto when combined auto OPR is at or below 30", () => {
        const t1 = evo({ opr: 50, autoOPR: 15 });
        const t2 = evo({ opr: 50, autoOPR: 15 });
        const { reasons } = explainSynergyScore(t1, t2);
        expect(reasons.some(r => r.key === "dominantAuto")).toBe(false);
    });

    it("adds foulRisk when combined net discipline is clearly negative", () => {
        const t1 = evo({ opr: 50, netDiscipline: -6 });
        const t2 = evo({ opr: 50, netDiscipline: -4 });
        const { reasons } = explainSynergyScore(t1, t2);
        const foul = reasons.find(r => r.key === "foulRisk");
        expect(foul).toBeDefined();
        expect(foul).toEqual({ key: "foulRisk", risk: -10, penalty: 8 }); // min(|−10|·0.8, 30)
    });

    it("adds disciplinedDuo when combined net discipline is clearly positive", () => {
        const t1 = evo({ opr: 50, netDiscipline: 4 });
        const t2 = evo({ opr: 50, netDiscipline: 5 });
        const { reasons } = explainSynergyScore(t1, t2);
        expect(reasons).toContainEqual({ key: "disciplinedDuo", risk: 9 });
    });

    it("delegates its score to calculateSynergyScore (no divergence)", () => {
        const t1 = evo({ opr: 50, autoOPR: 20 });
        const t2 = evo({ opr: 55, autoOPR: 15 });
        expect(calculateSynergyScore(t1, t2)).toBe(explainSynergyScore(t1, t2).score);
    });
});

// ---------------------------------------------------------------------------
// Unified win-probability model (bracket analytic ↔ Monte Carlo consistency)
// ---------------------------------------------------------------------------

function alliance(id: number, totalOPR: number, totalSigma: number): Alliance {
    return {
        id,
        captain: teamWith([]),
        pick1: null,
        pick2: null,
        totalOPR,
        totalAuto: 0,
        totalTele: 0,
        totalEndgame: 0,
        projectedScore: totalOPR,
        totalSigma,
    };
}

describe("updateBracket — unified win probability", () => {
    it("uses the shared sigma-aware model, not the old Elo-80 curve", () => {
        // OPR 120 vs 90, σ=20 each → σ_diff = √800 ≈ 28.28.
        const a1 = alliance(1, 120, 20);
        const a2 = alliance(2, 90, 20);
        const bracket = updateBracket(initializeBracket(2), [a1, a2]);

        // Playoff context uses elimination-calibrated noise (decisions.md #59):
        // σ_diff inflated by PLAYOFF_SIGMA_INFLATION, learned from 10,800 real
        // playoff matches. Φ(30/(28.28·2.4)) ≈ 0.671 — deliberately humbler
        // than the quals-derived 0.856 (playoffs are noisier than quals).
        const expected = playoffWinProbability(120, 90, combineSigmas([20, 20]));
        expect(bracket[0].winProbabilityRed).toBeCloseTo(expected, 10);
        expect(bracket[0].winProbabilityRed).toBeCloseTo(0.6707, 3);
    });

    it("favors the higher-OPR alliance more when both are consistent", () => {
        // Same 30-point spread; tighter sigmas → more decisive probability.
        const tight = updateBracket(initializeBracket(2), [alliance(1, 120, 10), alliance(2, 90, 10)]);
        const noisy = updateBracket(initializeBracket(2), [alliance(1, 120, 50), alliance(2, 90, 50)]);
        expect(tight[0].winProbabilityRed).toBeGreaterThan(noisy[0].winProbabilityRed);
        expect(noisy[0].winProbabilityRed).toBeGreaterThan(0.5);
    });
});

describe("runMonteCarloSimulation — agrees with the analytic model", () => {
    it("BO3 championship odds converge to the analytic series probability", () => {
        // The MC samples scores from N(OPR, σ²) — the same normals the
        // analytic model integrates. For a best-of-3 with per-match win
        // probability p, P(win series) = p²(3 − 2p). The empirical champion
        // rate must converge to it (this is the consistency the unification
        // buys: bracket numbers and simulator numbers describe ONE model).
        const a1 = alliance(1, 120, 20);
        const a2 = alliance(2, 90, 20);
        // Per-match p uses the playoff-calibrated model — the MC samples with
        // the same inflated σ, so both still describe ONE model.
        const p = playoffWinProbability(120, 90, combineSigmas([20, 20]));
        const seriesP = p * p * (3 - 2 * p);

        const results = runMonteCarloSimulation([a1, a2], 2, 4000);
        const champ1 = results.find(r => r.allianceId === 1)!;

        // 4000 iterations → binomial σ ≈ 0.0037; ±0.03 is ~8σ (non-flaky).
        expect(champ1.championProbability).toBeGreaterThan(seriesP - 0.03);
        expect(champ1.championProbability).toBeLessThan(seriesP + 0.03);
    });

    it("produces finite scores and sane probabilities (Box-Muller guard)", () => {
        const results = runMonteCarloSimulation(
            [alliance(1, 100, 15), alliance(2, 100, 15)],
            2,
            2000,
        );
        for (const r of results) {
            expect(Number.isFinite(r.championProbability)).toBe(true);
            expect(r.championProbability).toBeGreaterThanOrEqual(0);
            expect(r.championProbability).toBeLessThanOrEqual(1);
        }
        // Evenly matched → both near 50%.
        expect(results[0].championProbability).toBeGreaterThan(0.4);
        expect(results[0].championProbability).toBeLessThan(0.6);
    });
});
