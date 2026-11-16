import "server-only";
import history2026 from "@/lib/data/starting-history-2026.json";
import { fetchMatches, fetchTeamEvents } from "@/lib/ftc-api";
import { componentOpr } from "@/lib/component-opr";
import { npScore, sideDisqualified } from "@/lib/live-projection";
import { serverCache } from "@/lib/server-cache";
import { withTimeout } from "@/lib/tiered-cache";
import { singleFlight } from "@/lib/single-flight";
import { buildStartingPoints, historyZ, inSeasonOpr, type SeasonEventOpr, type StartingPoints } from "@/lib/starting-points";
import type { FTCMatch } from "@/types/scouting";

/**
 * Server side of the starting points (decision #117), official FIRST data only.
 *
 * 1. History (cross-season): a table built offline by
 *    scripts/build-history-table.ts and shipped with the server code (it only
 *    changes once a season). No network at request time.
 * 2. In-season (#114): each robot's own ridge OPR (λ = 1, non-penalty) at the
 *    events of THIS season that started before this one, from the FIRST API
 *    (`/events?teamNumber=` + `/matches`, both through the shared cache; a
 *    finished event's OPR table is cached 30 days). Time-boxed: past the
 *    budget the page gets history only and the work keeps warming the cache.
 *    The assembled per-event result is cached (30 days once the event has
 *    started — its earlier events are final — else 6 h), so a forecast is
 *    stable across visits. Bulk callers (live scoreboard, notifications) use
 *    `{ fetch: false }`: they read that cache and never call FIRST themselves.
 *    All FIRST calls from here share one concurrency limit.
 *
 * Kill switch: STARTING_POINTS=off. Any failure ⇒ less prior, never an error.
 */

interface HistoryTable { season: number; rookieAbove: number; seasonMeanRobot: number; z: Record<string, number> }

const TABLES: Record<number, HistoryTable> = { 2026: history2026 as HistoryTable };
const IN_SEASON_BUDGET_MS = 2_500;
const CONCURRENCY = 6;
/** One limit for every FIRST call made from this module, across concurrent requests. */
let inFlight = 0;
const waiters: (() => void)[] = [];
async function limited<T>(fn: () => Promise<T>): Promise<T> {
    if (inFlight >= CONCURRENCY) await new Promise<void>(res => waiters.push(res));
    inFlight++;
    try { return await fn(); } finally { inFlight--; waiters.shift()?.(); }
}

const isPlayedQual = (m: FTCMatch) => m.tournamentLevel === "QUALIFICATION"
    && ((m.postResultTime?.length ?? 0) > 0 || (m.scoreRedFinal ?? 0) + (m.scoreBlueFinal ?? 0) > 0);
const sideOf = (m: FTCMatch, c: "Red" | "Blue") => m.teams.filter(t => t.station.startsWith(c) && t.onField !== false).map(t => t.teamNumber);

interface EventOprTable { opr: Record<string, number>; n: Record<string, number>; meanRobot: number }

/** Ridge OPR (λ = 1, non-penalty) of one event from its played quals — what #114 validated. */
async function eventOprTable(season: number, code: string, ended: boolean): Promise<EventOprTable | null> {
    const key = `event_ridge_opr_v1_${season}_${code}`;
    const cached = await serverCache.get<EventOprTable>(key).catch(() => null);
    if (cached) return cached;
    const quals = (await limited(() => fetchMatches(season, code))).filter(isPlayedQual);
    const rows = quals.flatMap(m => (["Red", "Blue"] as const).filter(c => !sideDisqualified(m, c)).map(c => ({ teams: sideOf(m, c), value: npScore(m, c) }))).filter(r => r.teams.length > 0);
    if (rows.length < 12) return null; // ≥ 6 quals, as in the validated backtest
    const opr = componentOpr(rows, { lambda: 1 });
    const n: Record<string, number> = {};
    for (const r of rows) for (const t of r.teams) n[t] = (n[t] ?? 0) + 1;
    const table: EventOprTable = {
        opr: Object.fromEntries([...opr].map(([t, x]) => [t, Math.round(x * 100) / 100])),
        n,
        meanRobot: rows.reduce((s, r) => s + r.value, 0) / rows.reduce((s, r) => s + r.teams.length, 0),
    };
    await serverCache.set(key, table, ended ? 30 * 86400 : 3600).catch(() => false);
    return table;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
    const out: R[] = new Array(items.length);
    let i = 0;
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
    }));
    return out;
}

/** Earlier-this-season OPR per robot + the average robot of those events. */
interface InSeason { byTeam: Map<number, SeasonEventOpr[]>; meanRobot: number | null }
type InSeasonCached = { teams: number[]; byTeam: [number, SeasonEventOpr[]][]; meanRobot: number | null };

async function inSeasonTables(season: number, eventStart: string, teams: number[]): Promise<InSeason> {
    const before = eventStart.slice(0, 10);
    const now = Date.now();
    const teamEvents = await mapLimit(teams, CONCURRENCY, t => limited(() => fetchTeamEvents(season, t)).catch(() => []));
    const earlier = new Map<string, { start: string; ended: boolean }>();
    for (const evs of teamEvents) for (const e of evs) {
        const start = (e.dateStart ?? "").slice(0, 10);
        // "Ended" = 2 days past its last day (same buffer as getSmartTTL), so a table is never frozen mid-event.
        if (start && start < before) earlier.set(e.code, { start, ended: Date.parse(e.dateEnd ?? e.dateStart) + 2 * 86400_000 < now });
    }
    const codes = [...earlier.keys()];
    const tables = await mapLimit(codes, CONCURRENCY, c => eventOprTable(season, c, earlier.get(c)!.ended).catch(() => null));
    const byTeam = new Map<number, SeasonEventOpr[]>();
    const means: number[] = [];
    codes.forEach((c, i) => {
        const tb = tables[i];
        if (!tb) return;
        means.push(tb.meanRobot);
        for (const [t, x] of Object.entries(tb.opr)) {
            const list = byTeam.get(Number(t)) ?? [];
            list.push({ start: earlier.get(c)!.start, opr: x, n: tb.n[t] ?? 0 });
            byTeam.set(Number(t), list);
        }
    });
    return { byTeam, meanRobot: means.length ? means.reduce((a, b) => a + b, 0) / means.length : null };
}

/**
 * Starting points for the robots of one event, or null (forecast as before).
 * Uses only data from BEFORE the event started (earlier events, previous
 * seasons), so replays of past forecasts (prediction ledger) stay honest.
 */
/**
 * Cached per event (key: season + event code + start day). Every caller of an
 * event shares it, whatever subset of robots it knows; a caller that knows
 * robots the cache lacks (schedule published later) recomputes for the union.
 */
async function cachedInSeason(season: number, eventCode: string | undefined, eventStart: string, teams: number[], fetch: boolean): Promise<InSeason | null> {
    const day = eventStart.slice(0, 10), key = `inseason_v1_${season}_${eventCode ?? "x"}_${day}`;
    const hit = await serverCache.get<InSeasonCached>(key).catch(() => null);
    const covered = hit ? new Set(hit.teams) : null;
    if (hit && (!fetch || !eventCode || teams.every(t => covered!.has(t)))) return { byTeam: new Map(hit.byTeam), meanRobot: hit.meanRobot };
    if (!fetch || !eventCode) return null; // no stable key ⇒ never fetch on behalf of an unknown event
    const all = [...new Set([...(hit?.teams ?? []), ...teams])];
    const work = singleFlight(key, async () => {
        const r = await inSeasonTables(season, eventStart, all);
        const started = Date.parse(day) <= Date.now();
        await serverCache.set(key, { teams: all, byTeam: [...r.byTeam], meanRobot: r.meanRobot } satisfies InSeasonCached, started ? 30 * 86400 : 6 * 3600).catch(() => false);
        return r;
    });
    work.catch(() => null); // keeps warming the cache after a timeout without an unhandled rejection
    return withTimeout(work, IN_SEASON_BUDGET_MS).catch(() => null);
}

export interface StartingPointsOptions {
    /** The event's code: the in-season prior is cached per event (required to fetch it). */
    eventCode?: string;
    /** false = read the cached in-season prior only, never call FIRST (bulk callers). Default true. */
    fetch?: boolean;
}

export async function getStartingPoints(season: number, eventStart: string | null | undefined, teams: number[], opts: StartingPointsOptions = {}): Promise<StartingPoints | null> {
    if (process.env.STARTING_POINTS === "off" || teams.length === 0) return null;
    const table = TABLES[season];
    const inS = eventStart ? await cachedInSeason(season, opts.eventCode, eventStart, teams, opts.fetch ?? true) : null;
    if (!table && !inS?.byTeam.size) return null;
    return buildStartingPoints({
        teams,
        inSeason: t => (inS && eventStart ? inSeasonOpr(inS.byTeam.get(t), eventStart) : null),
        history: t => (table ? table.z[t] ?? historyZ(t, undefined, undefined, undefined, table.rookieAbove) : null),
        seasonMeanRobot: inS?.meanRobot ?? table?.seasonMeanRobot ?? 0,
    });
}
