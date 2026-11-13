/**
 * Does event "noisiness" carry information the Oracle isn't already using?
 *
 * Motivation: PENDING proposed a "defensive-meta detector" that would widen the
 * model's σ automatically when an event's residuals looked defensive — the
 * lesson drawn from Power Play 2022 being the least accurate season (72.3% vs
 * ~75.7%). The idea only pays off if, AFTER the model has already fitted a σ
 * to that event, high-noise events remain miscalibrated. This script tests
 * exactly that, and the answer is no. See decisions.md #70.
 *
 * Two tests:
 *   1. Bucket each season's events by their own fitted σ. If σ already absorbs
 *      difficulty, accuracy and stated confidence should fall together and the
 *      calibration gap should stay flat.
 *   2. Bucket by a SCALE-FREE noise index, σ / typical alliance score, since
 *      raw σ is confounded with how much a given game scores. If noise carried
 *      residual signal, accuracy should fall monotonically across quartiles.
 *
 * Usage:  node scripts/oracle-noise-analysis.mjs
 * Needs:  data/oracle-backtest/season-*.jsonl  (and profiles-*.jsonl for test 2)
 *         regenerate with `node scripts/oracle-backtest.mjs run <season>`
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), "data", "oracle-backtest");
const read = (f) =>
    readFileSync(join(DIR, f), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));

/** Aggregate a set of events into accuracy / stated confidence / gap. */
function agg(rows) {
    const n = rows.reduce((s, r) => s + r.playoffN, 0);
    const hits = rows.reduce((s, r) => s + r.hits, 0);
    const conf = rows.reduce((s, r) => s + r.meanP * r.playoffN, 0) / n;
    return { events: rows.length, n, acc: hits / n, conf, gap: conf - hits / n };
}

const pct = (x) => (x * 100).toFixed(1);
const line = (label, a, extra = "") =>
    console.log(
        `${label.padEnd(20)} ${String(a.events).padStart(5)} ${String(a.n).padStart(7)}  ` +
        `${pct(a.acc).padStart(5)}  ${pct(a.conf).padStart(6)}  ${pct(a.gap).padStart(7)}  ${extra}`,
    );

console.log("TEST 1 — buckets by the event's OWN fitted sigma (within season, so scale is fixed)");
console.log("If sigma already absorbs difficulty, the GAP column stays flat while acc/conf fall together.\n");
console.log("bucket               events matches    acc%    conf%   gap(pp)");

for (const y of [2021, 2022, 2023, 2024, 2025]) {
    const file = `season-${y}.jsonl`;
    if (!existsSync(join(DIR, file))) continue;
    const rows = read(file).filter((r) => r.playoffN >= 4 && r.sigma > 0);
    const s = rows.map((r) => r.sigma).sort((a, b) => a - b);
    const lo = s[Math.floor(s.length * 0.33)];
    const hi = s[Math.floor(s.length * 0.67)];
    console.log(`\n-- ${y}`);
    line("  sigma bajo", agg(rows.filter((r) => r.sigma <= lo)));
    line("  sigma medio", agg(rows.filter((r) => r.sigma > lo && r.sigma <= hi)));
    line("  sigma alto", agg(rows.filter((r) => r.sigma > hi)));
}

console.log("\n\nTEST 2 — buckets by a SCALE-FREE noise index: sigma / typical alliance score.");
console.log("Raw sigma is confounded with the game's scoring level; this removes that.");
console.log("If noise carried signal the model misses, acc% would fall from Q1 to Q4.\n");

for (const y of [2024, 2025]) {
    const pf = `profiles-${y}.jsonl`;
    if (!existsSync(join(DIR, pf))) continue;
    const prof = new Map(read(pf).filter((p) => p.oprMean > 0).map((p) => [p.code, p]));
    const rows = read(`season-${y}.jsonl`)
        .filter((r) => r.playoffN >= 4 && r.sigma > 0 && prof.has(r.code))
        // A 2-robot alliance scores ~2x the mean team OPR.
        .map((r) => ({ ...r, noise: r.sigma / (2 * prof.get(r.code).oprMean) }))
        .filter((r) => Number.isFinite(r.noise))
        .sort((a, b) => a.noise - b.noise);

    const q = (k) => rows[Math.floor(rows.length * k)].noise;
    const cuts = [q(0.25), q(0.5), q(0.75)];
    console.log(`\n-- ${y}  (n=${rows.length} eventos, cortes ${cuts.map((c) => c.toFixed(3)).join(" / ")})`);
    console.log("bucket               events matches    acc%    conf%   gap(pp)  ruido medio");
    const band = [
        ["  Q1 (más legible)", (r) => r.noise <= cuts[0]],
        ["  Q2", (r) => r.noise > cuts[0] && r.noise <= cuts[1]],
        ["  Q3", (r) => r.noise > cuts[1] && r.noise <= cuts[2]],
        ["  Q4 (más caótico)", (r) => r.noise > cuts[2]],
    ];
    for (const [label, pred] of band) {
        const rs = rows.filter(pred);
        const mean = rs.reduce((s, r) => s + r.noise, 0) / rs.length;
        line(label, agg(rs), mean.toFixed(3));
    }
}

console.log(`
CONCLUSION (see decisions.md #70)
  Test 1: accuracy and stated confidence fall together as sigma rises; the gap
          stays within roughly one point. The per-event sigma is already doing
          the job a defensive-meta detector was meant to do.
  Test 2: once sigma is normalized by scoring level, accuracy is FLAT across
          quartiles. Event noisiness carries no residual signal.
  Every gap is negative, i.e. the model is slightly UNDER-confident already.
  Widening sigma further would move calibration the wrong way.
`);
