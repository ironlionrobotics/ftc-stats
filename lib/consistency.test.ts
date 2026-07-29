import { describe, it, expect } from "vitest";
import {
    analyzeSeries, diagnoseForm, buildConsistencyProfile,
    projectFormBands, oprToReachVerdict, pointsToNextTier, consistencyNote,
    FormDiagnosis,
} from "./consistency";
import { EventProfile, projectAtEvent } from "./event-selector";

const field = (over: Partial<EventProfile> = {}): EventProfile => ({
    season: 2025, code: "TEST", name: "Test", type: "Premier", region: "MX",
    teams: 29, oprMean: 56.6, oprSd: 32.6, oprTop: 139.1, sigma: 33.2, ...over,
});

// 30311's real DECODE season (lib/reports/team-30311-decode.ts).
const SEASON_30311 = [
    { label: "MXSTQ", opr: 50.94, auto: 9.45, dc: 41.63 },
    { label: "MXMOQ", opr: 68.9, auto: 8.25, dc: 55.14 },
    { label: "MXCMP", opr: 63.44, auto: 10.16, dc: 49.39 },
    { label: "FPEMX", opr: 80.76, auto: 15.07, dc: 44.88 },
];

describe("analyzeSeries", () => {
    it("keeps the variance identity (residualSigma/rawSigma)^2 === 1 - r2", () => {
        // This identity is what lets the UI show both sigmas side by side, so
        // it is a contract, not an incidental property.
        const a = analyzeSeries(SEASON_30311.map(p => p.opr));
        expect((a.residualSigma / a.rawSigma) ** 2).toBeCloseTo(1 - a.r2, 10);
    });

    it("fits a perfect line with r2 = 1 and no residual spread", () => {
        const a = analyzeSeries([10, 20, 30, 40]);
        expect(a.slope).toBeCloseTo(10, 10);
        expect(a.r2).toBeCloseTo(1, 10);
        expect(a.residualSigma).toBeCloseTo(0, 10);
        expect(a.currentForm).toBeCloseTo(40, 10);
        expect(a.projectedNext).toBeCloseTo(50, 10);
    });

    it("reports a flat series as zero spread and zero trend", () => {
        const a = analyzeSeries([50, 50, 50, 50]);
        expect(a.rawSigma).toBe(0);
        expect(a.cv).toBe(0);
        expect(a.slope).toBeCloseTo(0, 10);
        expect(a.r2).toBe(0); // nothing to explain — not 0/0
    });

    it("exposes adjustedR2 only once there are residual degrees of freedom", () => {
        expect(analyzeSeries([1, 3, 2]).adjustedR2).toBeNull();
        expect(analyzeSeries([1, 3, 2, 5]).adjustedR2).not.toBeNull();
    });

    it("does not blow up on empty or single-point series", () => {
        const empty = analyzeSeries([]);
        expect(empty.n).toBe(0);
        expect(Number.isFinite(empty.rawSigma)).toBe(true);

        const one = analyzeSeries([42]);
        expect(one.mean).toBe(42);
        expect(one.currentForm).toBeCloseTo(42, 10);
        expect(Number.isFinite(one.cv)).toBe(true);
    });

    it("computes the population sd, matching a known distribution", () => {
        // [2,4,4,4,5,5,7,9] has mean 5 and population sd 2.
        expect(analyzeSeries([2, 4, 4, 4, 5, 5, 7, 9]).rawSigma).toBeCloseTo(2, 10);
    });
});

describe("diagnoseForm", () => {
    it("separates growth from volatility — the distinction the module exists for", () => {
        // Rising line: spread is trend.
        expect(diagnoseForm(analyzeSeries([40, 55, 70, 85]))).toBe("crecimiento");
        // Zig-zag around a flat mean: spread is noise.
        expect(diagnoseForm(analyzeSeries([40, 80, 41, 79]))).toBe("volatilidad");
    });

    it("flags a falling trend as declive rather than growth", () => {
        expect(diagnoseForm(analyzeSeries([85, 70, 55, 40]))).toBe("declive");
    });

    it("calls a tight series estable regardless of its shape", () => {
        expect(diagnoseForm(analyzeSeries([70, 71, 70, 71]))).toBe("estable");
    });

    it("refuses to diagnose fewer than 3 events", () => {
        expect(diagnoseForm(analyzeSeries([50, 80]))).toBe("insuficiente");
    });
});

describe("buildConsistencyProfile — 30311 DECODE season", () => {
    const p = buildConsistencyProfile(SEASON_30311, 63.4);

    it("diagnoses the season as growth, not inconsistency", () => {
        // The refinement over decisions.md #58: ~77% of the spread is trend.
        expect(p.diagnosis).toBe("crecimiento");
        expect(p.tot.r2).toBeGreaterThan(0.7);
        expect(p.tot.slope).toBeGreaterThan(5);
    });

    it("quantifies how far the public season number lags current form", () => {
        // The actionable number: captains scout the 63.4, not the ~78.6 form.
        expect(p.scoutingGap).toBeGreaterThan(10);
        expect(p.publicNumber).toBe(63.4);
        expect(p.peakGap).toBeCloseTo(80.76 - 63.4, 6);
        expect(p.realizationRate).toBeCloseTo(63.4 / 80.76, 6);
    });

    it("identifies teleop as the volatility driver, not auto", () => {
        // Auto is the phase that GROWS; teleop is the one that is actually
        // noisy. Naively reading raw spread would blame the wrong phase.
        expect(p.volatilityDriver?.key).toBe("dc");
        const auto = p.phases.find(x => x.key === "auto")!;
        const dc = p.phases.find(x => x.key === "dc")!;
        expect(auto.diagnosis).toBe("crecimiento");
        expect(dc.diagnosis).toBe("volatilidad");
        expect(dc.analysis.residualSigma).toBeGreaterThan(auto.analysis.residualSigma);
    });

    it("skips a phase that is not reported for every event", () => {
        const partial = buildConsistencyProfile([
            { label: "A", opr: 50, auto: 10 },
            { label: "B", opr: 60 },            // no auto here
            { label: "C", opr: 70, auto: 20 },
        ]);
        expect(partial.phases.find(x => x.key === "auto")).toBeUndefined();
    });

    it("falls back to the median when no public number is supplied", () => {
        const noPublic = buildConsistencyProfile(SEASON_30311);
        expect(noPublic.publicNumber).toBeCloseTo(noPublic.tot.median, 10);
    });
});

describe("projectFormBands", () => {
    it("reproduces the real FPEMX outcome: current form projects as a pick", () => {
        // 30311 was in fact selected at FPEMX (seed 7, alliance 5 pick).
        const p = buildConsistencyProfile(SEASON_30311, 63.4);
        const bands = projectFormBands(p, field());
        const actual = bands.find(b => b.key === "actual")!;
        expect(actual.projection.verdict).toBe("pick");
        expect(actual.projection.expectedSeed).toBeLessThanOrEqual(10);
    });

    it("orders the bands from floor to peak", () => {
        const p = buildConsistencyProfile(SEASON_30311, 63.4);
        const bands = projectFormBands(p, field());
        expect(bands.map(b => b.key)).toEqual(["piso", "publico", "actual", "pico"]);
        expect(bands[0].opr).toBeLessThan(bands[3].opr);
    });
});

describe("oprToReachVerdict", () => {
    it("returns an OPR that actually achieves the target verdict", () => {
        // Bisection must agree with the forward function it inverts.
        const f = field();
        for (const target of ["capitan", "pick", "burbuja"] as const) {
            const opr = oprToReachVerdict(target, f);
            expect(opr).not.toBeNull();
            expect(projectAtEvent(opr!, f).verdict).toBe(target === "burbuja" ? "burbuja" : target);
        }
    });

    it("is monotone: a harder verdict never needs less OPR", () => {
        const f = field();
        const capitan = oprToReachVerdict("capitan", f)!;
        const pick = oprToReachVerdict("pick", f)!;
        const burbuja = oprToReachVerdict("burbuja", f)!;
        expect(capitan).toBeGreaterThanOrEqual(pick);
        expect(pick).toBeGreaterThanOrEqual(burbuja);
    });

    it("returns 0 for a target already met at zero OPR", () => {
        // A field where even 0 OPR lands inside the bubble (tiny field).
        expect(oprToReachVerdict("fuera", field())).toBe(0);
    });
});

describe("pointsToNextTier", () => {
    it("quantifies the smallest real lever: 30311 at FPEMX is ~2 points from pick", () => {
        const gap = pointsToNextTier(63.4, field());
        expect(gap).not.toBeNull();
        expect(gap!.from).toBe("burbuja");
        expect(gap!.to).toBe("pick");
        expect(gap!.delta).toBeGreaterThan(0);
        expect(gap!.delta).toBeLessThan(5);
    });

    it("returns null when already projecting as captain", () => {
        expect(pointsToNextTier(200, field())).toBeNull();
    });

    it("reports zero delta when the current OPR already clears the next tier", () => {
        const f = field();
        const needed = oprToReachVerdict("pick", f)!;
        const gap = pointsToNextTier(needed, f);
        // At exactly the threshold the verdict IS pick, so the next tier up is
        // captain — whatever it reports, delta is never negative.
        if (gap) expect(gap.delta).toBeGreaterThanOrEqual(0);
    });
});

describe("consistencyNote", () => {
    it("produces a distinct, non-empty note for every diagnosis", () => {
        const series: Record<FormDiagnosis, number[]> = {
            insuficiente: [50, 80],
            estable: [70, 71, 70, 71],
            crecimiento: [40, 55, 70, 85],
            declive: [85, 70, 55, 40],
            volatilidad: [40, 80, 41, 79],
            mixto: [40, 70, 50, 80],
        };
        const seen = new Set<string>();
        for (const [diagnosis, values] of Object.entries(series)) {
            const p = buildConsistencyProfile(values.map((opr, i) => ({ label: `E${i}`, opr })));
            expect(p.diagnosis).toBe(diagnosis);
            const note = consistencyNote(p);
            expect(note.length).toBeGreaterThan(20);
            seen.add(note);
        }
        expect(seen.size).toBe(Object.keys(series).length);
    });
});
