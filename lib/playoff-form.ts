import type { FTCMatch } from "@/types/scouting";
import { npScore, sideDisqualified, type StrengthModel } from "@/lib/live-projection";
import { winProbabilityFromNormalModel, PLAYOFF_FORM_K, PLAYOFF_SIGMA_INFLATION } from "@/lib/win-probability";

/**
 * Live playoff forecast (decision #113): the event's quals strength
 * (eventStrengthModel) plus each alliance's PLAYOFF FORM — what it actually
 * scored in the playoff matches already played versus its quals projection,
 * shrunk toward 0:  offset = Σ (np − projected) / (PLAYOFF_FORM_K + n).
 *
 * Backtest (scripts/playoff-update-backtest.ts, held-out events): log loss
 * 0.506 → 0.487 (2025, 3,056 matches) and 0.497 → 0.462 (2024, 2,480);
 * accuracy 76.1 → 76.3% and 76.3 → 77.9%. Same K≈2 optimum in 2024–2026.
 *
 * σ: this model's σ_diff comes from the ridge OPR residuals, and on it the
 * playoff inflation that fits is 1.6 (2024, 2025, 2026 all agree), not the
 * 2.4 that PLAYOFF_SIGMA_INFLATION calibrates for the Oracle's own
 * between-event σ (#59). Using 2.4 here was making live playoff odds too timid.
 */
export const LIVE_PLAYOFF_SIGMA_INFLATION = 1.6;

/**
 * Per-robot σ to hand the Oracle bracket (TeamEvolution.sigma) so it
 * reproduces THIS model: two robots combine to σ_alliance·r, two alliances to
 * σ_diff·r, and the bracket's own ×PLAYOFF_SIGMA_INFLATION brings it to
 * σ_diff × LIVE_PLAYOFF_SIGMA_INFLATION (r = 1.6 / 2.4).
 */
export function oracleRobotSigma(model: StrengthModel): number {
    return (model.sigmaAlliance / Math.SQRT2) * (LIVE_PLAYOFF_SIGMA_INFLATION / PLAYOFF_SIGMA_INFLATION);
}

export interface PlayoffForecaster {
    /** Projected non-penalty points of a fielded side: quals strength + its alliance's form. */
    mu(side: number[]): number;
    /** P(red wins) for a playoff match. */
    pRed(red: number[], blue: number[]): number;
    /** Learn from a played playoff match (call in play order when replaying pre-match forecasts). */
    record(m: FTCMatch): void;
    /** Form of the alliance a team plays in (null before its first playoff result). */
    formOf(team: number): { n: number; sum: number; offset: number } | null;
}

const fielded = (m: FTCMatch, c: "Red" | "Blue") =>
    m.teams.filter(t => t.station.startsWith(c) && t.onField !== false).map(t => t.teamNumber);

export function playoffForecaster(model: StrengthModel, played: FTCMatch[] = []): PlayoffForecaster {
    // Alliance identity: robots that share a playoff side belong to one alliance
    // (3-robot alliances rotate who's fielded), via union-find.
    const parent = new Map<number, number>();
    const find = (x: number): number => {
        const p = parent.get(x);
        if (p === undefined || p === x) return x;
        const r = find(p);
        parent.set(x, r);
        return r;
    };
    const union = (side: number[]) => {
        for (const t of side) {
            if (!parent.has(t)) parent.set(t, t);
            parent.set(find(t), find(side[0]));
        }
    };
    const form = new Map<number, { n: number; sum: number }>();
    const quals = (side: number[]) => side.reduce((s, t) => s + model.strength(t), 0);
    const allianceOf = (side: number[]) => {
        const known = side.find(t => parent.has(t));
        return known === undefined ? null : find(known);
    };
    const offsetOf = (f?: { n: number; sum: number }) => (f && f.n > 0 ? f.sum / (PLAYOFF_FORM_K + f.n) : 0);
    const mu = (side: number[]) => {
        const a = allianceOf(side);
        return quals(side) + (a === null ? 0 : offsetOf(form.get(a)));
    };

    const api: PlayoffForecaster = {
        mu,
        pRed: (red, blue) => winProbabilityFromNormalModel(mu(red), mu(blue), model.sigmaDiff * LIVE_PLAYOFF_SIGMA_INFLATION),
        record(m) {
            for (const c of ["Red", "Blue"] as const) {
                const side = fielded(m, c);
                if (side.length === 0) continue;
                union(side);
                if (sideDisqualified(m, c)) continue; // a DQ's 0 is a penalty, not form
                const a = find(side[0]);
                const f = form.get(a) ?? { n: 0, sum: 0 };
                f.n++;
                f.sum += npScore(m, c) - quals(side);
                form.set(a, f);
            }
        },
        formOf(team) {
            if (!parent.has(team)) return null;
            const f = form.get(find(team));
            return f ? { ...f, offset: offsetOf(f) } : null;
        },
    };
    played.forEach(api.record);
    return api;
}
