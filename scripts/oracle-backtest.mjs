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

import { readFileSync, appendFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
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

    // Per-team consistency: RMS of the residuals of the alliances the team
    // played in during quals (their own volatility, feature for the elim model).
    const teamRes = new Map();
    for (const m of quals) {
        for (const color of ["Red", "Blue"]) {
            const members = m.teams.filter(t => t.alliance === color);
            const mu = members.reduce((s, t) => s + (opr.get(t.teamNumber) ?? 0), 0);
            const r = (color === "Red" ? m.redNp : m.blueNp) - mu;
            for (const t of members) {
                const arr = teamRes.get(t.teamNumber) ?? [];
                arr.push(r); teamRes.set(t.teamNumber, arr);
            }
        }
    }
    const teamSigma = (t) => {
        const arr = teamRes.get(t);
        if (!arr || arr.length < 2) return sigma / Math.SQRT2; // fall back to event level
        return Math.sqrt(arr.reduce((s, r) => s + r * r, 0) / arr.length);
    };

    let hits = 0, n = 0, sumP = 0, brier = 0;
    const matchRows = [];
    for (const m of playoffs) {
        if (m.redTot === m.blueTot) continue; // ties carry no verdict
        const fielded = (color) => m.teams.filter(t => t.alliance === color && t.station !== "NotOnField");
        const mu = (color) => fielded(color).reduce((s, t) => s + (opr.get(t.teamNumber) ?? 0), 0);
        const cons = (color) => {
            const f = fielded(color);
            return f.length ? f.reduce((s, t) => s + teamSigma(t.teamNumber), 0) / f.length : sigma / Math.SQRT2;
        };
        const muR = mu("Red"), muB = mu("Blue");
        const pRed = phi((muR - muB) / sigma);
        const redWon = m.redTot > m.blueTot;
        const pWinner = redWon ? pRed : 1 - pRed;
        n++; sumP += pWinner; brier += (pRed - (redWon ? 1 : 0)) ** 2;
        if ((pRed >= 0.5) === redWon) hits++;
        matchRows.push({
            z: (muR - muB) / sigma,               // baseline predictor (normal-model z)
            consDiff: (cons("Blue") - cons("Red")) / sigma, // + = blue less consistent
            level: (muR + muB) / (2 * sigma),     // field-strength context
            redWon: redWon ? 1 : 0,
        });
    }
    if (n < 2) return null;

    // Field profile (for the event-selector): distribution of team OPRs.
    const oprs = [...opr.values()].sort((a, b) => b - a);
    const oprMean = oprs.reduce((s, v) => s + v, 0) / oprs.length;
    const oprSd = Math.sqrt(oprs.reduce((s, v) => s + (v - oprMean) ** 2, 0) / oprs.length);
    const profile = { teams: oprs.length, oprMean, oprSd, oprTop: oprs[0] ?? 0 };

    return { quals: quals.length, playoffN: n, hits, meanP: sumP / n, brier: brier / n, sigma, matchRows, profile };
}

async function runSeason(season, limit, mode = "season") {
    mkdirSync(OUT_DIR, { recursive: true });
    const outFile = join(OUT_DIR, `${mode === "season" ? "season" : mode}-${season}.jsonl`);
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
                // 2020-2021 (COVID era) split scores into Trad/Remote types;
                // remote events have no alliances/playoffs so Trad is the one
                // that matters. 2019 and earlier use the plain typename.
                const scoreType = (season === 2021 || season === 2020) ? `MatchScores${season}Trad` : `MatchScores${season}`;
                const d = await gql(`query{ eventByCode(season:${season}, code:"${ev.code}"){ matches { tournamentLevel scores { ... on ${scoreType} { red { totalPointsNp totalPoints } blue { totalPointsNp totalPoints } } } teams { teamNumber alliance station } } } }`);
                const matches = d.eventByCode?.matches ?? [];
                const r = analyzeEvent(matches);
                if (mode === "profiles") {
                    const row = r
                        ? { season, code: ev.code, name: ev.name, type: ev.type, region: ev.regionCode, ...r.profile, sigma: Number(r.sigma.toFixed(1)), playoffN: r.playoffN }
                        : { season, code: ev.code, skipped: true };
                    appendFileSync(outFile, JSON.stringify(row) + "\n");
                } else if (mode === "matches") {
                    // One line per playoff match (features for the elim-model fit),
                    // or a skip marker so resume still works for barren events.
                    const lines = r
                        ? r.matchRows.map(mr => JSON.stringify({ season, code: ev.code, type: ev.type, region: ev.regionCode, ...mr }))
                        : [JSON.stringify({ season, code: ev.code, skipped: true })];
                    appendFileSync(outFile, lines.join("\n") + "\n");
                } else {
                    const agg = r ? { quals: r.quals, playoffN: r.playoffN, hits: r.hits, meanP: r.meanP, brier: r.brier, sigma: r.sigma } : { skipped: true };
                    const row = { season, code: ev.code, name: ev.name, type: ev.type, region: ev.regionCode, ...agg };
                    appendFileSync(outFile, JSON.stringify(row) + "\n");
                }
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

/**
 * Elim-model fit: logistic regression P(redWin) over playoff-match features
 * [z, consDiff, level] vs the baseline Φ(z). Deterministic 80/20 split by
 * event code so both models are scored on the same held-out matches.
 */
function fit() {
    const rows = readdirSync(OUT_DIR).filter(f => f.startsWith("matches-"))
        .flatMap(f => readFileSync(join(OUT_DIR, f), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)))
        .filter(r => !r.skipped && Number.isFinite(r.z));
    const hash = (s) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 0);
    const train = rows.filter(r => hash(r.code + r.season) % 5 !== 0);
    const test = rows.filter(r => hash(r.code + r.season) % 5 === 0);
    console.log(`fit: ${rows.length} matches (${train.length} train / ${test.length} test)`);

    const feats = (r) => [1, r.z, r.consDiff, r.level];
    let w = [0, 1.2, 0, 0]; // start near the probit≈logit equivalence for z
    const lr = 0.05;
    for (let epoch = 0; epoch < 400; epoch++) {
        const g = [0, 0, 0, 0];
        for (const r of train) {
            const x = feats(r);
            const p = 1 / (1 + Math.exp(-x.reduce((s, xi, i) => s + xi * w[i], 0)));
            const err = p - r.redWon;
            for (let i = 0; i < 4; i++) g[i] += err * x[i];
        }
        for (let i = 0; i < 4; i++) w[i] -= lr * g[i] / train.length;
    }

    const score = (rows, pFn) => {
        let ll = 0, br = 0, hits = 0;
        for (const r of rows) {
            const p = Math.min(1 - 1e-9, Math.max(1e-9, pFn(r)));
            ll += -(r.redWon * Math.log(p) + (1 - r.redWon) * Math.log(1 - p));
            br += (p - r.redWon) ** 2;
            if ((p >= 0.5) === (r.redWon === 1)) hits++;
        }
        return { logloss: (ll / rows.length).toFixed(4), brier: (br / rows.length).toFixed(4), acc: (100 * hits / rows.length).toFixed(1) };
    };
    const baseline = (r) => phi(r.z);
    const model = (r) => 1 / (1 + Math.exp(-feats(r).reduce((s, xi, i) => s + xi * w[i], 0)));
    console.log("pesos [bias, z, consDiff, level]:", w.map(x => x.toFixed(4)).join(", "));
    console.log("TEST  baseline Φ(z):", score(test, baseline));
    console.log("TEST  logistic fit :", score(test, model));
    console.log("TRAIN logistic fit :", score(train, model));
}

const [cmd, arg, flag, flagVal] = process.argv.slice(2);
if (cmd === "run" && arg) {
    const limit = flag === "--limit" ? Number(flagVal) : undefined;
    runSeason(Number(arg), limit).catch(e => { console.error(e); process.exit(1); });
} else if ((cmd === "matches" || cmd === "profiles") && arg) {
    runSeason(Number(arg), flag === "--limit" ? Number(flagVal) : undefined, cmd).catch(e => { console.error(e); process.exit(1); });
} else if (cmd === "export-profiles") {
    // Curates profiles-*.jsonl into the committed dataset the app's event
    // selector imports (lib/data/event-profiles.json).
    const rows = readdirSync(OUT_DIR).filter(f => f.startsWith("profiles-"))
        .flatMap(f => readFileSync(join(OUT_DIR, f), "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l)))
        .filter(r => !r.skipped && r.teams >= 8)
        .map(r => ({ season: r.season, code: r.code, name: r.name, type: r.type, region: r.region ?? null, teams: r.teams, oprMean: Number(r.oprMean.toFixed(1)), oprSd: Number(r.oprSd.toFixed(1)), oprTop: Number(r.oprTop.toFixed(1)), sigma: r.sigma }));
    const out = join(process.cwd(), "lib", "data", "event-profiles.json");
    mkdirSync(join(process.cwd(), "lib", "data"), { recursive: true });
    const fs = await import("node:fs");
    fs.writeFileSync(out, JSON.stringify(rows));
    console.log(`export: ${rows.length} perfiles → ${out}`);
} else if (cmd === "fit") {
    fit();
} else if (cmd === "report") {
    report();
} else {
    console.log("Uso: node scripts/oracle-backtest.mjs run|matches <season> [--limit N] | fit | report");
}
