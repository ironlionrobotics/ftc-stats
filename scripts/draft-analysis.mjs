/**
 * What the draft data says. Reads data/draft-science/teams-<season>.jsonl
 * (produced by scripts/draft-science.mjs) and answers three questions a
 * strategy team actually asks:
 *
 *   1. How high do I need to finish to be reasonably safe?
 *   2. If I can't captain, does raw ability still get me drafted — or is
 *      selection purely a function of where I seeded?
 *   3. How often does the seeding order actually hold?
 *
 * Everything is normalized so fields of different sizes are comparable:
 * `seedPct` is 0 at the top of the ranking and 100 at the bottom, `oprPct` is
 * the team's OPR percentile within its own event.
 *
 * Usage: node scripts/draft-analysis.mjs [season]
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const season = Number(process.argv[2] || 2025);
const file = join(process.cwd(), "data", "draft-science", `teams-${season}.jsonl`);
if (!existsSync(file)) {
    console.error(`Falta ${file}. Corre antes: node scripts/draft-science.mjs ${season}`);
    process.exit(1);
}
const rows = readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map(l => JSON.parse(l));
const events = new Set(rows.map(r => r.code));
console.log(`${rows.length.toLocaleString("es-MX")} equipos-evento · ${events.size} eventos · temporada ${season}\n`);

const pct = (x) => (x * 100).toFixed(1);
const rate = (rs, f = (r) => r.picked) => rs.length ? rs.reduce((s, r) => s + f(r), 0) / rs.length : 0;

// ── 1. Pick rate by seed ──────────────────────────────────────────────────
// Reported against ABSOLUTE seed, because that is what a team can see on the
// ranking screen mid-event. Restricted to fields of 20+ so a "seed 8" means
// something similar across rows.
console.log("1) PROBABILIDAD DE SER SELECCIONADO, POR SEED (fields de 20+ equipos)");
console.log("   seed   equipos   % en alianza   % capitán   % pick");
const big = rows.filter(r => r.fieldSize >= 20);
for (const s of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12, 14, 16, 20, 24]) {
    const rs = big.filter(r => r.seed === s);
    if (rs.length < 20) continue;
    console.log(
        `   ${String(s).padStart(4)}  ${String(rs.length).padStart(8)}  ` +
        `${pct(rate(rs)).padStart(12)}  ${pct(rate(rs, r => r.captain)).padStart(10)}  ` +
        `${pct(rate(rs, r => r.picked && !r.captain)).padStart(7)}`,
    );
}

// ── 2. Does OPR matter beyond seed? ───────────────────────────────────────
// The interesting population is teams that cannot captain: seeded below the
// alliance count, but not so low that nobody would consider them. Within that
// band, split by OPR percentile and see whether ability still moves the odds.
console.log("\n2) EN LA BURBUJA: ¿el OPR mueve la aguja más allá del seed?");
console.log("   Equipos que NO pueden capitanear (seed > nº de alianzas) y están en el tercio alto de la tabla.");
const bubble = rows.filter(r =>
    r.seed > r.alliances && r.seedPct <= 45 && r.oprPct !== null && r.fieldSize >= 20);
console.log(`   n = ${bubble.length.toLocaleString("es-MX")} equipos-evento\n`);
console.log("   OPR dentro del evento    equipos   % seleccionado");
const oprBands = [
    ["top 10%  (p90-100)", (r) => r.oprPct >= 90],
    ["p75-90", (r) => r.oprPct >= 75 && r.oprPct < 90],
    ["p50-75", (r) => r.oprPct >= 50 && r.oprPct < 75],
    ["p25-50", (r) => r.oprPct >= 25 && r.oprPct < 50],
    ["bajo p25", (r) => r.oprPct < 25],
];
for (const [label, f] of oprBands) {
    const rs = bubble.filter(f);
    if (!rs.length) continue;
    console.log(`   ${label.padEnd(22)} ${String(rs.length).padStart(7)}  ${pct(rate(rs)).padStart(13)}`);
}

// Same split, holding seed almost fixed, so the effect can't be seed in disguise.
console.log("\n   Control — mismo ejercicio dentro de una banda estrecha de seed (7-12):");
const narrow = bubble.filter(r => r.seed >= 7 && r.seed <= 12);
console.log(`   n = ${narrow.length.toLocaleString("es-MX")}`);
for (const [label, f] of oprBands) {
    const rs = narrow.filter(f);
    if (rs.length < 30) continue;
    console.log(`   ${label.padEnd(22)} ${String(rs.length).padStart(7)}  ${pct(rate(rs)).padStart(13)}`);
}

// ── 3. Does seeding order hold? ───────────────────────────────────────────
console.log("\n3) ¿SE RESPETA EL ORDEN DE LA TABLA?");
const byEvent = new Map();
for (const r of rows) (byEvent.get(r.code) ?? byEvent.set(r.code, []).get(r.code)).push(r);
let inverted = 0, total = 0;
for (const ts of byEvent.values()) {
    const picked = ts.filter(t => t.picked).map(t => t.seed).sort((a, b) => a - b);
    if (!picked.length) continue;
    const cutoff = picked[picked.length - 1];
    // A team that seeded better than the worst selected team and still went unpicked.
    inverted += ts.filter(t => !t.picked && t.seed < cutoff).length;
    total += ts.filter(t => t.seed < cutoff).length;
}
console.log(`   ${pct(inverted / total)}% de los equipos que seedearon por encima del último seleccionado`);
console.log(`   se quedaron fuera de todos modos (n = ${total.toLocaleString("es-MX")}).`);
console.log(`   Es decir: el orden de la tabla NO se respeta estrictamente — hay ${inverted.toLocaleString("es-MX")} casos`);
console.log("   donde un capitán prefirió a alguien peor seedeado.");
