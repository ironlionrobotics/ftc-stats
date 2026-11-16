/**
 * Regenerates the numbers in lib/reports/draft-priors.ts from
 * data/draft-science-first/teams-<season>.jsonl (scripts/draft-science.ts,
 * official FIRST archive). Same definitions as scripts/draft-analysis.mjs:
 *   bySeed      — fields of 20+, share on a playoff alliance, + PAVA (non-increasing, weighted by n)
 *   oprEffect   — bubble (seed > alliances, seedPct ≤ 45, fields 20+), seeds 7-12, by in-event OPR percentile
 *   violation   — teams seeded above the last selected team that went unpicked
 *
 * Prints a JSON blob; paste the values into lib/reports/draft-priors.ts.
 * Usage: node scripts/build-draft-priors.mjs [season]
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const season = Number(process.argv[2] || 2025);
const rows = readFileSync(join(process.cwd(), "data", "draft-science-first", `teams-${season}.jsonl`), "utf8")
    .trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
const r4 = x => Math.round(x * 1e4) / 1e4;
const rate = rs => rs.reduce((s, r) => s + r.picked, 0) / rs.length;

const big = rows.filter(r => r.fieldSize >= 20);
const bySeed = [];
for (let s = 1; s <= 24; s++) {
    const rs = big.filter(r => r.seed === s);
    if (rs.length >= 20) bySeed.push({ seed: s, n: rs.length, pickRate: rate(rs) });
}
// Pool-adjacent-violators, non-increasing, weighted by n.
const blocks = bySeed.map(r => ({ w: r.n, v: r.pickRate, k: 1 }));
for (let i = 0; i < blocks.length - 1;) {
    if (blocks[i].v < blocks[i + 1].v) {
        const a = blocks[i], b = blocks[i + 1];
        blocks.splice(i, 2, { w: a.w + b.w, v: (a.v * a.w + b.v * b.w) / (a.w + b.w), k: a.k + b.k });
        if (i > 0) i--;
    } else i++;
}
const smooth = blocks.flatMap(b => Array(b.k).fill(b.v));
bySeed.forEach((r, i) => { r.pickRateSmoothed = r4(smooth[i]); r.pickRate = r4(r.pickRate); });

const narrow = rows.filter(r => r.seed > r.alliances && r.seedPct <= 45 && r.oprPct !== null && r.fieldSize >= 20 && r.seed >= 7 && r.seed <= 12);
const base = rate(narrow);
const odds = p => p / (1 - p);
const bands = [["p90", r => r.oprPct >= 90], ["p75", r => r.oprPct >= 75 && r.oprPct < 90], ["p50", r => r.oprPct >= 50 && r.oprPct < 75], ["p25", r => r.oprPct >= 25 && r.oprPct < 50], ["p0", r => r.oprPct < 25]]
    .map(([band, f]) => { const rs = narrow.filter(f), p = rate(rs); return { band, n: rs.length, pickRate: r4(p), lift: Math.round(p / base * 1000) / 1000, oddsRatio: Math.round(odds(p) / odds(base) * 1000) / 1000 }; });

const byEvent = new Map();
for (const r of rows) (byEvent.get(r.code) ?? byEvent.set(r.code, []).get(r.code)).push(r);
let inverted = 0, total = 0;
for (const ts of byEvent.values()) {
    const picked = ts.filter(t => t.picked).map(t => t.seed).sort((a, b) => a - b);
    if (!picked.length) continue;
    const cutoff = picked[picked.length - 1];
    inverted += ts.filter(t => !t.picked && t.seed < cutoff).length;
    total += ts.filter(t => t.seed < cutoff).length;
}
console.log(JSON.stringify({ season, events: byEvent.size, observations: rows.length, bySeed, oprEffect: { base: r4(base), n: narrow.length, bands }, seedOrderViolationRate: Math.round(inverted / total * 1000) / 1000 }, null, 1));
