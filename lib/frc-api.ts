import "server-only";
import type { FTCAllianceSelection, FTCEvent, FTCHybridScheduleMatch, FTCMatch, TeamRanking } from "@/types/scouting";
import { getCachedData, setCachedData } from "@/lib/ftc-api";
import { singleFlight } from "@/lib/single-flight";

/**
 * FRC Events API v3 (official FIRST) — server-only client, normalized to the
 * SAME shapes the FTC client returns, so the strength model, Oracle and UI
 * work for both programs (plan docs/plan-first-api-y-frc.md, Fase C1).
 *
 * Source of the schemas (16-nov-2026): FIRST's public Postman collection
 * (frc-api-docs.firstinspires.org) and the GRRPit TypeScript client.
 * Differences handled here:
 *  - top-level keys are PascalCase (`Events`, `Matches`, `Schedule`,
 *    `Rankings`, `Alliances`, `Awards`, `MatchScores`) except `teams`;
 *  - tournamentLevel is `Qualification` / `Playoff` (FTC: QUALIFICATION/PLAYOFF);
 *  - alliances list plain team numbers (FTC: objects), plus round3/backup;
 *  - there is no hybrid schedule: schedule + results are merged here;
 *  - `scoreRedFoul` is the foul points awarded TO red (per FIRST's docs).
 *    PRIDE's FTC convention (decision #48) reads each alliance's fouls
 *    RECEIVED on the OPPONENT's field, so the two foul fields are swapped
 *    on the way in. [Verify with the first live response.]
 *
 * Credentials: FRC_API_USERNAME / FRC_API_KEY (separate registration from
 * FTC). Missing ⇒ every call returns empty data. Terms: non-commercial use,
 * attribution "Event Data provided by FIRST".
 */

const BASE_URL = "https://frc-api.firstinspires.org/v3.0";
const PREFIX = "frc_";

function authHeader(): string | null {
    const u = process.env.FRC_API_USERNAME, k = process.env.FRC_API_KEY;
    return u && k ? "Basic " + Buffer.from(`${u}:${k}`).toString("base64") : null;
}

export const hasFrcCredentials = () => authHeader() !== null;

async function get<T>(path: string): Promise<T | null> {
    const auth = authHeader();
    if (!auth) return null;
    for (let attempt = 0; attempt < 3; attempt++) {
        const r = await fetch(`${BASE_URL}${path}`, {
            headers: { Authorization: auth, Accept: "application/json" },
            cache: "no-store",
            signal: AbortSignal.timeout(15_000),
        }).catch(() => null);
        if (r?.ok) return (await r.json().catch(() => null)) as T | null;
        if (r && r.status < 500 && r.status !== 429) return null; // 400/401/404/501: no retry
        if (attempt < 2) await new Promise(res => setTimeout(res, 800 * 2 ** attempt));
    }
    return null;
}

/** Read-through cache on the shared server cache; empty results are not cached. */
async function cached<T>(key: string, ttlSeconds: number, work: () => Promise<T | null>, empty: T): Promise<T> {
    const hit = await getCachedData<T>(PREFIX + key, ttlSeconds);
    if (hit) return hit;
    return singleFlight(PREFIX + key, async () => {
        const v = await work();
        if (v === null) return empty;
        // Empty lists (event not started) are cached briefly, so pre-event pages don't hit FIRST on every view.
        await setCachedData(PREFIX + key, v, Array.isArray(v) && !v.length ? Math.min(ttlSeconds, 300) : ttlSeconds);
        return v;
    });
}

// ---------------------------------------------------------------------------
// Raw shapes (FRC v3)

interface RawEvent { code: string; name: string; type: string; districtCode: string | null; divisionCode: string | null; venue?: string; city?: string; stateprov?: string; country?: string; dateStart: string; dateEnd: string; timezone?: string }
interface RawTeamSlot { teamNumber: number; station: string; dq?: boolean; surrogate?: boolean }
interface RawMatch { description: string; tournamentLevel: string; matchNumber: number; actualStartTime?: string | null; postResultTime?: string | null; scoreRedFinal: number | null; scoreRedFoul: number | null; scoreRedAuto: number | null; scoreBlueFinal: number | null; scoreBlueFoul: number | null; scoreBlueAuto: number | null; teams: RawTeamSlot[] }
interface RawSchedule { description: string; tournamentLevel: string; matchNumber: number; startTime?: string | null; teams: RawTeamSlot[] }
interface RawRanking { rank: number; teamNumber: number; sortOrder1: number; sortOrder2: number; sortOrder3: number; sortOrder4: number; sortOrder5: number; sortOrder6: number; wins: number; losses: number; ties: number; qualAverage: number | null; dq: number; matchesPlayed: number }
interface RawAlliance { number: number; name: string; captain: number | null; round1: number | null; round2: number | null; round3: number | null; backup: number | null; backupReplaced: boolean | null }
export interface FrcTeam { teamNumber: number; nameFull?: string; nameShort?: string; city?: string; stateProv?: string; country?: string; rookieYear?: number; districtCode?: string | null }
export interface FrcAward { awardId: number; name: string; series: number; teamNumber: number | null; person?: string | null }
export interface FrcScoreEntry { matchLevel: string; matchNumber: number; alliances: ({ alliance: "Red" | "Blue" } & Record<string, unknown>)[] }

// ---------------------------------------------------------------------------
// TTL: finished events change rarely, live ones every minute.

function ttlFor(e: { dateStart?: string; dateEnd?: string } | undefined): number {
    if (!e?.dateEnd) return 60; // unknown event (e.g. /events failed): assume live, like getSmartTTL (#112)
    const now = Date.now(), start = Date.parse(e.dateStart ?? e.dateEnd), end = Date.parse(e.dateEnd) + 86400_000;
    if (now > end + 2 * 86400_000) return 30 * 86400;
    if (now >= start - 86400_000 && now <= end) return 60;
    return 3600;
}

const LEVEL: Record<string, string> = { Qualification: "QUALIFICATION", Playoff: "PLAYOFF", Practice: "PRACTICE" };

// ---------------------------------------------------------------------------
// Public API (same shapes as lib/ftc-api.ts)

export async function fetchFrcEvents(season: number): Promise<(FTCEvent & { type: string; districtCode: string | null })[]> {
    return cached(`events_${season}`, 86400, async () => {
        const d = await get<{ Events: RawEvent[] }>(`/${season}/events`);
        return d?.Events ? d.Events.map(e => ({
            code: e.code, name: e.name, dateStart: e.dateStart, dateEnd: e.dateEnd, venue: e.venue, city: e.city,
            stateProv: e.stateprov, country: e.country, typeName: e.type, type: e.type, districtCode: e.districtCode,
        })) : null;
    }, []);
}

async function eventTtl(season: number, code: string) {
    return ttlFor((await fetchFrcEvents(season)).find(e => e.code === code));
}

const toTeams = (teams: RawTeamSlot[]) => teams.map(t => ({
    teamNumber: t.teamNumber, station: t.station as FTCMatch["teams"][number]["station"], dq: !!t.dq,
    onField: true, yellowCard: false, redCard: false,
}));

/** Played matches (qual + playoff) in FTC shape. Playoff `series` = match number (FRC numbers playoff matches 1…16). */
export async function fetchFrcMatches(season: number, code: string): Promise<FTCMatch[]> {
    const ttl = await eventTtl(season, code);
    return cached(`matches_${season}_${code}`, ttl, async () => {
        const [q, p] = await Promise.all(["Qualification", "Playoff"].map(l => get<{ Matches: RawMatch[] }>(`/${season}/matches/${code}?tournamentLevel=${l}`)));
        if (!q?.Matches && !p?.Matches) return null;
        return [...(q?.Matches ?? []), ...(p?.Matches ?? [])].map(m => ({
            description: m.description, matchNumber: m.matchNumber, tournamentLevel: LEVEL[m.tournamentLevel] ?? m.tournamentLevel.toUpperCase(),
            series: m.tournamentLevel === "Playoff" ? m.matchNumber : 0,
            scoreRedFinal: m.scoreRedFinal ?? 0, scoreBlueFinal: m.scoreBlueFinal ?? 0,
            scoreRedAuto: m.scoreRedAuto ?? 0, scoreBlueAuto: m.scoreBlueAuto ?? 0,
            // Swapped: PRIDE reads fouls RECEIVED on the opponent's field (#48); FRC reports points awarded TO each alliance.
            scoreRedFoul: m.scoreBlueFoul ?? 0, scoreBlueFoul: m.scoreRedFoul ?? 0,
            scoreRedRp1: 0, scoreRedRp2: 0, scoreBlueRp1: 0, scoreBlueRp2: 0,
            teams: toTeams(m.teams),
            actualStartTime: m.actualStartTime ?? undefined, postResultTime: m.postResultTime ?? undefined,
        }));
    }, []);
}

/** Schedule with results inlined (FTC "hybrid" shape): unplayed matches have null scores. */
export async function fetchFrcHybridSchedule(season: number, code: string): Promise<FTCHybridScheduleMatch[]> {
    const ttl = await eventTtl(season, code);
    const [sched, played] = await Promise.all([
        cached(`schedule_${season}_${code}`, ttl, async () => {
            const [q, p] = await Promise.all(["Qualification", "Playoff"].map(l => get<{ Schedule: RawSchedule[] }>(`/${season}/schedule/${code}?tournamentLevel=${l}`)));
            return q?.Schedule || p?.Schedule ? [...(q?.Schedule ?? []), ...(p?.Schedule ?? [])] : null;
        }, [] as RawSchedule[]),
        fetchFrcMatches(season, code),
    ]);
    // Only matches with a posted result count as played (an unplayed entry with null scores must not read 0–0).
    const res = new Map(played.filter(m => !!m.postResultTime).map(m => [`${m.tournamentLevel}:${m.matchNumber}`, m]));
    return sched.map(s => {
        const level = LEVEL[s.tournamentLevel] ?? s.tournamentLevel.toUpperCase();
        const r = res.get(`${level}:${s.matchNumber}`);
        return {
            description: s.description, matchNumber: s.matchNumber, tournamentLevel: level,
            series: level === "PLAYOFF" ? s.matchNumber : 0, startTime: s.startTime ?? null, actualStartTime: r?.actualStartTime ?? null,
            scoreRedFinal: r ? r.scoreRedFinal : null, scoreBlueFinal: r ? r.scoreBlueFinal : null,
            teams: s.teams.map(t => ({ teamNumber: t.teamNumber, station: t.station, surrogate: !!t.surrogate })),
        } as FTCHybridScheduleMatch;
    });
}

export async function fetchFrcRankings(season: number, code: string): Promise<TeamRanking[]> {
    const ttl = await eventTtl(season, code);
    return cached(`rankings_${season}_${code}`, ttl, async () => {
        const d = await get<{ Rankings: RawRanking[] }>(`/${season}/rankings/${code}`);
        return d?.Rankings ? d.Rankings.map(r => ({
            ...r, qualAverage: r.qualAverage ?? 0, displayTeamNumber: String(r.teamNumber), teamName: String(r.teamNumber), matchesCounted: r.matchesPlayed,
        })) : null;
    }, []);
}

/** Alliances in FTC shape: captain/round1/round2 as {teamNumber}; round3 and backup kept. */
export async function fetchFrcAlliances(season: number, code: string): Promise<(FTCAllianceSelection & { round3?: { teamNumber: number } | null })[]> {
    const ttl = await eventTtl(season, code);
    return cached(`alliances_${season}_${code}`, ttl, async () => {
        const d = await get<{ Alliances: RawAlliance[] }>(`/${season}/alliances/${code}`);
        const t = (n: number | null) => (n ? { teamNumber: n } : null);
        return d?.Alliances ? d.Alliances.map(a => ({ number: a.number, name: a.name, captain: t(a.captain), round1: t(a.round1), round2: t(a.round2), round3: t(a.round3), backup: t(a.backup) })) : null;
    }, []);
}

export async function fetchFrcScores(season: number, code: string): Promise<FrcScoreEntry[]> {
    const ttl = await eventTtl(season, code);
    return cached(`scores_${season}_${code}`, ttl, async () => {
        const [q, p] = await Promise.all(["Qualification", "Playoff"].map(l => get<{ MatchScores: FrcScoreEntry[] }>(`/${season}/scores/${code}/${l}`)));
        return q?.MatchScores || p?.MatchScores ? [...(q?.MatchScores ?? []), ...(p?.MatchScores ?? [])] : null;
    }, []);
}

export async function fetchFrcEventTeams(season: number, code: string): Promise<FrcTeam[]> {
    return cached(`teams_${season}_${code}`, 86400, async () => {
        const out: FrcTeam[] = [];
        for (let page = 1; page < 20; page++) {
            const d = await get<{ teams: FrcTeam[]; pageTotal: number }>(`/${season}/teams?eventCode=${code}&page=${page}`);
            if (!d?.teams) return out.length ? out : null;
            out.push(...d.teams);
            if (page >= d.pageTotal) break;
        }
        return out;
    }, []);
}

export async function fetchFrcTeamEvents(season: number, teamNumber: number): Promise<FTCEvent[]> {
    return cached(`team_events_${season}_${teamNumber}`, 3600, async () => {
        const d = await get<{ Events: RawEvent[] }>(`/${season}/events?teamNumber=${teamNumber}`);
        return d?.Events ? d.Events.map(e => ({ code: e.code, name: e.name, dateStart: e.dateStart, dateEnd: e.dateEnd, city: e.city, country: e.country, typeName: e.type })) : null;
    }, []);
}

export async function fetchFrcAwards(season: number, code: string): Promise<FrcAward[]> {
    const ttl = await eventTtl(season, code);
    return cached(`awards_${season}_${code}`, ttl, async () => (await get<{ Awards: FrcAward[] }>(`/${season}/awards/event/${code}`))?.Awards ?? null, []);
}
