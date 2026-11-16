/**
 * Starting points backtest (decision #117) — runs the PRODUCTION code
 * (lib/starting-points.ts + eventStrengthModel) over a whole season and
 * scores every qual forecast made from the quals before it.
 *
 * Variants of the in-season prior (earlier events this season):
 *  - ridge:        our own ridge OPR (λ=1) from those events' matches — what #114 validated
 *  - ftcscout:     FTCScout's event OPR as-is (candidate source; too slow at request time, #117)
 *  - ftcscout-shr: FTCScout's OPR shrunk n/(n+1) toward the event mean (≈ ridge λ=1)
 * History prior: lib/starting-points.ts historyZ on the three previous seasons.
 * Reported on odd-indexed events by start date (the 15-nov exploration fitted
 * λ/ρ on even ones), so numbers are comparable to it.
 *
 * Data (gitignored, see docs/memory/decisions.md #117):
 *   data/season-pull/history/season-<S>.json   FTCScout eventsSearch with team stats + awards
 *   data/playoff-backtest/season-<S>.json      FTCScout matches (seasons ≤ 2025)
 *   data/season-pull/2026/*.json               FIRST matches (2026)
 * Run: node scripts/run-ts.mjs scripts/starting-points-backtest.ts 2025 [2026]
 */
import { readFileSync, readdirSync } from "node:fs";
import { componentOpr, type OprRow } from "@/lib/component-opr";
import { eventStrengthModel } from "@/lib/live-projection";
import {
    buildStartingPoints, historyZ, inSeasonOpr, maxTeamWithEvents, teamSeasonProfiles,
    type ScoutEvent, type SeasonEventOpr, type StartingPoints,
} from "@/lib/starting-points";
import type { FTCMatch } from "@/types/scouting";

interface M { s: number; red: number[]; blue: number[]; redNp: number; blueNp: number; redTot: number; blueTot: number }
interface Ev { code: string; quals: M[]; start: string; type: string }
const H = "data/season-pull/history";
const scout = (s: number): ScoutEvent[] => JSON.parse(readFileSync(`${H}/season-${s}.json`, "utf8"));

function loadMatches(season: number, meta: Map<string, ScoutEvent>): Ev[] {
    let raw: { code: string; quals: M[] }[];
    if (season >= 2026) {
        const dir = `data/season-pull/${season}`;
        raw = readdirSync(dir).filter(f => f[0] !== "_").map(f => {
            const j = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
            type FT = { teamNumber: number; station: string; onField?: boolean };
            type FM = { tournamentLevel: string; matchNumber: number; teams: FT[]; scoreRedFinal: number; scoreBlueFinal: number; scoreRedFoul: number; scoreBlueFoul: number; postResultTime: string | null };
            const side = (m: FM, c: string) => m.teams.filter(t => t.station.startsWith(c) && t.onField !== false).map(t => t.teamNumber);
            return {
                code: j.event.code,
                quals: (j.matches as FM[]).filter(m => m.tournamentLevel === "QUALIFICATION" && m.postResultTime).map(m => ({
                    s: m.matchNumber, red: side(m, "Red"), blue: side(m, "Blue"),
                    redNp: m.scoreRedFinal - m.scoreBlueFoul, blueNp: m.scoreBlueFinal - m.scoreRedFoul, redTot: m.scoreRedFinal, blueTot: m.scoreBlueFinal,
                })),
            };
        });
    } else raw = JSON.parse(readFileSync(`data/playoff-backtest/season-${season}.json`, "utf8"));
    const ok = (m: M) => m.red.length > 0 && m.blue.length > 0 && [m.redNp, m.blueNp, m.redTot, m.blueTot].every(Number.isFinite);
    return raw.map(e => ({ code: e.code, quals: e.quals.filter(ok).sort((a, b) => a.s - b.s), start: meta.get(e.code)?.start ?? "", type: meta.get(e.code)?.type ?? "" }))
        .filter(e => e.quals.length >= 6 && e.start).sort((a, b) => a.start.localeCompare(b.start) || a.code.localeCompare(b.code));
}

/** The cached match shape → FTCMatch, so eventStrengthModel runs unchanged. */
const toFtc = (m: M): FTCMatch => ({
    matchNumber: m.s, tournamentLevel: "QUALIFICATION", series: 0, postResultTime: "x",
    scoreRedFinal: m.redTot, scoreBlueFinal: m.blueTot, scoreRedFoul: m.blueTot - m.blueNp, scoreBlueFoul: m.redTot - m.redNp,
    teams: [...m.red.map((t, i) => ({ teamNumber: t, station: `Red${i + 1}`, dq: false, onField: true })), ...m.blue.map((t, i) => ({ teamNumber: t, station: `Blue${i + 1}`, dq: false, onField: true }))],
} as unknown as FTCMatch);

const rowsOf = (ms: M[]): OprRow[] => ms.flatMap(m => [{ teams: m.red, value: m.redNp }, { teams: m.blue, value: m.blueNp }]);
type Variant = "none" | "history" | "ridge" | "ftcscout" | "ftcscout-shr" | "ridge+history" | "ftcscout+history" | "ftcscout-shr+history";

function main(season: number) {
    const cur = scout(season), meta = new Map(cur.map(e => [e.code, e]));
    const p1 = teamSeasonProfiles(scout(season - 1)), p2 = teamSeasonProfiles(scout(season - 2)), p3 = teamSeasonProfiles(scout(season - 3));
    const rookieAbove = maxTeamWithEvents(p2, p3);
    const hz = (t: number) => historyZ(t, p1.get(t), p2.get(t), p3.get(t), rookieAbove);
    // FTCScout in-season table: team → events {start, opr, n}, raw and shrunk.
    const raw = new Map<number, SeasonEventOpr[]>(), shr = new Map<number, SeasonEventOpr[]>();
    for (const e of cur) {
        const rows = e.teams.filter(t => (t.stats?.qualMatchesPlayed ?? 0) > 0 && Number.isFinite(t.stats?.opr?.totalPointsNp));
        if (!rows.length) continue;
        const mean = rows.reduce((s, r) => s + r.stats!.opr!.totalPointsNp!, 0) / rows.length;
        for (const r of rows) {
            const n = r.stats!.qualMatchesPlayed!, x = r.stats!.opr!.totalPointsNp!;
            (raw.get(r.teamNumber) ?? raw.set(r.teamNumber, []).get(r.teamNumber)!).push({ start: e.start, opr: x, n });
            (shr.get(r.teamNumber) ?? shr.set(r.teamNumber, []).get(r.teamNumber)!).push({ start: e.start, opr: mean + (x - mean) * n / (n + 1), n });
        }
    }
    const events = loadMatches(season, meta);
    // Own ridge in-season table + running season mean robot, events in date order.
    const ridgeAt: Map<number, number>[] = [], muRun: number[] = [];
    {
        const hist = new Map<number, { sum: number; n: number }>(); let pending: Ev[] = [], last = "", muSum = 0, muN = 0;
        const commit = () => {
            for (const ev of pending) {
                const opr = componentOpr(rowsOf(ev.quals), { lambda: 1 }), cnt = new Map<number, number>();
                for (const m of ev.quals) for (const t of [...m.red, ...m.blue]) cnt.set(t, (cnt.get(t) ?? 0) + 1);
                for (const [t, x] of opr) { const h = hist.get(t) ?? { sum: 0, n: 0 }; h.sum += x * cnt.get(t)!; h.n += cnt.get(t)!; hist.set(t, h); }
                const r = rowsOf(ev.quals); muSum += r.reduce((s, x) => s + x.value, 0) / r.reduce((s, x) => s + x.teams.length, 0); muN++;
            }
            pending = [];
        };
        for (const e of events) { if (e.start !== last) { commit(); last = e.start; } ridgeAt.push(new Map([...hist].map(([t, h]) => [t, h.sum / h.n]))); muRun.push(muN ? muSum / muN : 50); pending.push(e); }
    }
    const startFor = (i: number, v: Variant): StartingPoints | null => {
        if (v === "none") return null;
        const e = events[i], teams = [...new Set(e.quals.flatMap(m => [...m.red, ...m.blue]))];
        const inS = v.startsWith("ridge") ? (t: number) => ridgeAt[i].get(t) ?? null
            : v.startsWith("ftcscout-shr") ? (t: number) => inSeasonOpr(shr.get(t), e.start)
            : v.startsWith("ftcscout") ? (t: number) => inSeasonOpr(raw.get(t), e.start) : () => null;
        return buildStartingPoints({ teams, inSeason: inS, history: v === "history" || v.endsWith("history") ? hz : () => null, seasonMeanRobot: muRun[i] });
    };
    const variants: Variant[] = ["none", "ridge", "history", "ridge+history", "ftcscout+history", "ftcscout-shr+history"];
    console.log(`\n=== ${season}: ${events.length} events, scored on ${Math.floor(events.length / 2)} (odd) ===`);
    for (const v of variants) {
        let ll = 0, hit = 0, n = 0, ll1 = 0, hit1 = 0, n1 = 0;
        for (let i = 1; i < events.length; i += 2) {
            const e = events[i], start = startFor(i, v), ms = e.quals.map(toFtc);
            e.quals.forEach((m, k) => {
                if (m.redTot === m.blueTot) return;
                const y = m.redTot > m.blueTot ? 1 : 0;
                const before = ms.slice(0, k);
                const raw = start || k >= 2 ? eventStrengthModel(before, start).pRed(m.red, m.blue) : 0.5;
                const p = Math.min(0.99, Math.max(0.01, raw));
                const l = -Math.log(y ? p : 1 - p), h = raw !== 0.5 && (p > 0.5) === (y === 1) ? 1 : 0;
                ll += l; hit += h; n++;
                if (3 * k < e.quals.length) { ll1 += l; hit1 += h; n1++; }
            });
        }
        console.log(`${v.padEnd(22)} n=${n} acierto ${(hit / n * 100).toFixed(1)}% logloss ${(ll / n).toFixed(4)} | 1er tercio acierto ${(hit1 / n1 * 100).toFixed(1)}% logloss ${(ll1 / n1).toFixed(4)}`);
    }
}

for (const s of process.argv.slice(2).map(Number).filter(Boolean)) main(s);
