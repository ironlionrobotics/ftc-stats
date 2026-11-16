/**
 * Draft science: what actually gets a team picked for a playoff alliance?
 *
 * The strategic question a team asks before an event is "how high do I need to
 * finish to be safe?", and the follow-up nobody has data for: "if I can't
 * captain, does raw ability still get me drafted, or is it all seeding?"
 *
 * Alliances are RECONSTRUCTED from playoff match composition: teams that take the field on
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
 * Data: the OFFICIAL FIRST season archive (data/first-archive/ftc/<S>/, built with
 * scripts/first-archive-pull.ts; 2026 is read from data/season-pull/2026/). No FTCScout.
 * Seed = official qualification rank; OPR percentile uses our ridge OPR (λ=1, non-penalty).
 * (The archive also carries the REAL alliance selection in `alliances`; this script keeps the
 * match-composition reconstruction so numbers stay comparable with the earlier runs.)
 *
 * Usage:
 *   node scripts/run-ts.mjs scripts/draft-science.ts 2025            # all events with playoffs
 *   node scripts/run-ts.mjs scripts/draft-science.ts 2025 --limit 400
 *
 * Resumable: re-running skips events already in the output file.
 * Writes data/draft-science-first/teams-<season>.jsonl (one row per team per event); a
 * separate dir from the old FTCScout-based data/draft-science/ so the sources never mix
 * (scripts/draft-analysis.mjs reads the old dir).
 */

import { readFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { archivedEvents, EVENT_TYPE, isPlayed, isPlayoffLevel, side, toScoutEvent, type FMatch } from "./first-archive";

const OUT_DIR = join(process.cwd(), "data", "draft-science-first");

interface PMatch { teams: { teamNumber: number; alliance: "Red" | "Blue"; onField: boolean }[] }

/** Connected components over "played on the same side of a playoff match". */
function reconstructAlliances(playoffMatches: PMatch[]) {
    const parent = new Map<number, number>();
    const find = (x: number): number => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x)!)!); x = parent.get(x)!; } return x; };
    const union = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };

    for (const m of playoffMatches) {
        for (const color of ["Red", "Blue"]) {
            const side = m.teams.filter(t => t.alliance === color && t.onField).map(t => t.teamNumber);
            for (const t of side) if (!parent.has(t)) parent.set(t, t);
            for (let i = 1; i < side.length; i++) union(side[0], side[i]);
        }
    }
    const groups = new Map<number, number[]>();
    for (const t of parent.keys()) {
        const r = find(t);
        (groups.get(r) ?? groups.set(r, []).get(r)!).push(t);
    }
    return [...groups.values()];
}

const season = Number(process.argv[2] || 2025);
const limitIdx = process.argv.indexOf("--limit");
const limit = limitIdx > -1 ? Number(process.argv[limitIdx + 1]) : Infinity;

const events = archivedEvents(season).filter(a => a.matches.filter(m => isPlayoffLevel(m.tournamentLevel) && isPlayed(m)).length >= 2);

mkdirSync(OUT_DIR, { recursive: true });
const outFile = join(OUT_DIR, `teams-${season}.jsonl`);
const done = new Set(existsSync(outFile)
    ? readFileSync(outFile, "utf8").split("\n").filter(Boolean).map(l => JSON.parse(l).code)
    : []);

const todo = events.filter(e => !done.has(e.event.code)).slice(0, Math.max(0, limit - done.size));
console.log(`${events.length} eventos con playoffs · ${done.size} ya procesados · ${todo.length} por hacer`);

const asPMatch = (m: FMatch): PMatch => ({
    teams: (["Red", "Blue"] as const).flatMap(c => {
        const on = new Set(side(m, c));
        return m.teams.filter(t => t.station.startsWith(c)).map(t => ({ teamNumber: t.teamNumber, alliance: c, onField: on.has(t.teamNumber) }));
    }),
});

let ok = 0, skipped = 0;
for (const [i, a] of todo.entries()) {
    const ev = { code: a.event.code, type: EVENT_TYPE[String(a.event.type)] ?? `type${a.event.type}`, region: a.event.regionCode ?? "" };
    try {
        const scout = toScoutEvent(a);
        const teams = scout.teams.filter(t => Number.isFinite(t.stats?.rank) && (a.rankings ?? []).some(r => r.teamNumber === t.teamNumber))
            .map(t => ({ teamNumber: t.teamNumber, stats: t.stats! }));
        const playoffs = a.matches.filter(m => isPlayoffLevel(m.tournamentLevel) && isPlayed(m)).map(asPMatch);
        if (teams.length < 12 || playoffs.length < 2) { skipped++; continue; }

        const alliances = reconstructAlliances(playoffs);
        const rankOf = new Map(teams.map(t => [t.teamNumber, t.stats.rank as number]));
        const onAlliance = new Map<number, number>();          // team -> index of its alliance
        const captains = new Set();
        alliances.forEach((members, idx) => {
            for (const t of members) onAlliance.set(t, idx);
            // Best (lowest) seed on the alliance is taken as its captain.
            const cap = members.filter(t => rankOf.has(t)).sort((x, y) => rankOf.get(x)! - rankOf.get(y)!)[0];
            if (cap !== undefined) captains.add(cap);
        });

        // OPR percentile within this event, so it's comparable across fields.
        const oprs = teams.map(t => t.stats.opr?.totalPointsNp).filter((v): v is number => Number.isFinite(v)).sort((x, y) => x - y);
        const oprPct = (v: number | undefined) => {
            if (v === undefined || !Number.isFinite(v) || oprs.length < 8) return null;
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
            seedPct: (((t.stats.rank as number) - 1) / (n - 1)) * 100,
            oprPct: oprPct(t.stats.opr?.totalPointsNp),
            picked: onAlliance.has(t.teamNumber) ? 1 : 0,
            captain: captains.has(t.teamNumber) ? 1 : 0,
        })).join("\n");
        appendFileSync(outFile, lines + "\n");
        ok++;
    } catch (e) {
        skipped++;
        if (skipped < 5) console.error(`  ${ev.code}: ${(e as Error).message}`);
    }
    if ((i + 1) % 25 === 0) process.stderr.write(`\r  ${i + 1}/${todo.length} (ok ${ok}, saltados ${skipped})`);
}
process.stderr.write("\n");
console.log(`Listo: ${ok} eventos escritos, ${skipped} saltados -> ${outFile}`);
