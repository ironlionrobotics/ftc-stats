import { describe, it, expect } from "vitest";
import { calculateTeamProjection, predictMatch, TeamProjection } from "./projections";
import type { AggregatedTeamStats, FTCMatchScouting, PitScouting } from "@/types/scouting";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function team(overrides: Partial<AggregatedTeamStats> = {}): AggregatedTeamStats {
    return {
        teamNumber: 30311,
        teamName: "Iron Lion",
        regionalsAttended: 1,
        totalRS: 0,
        averageRS: 0,
        totalMatchPoints: 0,
        averageMatchPoints: 50,
        totalBasePoints: 0,
        averageBasePoints: 0,
        totalAutoPoints: 0,
        averageAutoPoints: 0,
        totalHighScore: 0,
        averageHighScore: 0,
        totalWins: 0,
        totalLosses: 0,
        totalTies: 0,
        bestRank: 1,
        averageRank: 1,
        hasAdvanced: false,
        advancementPoints: { total: 0, judging: 0, playoff: 0, selection: 0, qualification: 0 },
        totalNP: 0,
        averageNP: 0,
        opr: 0,
        events: [],
        ...overrides,
    };
}

// Objective ("match" mode) entry. Point mapping used by the projection engine:
//   auto  = autoPurple*3 + autoGreen*3 + autoPoints
//   tele  = telePurple*2 + teleGreen*2 + patterns*10
//   end   = (dualParking ? 20 : 0) + (Full → 10 | Partial → 5 | None → 0)
function matchEntry(overrides: Partial<FTCMatchScouting> = {}): FTCMatchScouting {
    return {
        teamNumber: 30311,
        eventCode: "MXMO",
        matchNumber: 1,
        season: 2025,
        program: "FTC",
        scouterId: "scout-1",
        scouterName: "Scout One",
        notes: "",
        timestamp: null,
        scoutingMode: "match",
        ...overrides,
    };
}

function superEntry(overrides: Partial<FTCMatchScouting> = {}): FTCMatchScouting {
    return matchEntry({
        scoutingMode: "super",
        // Super entries intentionally leave all counter fields undefined.
        driverSkill: 3,
        ...overrides,
    });
}

function pit(notes: string): PitScouting {
    return { teamNumber: 30311, season: 2025, notes };
}

function projection(overrides: Partial<TeamProjection> = {}): TeamProjection {
    return {
        teamNumber: 1,
        projectedPoints: 100,
        breakdown: { auto: 25, teleop: 60, endgame: 15 },
        confidence: 0.8,
        reliability: "high",
        redFlags: [],
        ...overrides,
    };
}

const breakdownSum = (p: TeamProjection) =>
    p.breakdown.auto + p.breakdown.teleop + p.breakdown.endgame;

// ---------------------------------------------------------------------------
// calculateTeamProjection
// ---------------------------------------------------------------------------

describe("calculateTeamProjection", () => {
    describe("cold start (no scouting)", () => {
        it("returns the API base with low reliability", () => {
            const p = calculateTeamProjection(team({ averageMatchPoints: 80 }), [], null);
            expect(p.projectedPoints).toBe(80);
            expect(p.reliability).toBe("low");
            expect(p.redFlags).toEqual([]);
        });

        it("splits the breakdown from API auto share when available", () => {
            const p = calculateTeamProjection(
                team({ averageMatchPoints: 80, averageAutoPoints: 20 }),
                [],
                null,
            );
            // autoShare = 20/80 = 0.25; remainder split 80/20 teleop/endgame.
            expect(p.breakdown.auto).toBeCloseTo(20, 5);
            expect(p.breakdown.teleop).toBeCloseTo(48, 5);
            expect(p.breakdown.endgame).toBeCloseTo(12, 5);
            expect(breakdownSum(p)).toBeCloseTo(80, 5);
        });

        it("uses the historical default split when no API auto data exists", () => {
            const p = calculateTeamProjection(team({ averageMatchPoints: 100 }), [], null);
            expect(p.breakdown.auto).toBeCloseTo(25, 5);
            expect(p.breakdown.teleop).toBeCloseTo(60, 5);
            expect(p.breakdown.endgame).toBeCloseTo(15, 5);
        });

        it("keeps confidence within [0.1, 0.99]", () => {
            const p = calculateTeamProjection(team({ averageMatchPoints: 0 }), [], null);
            expect(p.confidence).toBeGreaterThanOrEqual(0.1);
            expect(p.confidence).toBeLessThanOrEqual(0.99);
            expect(Number.isFinite(p.projectedPoints)).toBe(true);
        });
    });

    describe("posterior blending", () => {
        it("pulls toward consistent scouting data with enough observations", () => {
            // apiBase 50 vs 4 identical 100-point observations. Identical
            // observations → variance floor 1 → scout precision dominates the
            // prior (σ²=100) by ~400×, so the posterior lands at ~100.
            const entries = Array.from({ length: 4 }, (_, i) =>
                matchEntry({
                    matchNumber: i + 1,
                    autoPoints: 40,
                    teleopPurpleArtifacts: 20, // 40
                    patternsCompleted: 1, // 10
                    endgameBaseParking: "Full", // 10
                }),
            );
            const p = calculateTeamProjection(team({ averageMatchPoints: 50 }), entries, null);
            expect(p.projectedPoints).toBe(100);
            expect(p.reliability).toBe("high");
        });

        it("weighs a single observation equally against the prior", () => {
            // scoredCount=1 → scoutVar falls back to priorVar → posterior is
            // the midpoint of apiBase (30) and the observation (70).
            const entry = matchEntry({
                autoPoints: 30,
                teleopPurpleArtifacts: 10, // 20
                patternsCompleted: 1, // 10
                endgameBaseParking: "Full", // 10 → total 70
            });
            const p = calculateTeamProjection(team({ averageMatchPoints: 30 }), [entry], null);
            expect(p.projectedPoints).toBe(50);
            expect(p.reliability).toBe("medium");
        });
    });

    describe("super-scouting entries must not dilute objective statistics (C6 regression)", () => {
        it("does not discard the single real observation when supers are present", () => {
            // REGRESSION: with n = all entries, 1 match + 2 supers passed the
            // n>=2 guard, variance([x]) returned Infinity, scout precision
            // collapsed to 0 and the projection silently fell back to the
            // prior (30). Correct: same result as the single-entry case (50).
            const entries = [
                matchEntry({
                    autoPoints: 30,
                    teleopPurpleArtifacts: 10,
                    patternsCompleted: 1,
                    endgameBaseParking: "Full", // total 70
                }),
                superEntry({ matchNumber: 2 }),
                superEntry({ matchNumber: 3 }),
            ];
            const p = calculateTeamProjection(team({ averageMatchPoints: 30 }), entries, null);
            expect(p.projectedPoints).toBe(50);
        });

        it("computes the scout mean over scored entries only", () => {
            // REGRESSION: scoutMean divided by n (4) instead of scoredCount
            // (2), halving the observed mean (60 → 30) and dragging the
            // posterior to ~30. Correct: two consistent 60s + apiBase 60 → 60.
            const entries = [
                matchEntry({
                    matchNumber: 1,
                    autoPoints: 20,
                    teleopPurpleArtifacts: 15, // 30
                    endgameBaseParking: "Full", // 10 → total 60
                }),
                matchEntry({
                    matchNumber: 2,
                    autoPoints: 20,
                    teleopPurpleArtifacts: 15,
                    endgameBaseParking: "Full",
                }),
                superEntry({ matchNumber: 3 }),
                superEntry({ matchNumber: 4 }),
            ];
            const p = calculateTeamProjection(team({ averageMatchPoints: 60 }), entries, null);
            expect(p.projectedPoints).toBe(60);
        });

        it("reports low reliability when ALL entries are super-scouting", () => {
            // Zero objective observations → the projection is pure prior and
            // must not claim medium/high reliability (previously n=2 → medium).
            const entries = [superEntry({ matchNumber: 1 }), superEntry({ matchNumber: 2 })];
            const p = calculateTeamProjection(team({ averageMatchPoints: 100 }), entries, null);
            expect(p.reliability).toBe("low");
            expect(p.projectedPoints).toBe(100); // neutral skill → prior untouched
        });

        it("still applies the driver-skill modifier from super entries", () => {
            // Subjective skill is exactly what super-scouting contributes.
            // avgSkill 5 → multiplier 1 + (5-3)·0.075 = 1.15.
            // NOTE: MODEL comment says the swing caps at ±7.5% but the code
            // yields ±15% at the Likert extremes — documented as-is, flagged
            // for calibration review.
            const entries = [
                superEntry({ matchNumber: 1, driverSkill: 5 }),
                superEntry({ matchNumber: 2, driverSkill: 5 }),
            ];
            const p = calculateTeamProjection(team({ averageMatchPoints: 100 }), entries, null);
            expect(p.projectedPoints).toBe(115);
        });
    });

    describe("component breakdown", () => {
        it("uses observed shares and sums to the projected total", () => {
            const entry = matchEntry({
                autoPoints: 30,
                teleopPurpleArtifacts: 10, // 20
                patternsCompleted: 1, // 10 → tele 30
                endgameBaseParking: "Full", // 10 → total 70
            });
            const p = calculateTeamProjection(team({ averageMatchPoints: 30 }), [entry], null);
            // Posterior 50, shares 30/70, 30/70, 10/70.
            expect(p.breakdown.auto).toBeCloseTo(50 * (30 / 70), 5);
            expect(p.breakdown.teleop).toBeCloseTo(50 * (30 / 70), 5);
            expect(p.breakdown.endgame).toBeCloseTo(50 * (10 / 70), 5);
            expect(breakdownSum(p)).toBeCloseTo(50, 5);
        });

        it("falls back to API shares when every scored observation is zero", () => {
            // REGRESSION: the old `|| 1` guard produced an all-zero breakdown
            // next to a non-zero projectedPoints. The breakdown must always
            // sum to the projected total.
            const entry = matchEntry({ endgameBaseParking: "None" }); // total 0
            const p = calculateTeamProjection(
                team({ averageMatchPoints: 50, averageAutoPoints: 10 }),
                [entry],
                null,
            );
            // Posterior = midpoint of apiBase 50 and observation 0 → 25.
            expect(p.projectedPoints).toBe(25);
            expect(breakdownSum(p)).toBeCloseTo(25, 5);
            expect(p.breakdown.auto).toBeGreaterThan(0);
        });
    });

    describe("qualitative modifiers", () => {
        it("flags mechanical risk from pit notes and applies the penalty", () => {
            const p = calculateTeamProjection(
                team({ averageMatchPoints: 100 }),
                [],
                pit("intake broken since Q3"),
            );
            expect(p.redFlags).toContain("Riesgo Mecánico Detectado");
            expect(p.projectedPoints).toBe(60); // ×(1 − 0.4)
        });

        it("detects the Spanish keyword 'fallo' too", () => {
            const p = calculateTeamProjection(
                team({ averageMatchPoints: 100 }),
                [],
                pit("Fallo recurrente en el brazo"),
            );
            expect(p.redFlags).toContain("Riesgo Mecánico Detectado");
        });

        it("keeps confidence invariant to multiplicative modifiers", () => {
            // posteriorVar describes the pre-multiplier base; the multiplier
            // scales mean and sd equally, so confidence must not change.
            // (Previously the mechanical penalty deflated it via the
            // post-multiplier denominator.)
            const clean = calculateTeamProjection(team({ averageMatchPoints: 100 }), [], null);
            const broken = calculateTeamProjection(
                team({ averageMatchPoints: 100 }),
                [],
                pit("broken lift"),
            );
            expect(broken.confidence).toBeCloseTo(clean.confidence, 10);
            // apiPriorCV = 0.2 → confidence = 1 − 0.2 = 0.8.
            expect(clean.confidence).toBeCloseTo(0.8, 5);
        });
    });
});

// ---------------------------------------------------------------------------
// predictMatch
// ---------------------------------------------------------------------------

describe("predictMatch", () => {
    it("gives exactly 0.5 for evenly matched alliances", () => {
        const red = [projection({ projectedPoints: 100 })];
        const blue = [projection({ projectedPoints: 100 })];
        expect(predictMatch(red, blue).winProbability).toBeCloseTo(0.5, 10);
    });

    it("matches the calibrated logistic value", () => {
        // diff 100, avg 100 → normalized 1 → 1/(1+e^{-1.5}) ≈ 0.8176.
        const red = [projection({ projectedPoints: 150 })];
        const blue = [projection({ projectedPoints: 50 })];
        expect(predictMatch(red, blue).winProbability).toBeCloseTo(0.8176, 3);
    });

    it("is symmetric: P(red) + P(swapped) = 1", () => {
        const a = [projection({ projectedPoints: 120 })];
        const b = [projection({ projectedPoints: 80 })];
        const pAB = predictMatch(a, b).winProbability;
        const pBA = predictMatch(b, a).winProbability;
        expect(pAB + pBA).toBeCloseTo(1, 10);
    });

    it("clamps to [0.01, 0.99] instead of saturating", () => {
        const red = [projection({ projectedPoints: 1000 })];
        const blue = [projection({ projectedPoints: 1 })];
        const p = predictMatch(red, blue).winProbability;
        expect(p).toBeLessThanOrEqual(0.99);
        expect(p).toBeGreaterThan(0.9);
    });

    it("handles zero-score alliances without NaN", () => {
        const red = [projection({ projectedPoints: 0, breakdown: { auto: 0, teleop: 0, endgame: 0 } })];
        const blue = [projection({ projectedPoints: 0, breakdown: { auto: 0, teleop: 0, endgame: 0 } })];
        const result = predictMatch(red, blue);
        expect(result.winProbability).toBeCloseTo(0.5, 10);
        expect(Number.isFinite(result.winProbability)).toBe(true);
    });

    it("sums alliance scores from team projections", () => {
        const red = [projection({ projectedPoints: 60 }), projection({ projectedPoints: 50 })];
        const blue = [projection({ projectedPoints: 40 }), projection({ projectedPoints: 45 })];
        const result = predictMatch(red, blue);
        expect(result.redAlliance.score).toBe(110);
        expect(result.blueAlliance.score).toBe(85);
    });

    describe("insights", () => {
        it("flags a red autonomous advantage", () => {
            const red = [projection({ breakdown: { auto: 40, teleop: 50, endgame: 10 } })];
            const blue = [projection({ breakdown: { auto: 20, teleop: 70, endgame: 10 } })];
            const { insights } = predictMatch(red, blue);
            expect(insights.some(i => i.includes("Alianza Roja domina en período Autónomo"))).toBe(true);
        });

        it("flags a technical tie when the margin is under 5% of the average", () => {
            const red = [projection({ projectedPoints: 100 })];
            const blue = [projection({ projectedPoints: 98 })];
            const { insights } = predictMatch(red, blue);
            expect(insights.some(i => i.includes("Empate técnico"))).toBe(true);
        });

        it("marks high-precision predictions when all teams have high reliability", () => {
            const red = [projection({ reliability: "high" })];
            const blue = [projection({ reliability: "high" })];
            expect(
                predictMatch(red, blue).insights.some(i => i.includes("alta precisión")),
            ).toBe(true);

            const mixed = [projection({ reliability: "low" })];
            expect(
                predictMatch(red, mixed).insights.some(i => i.includes("alta precisión")),
            ).toBe(false);
        });
    });
});
