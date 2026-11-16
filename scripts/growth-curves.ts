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
 * Data: the OFFICIAL FIRST season archive (data/first-archive/ftc/<S>/, built with
 * scripts/first-archive-pull.ts). Team region and rookieYear come from the archive's
 * official team directory (`homeRegion`, `rookieYear`); a team's season value is the
 * match-weighted mean of its ridge OPR (λ=1, non-penalty) over that season's events —
 * OUR OPR, not FTCScout's quickStats. No FTCScout. Seasons = those present in the archive
 * (2019–2025 since Nov 2026), so the "veteran" cohort needs min(5, seasons
 * available) seasons instead of a fixed 5.
 *
 * Usage:
 *   node scripts/run-ts.mjs scripts/growth-curves.ts                # default regions
 *   node scripts/run-ts.mjs scripts/growth-curves.ts MX USTXHO USCALS   # explicit FIRST homeRegion codes
 *
 * Writes data/growth-curves-first/<REGION>.json (lib/reports/growth-curves.ts is curated
 * from it; the old FTCScout-based data/growth-curves/ is obsolete) and prints a summary.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { archivedTeams, scoutSeasonFromArchive } from "./first-archive";

const OUT_DIR = join(process.cwd(), "data", "growth-curves-first");
const CANDIDATE_SEASONS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const DEFAULT_REGIONS = ["MX", "USTXHO", "USCALS"];

/** team → season → match-weighted mean ridge OPR over its events (null cohort until first call). */
let SEASONS: number[] = [];
let SEASON_OPR: Map<number, Record<number, number>> | null = null;
function seasonOprs(): Map<number, Record<number, number>> {
    if (SEASON_OPR) return SEASON_OPR;
    const out = new Map<number, Record<number, number>>();
    SEASONS = [];
    for (const s of CANDIDATE_SEASONS) {
        const events = scoutSeasonFromArchive(s);
        if (events.length === 0) continue;
        SEASONS.push(s);
        const acc = new Map<number, { sum: number; n: number }>();
        for (const e of events) for (const t of e.teams) {
            const n = t.stats?.qualMatchesPlayed ?? 0, x = t.stats?.opr?.totalPointsNp;
            if (!n || typeof x !== "number" || !Number.isFinite(x)) continue;
            const a = acc.get(t.teamNumber) ?? { sum: 0, n: 0 };
            a.sum += x * n; a.n += n;
            acc.set(t.teamNumber, a);
        }
        for (const [team, a] of acc) (out.get(team) ?? out.set(team, {}).get(team)!)[s] = a.sum / a.n;
    }
    return (SEASON_OPR = out);
}

const quantile = (sorted: number[], q: number) => {
    if (sorted.length === 0) return null;
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

function analyzeRegion(region: string) {
    console.log(`\n=== ${region} ===`);
    const all = seasonOprs();
    const dir = archivedTeams(SEASONS);
    const teams = [...dir].filter(([, t]) => t.region === region && Number.isFinite(t.rookieYear)).map(([number, t]) => ({ number, rookieYear: t.rookieYear as number }));
    console.log(`  ${teams.length} equipos con rookieYear conocido (temporadas: ${SEASONS.join(", ")})`);
    if (teams.length === 0) return null;

    const oprs = new Map(teams.filter(t => all.has(t.number)).map(t => [t.number, all.get(t.number)!]));
    const rookieYear = new Map(teams.map(t => [t.number, t.rookieYear]));

    // Percentile within the (season, region) cohort — the normalization that
    // makes seasons comparable at all.
    const bySeason = new Map<number, number[]>(SEASONS.map(s => [s, []]));
    for (const per of oprs.values()) for (const s of SEASONS) if (per[s] !== undefined) bySeason.get(s)!.push(per[s]);
    for (const s of SEASONS) bySeason.get(s)!.sort((a, b) => a - b);

    const pctlOf = (season: number, value: number) => {
        const arr = bySeason.get(season);
        if (!arr || arr.length < 8) return null;      // cohort too thin to rank against
        let lo = 0, hi = arr.length;
        while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m] < value) lo = m + 1; else hi = m; }
        return (lo / (arr.length - 1)) * 100;
    };

    const byAge = new Map<number, number[]>();
    for (const [num, per] of oprs) {
        const ry = rookieYear.get(num)!;
        for (const s of SEASONS) {
            if (per[s] === undefined) continue;
            const age = s - ry;                        // 0 = rookie season
            if (age < 0 || age > 6) continue;
            const p = pctlOf(s, per[s]);
            if (p === null) continue;
            (byAge.get(age) ?? byAge.set(age, []).get(age)!).push(p);
        }
    }

    const summarize = (m: Map<number, number[]>) => [...m.entries()].sort((a, b) => a[0] - b[0]).map(([age, ps]) => {
        ps.sort((a, b) => a - b);
        return {
            year: age + 1,                              // "temporada 1" reads better than "año 0"
            teams: ps.length,
            p25: +quantile(ps, 0.25)!.toFixed(1),
            median: +quantile(ps, 0.5)!.toFixed(1),
            p75: +quantile(ps, 0.75)!.toFixed(1),
        };
    });
    const curve = summarize(byAge);

    // SURVIVOR-BIAS CONTROL. The naive curve mixes two effects: teams getting
    // better, and weak teams dropping out. Re-run over only the teams observed
    // for >= 5 seasons: within that fixed cohort nobody leaves, so whatever
    // climb remains is real improvement. Comparing their SEASON-1 percentile
    // against everyone's says how much of the gap was selection from the start.
    const seasonsSeen = new Map([...oprs].map(([n, per]) => [n, Object.keys(per).length]));
    const vetMin = Math.min(5, SEASONS.length);
    const veterans = new Set([...seasonsSeen].filter(([, c]) => c >= vetMin).map(([n]) => n));
    const byAgeVet = new Map<number, number[]>();
    for (const [num, per] of oprs) {
        if (!veterans.has(num)) continue;
        const ry = rookieYear.get(num)!;
        for (const s of SEASONS) {
            if (per[s] === undefined) continue;
            const age = s - ry;
            if (age < 0 || age > 6) continue;
            const p = pctlOf(s, per[s]);
            if (p === null) continue;
            (byAgeVet.get(age) ?? byAgeVet.set(age, []).get(age)!).push(p);
        }
    }
    const cohortCurve = summarize(byAgeVet);

    console.log("\n  TODOS los equipos (la cola pierde equipos: eso es attrition, no mejora)");
    console.log("  temporada  equipos   p25  mediana   p75   (percentil regional de OPR)");
    for (const r of curve) {
        console.log(`  ${String(r.year).padStart(6)}  ${String(r.teams).padStart(8)}  ${String(r.p25).padStart(5)}  ${String(r.median).padStart(7)}  ${String(r.p75).padStart(5)}`);
    }
    console.log(`\n  COHORTE FIJA — solo los ${veterans.size} equipos con ${vetMin}+ temporadas (nadie sale a media curva)`);
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
    try { analyzeRegion(r); }
    catch (e) { console.error(`  ${r} falló: ${(e as Error).message}`); }
}
console.log(`\nEscrito en ${OUT_DIR}`);
console.log("Recordatorio: la cola de la curva es survivor-biased — los programas que se retiran salen de los datos.");
