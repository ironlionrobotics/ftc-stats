/**
 * Builds the history table of the starting points (decision #117):
 * lib/data/starting-history-<S>.json = predicted first-event z (historyZ) for
 * every team with history in seasons S-1..S-3, plus the rookie threshold.
 *
 * Why a committed file and not a live query: FTCScout's bulk season query
 * takes 12–70 s (measured 15-nov-2026) and per-team queries got rate-limited,
 * so the app can't fetch history at request time. History only changes once
 * a season, so it is computed here once (re-run when a season ends or the
 * coefficients change) and shipped with the server code.
 *
 * Input: data/season-pull/history/season-<Y>.json (FTCScout eventsSearch with
 * team stats + awards; gitignored). `--pull` downloads missing seasons first
 * (one query per season, ~1 min each).
 * Run: node scripts/run-ts.mjs scripts/build-history-table.ts 2026 [--pull]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { HISTORY_COEFS, historyZ, maxTeamWithEvents, teamSeasonProfiles, type ScoutEvent } from "@/lib/starting-points";

const SEASON = Number(process.argv[2]);
const PULL = process.argv.includes("--pull");
const DIR = "data/season-pull/history";

async function pull(season: number) {
    const query = `{ eventsSearch(season:${season}, limit:5000){ code type start end regionCode finished awards { type placement teamNumber } teams { teamNumber stats { ... on TeamEventStats${season} { rank wins losses ties qualMatchesPlayed opr { totalPointsNp } } } } } }`;
    const r = await fetch("https://api.ftcscout.org/graphql", {
        method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "PRIDE" },
        body: JSON.stringify({ query }), signal: AbortSignal.timeout(300_000),
    });
    const j = await r.json() as { data?: { eventsSearch: ScoutEvent[] }; errors?: { message: string }[] };
    if (!j.data) throw new Error(j.errors?.[0]?.message ?? `HTTP ${r.status}`);
    mkdirSync(DIR, { recursive: true });
    writeFileSync(`${DIR}/season-${season}.json`, JSON.stringify(j.data.eventsSearch));
}

async function load(season: number): Promise<ScoutEvent[]> {
    const f = `${DIR}/season-${season}.json`;
    if (!existsSync(f)) {
        if (!PULL) throw new Error(`${f} missing — run with --pull`);
        console.log(`pulling ${season} from FTCScout…`);
        await pull(season);
    }
    return JSON.parse(readFileSync(f, "utf8"));
}

async function main() {
    if (!SEASON) throw new Error("usage: build-history-table.ts <season> [--pull]");
    const [s1, s2, s3] = (await Promise.all([1, 2, 3].map(k => load(SEASON - k)))).map(teamSeasonProfiles);
    const rookieAbove = maxTeamWithEvents(s2, s3);
    // Sanity: a partial or truncated pull would rate almost everyone "rookie".
    for (const [k, p] of [[1, s1], [2, s2], [3, s3]] as const) {
        const withStats = [...p.values()].filter(x => x.zMean !== null).length;
        if (withStats < 4000) throw new Error(`season ${SEASON - k}: only ${withStats} teams with stats — incomplete pull?`);
    }
    if (rookieAbove < 20000) throw new Error(`rookieAbove ${rookieAbove} looks wrong`);
    const z: Record<number, number> = {};
    for (const t of [...new Set([...s1.keys(), ...s2.keys(), ...s3.keys()])].sort((a, b) => a - b)) {
        if (t >= 90000) continue; // placeholder numbers
        z[t] = Math.round(historyZ(t, s1.get(t), s2.get(t), s3.get(t), rookieAbove) * 100) / 100;
    }
    // Typical robot of the season so far (mean event OPR), only used to scale
    // forecasts before an event's first qual; a fresh table is not required.
    let seasonMeanRobot = 25;
    if (existsSync(`${DIR}/season-${SEASON}.json`)) {
        const means = (JSON.parse(readFileSync(`${DIR}/season-${SEASON}.json`, "utf8")) as ScoutEvent[])
            .map(e => e.teams.map(t => t.stats?.opr?.totalPointsNp).filter((x): x is number => Number.isFinite(x)))
            .filter(xs => xs.length >= 6).map(xs => xs.reduce((a, b) => a + b, 0) / xs.length);
        if (means.length) seasonMeanRobot = Math.round(means.reduce((a, b) => a + b, 0) / means.length * 10) / 10;
    }
    const out = `lib/data/starting-history-${SEASON}.json`;
    writeFileSync(out, JSON.stringify({ season: SEASON, builtAt: new Date().toISOString().slice(0, 10), coefs: HISTORY_COEFS.join(","), rookieAbove, seasonMeanRobot, z }));
    console.log(`${out}: ${Object.keys(z).length} teams, rookieAbove ${rookieAbove}, seasonMeanRobot ${seasonMeanRobot}`);
}

main().catch(e => { console.error(e); process.exit(1); });
