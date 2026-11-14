import type { FTCMatch } from "@/types/scouting";
import { eventStrengthModel } from "@/lib/live-projection";
import { playoffWinProbability } from "@/lib/win-probability";

/**
 * "Who did PRIDE pick, and who won?" (decision #111). Pure replay of the
 * pre-match forecast for every played match: quals use the live event model
 * fitted ONLY on the quals before it (calibrated, #109); playoffs use the
 * whole quals model with playoff σ (#59). The model is deterministic, so this
 * is exactly what any PRIDE screen showed before the match — no stored log
 * needed, and it can't be tweaked after the fact.
 */

export type Side = "Red" | "Blue";

export interface LedgerRow {
    level: string;
    matchNumber: number;
    series: number;
    red: number[];
    blue: number[];
    /** P(red wins) before the match; null when the model had < 2 quals. */
    pRed: number | null;
    /** Favorite before the match; null = no forecast or a true toss-up (|p − ½| < TOSSUP). */
    predicted: Side | null;
    winner: Side | "Tie";
    /** null when there was no call (no forecast, toss-up or tie). */
    correct: boolean | null;
    redScore: number;
    blueScore: number;
}

export interface Scorecard {
    /** Matches with a forecast and a winner. */
    n: number;
    /** Correct calls among matches with a favorite (toss-ups excluded). */
    calls: number;
    hits: number;
    accuracy: number | null;
    brier: number | null;
    logLoss: number | null;
    /** Favorite's predicted vs real win rate per confidence band (50–60 … 90–100). */
    bands: Array<{ lo: number; hi: number; n: number; predicted: number; actual: number }>;
}

/** Below this margin from 50% PRIDE doesn't "pick" anyone: shown as toss-up. */
export const TOSSUP = 0.05;

const sideOf = (m: FTCMatch, c: Side) => m.teams.filter(t => t.station.startsWith(c) && t.onField !== false).map(t => t.teamNumber);
const isPlayed = (m: FTCMatch) => (m.postResultTime?.length ?? 0) > 0 || (m.scoreRedFinal ?? 0) + (m.scoreBlueFinal ?? 0) > 0;
const order = (a: FTCMatch, b: FTCMatch) => {
    const t = (m: FTCMatch) => Date.parse(m.actualStartTime ?? m.postResultTime ?? "") || 0;
    return t(a) - t(b) || (a.series ?? 0) - (b.series ?? 0) || a.matchNumber - b.matchNumber;
};

export function predictionLedger(matches: FTCMatch[]): LedgerRow[] {
    const quals = matches.filter(m => m.tournamentLevel === "QUALIFICATION" && isPlayed(m)).sort((a, b) => a.matchNumber - b.matchNumber);
    const playoffs = matches.filter(m => m.tournamentLevel === "PLAYOFF" && isPlayed(m)).sort(order);
    const rows: LedgerRow[] = [];
    const push = (m: FTCMatch, pRed: number | null) => {
        const rs = m.scoreRedFinal ?? 0, bs = m.scoreBlueFinal ?? 0;
        const winner: Side | "Tie" = rs === bs ? "Tie" : rs > bs ? "Red" : "Blue";
        const predicted: Side | null = pRed === null || Math.abs(pRed - 0.5) < TOSSUP ? null : pRed > 0.5 ? "Red" : "Blue";
        rows.push({
            level: m.tournamentLevel, matchNumber: m.matchNumber, series: m.series ?? 0,
            red: sideOf(m, "Red"), blue: sideOf(m, "Blue"), pRed, predicted, winner,
            correct: predicted === null || winner === "Tie" ? null : predicted === winner,
            redScore: rs, blueScore: bs,
        });
    };
    quals.forEach((m, k) => {
        const before = quals.slice(0, k);
        push(m, before.length >= 2 ? eventStrengthModel(before).pRed(sideOf(m, "Red"), sideOf(m, "Blue")) : null);
    });
    if (playoffs.length) {
        const model = quals.length >= 2 ? eventStrengthModel(quals) : null;
        const mu = (a: number[]) => a.reduce((s, t) => s + (model?.strength(t) ?? 0), 0);
        for (const m of playoffs) push(m, model ? playoffWinProbability(mu(sideOf(m, "Red")), mu(sideOf(m, "Blue")), model.sigmaDiff) : null);
    }
    return rows;
}

export function scorecard(rows: LedgerRow[]): Scorecard {
    const scored = rows.filter(r => r.pRed !== null && r.winner !== "Tie");
    const calls = scored.filter(r => r.predicted !== null);
    const hits = calls.filter(r => r.correct).length;
    let brier = 0, ll = 0;
    const bands = [0.5, 0.6, 0.7, 0.8, 0.9].map(lo => ({ lo, hi: lo + 0.1, n: 0, predicted: 0, actual: 0 }));
    for (const r of scored) {
        const p = Math.min(0.99, Math.max(0.01, r.pRed!));
        const y = r.winner === "Red" ? 1 : 0;
        brier += (p - y) ** 2;
        ll -= Math.log(y ? p : 1 - p);
        const fav = Math.max(p, 1 - p), favWon = (p >= 0.5) === (y === 1) ? 1 : 0;
        const b = bands[Math.min(4, Math.floor((fav - 0.5) / 0.1))];
        b.n++; b.predicted += fav; b.actual += favWon;
    }
    const n = scored.length;
    return {
        n,
        calls: calls.length,
        hits,
        accuracy: calls.length ? hits / calls.length : null,
        brier: n ? brier / n : null,
        logLoss: n ? ll / n : null,
        bands: bands.map(b => ({ ...b, predicted: b.n ? b.predicted / b.n : 0, actual: b.n ? b.actual / b.n : 0 })),
    };
}
