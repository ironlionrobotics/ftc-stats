/**
 * BIOBUZZ RP count models (lib/rp-counts.ts): re-validation on the official FIRST archive (decision #96 method).
 * Per event: train on the first 60% of quals (chronological), predict alliances in the last 40%.
 * Inputs are built like app/actions/analytics.ts (ridge tips OPR, decayed + shrunk per-robot rates).
 * 2-fold CV by event halves (even/odd index) for r and Platt fits.
 * Run: node scripts/run-ts.mjs scripts/rp-counts-backtest.ts [season] [parity|date]
 * ("current" rows use whatever lib/rp-counts.ts holds now; the 16-nov refit is in decisions.md #118.)
 */
import { componentOpr } from "@/lib/component-opr";
import { rpThresholdsFor } from "@/lib/games/season-rules";
import { biobuzzTips, biobuzzRobotOutcomes, robotSlotsFor, type AllianceScoreBreakdown } from "@/lib/score-breakdown";
import { calibrateSwarm, decayedUpdate, pAtLeastNegBin, pSwarm, shrunkRate, BIOBUZZ_TIPS_DISPERSION, SWARM_CALIBRATION, type DecayedCounts } from "@/lib/rp-counts";
import { archivedEvents } from "./first-archive";

const SEASON = Number(process.argv[2] ?? 2026);
interface Obs { leave: boolean; autoPark: boolean; teleopPark: boolean }
interface Side { teams: number[]; slots: [number | undefined, number | undefined]; tips: number; rp: { swarm: boolean; p1: boolean; p2: boolean }; obs: [Obs, Obs] }
interface Qual { num: number; red: Side; blue: Side }
interface Row { ev: number; late: number; mu: number; tips: number; y: { p1: number; p2: number; sw: number }; sw: number; swCal: number; thr: { p1: number; p2: number; sw: number } }

const B = (x: unknown) => x === true;
function loadEvents() {
    const out: { code: string; start: string; quals: Qual[] }[] = [];
    for (const a of archivedEvents(SEASON)) {
        const scores = (a.scores ?? []) as { matchLevel: string; matchNumber: number; alliances: (AllianceScoreBreakdown & { alliance: string })[] }[];
        const sc = new Map(scores.filter(s => s.matchLevel === "QUALIFICATION").map(s => [s.matchNumber, s]));
        const quals: Qual[] = [];
        for (const m of a.matches.filter(m => m.tournamentLevel === "QUALIFICATION")) {
            const s = sc.get(m.matchNumber);
            if (!s) continue;
            const mk = (c: "Red" | "Blue"): Side | null => {
                const b = s.alliances.find(x => x.alliance.toLowerCase() === c.toLowerCase());
                if (!b || Object.keys(b).length === 0) return null;
                const slots = robotSlotsFor(m.teams, c);
                return {
                    teams: m.teams.filter(t => t.station.startsWith(c)).map(t => t.teamNumber), slots, tips: biobuzzTips(b),
                    rp: { swarm: B((b as Record<string, unknown>).swarmRP), p1: B((b as Record<string, unknown>).pollinator1RP), p2: B((b as Record<string, unknown>).pollinator2RP) },
                    obs: [biobuzzRobotOutcomes(b, 1), biobuzzRobotOutcomes(b, 2)],
                };
            };
            const red = mk("Red"), blue = mk("Blue");
            if (red && blue) quals.push({ num: m.matchNumber, red, blue });
        }
        quals.sort((x, y) => x.num - y.num);
        if (quals.length >= 10) out.push({ code: a.event.code, start: a.event.dateStart ?? "", quals });
    }
    return out;
}

// ---- math helpers
function lgamma(x: number): number {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, t = x + 5.5; t -= (x + 0.5) * Math.log(t);
    let s = 1.000000000190015; for (const k of c) s += k / ++y;
    return -t + Math.log(2.5066282746310005 * s / x);
}
function nbLogPmf(k: number, mu: number, r: number): number {
    const m = Math.max(mu, 0.02);
    return lgamma(k + r) - lgamma(r) - lgamma(k + 1) + r * Math.log(r / (r + m)) + k * Math.log(m / (r + m));
}
function fitR(rows: Row[]): number {
    const ll = (lr: number) => rows.reduce((s, x) => s + nbLogPmf(x.tips, x.mu, Math.exp(lr)), 0);
    let lo = Math.log(0.3), hi = Math.log(1e6);
    const g = (Math.sqrt(5) - 1) / 2;
    for (let i = 0; i < 80; i++) {
        const a = hi - g * (hi - lo), b = lo + g * (hi - lo);
        if (ll(a) > ll(b)) hi = b; else lo = a;
    }
    return Math.exp((lo + hi) / 2);
}
const logit = (p: number) => { const q = Math.min(1 - 1e-6, Math.max(1e-6, p)); return Math.log(q / (1 - q)); };
function fitPlatt(ps: number[], ys: number[]): { a: number; b: number } {
    let a = 0, b = 1;
    const z = ps.map(logit);
    for (let it = 0; it < 50; it++) {
        let g0 = 0, g1 = 0, h00 = 1e-9, h01 = 0, h11 = 1e-9;
        for (let i = 0; i < z.length; i++) {
            const p = 1 / (1 + Math.exp(-(a + b * z[i]))), w = p * (1 - p);
            g0 += p - ys[i]; g1 += (p - ys[i]) * z[i]; h00 += w; h01 += w * z[i]; h11 += w * z[i] * z[i];
        }
        const det = h00 * h11 - h01 * h01;
        const da = (h11 * g0 - h01 * g1) / det, db = (h00 * g1 - h01 * g0) / det;
        a -= da; b -= db;
        if (Math.abs(da) + Math.abs(db) < 1e-9) break;
    }
    return { a, b };
}
const applyPlatt = (p: number, c: { a: number; b: number }) => (p >= 1 - 1e-12 ? 1 : p <= 1e-12 ? 0 : 1 / (1 + Math.exp(-(c.a + c.b * logit(p)))));

function report(label: string, ps: number[], ys: number[]) {
    const n = ys.length, base = ys.reduce((s, y) => s + y, 0) / n;
    const brier = ps.reduce((s, p, i) => s + (p - ys[i]) ** 2, 0) / n;
    const clim = base * (1 - base);
    const mp = ps.reduce((s, p) => s + p, 0) / n;
    const bins = Array.from({ length: 5 }, () => ({ n: 0, p: 0, y: 0 }));
    ps.forEach((p, i) => { const b = bins[Math.min(4, Math.floor(p * 5))]; b.n++; b.p += p; b.y += ys[i]; });
    const rel = bins.map((b, i) => `[${i * 20}-${(i + 1) * 20}%) n=${b.n} pred=${b.n ? (b.p / b.n).toFixed(3) : "-"} obs=${b.n ? (b.y / b.n).toFixed(3) : "-"}`).join(" | ");
    console.log(`  ${label.padEnd(26)} n=${n} Brier=${brier.toFixed(4)} skill=${(1 - brier / clim).toFixed(3)} meanPred=${mp.toFixed(3)} obs=${base.toFixed(3)}\n      ${rel}`);
    return brier;
}

// ---- build rows
const events = loadEvents();
const startOf = events.map(e => e.start);
console.log(`season ${SEASON}: ${events.length} events with >=10 quals having breakdowns`);

interface Acc { c: DecayedCounts; ts: number; n: number }
const trainInfo = events.map(ev => {
    const cut = Math.floor(ev.quals.length * 0.6);
    const train = ev.quals.slice(0, cut), test = ev.quals.slice(cut);
    const rows = train.flatMap(q => ([q.red, q.blue]).flatMap(s => (s.teams.length ? [{ teams: s.teams, value: s.tips }] : [])));
    const opr = componentOpr(rows);
    const acc = new Map<number, Acc>();
    for (const q of train) for (const s of [q.red, q.blue]) {
        s.slots.forEach((t, i) => {
            if (t == null) return;
            const a = acc.get(t) ?? { c: { leave: 0, autoPark: 0, teleopPark: 0, n: 0 }, ts: 0, n: 0 };
            a.c = decayedUpdate(a.c, s.obs[i]);
            acc.set(t, a);
        });
        for (const t of s.teams) { const a = acc.get(t) ?? { c: { leave: 0, autoPark: 0, teleopPark: 0, n: 0 }, ts: 0, n: 0 }; a.n++; a.ts += opr.get(t) ?? 0; acc.set(t, a); }
    }
    return { ev, test, opr, acc };
});
// analysis-wide average robot prior (production pools every team's accumulators)
let sl = 0, sa = 0, st = 0, sn = 0, tw = 0, tm = 0;
for (const ti of trainInfo) for (const a of ti.acc.values()) { sl += a.c.leave; sa += a.c.autoPark; st += a.c.teleopPark; sn += a.c.n; tw += a.ts; tm += a.n; }
const prior = { leave: sl / Math.max(sn, 1), autoPark: sa / Math.max(sn, 1), teleopPark: st / Math.max(sn, 1), tips: tw / Math.max(tm, 1) };
console.log(`prior robot: leave ${prior.leave.toFixed(3)} autoPark ${prior.autoPark.toFixed(3)} teleopPark ${prior.teleopPark.toFixed(3)} tips ${prior.tips.toFixed(3)}; current r=${BIOBUZZ_TIPS_DISPERSION.toFixed(3)}`);

const order = events.map((_, i) => i).sort((a, b) => (startOf[a] < startOf[b] ? -1 : 1));
const dateRank = new Map(order.map((e, r) => [e, r]));
const rows: Row[] = [];
let flagMismatch = 0, flagN = 0;
trainInfo.forEach((ti, evIdx) => {
    const th = rpThresholdsFor(SEASON, ti.ev.code);
    const thr = { p1: th.pollinator1 ?? 4, p2: th.pollinator2 ?? 7, sw: th.swarm ?? 16 };
    const rates = (t: number | undefined) => {
        const a = t != null ? ti.acc.get(t) : undefined;
        if (!a || a.c.n === 0) return { leave: prior.leave, autoPark: prior.autoPark, teleopPark: prior.teleopPark };
        return { leave: shrunkRate(a.c.leave, a.c.n, prior.leave), autoPark: shrunkRate(a.c.autoPark, a.c.n, prior.autoPark), teleopPark: shrunkRate(a.c.teleopPark, a.c.n, prior.teleopPark) };
    };
    for (const q of ti.test) for (const s of [q.red, q.blue]) {
        const mu = s.teams.slice(0, 2).reduce((x, t) => x + Math.max(0, ti.opr.get(t) ?? prior.tips), 0);
        const raw = pSwarm(rates(s.slots[0]), rates(s.slots[1]), thr.sw);
        flagN++; if ((s.tips >= thr.p1) !== s.rp.p1) flagMismatch++;
        rows.push({ ev: evIdx, late: +(dateRank.get(evIdx)! >= events.length / 2), mu, tips: s.tips, y: { p1: +s.rp.p1, p2: +s.rp.p2, sw: +s.rp.swarm }, sw: raw, swCal: calibrateSwarm(raw), thr });
    }
});
console.log(`test alliances: ${rows.length}; tips>=pollinator1 threshold disagrees with official flag in ${flagMismatch}/${flagN}`);
console.log(`test TIPS mean ${(rows.reduce((s, r) => s + r.tips, 0) / rows.length).toFixed(3)} var ${(() => { const m = rows.reduce((s, r) => s + r.tips, 0) / rows.length; return (rows.reduce((s, r) => s + (r.tips - m) ** 2, 0) / rows.length).toFixed(3); })()}`);

const MODE: "parity" | "date" = (process.argv[3] as "parity" | "date") ?? "parity";
const fold = (k: number) => rows.filter(r => (MODE === "parity" ? r.ev % 2 : r.late) === k);
console.log(`fold mode: ${MODE} (parity = even/odd event index, date = early/late events); folds n=${fold(0).length}/${fold(1).length}`);
const rAll = fitR(rows), rF = [fitR(fold(0)), fitR(fold(1))];
console.log(`fitted r: all=${rAll.toFixed(3)} even-half=${rF[0].toFixed(3)} odd-half=${rF[1].toFixed(3)} (marginal-moment r from archive 1.295/2.014 = ${(1.295 ** 2 / (2.014 - 1.295)).toFixed(3)})`);

const pol = (r: Row, k: "p1" | "p2", rr: number) => pAtLeastNegBin(r.thr[k], r.mu, rr);
for (const k of ["p1", "p2"] as const) {
    console.log(`\n=== POLLINATOR ${k === "p1" ? 1 : 2} (threshold ${rows[0].thr[k]} TIPS) ===`);
    const ys = rows.map(r => r.y[k]);
    const bCur = report("current r", rows.map(r => pol(r, k, BIOBUZZ_TIPS_DISPERSION)), ys);
    // CV r: fit on other half, predict this half
    const psCv: number[] = [], ysCv: number[] = [];
    for (const f of [0, 1]) for (const r of fold(f)) { psCv.push(pol(r, k, rF[1 - f])); ysCv.push(r.y[k]); }
    const bR = report("fitted r (2-fold CV)", psCv, ysCv);
    report("fitted r (all, in-sample)", rows.map(r => pol(r, k, rAll)), ys);
    for (const [nm, rr] of [["current r", () => BIOBUZZ_TIPS_DISPERSION], ["CV r", (f: number) => rF[1 - f]]] as const) {
        const cs: { a: number; b: number }[] = [], ps: number[] = [], yy: number[] = [];
        for (const f of [0, 1]) {
            const tr = fold(1 - f), te = fold(f);
            const c = fitPlatt(tr.map(r => pol(r, k, rr(f))), tr.map(r => r.y[k])); cs.push(c);
            for (const r of te) { ps.push(applyPlatt(pol(r, k, rr(f)), c)); yy.push(r.y[k]); }
        }
        const b = report(`Platt on ${nm} (CV)`, ps, yy);
        console.log(`      Platt coefs per half: ${cs.map(c => `a=${c.a.toFixed(3)} b=${c.b.toFixed(3)}`).join(" / ")}  dBrier vs current=${(b - bCur).toFixed(4)}`);
    }
    console.log(`      dBrier fitted r vs current = ${(bR - bCur).toFixed(4)}`);
}

console.log(`\n=== SWARM (threshold ${rows[0].thr.sw}) ===`);
const ysS = rows.map(r => r.y.sw);
const bRaw = report("uncalibrated", rows.map(r => r.sw), ysS);
const bCurS = report(`current Platt a=${SWARM_CALIBRATION.a} b=${SWARM_CALIBRATION.b}`, rows.map(r => r.swCal), ysS);
{
    const cs: { a: number; b: number }[] = [], ps: number[] = [], yy: number[] = [];
    for (const f of [0, 1]) {
        const tr = fold(1 - f), te = fold(f);
        const c = fitPlatt(tr.map(r => r.sw), tr.map(r => r.y.sw)); cs.push(c);
        for (const r of te) { ps.push(applyPlatt(r.sw, c)); yy.push(r.y.sw); }
    }
    const b = report("refit Platt (2-fold CV)", ps, yy);
    const all = fitPlatt(rows.map(r => r.sw), ysS);
    console.log(`      coefs per half: ${cs.map(c => `a=${c.a.toFixed(3)} b=${c.b.toFixed(3)}`).join(" / ")}; all-data a=${all.a.toFixed(3)} b=${all.b.toFixed(3)}; dBrier vs current=${(b - bCurS).toFixed(4)} (raw->refit ${(b - bRaw).toFixed(4)})`);
}
