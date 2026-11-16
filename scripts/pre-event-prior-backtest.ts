/**
 * Pre-event prior backtest (decision #114).
 *
 * Question: today every event starts from zero — before a robot's first quals
 * PRIDE knows nothing about it, and the first third of quals is the weakest
 * (73 % vs 80 % in the last third, 12–14 Nov). Most events are league meets
 * whose teams already played earlier meets. Does starting each robot from
 * what it did EARLIER THIS SEASON help?
 *
 * Model under test (same ridge OPR as eventStrengthModel, λ = 1 toward the
 * "average robot" today): shrink each robot toward ITS OWN prior instead,
 * with weight λp (in matches):
 *     prior_t = μ0 + ρ · (prevOPR_t − mean prevOPR of the robots here that have one)
 * i.e. the earlier events give RELATIVE strength (regressed by ρ), re-centered on this event's
 * level (scores grow during a season; events differ). μ0 = this event's
 * average robot from the quals played so far (before any: the prevOPR mean).
 * Robots without an earlier event keep μ0. prevOPR = match-weighted mean of
 * the robot's ridge OPRs at every earlier event of the season.
 * Uncertainty: #109's σ·√(1 + A/n̄) with a prior counting as λp matches.
 *
 * Every qual is predicted from the quals before it only; matches the baseline
 * can't forecast (< 2 quals played) count as 50 % for it. Fit on even-indexed
 * events, reported on odd-indexed (held out).
 *
 * Data: the OFFICIAL FIRST season archive (data/first-archive/ftc/<S>/, built with
 * scripts/first-archive-pull.ts; 2026 is read from data/season-pull/2026/). No FTCScout.
 * Run: node scripts/run-ts.mjs scripts/pre-event-prior-backtest.ts 2025 [2026]
 */
import { componentOpr, type OprRow } from "@/lib/component-opr";
import { winProbabilityFromNormalModel } from "@/lib/win-probability";
import { LIVE_QUAL_UNCERTAINTY } from "@/lib/live-projection";
import { archiveMatchEvents, type ArchM } from "./first-archive";

const SEASONS = process.argv.slice(2).map(Number).filter(Boolean);

type M = ArchM;
interface Ev { code: string; quals: M[]; playoffs: M[]; start?: string; type?: string }

const usable = (m: M) => m.red.length > 0 && m.blue.length > 0
    && [m.redNp, m.blueNp, m.redTot, m.blueTot].every(v => typeof v === "number" && Number.isFinite(v));

function load(season: number): Ev[] {
    return archiveMatchEvents(season)
        .map(e => ({ ...e, quals: e.quals.filter(usable) }))
        .filter(e => e.quals.length >= 6 && e.start)
        .sort((a, b) => a.start!.localeCompare(b.start!) || a.code.localeCompare(b.code));
}

const rowsOf = (ms: M[]): OprRow[] => ms.flatMap(m => [{ teams: m.red, value: m.redNp }, { teams: m.blue, value: m.blueNp }]);

/** Ridge OPR shrunk toward a PER-ROBOT prior: solve for δ = x − prior with a scalar 0 prior. */
function priorOpr(rows: OprRow[], prior: (t: number) => number, lambda: number): Map<number, number> {
    const resid = rows.map(r => ({ teams: r.teams, value: r.value - r.teams.reduce((s, t) => s + prior(t), 0) }));
    const delta = componentOpr(resid, { lambda, prior: 0 });
    return new Map([...delta].map(([t, d]) => [t, prior(t) + d]));
}

interface Pred { p: number; y: number; third: number }
interface Variant { name: string; lambdaP: number | null; a: number; rho: number }

function replay(e: Ev, prev: Map<number, { opr: number; n: number }>, v: Variant): Pred[] {
    const out: Pred[] = [];
    const robots = [...new Set(e.quals.flatMap(m => [...m.red, ...m.blue]))];
    const withPrev = robots.filter(t => prev.has(t));
    const prevMean = withPrev.length ? withPrev.reduce((s, t) => s + prev.get(t)!.opr, 0) / withPrev.length : 0;
    e.quals.forEach((m, k) => {
        if (m.redTot === m.blueTot) return;
        const y = m.redTot > m.blueTot ? 1 : 0;
        const third = Math.min(2, Math.floor((3 * k) / e.quals.length));
        const before = e.quals.slice(0, k);
        const rows = rowsOf(before);
        const meanRobot = rows.length ? rows.reduce((s, r) => s + r.value, 0) / rows.reduce((s, r) => s + r.teams.length, 0) : null;
        const usePrior = v.lambdaP !== null && withPrev.length > 0;
        if (!usePrior && before.length < 2) { out.push({ p: 0.5, y, third }); return; }
        if (usePrior && meanRobot === null && withPrev.length === 0) { out.push({ p: 0.5, y, third }); return; }
        const mu0 = meanRobot ?? prevMean;
        let strength: (t: number) => number;
        const played = new Map<number, number>();
        for (const r of rows) for (const t of r.teams) played.set(t, (played.get(t) ?? 0) + 1);
        if (usePrior) {
            const prior = (t: number) => (prev.has(t) ? mu0 + v.rho * (prev.get(t)!.opr - prevMean) : mu0);
            const opr = rows.length ? priorOpr(rows, prior, v.lambdaP!) : new Map<number, number>();
            strength = t => opr.get(t) ?? prior(t);
        } else {
            const opr = componentOpr(rows, { lambda: 1 });
            strength = t => opr.get(t) ?? mu0;
        }
        const mu = (a: number[]) => a.reduce((s, t) => s + strength(t), 0);
        // σ: residual RMS of the fit so far, with #109's floors; before any match, 0.2 · mean alliance score.
        const meanScore = rows.length ? rows.reduce((s, r) => s + r.value, 0) / rows.length : 2 * mu0;
        const rms = rows.length ? Math.sqrt(rows.reduce((s, r) => s + (r.value - mu(r.teams)) ** 2, 0) / rows.length) : 0;
        const sigmaDiff = Math.SQRT2 * Math.max(rms, 0.2 * meanScore, 1);
        const four = [...m.red, ...m.blue];
        const nEff = four.reduce((s, t) => s + (played.get(t) ?? 0) + (usePrior && prev.has(t) ? v.lambdaP! : 0), 0) / four.length;
        const p = winProbabilityFromNormalModel(mu(m.red), mu(m.blue), sigmaDiff * Math.sqrt(1 + v.a / Math.max(nEff, 0.5)));
        out.push({ p, y, third });
    });
    return out;
}

function score(preds: Pred[]) {
    let ll = 0, brier = 0, hits = 0;
    for (const { p: raw, y } of preds) {
        const p = Math.min(0.99, Math.max(0.01, raw));
        ll -= Math.log(y ? p : 1 - p);
        brier += (p - y) ** 2;
        if (raw !== 0.5 && (p > 0.5) === (y === 1)) hits++;
    }
    const n = preds.length || 1;
    return { n: preds.length, ll: ll / n, brier: brier / n, acc: hits / n };
}

async function main() {
    for (const season of SEASONS) {
        const events = load(season);
        // Season history up to (not including) each event, in date order.
        const history = new Map<number, { sum: number; n: number }>();
        const prevAt: Map<number, { opr: number; n: number }>[] = [];
        let lastStart = "", pending: Ev[] = [];
        const commit = () => {
            for (const ev of pending) {
                const opr = componentOpr(rowsOf(ev.quals), { lambda: 1 });
                const cnt = new Map<number, number>();
                for (const m of ev.quals) for (const t of [...m.red, ...m.blue]) cnt.set(t, (cnt.get(t) ?? 0) + 1);
                for (const [t, x] of opr) {
                    const h = history.get(t) ?? { sum: 0, n: 0 };
                    h.sum += x * cnt.get(t)!; h.n += cnt.get(t)!;
                    history.set(t, h);
                }
            }
            pending = [];
        };
        for (const e of events) {
            // Events on the same start date don't see each other.
            if (e.start !== lastStart) { commit(); lastStart = e.start!; }
            prevAt.push(new Map([...history].map(([t, h]) => [t, { opr: h.sum / h.n, n: h.n }])));
            pending.push(e);
        }
        const idx = events.map((_, i) => i);
        const fitIdx = idx.filter(i => i % 2 === 0), heldIdx = idx.filter(i => i % 2 === 1);
        const run = (ids: number[], v: Variant, filter: (e: Ev) => boolean = () => true) =>
            ids.filter(i => filter(events[i])).flatMap(i => replay(events[i], prevAt[i], v));

        const base: Variant = { name: "hoy (sin prior)", lambdaP: null, a: LIVE_QUAL_UNCERTAINTY, rho: 1 };
        let best: Variant = base, bestLl = score(run(fitIdx, base)).ll;
        for (const lambdaP of [0.5, 1, 2, 4]) for (const a of [2, 4, 6]) for (const rho of [0.5, 0.75, 1]) {
            const v = { name: `prior λp=${lambdaP}, A=${a}, ρ=${rho}`, lambdaP, a, rho };
            const ll = score(run(fitIdx, v)).ll;
            if (ll < bestLl) { best = v; bestLl = ll; }
        }
        // Cross-check: fixed variants from the env, e.g. VARIANTS="2,6,1;1,4,1" (λp,A,ρ).
        for (const spec of (process.env.VARIANTS ?? "").split(";").filter(Boolean)) {
            const [lambdaP, a, rho] = spec.split(",").map(Number);
            const v = { name: `fijo λp=${lambdaP}, A=${a}, ρ=${rho}`, lambdaP, a, rho };
            const preds = run(heldIdx, v);
            console.log(`${season} ${v.name}: total ${score(preds).ll.toFixed(4)} · tercios ${[0, 1, 2].map(th => score(preds.filter(p => p.third === th)).ll.toFixed(4)).join(" / ")}`);
        }
        const share = heldIdx.filter(i => prevAt[i].size > 0).length;
        console.log(`\n=== Season ${season}: ${events.length} events (held-out ${heldIdx.length}, ${share} with some robot seen before) — best: ${best.name} ===`);
        const fmt = (label: string, r: ReturnType<typeof score>) =>
            console.log(`${label.padEnd(40)} n=${String(r.n).padStart(6)}  acc ${(r.acc * 100).toFixed(1)}%  brier ${r.brier.toFixed(4)}  logloss ${r.ll.toFixed(4)}`);
        const groups: [string, (e: Ev) => boolean][] = [
            ["todos", () => true],
            ["league meets", e => e.type === "LeagueMeet"],
            ["otros (qualifiers, etc.)", e => e.type !== "LeagueMeet"],
        ];
        for (const [g, f] of groups) {
            console.log(`-- held-out, ${g} --`);
            for (const v of [base, best]) {
                const preds = run(heldIdx, v, f);
                fmt(`${v.name} · total`, score(preds));
                for (const th of [0, 1, 2]) fmt(`${v.name} · tercio ${th + 1}`, score(preds.filter(p => p.third === th)));
            }
        }
    }
}

main().catch(e => { console.error(e); process.exit(1); });
