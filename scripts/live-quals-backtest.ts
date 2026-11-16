/**
 * Live qual-match win probability backtest (decision #109).
 *
 * Replays what "Hoy" shows before each qualification match: an event
 * strength model fitted ONLY on the quals already played (lib/live-projection
 * eventStrengthModel = ridge component OPR on non-penalty score + normal
 * model). Measures accuracy / Brier / log loss over every finished event of a
 * season of the official FIRST archive, and fits the calibration knobs:
 *   - lambda: ridge strength of the OPR (prior weight in matches)
 *   - a:      parameter-uncertainty inflation, σ_eff = σ · √(1 + a / n̄),
 *             n̄ = mean quals already played by the 4 robots in the match
 * Fit on even-indexed events, reported on odd-indexed ones (held out).
 *
 * Run: node scripts/run-ts.mjs scripts/live-quals-backtest.ts 2026
 * Data: the OFFICIAL FIRST season archive (data/first-archive/ftc/<S>/, built with
 * scripts/first-archive-pull.ts; 2026 is read from data/season-pull/2026/). No FTCScout.
 */
import { componentOpr } from "@/lib/component-opr";
import { winProbabilityFromNormalModel } from "@/lib/win-probability";
import { archiveMatchEvents, type ArchM } from "./first-archive";

const SEASON = Number(process.argv[2] ?? 2026);

interface Q { n: number; red: number[]; blue: number[]; redNp: number; blueNp: number; redTot: number; blueTot: number }
interface Ev { code: string; quals: Q[] }

/** A usable qual: both alliances fielded and every score present. */
const ok = (q: Q) => q.red.length > 0 && q.blue.length > 0
    && [q.redNp, q.blueNp, q.redTot, q.blueTot].every(v => typeof v === "number" && Number.isFinite(v));

function load(): Ev[] {
    return archiveMatchEvents(SEASON)
        .sort((a, b) => a.start.localeCompare(b.start) || a.code.localeCompare(b.code))
        .map(e => ({ code: e.code, quals: e.quals.map((m: ArchM): Q => ({ n: m.s, red: m.red, blue: m.blue, redNp: m.redNp, blueNp: m.blueNp, redTot: m.redTot, blueTot: m.blueTot })).filter(ok) }))
        .filter(e => e.quals.length >= 6);
}

interface Pred { z: number; sigma: number; nbar: number; mu: number; redWon: 0 | 1 }

/** Same math as eventStrengthModel, with lambda exposed; returns raw pieces so σ can be re-scaled. */
function predictions(ev: Ev, lambda: number): Pred[] {
    const out: Pred[] = [];
    const played = new Map<number, number>();
    for (let k = 0; k < ev.quals.length; k++) {
        const m = ev.quals[k];
        const before = ev.quals.slice(0, k);
        if (before.length >= 2 && m.redTot !== m.blueTot) {
            const rows = before.flatMap(q => [{ teams: q.red, value: q.redNp }, { teams: q.blue, value: q.blueNp }]).filter(r => r.teams.length > 0);
            const opr = componentOpr(rows, { lambda });
            const meanSize = rows.reduce((s, r) => s + r.teams.length, 0) / rows.length;
            const prior = rows.reduce((s, r) => s + r.value, 0) / rows.length / meanSize;
            const st = (t: number) => opr.get(t) ?? prior;
            const res = rows.map(r => r.value - r.teams.reduce((s, t) => s + st(t), 0));
            const rms = Math.sqrt(res.reduce((s, x) => s + x * x, 0) / res.length);
            const meanScore = rows.reduce((s, r) => s + r.value, 0) / rows.length;
            const sigma = Math.SQRT2 * Math.max(rms, 0.2 * meanScore, 1);
            const mu = m.red.reduce((s, t) => s + st(t), 0) - m.blue.reduce((s, t) => s + st(t), 0);
            const four = [...m.red, ...m.blue];
            const nbar = four.reduce((s, t) => s + (played.get(t) ?? 0), 0) / Math.max(1, four.length);
            out.push({ z: mu / sigma, sigma, nbar, mu, redWon: m.redTot > m.blueTot ? 1 : 0 });
        }
        for (const t of [...m.red, ...m.blue]) played.set(t, (played.get(t) ?? 0) + 1);
    }
    return out;
}

const phi = (z: number) => winProbabilityFromNormalModel(z, 0, 1);

function score(preds: Pred[], a: number) {
    let acc = 0, brier = 0, ll = 0;
    for (const p of preds) {
        const q = Math.min(0.99, Math.max(0.01, phi(p.z / Math.sqrt(1 + a / Math.max(p.nbar, 0.5)))));
        acc += (q > 0.5 ? 1 : 0) === p.redWon ? 1 : 0;
        brier += (q - p.redWon) ** 2;
        ll -= Math.log(p.redWon ? q : 1 - q);
    }
    const n = preds.length;
    return { n, acc: acc / n, brier: brier / n, ll: ll / n };
}

function calibration(preds: Pred[], a: number) {
    const bins = Array.from({ length: 5 }, () => ({ n: 0, p: 0, y: 0 }));
    for (const p of preds) {
        const q = phi(p.z / Math.sqrt(1 + a / Math.max(p.nbar, 0.5)));
        const fav = q >= 0.5 ? q : 1 - q, won = q >= 0.5 ? p.redWon : 1 - p.redWon;
        const b = Math.min(4, Math.floor((fav - 0.5) / 0.1));
        bins[b].n++; bins[b].p += fav; bins[b].y += won;
    }
    return bins.map((b, i) => `${50 + i * 10}-${60 + i * 10}%: n=${b.n} pred ${(b.p / Math.max(1, b.n) * 100).toFixed(0)}% real ${(b.y / Math.max(1, b.n) * 100).toFixed(0)}%`).join(" | ");
}

const fmt = (r: ReturnType<typeof score>) => `n=${r.n} acierto ${(r.acc * 100).toFixed(1)}% Brier ${r.brier.toFixed(4)} logloss ${r.ll.toFixed(4)}`;

const events = load();
const train = events.filter((_, i) => i % 2 === 0), test = events.filter((_, i) => i % 2 === 1);
console.log(`season ${SEASON}: ${events.length} events (≥6 quals), train ${train.length}, test ${test.length}`);

const LAMBDAS = [1, 2, 3, 5, 8];
const AS = [0, 0.5, 1, 2, 3, 4, 6, 8, 12];
let best = { lambda: 1, a: 0, ll: Infinity };
for (const lambda of LAMBDAS) {
    const pt = train.flatMap(e => predictions(e, lambda));
    for (const a of AS) {
        const r = score(pt, a);
        if (r.ll < best.ll) best = { lambda, a, ll: r.ll };
    }
}
const testCur = test.flatMap(e => predictions(e, 1));
const testBest = test.flatMap(e => predictions(e, best.lambda));
console.log(`fit (train): lambda=${best.lambda} a=${best.a}`);
console.log(`TEST actual (λ=1, a=0):  ${fmt(score(testCur, 0))}`);
console.log(`TEST calibrado:          ${fmt(score(testBest, best.a))}`);
console.log(`TEST moneda:             logloss ${Math.LN2.toFixed(4)} Brier 0.2500`);
console.log(`calib actual:    ${calibration(testCur, 0)}`);
console.log(`calib calibrado: ${calibration(testBest, best.a)}`);
for (const [lo, hi] of [[0, 2], [2, 4], [4, 99]] as const) {
    const c = testCur.filter(p => p.nbar >= lo && p.nbar < hi), b = testBest.filter(p => p.nbar >= lo && p.nbar < hi);
    console.log(`n̄ ${lo}-${hi}: actual ${fmt(score(c, 0))} | calibrado ${fmt(score(b, best.a))}`);
}
