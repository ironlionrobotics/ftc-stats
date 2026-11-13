import { describe, it, expect } from "vitest";
import {
    pAtLeastNegBin,
    nbDispersion,
    pSwarm,
    shrunkRate,
    decayedUpdate,
    biobuzzAllianceRp,
    BIOBUZZ_TIPS_DISPERSION,
} from "./rp-counts";
import { componentOpr } from "./component-opr";

describe("Negative Binomial tail", () => {
    it("matches a direct pmf sum", () => {
        const mu = 2.3, r = 2.9;
        const p = r / (r + mu);
        // pmf(x) = Γ(x+r)/(Γ(r) x!) p^r (1-p)^x, built iteratively
        let pmf = Math.pow(p, r), cdf = 0;
        for (let x = 0; x < 4; x++) { cdf += pmf; pmf *= ((x + r) / (x + 1)) * (1 - p); }
        expect(pAtLeastNegBin(4, mu, r)).toBeCloseTo(1 - cdf, 12);
    });
    it("P(X >= 0) = 1, zero mean never scores", () => {
        expect(pAtLeastNegBin(0, 1.2)).toBe(1);
        expect(pAtLeastNegBin(4, 0)).toBe(0);
    });
    it("is monotone in mu and in k", () => {
        expect(pAtLeastNegBin(4, 3)).toBeGreaterThan(pAtLeastNegBin(4, 2));
        expect(pAtLeastNegBin(7, 3)).toBeLessThan(pAtLeastNegBin(4, 3));
    });
    it("season dispersion from mean 1.16 / var 1.61 is ≈ 2.99", () => {
        expect(BIOBUZZ_TIPS_DISPERSION).toBeCloseTo(2.99, 2);
        expect(nbDispersion(2, 1.5)).toBeGreaterThan(1e5); // under-dispersed → Poisson
    });
    it("reproduces the season base rate of POLLINATOR 1 to the right order", () => {
        // Observed 5.6% of alliances reached >= 4 tips with mean 1.16.
        const p = pAtLeastNegBin(4, 1.16);
        expect(p).toBeGreaterThan(0.03);
        expect(p).toBeLessThan(0.09);
    });
});

describe("pSwarm (LEAVE 3 + AUTO PARK 5 + PARK 5 per robot, threshold 16)", () => {
    const sure = { leave: 1, autoPark: 1, teleopPark: 1 };
    const none = { leave: 0, autoPark: 0, teleopPark: 0 };
    it("both robots do everything → certain", () => {
        expect(pSwarm(sure, sure, 16)).toBeCloseTo(1, 12);
    });
    it("both LEAVE + both final PARK = exactly 16", () => {
        const r = { leave: 1, autoPark: 0, teleopPark: 1 };
        expect(pSwarm(r, r, 16)).toBeCloseTo(1, 12);
    });
    it("one dead robot: the other alone maxes at 13 < 16", () => {
        expect(pSwarm(sure, none, 16)).toBe(0);
    });
    it("a missing LEAVE must be covered by an AUTO PARK", () => {
        const noLeave = { leave: 0, autoPark: 0.5, teleopPark: 1 };
        const partner = { leave: 1, autoPark: 0, teleopPark: 1 };
        // 0 + 3 + 5 + 5 = 13 without autoPark; +5 with it → P = 0.5
        expect(pSwarm(noLeave, partner, 16)).toBeCloseTo(0.5, 12);
    });
});

describe("shrunkRate", () => {
    it("pulls small samples toward the prior", () => {
        expect(shrunkRate(1, 1, 0.5, 4)).toBeCloseTo(0.6, 12);
        expect(shrunkRate(0, 0, 0.7)).toBeCloseTo(0.7, 12);
    });
});

describe("componentOpr", () => {
    it("recovers exact contributions on a well-determined schedule (λ≈0)", () => {
        const truth = new Map([[1, 2], [2, 0.5], [3, 1], [4, 0]]);
        const pairs = [[1, 2], [1, 3], [1, 4], [2, 3], [2, 4], [3, 4]];
        const rows = pairs.map(teams => ({ teams, value: teams.reduce((s, t) => s + truth.get(t)!, 0) }));
        const opr = componentOpr(rows, { lambda: 1e-9 });
        for (const [t, v] of truth) expect(opr.get(t)!).toBeCloseTo(v, 6);
    });
    it("shrinks a single-match team toward the prior", () => {
        const opr = componentOpr([{ teams: [1, 2], value: 6 }], { lambda: 1, prior: 1 });
        // symmetric: (1+1)x = 6 + 1 ... per team: 2x + x·0 → x = (6 + 1) / (1 + 1 + ... )
        expect(opr.get(1)).toBeCloseTo(opr.get(2)!, 12);
        expect(opr.get(1)!).toBeLessThan(3);
        expect(opr.get(1)!).toBeGreaterThan(1);
    });
});

describe("biobuzzAllianceRp", () => {
    it("combines both teams' tips and rates", () => {
        const strong = { tipsOpr: 2.5, rates: { leave: 1, autoPark: 1, teleopPark: 1 }, matches: 6 };
        const weak = { tipsOpr: 0.2, rates: { leave: 0.5, autoPark: 0.2, teleopPark: 0.6 }, matches: 6 };
        const t = { swarm: 16, pollinator1: 4, pollinator2: 7 };
        const ss = biobuzzAllianceRp(strong, strong, t);
        const sw = biobuzzAllianceRp(strong, weak, t);
        expect(ss.swarm).toBeCloseTo(1, 12);
        expect(ss.pollinator1).toBeGreaterThan(sw.pollinator1);
        expect(ss.pollinator2).toBeLessThan(ss.pollinator1);
    });
});

describe("decayedUpdate (SWARM recency)", () => {
    it("weights recent matches more: late success beats early success", () => {
        const zero = { leave: 0, autoPark: 0, teleopPark: 0, n: 0 };
        const yes = { leave: true, autoPark: true, teleopPark: true };
        const no = { leave: false, autoPark: false, teleopPark: false };
        const lateGood = [no, no, yes, yes].reduce((c, o) => decayedUpdate(c, o), zero);
        const earlyGood = [yes, yes, no, no].reduce((c, o) => decayedUpdate(c, o), zero);
        expect(lateGood.leave / lateGood.n).toBeGreaterThan(0.5);
        expect(earlyGood.leave / earlyGood.n).toBeLessThan(0.5);
        expect(lateGood.n).toBeCloseTo(earlyGood.n, 12);
    });
    it("decay 1 reduces to plain counts", () => {
        const c = decayedUpdate(decayedUpdate({ leave: 0, autoPark: 0, teleopPark: 0, n: 0 }, { leave: true, autoPark: false, teleopPark: true }, 1), { leave: false, autoPark: false, teleopPark: true }, 1);
        expect(c).toEqual({ leave: 1, autoPark: 0, teleopPark: 2, n: 2 });
    });
});
