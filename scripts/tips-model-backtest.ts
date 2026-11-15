/**
 * BIOBUZZ: does a TIPS-first win model beat the score model? (decision #115)
 *
 * Season data (14-nov) says one TIP of difference wins ~95 % of quals. The
 * live model (eventStrengthModel) predicts from non-penalty POINTS, where a
 * TIP is just 20 of them. Candidate: two stages —
 *     P(win) = P(T_red > T_blue) + P(T_red = T_blue) · P(rest_red > rest_blue)
 * T = alliance TIPS ~ Negative Binomial(mean = Σ ridge tips-OPR, size r),
 * rest = np − 20·TIPS ~ normal on its own ridge OPR. Inflation of the TIPS mean
 * uncertainty with few matches mirrors #109 (variance + A·μ/n̄ … kept simple:
 * size r shrinks with few matches via r_eff = r · n̄ / (n̄ + B)).
 *
 * Quals: each match predicted from the quals before it (like the ledger).
 * Playoffs: from all quals (no form, both models), to isolate the strength
 * measure that alliance selection relies on.
 * Fit (r, B) on even-indexed events; report held-out odd-indexed ones.
 *
 * Data: data/season-pull/<season> (scripts/biobuzz-season-pull.ts).
 * Run: node scripts/run-ts.mjs scripts/tips-model-backtest.ts 2026
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { componentOpr, type OprRow } from "@/lib/component-opr";
import { winProbabilityFromNormalModel } from "@/lib/win-probability";
import { LIVE_QUAL_UNCERTAINTY } from "@/lib/live-projection";
import { LIVE_PLAYOFF_SIGMA_INFLATION } from "@/lib/playoff-form";

const SEASON = Number(process.argv[2] ?? 2026);
const DIR = join(process.cwd(), "data", "season-pull", String(SEASON));

interface A { teams: number[]; np: number; tips: number; total: number; auto: number; leavePark: number; rp: number }
interface ApiTeam { teamNumber: number; station: string; onField?: boolean; dq?: boolean }
interface ApiMatch { tournamentLevel: string; series: number; matchNumber: number; postResultTime?: string | null; scoreRedFinal: number; scoreBlueFinal: number; teams: ApiTeam[] }
interface ApiAlliance { alliance: string; autoPoints?: number; teleopPoints?: number; autoHiveTips?: number; teleopHiveTips?: number; autoLeavePoints: number; autoParkPoints: number; teleopParkPoints: number; swarmRP?: boolean; pollinator1RP?: boolean; pollinator2RP?: boolean }
interface ApiScore { matchLevel: string; matchSeries: number; matchNumber: number; alliances: ApiAlliance[] }
interface M { level: "Q" | "P"; order: number; red: A; blue: A }

function load(): M[][] {
    const out: M[][] = [];
    for (const f of readdirSync(DIR).filter(f => !f.startsWith("_")).sort()) {
        const { matches, scores } = JSON.parse(readFileSync(join(DIR, f), "utf8")) as { matches: ApiMatch[]; scores: ApiScore[] };
        const sc = new Map<string, ApiScore>(scores.map(s => [`${s.matchLevel === "QUALIFICATION" ? "Q" : "P"}:${s.matchSeries}:${s.matchNumber}`, s]));
        const ms: M[] = [];
        for (const m of matches) {
            const level = m.tournamentLevel === "QUALIFICATION" ? "Q" : "P";
            const s = sc.get(`${level}:${level === "Q" ? 0 : m.series}:${m.matchNumber}`);
            if (!s || !m.postResultTime) continue;
            const side = (c: "Red" | "Blue"): A | null => {
                const b = s.alliances.find(a => a.alliance === c);
                if (!b || m.teams.some(t => t.station.startsWith(c) && t.dq)) return null;
                const total = c === "Red" ? m.scoreRedFinal : m.scoreBlueFinal, opp = c === "Red" ? m.scoreBlueFinal : m.scoreRedFinal;
                return {
                    teams: m.teams.filter(t => t.station.startsWith(c) && t.onField !== false).map(t => t.teamNumber),
                    auto: b.autoPoints ?? 0,
                    leavePark: b.autoLeavePoints + b.autoParkPoints + b.teleopParkPoints,
                    rp: (total > opp ? 3 : total === opp ? 1 : 0) + +!!b.swarmRP + +!!b.pollinator1RP + +!!b.pollinator2RP,
                    np: (b.autoPoints ?? 0) + (b.teleopPoints ?? 0),
                    tips: (b.autoHiveTips ?? 0) + (b.teleopHiveTips ?? 0),
                    total,
                };
            };
            const red = side("Red"), blue = side("Blue");
            if (!red || !blue || !red.teams.length || !blue.teams.length) continue;
            ms.push({ level, order: level === "Q" ? m.matchNumber : 1000 + m.series * 10 + m.matchNumber, red, blue });
        }
        ms.sort((a, b) => a.order - b.order);
        if (ms.filter(m => m.level === "Q").length >= 6) out.push(ms);
    }
    return out;
}

/** NB pmf over 0..K with mean mu and size r (r → ∞ = Poisson). */
function nb(mu: number, r: number, K = 25): number[] {
    const m = Math.max(mu, 0.02), p = r / (r + m);
    const out: number[] = [];
    let pk = Math.pow(p, r);
    for (let k = 0; k <= K; k++) { out.push(pk); pk *= ((k + r) / (k + 1)) * (1 - p); }
    const s = out.reduce((a, b) => a + b, 0);
    return out.map(x => x / s);
}

interface Fit {
    tipsMu(t: number[]): number; restMu(t: number[]): number; npMu(t: number[]): number;
    sigmaRest: number; sigmaNp: number; played: Map<number, number>;
}
function fit(played: M[]): Fit {
    const rows = (f: (a: A) => number): OprRow[] => played.flatMap(m => [{ teams: m.red.teams, value: f(m.red) }, { teams: m.blue.teams, value: f(m.blue) }]);
    const mk = (f: (a: A) => number) => {
        const r = rows(f); const o = componentOpr(r, { lambda: 1 });
        const prior = r.reduce((s, x) => s + x.value, 0) / r.reduce((s, x) => s + x.teams.length, 0);
        const mu = (t: number[]) => t.reduce((s, x) => s + (o.get(x) ?? prior), 0);
        const meanScore = r.reduce((s, x) => s + x.value, 0) / r.length;
        const rms = Math.sqrt(r.reduce((s, x) => s + (x.value - mu(x.teams)) ** 2, 0) / r.length);
        return { mu, sigma: Math.SQRT2 * Math.max(rms, 0.2 * meanScore, 1) };
    };
    const tips = mk(a => a.tips), rest = mk(a => a.np - 20 * a.tips), np = mk(a => a.np);
    const played_ = new Map<number, number>();
    for (const m of played) for (const t of [...m.red.teams, ...m.blue.teams]) played_.set(t, (played_.get(t) ?? 0) + 1);
    return { tipsMu: tips.mu, restMu: rest.mu, npMu: np.mu, sigmaRest: rest.sigma, sigmaNp: np.sigma, played: played_ };
}

const nbar = (f: Fit, m: M) => { const ts = [...m.red.teams, ...m.blue.teams]; return ts.reduce((s, t) => s + (f.played.get(t) ?? 0), 0) / ts.length; };

function pScore(f: Fit, m: M, playoff: boolean) {
    const s = playoff ? f.sigmaNp * LIVE_PLAYOFF_SIGMA_INFLATION : f.sigmaNp * Math.sqrt(1 + LIVE_QUAL_UNCERTAINTY / Math.max(nbar(f, m), 0.5));
    return winProbabilityFromNormalModel(f.npMu(m.red.teams), f.npMu(m.blue.teams), s);
}
function pTips(f: Fit, m: M, r: number, B: number, restInfl: number) {
    const n = Math.max(nbar(f, m), 0.5);
    const rEff = r * n / (n + B);
    const R = nb(f.tipsMu(m.red.teams), rEff), Bl = nb(f.tipsMu(m.blue.teams), rEff);
    let gt = 0, eq = 0;
    for (let i = 0; i < R.length; i++) for (let j = 0; j < Bl.length; j++) { if (i > j) gt += R[i] * Bl[j]; else if (i === j) eq += R[i] * Bl[j]; }
    const pRest = winProbabilityFromNormalModel(f.restMu(m.red.teams), f.restMu(m.blue.teams), f.sigmaRest * restInfl);
    return gt + eq * pRest;
}

interface P { p: number; y: number }
function run(events: M[][], model: (f: Fit, m: M, playoff: boolean) => number, level: "Q" | "P"): P[] {
    const out: P[] = [];
    for (const ms of events) {
        const quals = ms.filter(m => m.level === "Q");
        if (level === "Q") {
            quals.forEach((m, k) => {
                if (k < 2 || m.red.total === m.blue.total) return;
                out.push({ p: model(fit(quals.slice(0, k)), m, false), y: m.red.total > m.blue.total ? 1 : 0 });
            });
        } else {
            const f = fit(quals);
            for (const m of ms.filter(x => x.level === "P")) if (m.red.total !== m.blue.total) out.push({ p: model(f, m, true), y: m.red.total > m.blue.total ? 1 : 0 });
        }
    }
    return out;
}
function score(ps: P[]) {
    let ll = 0, br = 0, hit = 0;
    for (const { p: raw, y } of ps) { const p = Math.min(.99, Math.max(.01, raw)); ll -= Math.log(y ? p : 1 - p); br += (p - y) ** 2; hit += +((p >= .5) === (y === 1)); }
    return `n=${String(ps.length).padStart(5)} acc ${(100 * hit / ps.length).toFixed(1)}%  brier ${(br / ps.length).toFixed(4)}  logloss ${(ll / ps.length).toFixed(4)}`;
}
const llOf = (ps: P[]) => ps.reduce((s, { p: raw, y }) => { const p = Math.min(.99, Math.max(.01, raw)); return s - Math.log(y ? p : 1 - p); }, 0) / ps.length;

const events = load();
const fitE = events.filter((_, i) => i % 2 === 0), held = events.filter((_, i) => i % 2 === 1);
console.log(`Season ${SEASON}: ${events.length} events (fit ${fitE.length} / held-out ${held.length})`);
// ---- Alliance selection: which per-team metric best predicts PLAYOFF winners? ----
// "Higher sum of the two picks' metric wins", strength from all quals (all events, no fitting).
{
    const metrics: Record<string, { hit: number; n: number; tie: number }> = {};
    const add = (k: string, r: number, b: number, y: number) => {
        const x = (metrics[k] ??= { hit: 0, n: 0, tie: 0 });
        x.n++; if (r === b) { x.tie++; x.hit += 0.5; } else x.hit += +((r > b) === (y === 1));
    };
    for (const ms of events) {
        const quals = ms.filter(m => m.level === "Q");
        const po = ms.filter(m => m.level === "P" && m.red.total !== m.blue.total);
        if (!po.length) continue;
        const f = fit(quals);
        const rowsOf = (g: (a: A) => number): OprRow[] => quals.flatMap(m => [{ teams: m.red.teams, value: g(m.red) }, { teams: m.blue.teams, value: g(m.blue) }]);
        const autoO = componentOpr(rowsOf(a => a.auto), { lambda: 1 }), lpO = componentOpr(rowsOf(a => a.leavePark), { lambda: 1 });
        const per = new Map<number, { np: number; rp: number; w: number; n: number }>();
        for (const m of quals) for (const [a, o] of [[m.red, m.blue], [m.blue, m.red]] as const) for (const t of a.teams) {
            const x = per.get(t) ?? { np: 0, rp: 0, w: 0, n: 0 }; x.np += a.np; x.rp += a.rp; x.w += +(a.total > o.total); x.n++; per.set(t, x);
        }
        const avg = (t: number, k: "np" | "rp" | "w") => { const x = per.get(t); return x ? x[k] / x.n : 0; };
        const sum = (ts: number[], g: (t: number) => number) => ts.reduce((s, t) => s + g(t), 0);
        for (const m of po) {
            const y = m.red.total > m.blue.total ? 1 : 0;
            const both = (k: string, g: (t: number) => number) => add(k, sum(m.red.teams, g), sum(m.blue.teams, g), y);
            add("OPR de puntos (modelo PRIDE)", f.npMu(m.red.teams), f.npMu(m.blue.teams), y);
            add("OPR de TIPS", f.tipsMu(m.red.teams), f.tipsMu(m.blue.teams), y);
            both("promedio de puntos de su alianza (averageNP)", t => avg(t, "np"));
            both("Ranking Score (RS)", t => avg(t, "rp"));
            both("% de victorias", t => avg(t, "w"));
            const autoSum = (ts: number[]) => sum(ts, t => autoO.get(t) ?? 0);
            add("OPR + bono auto>30 (Oracle actual)", f.npMu(m.red.teams) + (autoSum(m.red.teams) > 30 ? 10 : 0), f.npMu(m.blue.teams) + (autoSum(m.blue.teams) > 30 ? 10 : 0), y);
            // Picklist-style: min-max normalize each metric over the event's teams, weighted sum.
            const evTeams = [...per.keys()];
            const norm = (g: (t: number) => number) => { const v = evTeams.map(g); const lo = Math.min(...v), hi = Math.max(...v); return (t: number) => (hi === lo ? 0.5 : (g(t) - lo) / (hi - lo)); };
            const nO = norm(t => f.npMu([t])), nL = norm(t => lpO.get(t) ?? 0);
            for (const wl of [5, 15, 30]) add(`picklist: OPR 100 + LEAVE/PARK ${wl}`, sum(m.red.teams, t => 100 * nO(t) + wl * nL(t)), sum(m.blue.teams, t => 100 * nO(t) + wl * nL(t)), y);
            add("OPR, desempate por LEAVE+PARK", f.npMu(m.red.teams) + 0.01 * sum(m.red.teams, t => lpO.get(t) ?? 0), f.npMu(m.blue.teams) + 0.01 * sum(m.blue.teams, t => lpO.get(t) ?? 0), y);
        }
    }
    console.log(`\nSELECCIÓN DE ALIANZAS — ¿qué métrica de los equipos predice al ganador de playoffs? (todos los eventos)`);
    for (const [k, x] of Object.entries(metrics).sort((a, b) => b[1].hit / b[1].n - a[1].hit / a[1].n)) console.log(`  ${k.padEnd(46)} acierta ${(100 * x.hit / x.n).toFixed(1)}%  (n=${x.n}${x.tie ? `, empates ${x.tie}` : ""})`);
}

for (const level of ["Q", "P"] as const) {
    let best = { r: 2, B: 2, ri: 1, ll: Infinity };
    for (const r of [1, 2, 4, 8, 50]) for (const B of [0, 2, 4]) for (const ri of [1, 1.6, 2.4]) {
        const ll = llOf(run(fitE, (f, m) => pTips(f, m, r, B, ri), level));
        if (ll < best.ll) best = { r, B, ri, ll };
    }
    console.log(`\n${level === "Q" ? "QUALYS (pronóstico con las qualys previas)" : "PLAYOFFS (fuerza de todas las qualys, sin forma)"} — mejor TIPS: r=${best.r} B=${best.B} σresto×${best.ri}`);
    console.log(`  puntos (actual)  ${score(run(held, pScore, level))}`);
    console.log(`  TIPS primero     ${score(run(held, (f, m) => pTips(f, m, best.r, best.B, best.ri), level))}`);
}
