/**
 * Builds the history table of the starting points (decision #117):
 * lib/data/starting-history-<S>.json = predicted first-event z (historyZ) for
 * every team with history in seasons S-1..S-3, plus the rookie threshold.
 *
 * Source: the OFFICIAL FIRST season archive (data/first-archive/ftc/<Y>/,
 * built by scripts/first-archive-pull.ts), OPR computed in-house (ridge
 * λ = 1, non-penalty). Replaced FTCScout on 16-nov-2026: the coefficients
 * refit on FIRST data came out the same (scripts/fit-history-coefs.ts:
 * last season 0.373 vs 0.371, Worlds 0.387 vs 0.383), so HISTORY_COEFS stay.
 *
 * Why a committed file and not a live query: history only changes once a
 * season, and per-request work must fit a page budget. Re-run when a season
 * ends or the coefficients change (a test checks the coefficient fingerprint).
 *
 * Run: node scripts/run-ts.mjs scripts/build-history-table.ts 2026
 */
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { HISTORY_COEFS, historyZ, maxTeamWithEvents, teamSeasonProfiles, type ScoutEvent } from "@/lib/starting-points";
import { ARCHIVE, scoutSeasonFromArchive } from "./first-archive";

const SEASON = Number(process.argv[2]);

function load(season: number): ScoutEvent[] {
    if (!existsSync(join(ARCHIVE, String(season)))) {
        throw new Error(`season ${season} not archived — run: set -a; . ./.env.local; set +a; node scripts/run-ts.mjs scripts/first-archive-pull.ts ${season}`);
    }
    return scoutSeasonFromArchive(season);
}

function main() {
    if (!SEASON) throw new Error("usage: build-history-table.ts <season>");
    const [s1, s2, s3] = [1, 2, 3].map(k => teamSeasonProfiles(load(SEASON - k)));
    const rookieAbove = maxTeamWithEvents(s2, s3);
    // Sanity: a partial or truncated archive would rate almost everyone "rookie".
    for (const [k, p] of [[1, s1], [2, s2], [3, s3]] as const) {
        const withStats = [...p.values()].filter(x => x.zMean !== null).length;
        if (withStats < 4000) throw new Error(`season ${SEASON - k}: only ${withStats} teams with stats — incomplete archive?`);
    }
    if (rookieAbove < 20000) throw new Error(`rookieAbove ${rookieAbove} looks wrong`);
    const z: Record<number, number> = {};
    for (const t of [...new Set([...s1.keys(), ...s2.keys(), ...s3.keys()])].sort((a, b) => a - b)) {
        if (t >= 90000) continue; // placeholder numbers
        z[t] = Math.round(historyZ(t, s1.get(t), s2.get(t), s3.get(t), rookieAbove) * 100) / 100;
    }
    // Typical robot of the season so far (mean event OPR), only used to scale
    // forecasts before an event's first qual and nobody has an earlier event.
    let seasonMeanRobot = 25;
    if (existsSync(join(ARCHIVE, String(SEASON)))) {
        const means = scoutSeasonFromArchive(SEASON)
            .map(e => e.teams.map(t => t.stats?.opr?.totalPointsNp).filter((x): x is number => Number.isFinite(x)))
            .filter(xs => xs.length >= 6).map(xs => xs.reduce((a, b) => a + b, 0) / xs.length);
        if (means.length) seasonMeanRobot = Math.round(means.reduce((a, b) => a + b, 0) / means.length * 10) / 10;
    }
    const out = `lib/data/starting-history-${SEASON}.json`;
    writeFileSync(out, JSON.stringify({ season: SEASON, source: "FIRST", builtAt: new Date().toISOString().slice(0, 10), coefs: HISTORY_COEFS.join(","), rookieAbove, seasonMeanRobot, z }));
    console.log(`${out}: ${Object.keys(z).length} teams, rookieAbove ${rookieAbove}, seasonMeanRobot ${seasonMeanRobot}`);
}

main();
