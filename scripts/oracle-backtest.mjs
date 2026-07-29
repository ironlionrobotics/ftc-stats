#!/usr/bin/env node
/**
 * Oracle global backtest — replays PRIDE's prediction model against every
 * finished FTC event with playoffs, per season, across ALL regions, using
 * FTCScout's public GraphQL API (no auth).
 *
 * Methodology (identical to decisions.md #51–#54): per event, quals-only OPR
 * via in-place Gauss-Seidel (100 iters) on no-penalty alliance scores
 * (totalPointsNp); σ_diff = √2 · RMS(qual residuals); each playoff match is
 * predicted by the higher sum of fielded-robot OPRs (station != NotOnField)
 * with win prob Φ(Δμ/σ_diff); actual winner by totalPoints.
 *
 * RESUMABLE: results append to data/oracle-backtest/season-<S>.jsonl, one
 * line per event; already-processed codes are skipped on re-run. Run in parts:
 *   node scripts/oracle-backtest.mjs run 2025          # process a season
 *   node scripts/oracle-backtest.mjs run 2025 --limit 20   # smoke test
 *   node scripts/oracle-backtest.mjs report            # aggregate all seasons
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.ftcscout.org/graphql";
const OUT_DIR = join(process.cwd(), "data", "oracle-backtest");
const CONCURRENCY = 4;

async function gql(query) {
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            const res = await fetch(API, {
                method: "POST",
                headers: { "Content-Type": "application/json", "User-Agent": "PRIDE-oracle-backtest (ironlionrobotics.com)" },
                body: JSON.stringify({ query }),
            });
            if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.errors) throw new Error(json.errors[0].message);
            return json.data;
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
        }
    }
}

function erf(x) {
    // Abramowitz-Stegun 7.1.26
    const s = x < 0 ? -1 : 1; x = Math.abs(x);
    const t = 1 / (1 + 0.3275911 * x);
    const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
    return s * y;
}
const phi = (z) => 0.5 * (1 + erf(z / Math.SQRT2));

/** Quals-only OPR via in-place Gauss-Seidel (order matters — Jacobi diverges here). */
function solveOPR(quals) {
    const teams = [...new Set(quals.flatMap(m => m.teams.map(t => t.teamNumber)))];
    const idx = new Map(teams.map((t, i) => [t, i]));
    const n = teams.length;
    const A = Array.from({ length: n }, () => new Float64Array(n));
    const B = new Float64Array(n);
    for (const m of quals) {
        for (const color of ["Red", "Blue"]) {
            const members = m.teams.filter(t => t.alliance === color).map(t => idx.get(t.teamNumber));
            const score = color === "Red" ? m.redNp : m.blueNp;
            for (const i of members) { B[i] += score; for (const j of members) A[i][j] += 1; }
        }
    }
    const x = new Float64Array(n);
    for (let it = 0; it < 100; it++) {
        for (let i = 0; i < n; i++) {
            let s = 0;
            for (let j = 0; j < n; j++) if (i !== j) s += A[i][j] * x[j];
            if (A[i][i] > 0) x[i] = (B[i] - s) / A[i][i];
        }
    }
    return new Map(teams.map((t, i) => [t, x[i]]));
}

function analyzeEvent(matches) {
    const scored = matches.filter(m => m.scores);
    const norm = scored.map(m => ({
        level: m.tournamentLevel,
        teams: m.teams,
        redNp: m.scores.red.totalPointsNp ?? m.scores.red.totalPoints,
        blueNp: m.scores.blue.totalPointsNp ?? m.scores.blue.totalPoints,
        redTot: m.scores.red.totalPoints,
        blueTot: m.scores.blue.totalPoints,
    }));
    const quals = norm.filter(m => m.level === "Quals");
    const playoffs = norm.filter(m => m.level !== "Quals");
    if (quals.length < 4 || playoffs.length < 2) return null;

    const opr = solveOPR(quals);
    const residuals = [];
    for (const m of quals) {
        for (const color of ["Red", "Blue"]) {
            const mu = m.teams.filter(t => t.alliance === color).reduce((s, t) => s + (opr.get(t.teamNumber) ?? 0), 0);
            residuals.push((color === "Red" ? m.redNp : m.blueNp) - mu);
        }
    }
    const sigma = Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length) * Math.SQRT2;
    if (!(sigma > 0)) return null;

    let hits = 0, n = 0, sumP = 0, brier = 0;
    for (const m of playoffs) {
        if (m.redTot === m.blueTot) continue; // ties carry no verdict
        const mu = (color) => m.teams
            .filter(t => t.alliance === color && t.station !== "NotOnField")
            .reduce((s, t) => s + (opr.get(t.teamNumber) ?? 0), 0);
        const pRed = phi((mu("Red") - mu("Blue")) / sigma);
        const redWon = m.redTot > m.blueTot;
        const pWinner = redWon ? pRed : 1 - pRed;
        n++; sumP += pWinner; brier += (pRed - (redWon ? 1 : 0)) ** 2;
        if ((pRed >= 0.5) === redWon) hits++;
    }
    if (n < 2) return null;
    return { quals: quals.length, playoffN: n, hits, meanP: sumP / n, brier: brier / n, sigma };
}

async function runSeason(season, limit) {
    mkdirSync(OUT_DIR, { recursive: true });
    const outFile = join(OUT_DIR, `season-${season}.jsonl`);
    const done = new Set(
        existsSync(outFile)
            ? readFileSync(outFile, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l).code)
            : [],
    );

    const data = await gql(`query{ eventsSearch(season:${season}, limit:5000){ code name type finished regionCode hasMatches } }`);
    let events = data.eventsSearch.filter(e => e.finished && e.hasMatches && e.type !== "Scrimmage" && !done.has(e.code));
    if (limit) events = events.slice(0, limit);
    console.log(`[season ${season}] ${events.length} events to process (${done.size} already done)`);

    let processed = 0;
    const queue = [...events];
    const worker = async () => {
        for (;;) {
            const ev = queue.shift();
            if (!ev) return;
            try {
                const d = await gql(`query{ eventByCode(season:${season}, code:"${ev.code}"){ matches { tournamentLevel scores { ... on MatchScores${season} { red { totalPointsNp totalPoints } blue { totalPointsNp totalPoints } } } teams { teamNumber alliance station } } } }`);
                const matches = d.eventByCode?.matches ?? [];
                const r = analyzeEvent(matches);
                const row = { season, code: ev.code, name: ev.name, type: ev.type, region: ev.regionCode, ...(r ?? { skipped: true }) };
                appendFileSync(outFile, JSON.stringify(row) + "\n");
            } catch (e) {
                appendFileSync(outFile, JSON.stringify({ season, code: ev.code, type: ev.type, region: ev.regionCode, error: String(e.message).slice(0, 120) }) + "\n");
            }
            processed++;
            if (processed % 50 === 0) console.log(`  …${processed}/${events.length}`);
        }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    console.log(`[season ${season}] done: ${processed} events → ${outFile}`);
}

function report() {
    const rows = readdirSync(OUT_DIR).filter(f => f.endsWith(".jsonl"))
        .flatMap(f => readFileSync(join(OUT_DIR, f), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)))
        .filter(r => r.playoffN);
    const agg = (keyFn) => {
        const g = new Map();
        for (const r of rows) {
            const k = keyFn(r);
            const a = g.get(k) ?? { events: 0, n: 0, hits: 0, sumP: 0, brier: 0 };
            a.events++; a.n += r.playoffN; a.hits += r.hits; a.sumP += r.meanP * r.playoffN; a.brier += r.brier * r.playoffN;
            g.set(k, a);
        }
        return [...g.entries()]
            .map(([k, a]) => ({ key: k, events: a.events, matches: a.n, acc: (100 * a.hits / a.n).toFixed(1), meanP: (a.sumP / a.n).toFixed(3), brier: (a.brier / a.n).toFixed(3) }))
            .sort((a, b) => b.matches - a.matches);
    };
    console.log(`\nTOTAL: ${rows.length} events, ${rows.reduce((s, r) => s + r.playoffN, 0)} playoff matches\n`);
    console.log("== Por temporada =="); console.table(agg(r => r.season));
    console.log("== Por tipo de evento =="); console.table(agg(r => r.type));
    console.log("== Por región (top 30) =="); console.table(agg(r => r.region ?? "?").slice(0, 30));
    console.log("== Temporada × tipo =="); console.table(agg(r => `${r.season}·${r.type}`));
}

const [cmd, arg, flag, flagVal] = process.argv.slice(2);
if (cmd === "run" && arg) {
    const limit = flag === "--limit" ? Number(flagVal) : undefined;
    runSeason(Number(arg), limit).catch(e => { console.error(e); process.exit(1); });
} else if (cmd === "report") {
    report();
} else {
    console.log("Uso: node scripts/oracle-backtest.mjs run <season> [--limit N] | report");
}
