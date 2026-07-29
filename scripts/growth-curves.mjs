/**
 * Growth curves: how a program's standing evolves from its rookie year on.
 *
 * The question this answers is a planning one — "at what rate does a program
 * like ours improve, and where should we be in two years?" — so the output is
 * a per-region curve of standing vs. seasons-since-rookie.
 *
 * METHOD NOTE, and it matters. OPR is NOT comparable across seasons: every FTC
 * game scores differently, so a 50 in Power Play and a 50 in DECODE mean
 * nothing alike, and plotting raw OPR against "years since rookie" would mix
 * units and invent a trend. Each team is therefore converted to a PERCENTILE
 * within its own (season, region) cohort before anything is aggregated. That
 * is both comparable across seasons and the more useful quantity anyway:
 * competitively, what matters is whether you are climbing relative to the
 * teams you actually face.
 *
 * Second caveat, stated in the output: teams that stop competing leave the
 * data, and programs that fold are more likely to be weak ones. So the tail of
 * the curve is survivor-biased and reads slightly optimistic. The `teams`
 * count per year makes the attrition visible instead of hiding it.
 *
 * Usage:
 *   node scripts/growth-curves.mjs                # default regions
 *   node scripts/growth-curves.mjs MX USTXHO RO   # explicit regions
 *
 * Writes data/growth-curves/<REGION>.json and prints a summary.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const API = "https://api.ftcscout.org/graphql";
const UA = "PRIDE-growth-curves (ironlionrobotics.com)";
const OUT_DIR = join(process.cwd(), "data", "growth-curves");
const SEASONS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const BATCH = 10;             // teams per GraphQL request
const DEFAULT_REGIONS = ["MX", "USTXHO", "USCALS"];

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

async function fetchRegionTeams(region) {
    const d = await gql(`{ teamsSearch(region: ${region}, limit: 2000) { number rookieYear } }`);
    return (d.teamsSearch ?? []).filter(t => Number.isFinite(t.rookieYear));
}

/** One request per BATCH teams; every season is aliased inside it. */
async function fetchOprs(teams) {
    const out = new Map();
    for (let i = 0; i < teams.length; i += BATCH) {
        const slice = teams.slice(i, i + BATCH);
        const q = "{" + slice.map((t, k) =>
            `t${k}: teamByNumber(number: ${t.number}) { number ` +
            SEASONS.map(s => `s${s}: quickStats(season: ${s}) { tot { value } }`).join(" ") +
            ` }`).join(" ") + "}";
        const d = await gql(q);
        for (const key of Object.keys(d)) {
            const t = d[key];
            if (!t) continue;
            const per = {};
            for (const s of SEASONS) {
                const v = t[`s${s}`]?.tot?.value;
                if (typeof v === "number" && Number.isFinite(v)) per[s] = v;
            }
            out.set(t.number, per);
        }
        process.stderr.write(`\r  ${Math.min(i + BATCH, teams.length)}/${teams.length} equipos`);
    }
    process.stderr.write("\n");
    return out;
}

const quantile = (sorted, q) => {
    if (sorted.length === 0) return null;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

async function analyzeRegion(region) {
    console.log(`\n=== ${region} ===`);
    const teams = await fetchRegionTeams(region);
    console.log(`  ${teams.length} equipos con rookieYear conocido`);
    if (teams.length === 0) return null;

    const oprs = await fetchOprs(teams);
    const rookieYear = new Map(teams.map(t => [t.number, t.rookieYear]));

    // Percentile within the (season, region) cohort — the normalization that
    // makes seasons comparable at all.
    const bySeason = new Map(SEASONS.map(s => [s, []]));
    for (const per of oprs.values()) for (const s of SEASONS) if (per[s] !== undefined) bySeason.get(s).push(per[s]);
    for (const s of SEASONS) bySeason.get(s).sort((a, b) => a - b);

    const pctlOf = (season, value) => {
        const arr = bySeason.get(season);
        if (!arr || arr.length < 8) return null;      // cohort too thin to rank against
        let lo = 0, hi = arr.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < value) lo = m + 1; else hi = m; }
        return (lo / (arr.length - 1)) * 100;
    };

    const byAge = new Map();
    for (const [num, per] of oprs) {
        const ry = rookieYear.get(num);
        for (const s of SEASONS) {
            if (per[s] === undefined) continue;
            const age = s - ry;                        // 0 = rookie season
            if (age < 0 || age > 6) continue;
            const p = pctlOf(s, per[s]);
            if (p === null) continue;
            (byAge.get(age) ?? byAge.set(age, []).get(age)).push(p);
        }
    }

    const summarize = (m) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([age, ps]) => {
        ps.sort((a, b) => a - b);
        return {
            year: age + 1,                              // "temporada 1" reads better than "año 0"
            teams: ps.length,
            p25: +quantile(ps, 0.25).toFixed(1),
            median: +quantile(ps, 0.5).toFixed(1),
            p75: +quantile(ps, 0.75).toFixed(1),
        };
    });
    const curve = summarize(byAge);

    // SURVIVOR-BIAS CONTROL. The naive curve mixes two effects: teams getting
    // better, and weak teams dropping out. Re-run over only the teams observed
    // for >= 5 seasons: within that fixed cohort nobody leaves, so whatever
    // climb remains is real improvement. Comparing their SEASON-1 percentile
    // against everyone's says how much of the gap was selection from the start.
    const seasonsSeen = new Map([...oprs].map(([n, per]) => [n, Object.keys(per).length]));
    const veterans = new Set([...seasonsSeen].filter(([, c]) => c >= 5).map(([n]) => n));
    const byAgeVet = new Map();
    for (const [num, per] of oprs) {
        if (!veterans.has(num)) continue;
        const ry = rookieYear.get(num);
        for (const s of SEASONS) {
            if (per[s] === undefined) continue;
            const age = s - ry;
            if (age < 0 || age > 6) continue;
            const p = pctlOf(s, per[s]);
            if (p === null) continue;
            (byAgeVet.get(age) ?? byAgeVet.set(age, []).get(age)).push(p);
        }
    }
    const cohortCurve = summarize(byAgeVet);

    console.log("\n  TODOS los equipos (la cola pierde equipos: eso es attrition, no mejora)");
    console.log("  temporada  equipos   p25  mediana   p75   (percentil regional de OPR)");
    for (const r of curve) {
        console.log(`  ${String(r.year).padStart(6)}  ${String(r.teams).padStart(8)}  ${String(r.p25).padStart(5)}  ${String(r.median).padStart(7)}  ${String(r.p75).padStart(5)}`);
    }
    console.log(`\n  COHORTE FIJA — solo los ${veterans.size} equipos con 5+ temporadas (nadie sale a media curva)`);
    console.log("  temporada  equipos   p25  mediana   p75");
    for (const r of cohortCurve) {
        console.log(`  ${String(r.year).padStart(6)}  ${String(r.teams).padStart(8)}  ${String(r.p25).padStart(5)}  ${String(r.median).padStart(7)}  ${String(r.p75).padStart(5)}`);
    }
    if (curve[0] && cohortCurve[0]) {
        const sel = (cohortCurve[0].median - curve[0].median).toFixed(1);
        console.log(`\n  Selección: los que duran ya arrancaban ${sel} puntos de percentil por encima en su temporada 1.`);
    }

    mkdirSync(OUT_DIR, { recursive: true });
    writeFileSync(join(OUT_DIR, `${region}.json`),
        JSON.stringify({ region, teams: teams.length, curve, cohortCurve, cohortSize: veterans.size }, null, 2));
    return { region, curve, cohortCurve };
}

const regions = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_REGIONS;
for (const r of regions) {
    try { await analyzeRegion(r); }
    catch (e) { console.error(`  ${r} falló: ${e.message}`); }
}
console.log(`\nEscrito en ${OUT_DIR}`);
console.log("Recordatorio: la cola de la curva es survivor-biased — los programas que se retiran salen de los datos.");
