/**
 * Recomputes every figure of lib/reports/oracle-calibration.ts from the raw
 * backtest output of scripts/oracle-backtest.ts (official FIRST archive):
 * per season, per event tier, and the reliability diagram (raw σ vs the 2.4×
 * playoff inflation of decisions.md #59). Verified against the old FTCScout
 * output (data/oracle-backtest/): it reproduces the published numbers exactly.
 *
 * Usage: node scripts/build-oracle-calibration.mjs [dir]   (default data/oracle-backtest-first)
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2] || join(process.cwd(), "data", "oracle-backtest-first");
const load = pre => readdirSync(dir).filter(f => f.startsWith(pre)).flatMap(f => readFileSync(join(dir, f), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)));
const seasons = load("season-").filter(r => r.playoffN && r.season <= 2025);
const r1 = x => Math.round(x * 10) / 10, r3 = x => Math.round(x * 1000) / 1000;
const agg = rs => { const n = rs.reduce((s, r) => s + r.playoffN, 0), h = rs.reduce((s, r) => s + r.hits, 0), p = rs.reduce((s, r) => s + r.meanP * r.playoffN, 0), b = rs.reduce((s, r) => s + r.brier * r.playoffN, 0); return { events: rs.length, matches: n, accuracy: r1(100 * h / n), brier: r3(b / n), meanP: r1(100 * p / n) }; };
const by = {}; for (const r of seasons) (by[r.season] ??= []).push(r);
console.log("totals", agg(seasons));
for (const s of Object.keys(by)) console.log(s, agg(by[s]));
const lvl = t => t === "Championship" ? "championship" : t === "Premier" ? "premier" : t === "FIRSTChampionship" ? "worlds" : "regional";
const L = {}; for (const r of seasons) (L[lvl(r.type)] ??= []).push(r);
for (const k of Object.keys(L)) console.log(k, agg(L[k]));
function erf(x) { const t = 1 / (1 + 0.3275911 * Math.abs(x)); const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x); return x >= 0 ? y : -y; }
const phi = x => 0.5 * (1 + erf(x / Math.SQRT2));
const ms = load("matches-").filter(r => !r.skipped && Number.isFinite(r.z) && r.season <= 2025);
for (const [name, k] of [["raw", 1], ["corrected", 2.4]]) {
  const bins = [[50, 60], [60, 70], [70, 80], [80, 90], [90, 100.01]].map(([lo, hi]) => ({ lo, hi, n: 0, p: 0, w: 0 }));
  for (const r of ms) { const p = phi(r.z / k), fav = Math.max(p, 1 - p), won = p >= 0.5 ? r.redWon : 1 - r.redWon; const b = bins.find(b => 100 * fav >= b.lo && 100 * fav < b.hi); if (!b) continue; b.n++; b.p += fav; b.w += won; }
  console.log(name, ms.length, bins.map(b => ({ range: `${b.lo}-${Math.round(b.hi)}%`, matches: b.n, predicted: r1(100 * b.p / b.n), realized: r1(100 * b.w / b.n), gap: r1(100 * (b.p - b.w) / b.n) })));
}
