/**
 * Draft science: what actually gets a team picked for a playoff alliance?
 *
 * The strategic question a team asks before an event is "how high do I need to
 * finish to be safe?", and the follow-up nobody has data for: "if I can't
 * captain, does raw ability still get me drafted, or is it all seeding?"
 *
 * FTCScout exposes no alliance-selection endpoint, so alliances are
 * RECONSTRUCTED from playoff match composition: teams that take the field on
 * the same side of the same playoff match are on the same alliance. Backup
 * robots would blur that, so only `onField` participants count, and a team's
 * alliance is the connected component it belongs to.
 *
 * Captain is taken to be the best-seeded team on each alliance. That is the
 * FTC selection rule in practice (a captain always outranks the teams it
 * picks), but it is an inference, not a field in the data — noted because a
 * declined invitation can technically break it.
 *
 * One season at a time on purpose: OPR is only comparable within a season, and
 * pooling games would corrupt the OPR half of the analysis.
 *
 * Usage:
 *   node scripts/draft-science.mjs 2025            # all events with playoffs
 *   node scripts/draft-science.mjs 2025 --limit 400
 *
 * Resumable: re-running skips events already in the output file.
 * Writes data/draft-science/teams-<season>.jsonl (one row per team per event).
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.ftcscout.org/graphql";
const UA = "PRIDE-draft-science (ironlionrobotics.com)";
const BACKTEST_DIR = join(process.cwd(), "data", "oracle-backtest");
const OUT_DIR = join(process.cwd(), "data", "draft-science");

async function gql(query) {
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            const res = await fetch(API, {
                method: "POST",
                headers: { "Content-Type": "application/json", "User-Agent": UA },
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

/** Connected components over "played on the same side of a playoff match". */
function reconstructAlliances(playoffMatches) {
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

    for (const m of playoffMatches) {
        for (const color of ["Red", "Blue"]) {
            const side = m.teams.filter(t => t.alliance === color && t.onField).map(t => t.teamNumber);
            for (const t of side) if (!parent.has(t)) parent.set(t, t);
            for (let i = 1; i < side.length; i++) union(side[0], side[i]);
        }
    }
    const groups = new Map();
    for (const t of parent.keys()) {
        const r = find(t);
        (groups.get(r) ?? groups.set(r, []).get(r)).push(t);
    }
    return [...groups.values()];
}

async function fetchEvent(season, code) {
    const d = await gql(`{ eventByCode(season: ${season}, code: "${code}") {
        teams { teamNumber stats { ... on TeamEventStats${season} { rank opr { totalPointsNp } } } }
        matches { tournamentLevel teams { teamNumber alliance onField } }
    } }`);
    return d.eventByCode;
}

const season = Number(process.argv[2] || 2025);
const limitIdx = process.argv.indexOf("--limit");
const limit = limitIdx > -1 ? Number(process.argv[limitIdx + 1]) : Infinity;

const backtestFile = join(BACKTEST_DIR, `season-${season}.jsonl`);
if (!existsSync(backtestFile)) {
    console.error(`Falta ${backtestFile}. Corre antes: node scripts/oracle-backtest.mjs run ${season}`);
    process.exit(1);
}
const events = readFileSync(backtestFile, "utf8").trim().split("\n").filter(Boolean)
    .map(l => JSON.parse(l)).filter(e => e.playoffN > 0 && e.code);

mkdirSync(OUT_DIR, { recursive: true });
const outFile = join(OUT_DIR, `teams-${season}.jsonl`);
const done = new Set(existsSync(outFile)
    ? readFileSync(outFile, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l).code)
    : []);

const todo = events.filter(e => !done.has(e.code)).slice(0, Math.max(0, limit - done.size));
console.log(`${events.length} eventos con playoffs · ${done.size} ya procesados · ${todo.length} por hacer`);

let ok = 0, skipped = 0;
for (const [i, ev] of todo.entries()) {
    try {
        const data = await fetchEvent(season, ev.code);
        const teams = (data?.teams ?? []).filter(t => Number.isFinite(t.stats?.rank));
        const playoffs = (data?.matches ?? []).filter(m => m.tournamentLevel !== "Quals");
        if (teams.length < 12 || playoffs.length < 2) { skipped++; continue; }

        const alliances = reconstructAlliances(playoffs);
        const rankOf = new Map(teams.map(t => [t.teamNumber, t.stats.rank]));
        const onAlliance = new Map();          // team -> index of its alliance
        const captains = new Set();
        alliances.forEach((members, idx) => {
            for (const t of members) onAlliance.set(t, idx);
            // Best (lowest) seed on the alliance is taken as its captain.
            const cap = members.filter(t => rankOf.has(t)).sort((a, b) => rankOf.get(a) - rankOf.get(b))[0];
            if (cap !== undefined) captains.add(cap);
        });

        // OPR percentile within this event, so it's comparable across fields.
        const oprs = teams.map(t => t.stats.opr?.totalPointsNp).filter(Number.isFinite).sort((a, b) => a - b);
        const oprPct = (v) => {
            if (!Number.isFinite(v) || oprs.length < 8) return null;
            let lo = 0, hi = oprs.length;
            while (lo < hi) { const m = (lo + hi) >> 1; if (oprs[m] < v) lo = m + 1; else hi = m; }
            return (lo / (oprs.length - 1)) * 100;
        };

        const n = teams.length;
        const lines = teams.map(t => JSON.stringify({
            season, code: ev.code, type: ev.type, region: ev.region,
            fieldSize: n,
            alliances: alliances.length,
            team: t.teamNumber,
            seed: t.stats.rank,
            /** 0 = top of the field, 100 = bottom. Comparable across field sizes. */
            seedPct: ((t.stats.rank - 1) / (n - 1)) * 100,
            oprPct: oprPct(t.stats.opr?.totalPointsNp),
            picked: onAlliance.has(t.teamNumber) ? 1 : 0,
            captain: captains.has(t.teamNumber) ? 1 : 0,
        })).join("\n");
        appendFileSync(outFile, lines + "\n");
        ok++;
    } catch (e) {
        skipped++;
        if (skipped < 5) console.error(`  ${ev.code}: ${e.message}`);
    }
    if ((i + 1) % 25 === 0) process.stderr.write(`\r  ${i + 1}/${todo.length} (ok ${ok}, saltados ${skipped})`);
}
process.stderr.write("\n");
console.log(`Listo: ${ok} eventos escritos, ${skipped} saltados -> ${outFile}`);
