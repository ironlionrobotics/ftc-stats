/**
 * Playoff in-event update backtest (decision #113).
 *
 * Question: once an alliance has played playoff matches, should its forecast
 * keep using ONLY the quals model (what PRIDE does today), or learn from the
 * playoff scores it already put up (robot broke, strategy change, a pick that
 * clicks better than quals suggested)?
 *
 * Model under test: prior = Σ ridge OPR (λ=1, non-penalty, all quals) of the
 * fielded robots — the same strength the ledger and Oracle use. Each alliance
 * gets an offset from its earlier playoff matches, shrunk toward 0:
 *     offset_A = Σ (np_score − prior) / (k + n_A)
 * k = ∞ is today's quals-only model. Also re-tunes the playoff σ inflation
 * jointly (the offset removes part of the error the inflation was covering).
 * Fit on even-indexed events, reported on odd-indexed ones (held out).
 *
 * Data: the OFFICIAL FIRST season archive (data/first-archive/ftc/<S>/, built with
 * scripts/first-archive-pull.ts; 2026 is read from data/season-pull/2026/). No
 * FTCScout. Scores are final − fouls received (decision #48); OPR is our ridge.
 * Run: node scripts/run-ts.mjs scripts/playoff-update-backtest.ts 2026 [2025 ...]
 */
import { componentOpr } from "@/lib/component-opr";
import { winProbabilityFromNormalModel } from "@/lib/win-probability";
import { archiveMatchEvents, type ArchM } from "./first-archive";

const SEASONS = process.argv.slice(2).map(Number).filter(Boolean);

type M = ArchM;
interface Ev { code: string; quals: M[]; playoffs: M[] }

const usable = (m: M) => m.red.length > 0 && m.blue.length > 0
    && [m.redNp, m.blueNp, m.redTot, m.blueTot].every(v => typeof v === "number" && Number.isFinite(v));

function load(season: number): Ev[] {
    return archiveMatchEvents(season)
        .sort((a, b) => a.start.localeCompare(b.start) || a.code.localeCompare(b.code))
        .map(e => ({ code: e.code, quals: e.quals.filter(usable), playoffs: e.playoffs.filter(usable) }))
        .filter(e => e.quals.length >= 6 && e.playoffs.length >= 3);
}

/** Alliance id per team: teams that ever share a playoff side are one alliance (3-robot alliances rotate). */
function allianceIds(playoffs: M[]): Map<number, number> {
    const parent = new Map<number, number>();
    const find = (x: number): number => {
        if (!parent.has(x)) parent.set(x, x);
        const p = parent.get(x)!;
        if (p === x) return x;
        const r = find(p); parent.set(x, r); return r;
    };
    for (const m of playoffs) for (const side of [m.red, m.blue]) for (const t of side.slice(1)) parent.set(find(t), find(side[0]));
    const out = new Map<number, number>();
    for (const t of parent.keys()) out.set(t, find(t));
    return out;
}

interface Pred { p: number; y: number; hasHistory: boolean }

/** Every playoff prediction of one event under (k, inflation). */
function replay(e: Ev, k: number, infl: number, lambda = 1): Pred[] {
    const rows = e.quals.flatMap(m => [{ teams: m.red, value: m.redNp }, { teams: m.blue, value: m.blueNp }]);
    const opr = componentOpr(rows, { lambda });
    const meanSize = rows.reduce((s, r) => s + r.teams.length, 0) / rows.length;
    const meanScore = rows.reduce((s, r) => s + r.value, 0) / rows.length;
    const strength = (t: number) => opr.get(t) ?? meanScore / meanSize;
    const mu = (a: number[]) => a.reduce((s, t) => s + strength(t), 0);
    const rms = Math.sqrt(rows.reduce((s, r) => s + (r.value - mu(r.teams)) ** 2, 0) / rows.length);
    const sigmaDiff = Math.SQRT2 * Math.max(rms, 0.2 * meanScore, 1);

    const ids = allianceIds(e.playoffs);
    const hist = new Map<number, { sum: number; n: number }>();
    const offset = (side: number[]) => {
        const h = hist.get(ids.get(side[0])!);
        return h && Number.isFinite(k) ? h.sum / (k + h.n) : 0;
    };
    const out: Pred[] = [];
    for (const m of e.playoffs) {
        const ra = ids.get(m.red[0])!, ba = ids.get(m.blue[0])!;
        const hasHistory = hist.has(ra) || hist.has(ba);
        if (m.redTot !== m.blueTot) {
            const p = winProbabilityFromNormalModel(mu(m.red) + offset(m.red), mu(m.blue) + offset(m.blue), sigmaDiff * infl);
            out.push({ p, y: m.redTot > m.blueTot ? 1 : 0, hasHistory });
        }
        for (const [side, np, a] of [[m.red, m.redNp, ra], [m.blue, m.blueNp, ba]] as const) {
            const h = hist.get(a) ?? { sum: 0, n: 0 };
            h.sum += np - mu(side); h.n++;
            hist.set(a, h);
        }
    }
    return out;
}

function score(preds: Pred[]) {
    let ll = 0, brier = 0, hits = 0;
    for (const { p: raw, y } of preds) {
        const p = Math.min(0.99, Math.max(0.01, raw));
        ll -= Math.log(y ? p : 1 - p);
        brier += (p - y) ** 2;
        if ((p >= 0.5) === (y === 1)) hits++;
    }
    const n = preds.length || 1;
    return { n: preds.length, ll: ll / n, brier: brier / n, acc: hits / n };
}

const K = [Infinity, 16, 8, 5, 3, 2, 1, 0.5];
const INFL = [1.2, 1.6, 2.0, 2.4, 2.8];

async function main() {
    for (const season of SEASONS) {
        const events = load(season);
        const fit = events.filter((_, i) => i % 2 === 0), held = events.filter((_, i) => i % 2 === 1);
        const run = (evs: Ev[], k: number, infl: number, onlyHist = false) =>
            score(evs.flatMap(e => replay(e, k, infl)).filter(p => !onlyHist || p.hasHistory));
        console.log(`\n=== Season ${season}: ${events.length} events with playoffs (fit ${fit.length} / held-out ${held.length}) ===`);
        let best = { k: Infinity, infl: 2.4, ll: Infinity };
        for (const k of K) for (const infl of INFL) {
            const r = run(fit, k, infl);
            if (r.ll < best.ll) best = { k, infl, ll: r.ll };
        }
        let bestInflQualsOnly = { infl: 2.4, ll: Infinity };
        for (const infl of INFL) { const r = run(fit, Infinity, infl); if (r.ll < bestInflQualsOnly.ll) bestInflQualsOnly = { infl, ll: r.ll }; }
        console.log(`fit: best k=${best.k} infl=${best.infl}; quals-only best infl=${bestInflQualsOnly.infl}`);
        const fmt = (label: string, r: ReturnType<typeof score>) =>
            console.log(`${label.padEnd(44)} n=${String(r.n).padStart(5)}  acc ${(r.acc * 100).toFixed(1)}%  brier ${r.brier.toFixed(4)}  logloss ${r.ll.toFixed(4)}`);
        for (const onlyHist of [false, true]) {
            console.log(onlyHist ? "-- held-out, matches where an alliance already played --" : "-- held-out, all playoff matches --");
            fmt("today (quals only, infl 2.4)", run(held, Infinity, 2.4, onlyHist));
            fmt(`quals only, infl ${bestInflQualsOnly.infl}`, run(held, Infinity, bestInflQualsOnly.infl, onlyHist));
            fmt(`with playoff update k=${best.k}, infl ${best.infl}`, run(held, best.k, best.infl, onlyHist));
        }
        // Oracle on the event page used a NON-regularized OPR: same pipeline with λ ≈ 0.
        const runL = (lambda: number, k: number, infl: number) => score(held.flatMap(e => replay(e, k, infl, lambda)));
        fmt("OPR sin regularizar (λ≈0), qualys, infl 2.4", runL(1e-6, Infinity, 2.4));
        fmt(`OPR sin regularizar (λ≈0), forma k=${best.k}, infl ${best.infl}`, runL(1e-6, best.k, best.infl));
        fmt(`OPR ridge (λ=1), forma k=${best.k}, infl ${best.infl}`, runL(1, best.k, best.infl));
        console.log("-- held-out log loss by k (infl fixed at best) --");
        console.log(K.map(k => `k=${k}: ${run(held, k, best.infl).ll.toFixed(4)}`).join("  "));
    }
}

main().catch(e => { console.error(e); process.exit(1); });
