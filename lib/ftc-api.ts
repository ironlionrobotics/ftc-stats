import "server-only";
import { flattenMatchScores, type AllianceScoreBreakdown, type MatchScoreEntry } from "@/lib/score-breakdown";
import { cache } from "react";
import { TeamRanking, AdvancementResponse, AdvancementPoints, FTCMatch, FTCAward, FTCEvent } from "@/types/scouting";
import { serverCache } from "@/lib/server-cache";
import { singleFlight } from "@/lib/single-flight";

const BASE_URL = "https://ftc-api.firstinspires.org/v2.0";

// Per-alliance breakdown + flattened score entry. Types and parsing live in
// lib/score-breakdown.ts (pure, unit-tested); re-exported under the names
// existing callers already import.
export type FTCAllianceScoreBreakdown = AllianceScoreBreakdown;
export type FTCMatchScoreEntry = MatchScoreEntry;

// Team metadata from the FIRST API `/teams` endpoint.
export interface FTCTeamInfo {
    teamNumber: number;
    nameFull: string;
    nameShort: string;
    schoolName?: string;
    city?: string;
    stateProv?: string;
    country?: string;
    website?: string;
    rookieYear?: number;
    robotName?: string;
}

// Per-event ranking + derived KPIs for a team across a season, built by
// fetchTeamRankingsInSeason. The array it returns is sorted CHRONOLOGICALLY by
// `dateStart` — any trend analysis over the season (lib/team-season-analysis.ts)
// reads "per event" as "per position in this array".
export interface TeamSeasonRanking extends TeamRanking {
    eventCode: string;
    eventName: string;
    /** ISO start date of the event, carried over so callers can order a season. */
    dateStart: string;
    avgNP: number;
    avgAuto: number;
    highScore: number;
    winRate: number;
}

// Credentials from environment variables
const USERNAME = process.env.FTC_API_USERNAME;
const API_KEY = process.env.FTC_API_KEY;

if (!USERNAME || !API_KEY) {
    console.warn("FTC API credentials not found in environment variables");
}

const AUTH_HEADER = {
    Authorization: `Basic ${Buffer.from(`${USERNAME}:${API_KEY}`).toString('base64')}`,
};

const CACHE_PREFIX = "ftcapi:";

async function fetchWithRetry(url: string, options: RequestInit, retries = 3, backoff = 1000): Promise<Response> {
    try {
        const response = await fetch(url, options);
        if (response.ok) return response;

        // Retry only on server errors (5xx) or rate limits (429)
        if (retries > 0 && (response.status >= 500 || response.status === 429)) {
            const jitter = Math.random() * 500;
            const waitTime = backoff + jitter;
            console.warn(`[Retry] Status ${response.status} for ${url}. Retrying in ${Math.round(waitTime)}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
        }
        return response;
    } catch (error) {
        if (retries > 0) {
            const jitter = Math.random() * 500;
            const waitTime = backoff + jitter;
            console.warn(`[Retry] Error for ${url}: ${error}. Retrying in ${Math.round(waitTime)}ms...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
        }
        throw error;
    }
}

// Reads a cached payload from the shared server cache (memory → Firestore,
// lib/server-cache.ts). The TTL parameter is kept for call-site compatibility;
// expiry is fixed at write time. Returns null on miss, expiry, or any cache
// failure — a broken cache never fails the request (decision #89).
export async function getCachedData<T>(key: string, ttlSeconds: number): Promise<T | null> {
    void ttlSeconds;
    return serverCache.get<T>(CACHE_PREFIX + key);
}

// Writes a payload with an explicit TTL. Callers MUST pass a sensible
// ttlSeconds — defaults to 5 minutes to avoid permanently stale data.
export async function setCachedData<T>(key: string, payload: T, ttlSeconds: number = 300) {
    await serverCache.set(CACHE_PREFIX + key, payload, ttlSeconds);
}

// Read-through cache with single-flight stampede protection.
//
// Fast path (warm cache entry): one cache read, return — the single-flight Map
// is never touched, so cache hits pay zero coordination overhead.
//
// Cold path (miss): concurrent callers for the same key share ONE `work()`
// execution via singleFlight instead of each hammering the FIRST API. Inside
// the flight we re-check the cache first, in case a prior flight for the same
// key populated it in the gap between our outer miss and acquiring the slot.
//
// `work()` owns the fetch AND which results get written to cache — each fetcher
// caches successful responses but returns an *uncached* fallback ([]/null) on
// error, so failures are never memoised and the next request retries cleanly.
async function readThrough<T>(
    cacheKey: string,
    ttlSeconds: number,
    work: () => Promise<T>,
): Promise<T> {
    const cached = await getCachedData<T>(cacheKey, ttlSeconds);
    if (cached) return cached;

    return singleFlight(cacheKey, async () => {
        const recheck = await getCachedData<T>(cacheKey, ttlSeconds);
        if (recheck) return recheck;
        return work();
    });
}

// Helper to determine cache TTL based on event status.
// Wrapped with React.cache so that within a single SSR request, multiple
// fetchRankings/fetchMatches/etc. calls for the same (season, eventCode) reuse
// the result instead of triggering a fresh fetchEvents + Firestore RTT each time.
const getSmartTTL = cache(async (season: number, eventCode: string): Promise<number> => {
    try {
        const events = await fetchEvents(season);
        const event = events.find(e => e.code === eventCode);

        // Default to short cache (60s) if event not found (safe fallback)
        if (!event) return 60;

        const now = new Date();
        // dateStart/dateEnd are date-only strings ("YYYY-MM-DD"), which
        // Date parses as UTC midnight. All arithmetic must stay in UTC:
        // mixing in local setHours() shifted the boundary by the server's
        // timezone offset and marked events "completed" during their final
        // afternoon (playoffs!) when the server ran in UTC.
        const start = new Date(event.dateStart);
        const end = new Date(event.dateEnd || event.dateStart);
        end.setUTCHours(23, 59, 59, 999);

        // Only treat the event as completed a full day after its last day
        // ends in UTC — covers every venue timezone plus late score edits.
        const COMPLETED_BUFFER_MS = 24 * 60 * 60 * 1000;

        // If event is in the past (completed) -> Long Cache (30 days)
        if (now.getTime() > end.getTime() + COMPLETED_BUFFER_MS) {
            return 30 * 24 * 60 * 60;
        }

        // If event is in the future -> Medium Cache (24 hours)
        // We might want to see team list updates, so 24h is good.
        if (now < start) {
            // Check if it's "soon" (e.g. within 3 days) -> shorter cache (1 hour)
            const daysUntil = (start.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
            if (daysUntil < 3) return 3600;
            return 86400;
        }

        // If event is active (now is between start and end) -> Short Cache (60s)
        return 60;
    } catch (e) {
        console.warn("Error calculating Smart TTL, defaulting to 60s:", e);
        return 60;
    }
});


export async function fetchRankings(season: number, eventCode: string): Promise<TeamRanking[]> {
    const cacheKey = `rankings_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);

    return readThrough(cacheKey, ttl, async () => {
        try {
            const response = await fetchWithRetry(`${BASE_URL}/${season}/rankings/${eventCode}`, {
                headers: AUTH_HEADER,
                next: { revalidate: ttl < 60 ? 60 : ttl }, // NextJS revalidate
            });

            if (!response.ok) {
                if (response.status !== 404) {
                    console.error(`Status: ${response.status} ${response.statusText} for ${eventCode} (${season})`);
                }
                return [];
            }

            const data = await response.json();
            const rankings = data.rankings || [];
            await setCachedData(cacheKey, rankings, ttl);
            return rankings;
        } catch (error) {
            console.error(`Error fetching rankings for ${eventCode}:`, error);
            return [];
        }
    });
}

export async function fetchAdvancement(season: number, eventCode: string): Promise<AdvancementResponse | null> {
    const cacheKey = `advancement_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);

    return readThrough(cacheKey, ttl, async () => {
        try {
            const response = await fetchWithRetry(`${BASE_URL}/${season}/advancement/${eventCode}`, {
                headers: AUTH_HEADER,
                next: { revalidate: ttl < 60 ? 60 : ttl },
            }, 1);

            if (!response.ok) {
                if (response.status !== 404) {
                    console.error(`Failed to fetch advancement for ${eventCode}: ${response.status} ${response.statusText}`);
                }
                return null;
            }

            const data = await response.json();
            await setCachedData(cacheKey, data, ttl);
            return data;
        } catch (error) {
            console.error(`Error fetching advancement for ${eventCode}:`, error);
            return null;
        }
    });
}

export async function fetchAdvancementPoints(season: number, eventCode: string): Promise<AdvancementPoints[]> {
    const cacheKey = `advancement_points_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);

    return readThrough(cacheKey, ttl, async () => {
        try {
            const response = await fetchWithRetry(`${BASE_URL}/${season}/advancement/${eventCode}/points`, {
                headers: AUTH_HEADER,
                next: { revalidate: ttl < 60 ? 60 : ttl },
            }, 1);

            if (!response.ok) {
                if (response.status !== 404) {
                    console.warn(`[ftc-api] Could not fetch advancement points for ${eventCode}: ${response.status} ${response.statusText}. Using empty data.`);
                }
                return [];
            }

            const data = await response.json();
            const points = data || [];
            await setCachedData(cacheKey, points, ttl);
            return points;
        } catch (error) {
            console.error(`Error fetching advancement points for ${eventCode}:`, error);
            return [];
        }
    });
}

export async function fetchMatches(season: number, eventCode: string): Promise<FTCMatch[]> {
    const cacheKey = `matches_v2_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);

    return readThrough(cacheKey, ttl, async () => {
        const qualUrl = `${BASE_URL}/${season}/matches/${eventCode}?tournamentLevel=qual`;
        const playoffUrl = `${BASE_URL}/${season}/matches/${eventCode}?tournamentLevel=playoff`;

        // Debug logging
        console.log(`[fetchMatches] Fetching for ${eventCode} (Season: ${season})`);
        if (!AUTH_HEADER.Authorization || AUTH_HEADER.Authorization.includes("undefined")) {
            console.warn("[fetchMatches] Warning: Auth header appears invalid or missing credentials.");
        }

        try {
            // 404 means "no data published yet" (cacheable); any other failure
            // must NOT be memoised — see readThrough contract above.
            let fetchFailed = false;
            const handleLevel = (label: string) => async (r: Response) => {
                if (!r.ok) {
                    if (r.status !== 404) {
                        console.warn(`[fetchMatches] ${label} fetch failed: ${r.status} ${r.statusText}`);
                        fetchFailed = true;
                    }
                    return { matches: [] };
                }
                return r.json().catch((e: unknown) => {
                    console.error(`[fetchMatches] Error parsing ${label} JSON:`, e);
                    fetchFailed = true;
                    return { matches: [] };
                });
            };
            const [qualResult, playoffResult] = await Promise.all([
                fetchWithRetry(qualUrl, { headers: AUTH_HEADER, next: { revalidate: ttl < 60 ? 60 : ttl } }).then(handleLevel("Quals")),
                fetchWithRetry(playoffUrl, { headers: AUTH_HEADER, next: { revalidate: ttl < 60 ? 60 : ttl } }).then(handleLevel("Playoffs"))
            ]);

            const qualMatches = qualResult.matches || [];
            const playoffMatches = playoffResult.matches || [];
            const allMatches = [...qualMatches, ...playoffMatches].sort((a, b) => a.matchNumber - b.matchNumber);

            console.log(`[fetchMatches] Found ${allMatches.length} matches for ${eventCode}`);

            if (!fetchFailed) await setCachedData(cacheKey, allMatches, ttl);
            return allMatches;
        } catch (error) {
            console.error(`[fetchMatches] Critical error fetching matches for ${eventCode}:`, error);

            // Fallback
            try {
                const fallbackUrl = `${BASE_URL}/${season}/matches/${eventCode}`;
                console.log(`[fetchMatches] Attempting fallback: ${fallbackUrl}`);
                const resp = await fetch(fallbackUrl, { headers: AUTH_HEADER });
                if (!resp.ok) throw new Error(`Fallback failed: ${resp.status}`);
                const data = await resp.json();
                return data.matches || [];
            } catch (e) {
                console.error(`[fetchMatches] Fallback also failed:`, e);
                return [];
            }
        }
    });
}

// Full schedule (played + upcoming) with results inlined for played matches.
// Source: the FIRST API "hybrid" schedule endpoint. Unplayed matches come
// back with null scores — consumers use that to show predictions instead.
export async function fetchHybridSchedule(
    season: number,
    eventCode: string,
): Promise<import("@/types/scouting").FTCHybridScheduleMatch[]> {
    const cacheKey = `hybrid_v1_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);

    return readThrough(cacheKey, ttl, async () => {
        const qualUrl = `${BASE_URL}/${season}/schedule/${eventCode}/qual/hybrid`;
        const playoffUrl = `${BASE_URL}/${season}/schedule/${eventCode}/playoff/hybrid`;

        try {
            // Same contract as fetchMatches: 404 = "not published yet"
            // (cacheable); any other failure must not be memoised.
            let fetchFailed = false;
            const handleLevel = (label: string) => async (r: Response) => {
                if (!r.ok) {
                    if (r.status !== 404) {
                        console.warn(`[fetchHybridSchedule] ${label} fetch failed: ${r.status} ${r.statusText}`);
                        fetchFailed = true;
                    }
                    return { schedule: [] };
                }
                return r.json().catch((e: unknown) => {
                    console.error(`[fetchHybridSchedule] Error parsing ${label} JSON:`, e);
                    fetchFailed = true;
                    return { schedule: [] };
                });
            };
            const [qualResult, playoffResult] = await Promise.all([
                fetchWithRetry(qualUrl, { headers: AUTH_HEADER, next: { revalidate: ttl < 60 ? 60 : ttl } }).then(handleLevel("Qual")),
                fetchWithRetry(playoffUrl, { headers: AUTH_HEADER, next: { revalidate: ttl < 60 ? 60 : ttl } }).then(handleLevel("Playoff")),
            ]);

            const all = [...(qualResult.schedule || []), ...(playoffResult.schedule || [])];
            if (!fetchFailed) await setCachedData(cacheKey, all, ttl);
            return all;
        } catch (error) {
            console.error(`[fetchHybridSchedule] Error for ${eventCode}:`, error);
            return [];
        }
    });
}

// Selected playoff alliances (published by the API once alliance selection
// happens). Empty array until then. round2 != null on any alliance means the
// event runs 3-robot alliances (Championship/Premier format, manual §15.3).
export async function fetchAlliances(
    season: number,
    eventCode: string,
): Promise<import("@/types/scouting").FTCAllianceSelection[]> {
    const cacheKey = `alliances_v1_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);

    return readThrough(cacheKey, ttl, async () => {
        try {
            const response = await fetchWithRetry(`${BASE_URL}/${season}/alliances/${eventCode}`, {
                headers: AUTH_HEADER,
                next: { revalidate: ttl < 60 ? 60 : ttl },
            });
            if (!response.ok) {
                if (response.status !== 404) {
                    console.warn(`[fetchAlliances] ${response.status} ${response.statusText} for ${eventCode}`);
                }
                // 404/no data yet — return without caching so the next request
                // re-checks (selection can publish any minute during an event).
                return [];
            }
            const data = await response.json();
            const alliances = data.alliances || [];
            await setCachedData(cacheKey, alliances, ttl);
            return alliances;
        } catch (e) {
            console.error(`[fetchAlliances] Error for ${eventCode}:`, e);
            return [];
        }
    });
}

export async function fetchMatchScores(season: number, eventCode: string): Promise<FTCMatchScoreEntry[]> {
    // v5: v4 cached the empty result of parsing the wrong shape (`.scores`)
    // for up to 30 days on completed events — bumping invalidates it.
    const cacheKey = `scores_v5_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);

    return readThrough(cacheKey, ttl, async () => {
        // Use PascalCase for the level as per some documentation variants
        const qualUrl = `${BASE_URL}/${season}/scores/${eventCode}/Qual`;
        const playoffUrl = `${BASE_URL}/${season}/scores/${eventCode}/Playoff`;

        try {
            // Same contract as fetchMatches: 404 = "not published yet"
            // (cacheable); any other failure must not be memoised.
            let fetchFailed = false;
            const handleLevel = (label: string) => async (r: Response): Promise<FTCMatchScoreEntry[]> => {
                if (!r.ok) {
                    if (r.status !== 404) {
                        console.warn(`[fetchMatchScores] ${label} fetch failed: ${r.status} ${r.statusText}`);
                        fetchFailed = true;
                    }
                    return [];
                }
                try {
                    // Real shape: { matchScores: [{ ..., alliances: [...] }] }
                    return flattenMatchScores(await r.json());
                } catch (e: unknown) {
                    console.error(`[fetchMatchScores] Error parsing ${label} JSON:`, e);
                    fetchFailed = true;
                    return [];
                }
            };
            const [qualScores, playoffScores] = await Promise.all([
                fetchWithRetry(qualUrl, { headers: AUTH_HEADER, next: { revalidate: ttl < 60 ? 60 : ttl } }).then(handleLevel("Qual")),
                fetchWithRetry(playoffUrl, { headers: AUTH_HEADER, next: { revalidate: ttl < 60 ? 60 : ttl } }).then(handleLevel("Playoff"))
            ]);

            const allScores = [...qualScores, ...playoffScores];

            // Log to console for debugging on server-side
            if (allScores.length > 0) {
                console.log(`[fetchMatchScores] Successfully fetched ${allScores.length} score breakdowns for ${eventCode}`);
            } else {
                console.warn(`[fetchMatchScores] No scores found for ${eventCode} at ${qualUrl}`);
            }

            if (!fetchFailed) await setCachedData(cacheKey, allScores, ttl);
            return allScores;
        } catch (error) {
            console.error(`[fetchMatchScores] Error for ${eventCode}:`, error);
            return [];
        }
    });
}

export async function fetchTeam(season: number, teamNumber: number): Promise<FTCTeamInfo | null> {
    const cacheKey = `team_${season}_${teamNumber}`;

    // Cache for 24 hours (metadata changes rarely)
    return readThrough(cacheKey, 86400, async () => {
        try {
            const response = await fetchWithRetry(`${BASE_URL}/${season}/teams?teamNumber=${teamNumber}`, {
                headers: AUTH_HEADER,
                next: { revalidate: 86400 },
            });

            if (!response.ok) {
                console.error(`Status: ${response.status} ${response.statusText} for team ${teamNumber}`);
                return null;
            }

            const data = await response.json();
            const team = data.teams?.[0] || null;
            // Only cache real data. `readThrough` treats a falsy cached value
            // as a miss (`if (cached) return cached;`), so writing `null` here
            // would be a pure no-op write — zero cache benefit, one wasted
            // cache round-trip on every lookup. It also deliberately avoids
            // negative-caching: a team that registers mid-season becomes
            // visible immediately instead of waiting out a 24h TTL.
            if (team) {
                await setCachedData(cacheKey, team, 86400);
            }
            return team;
        } catch (error) {
            console.error(`Error fetching team ${teamNumber}:`, error);
            return null;
        }
    });
}

/** A team registered for an event — the subset scouting needs. */
export interface EventTeam {
    teamNumber: number;
    teamName: string;
}

/**
 * Teams registered for an event (`/teams?eventCode=`), available before any
 * match is played — scouting needs the roster on day 1 (pit interviews,
 * practice), when rankings are still empty. FIRST publishes the list days
 * before the event, so it is cached short (≤10 min) until the event is over;
 * a finished event keeps the long smart TTL.
 */
export async function fetchEventTeams(season: number, eventCode: string): Promise<EventTeam[]> {
    const cacheKey = `event_teams_${season}_${eventCode}`;
    const smart = await getSmartTTL(season, eventCode);
    const ttl = smart > 86400 ? smart : Math.min(smart, 600);

    return readThrough(cacheKey, ttl, async () => {
        try {
            const response = await fetchWithRetry(`${BASE_URL}/${season}/teams?eventCode=${encodeURIComponent(eventCode)}`, {
                headers: AUTH_HEADER,
                next: { revalidate: ttl < 60 ? 60 : ttl },
            });
            if (!response.ok) {
                if (response.status !== 404) console.error(`Status: ${response.status} for event teams ${eventCode} (${season})`);
                return [];
            }
            const data = await response.json();
            const teams: EventTeam[] = (data.teams ?? []).map((t: FTCTeamInfo) => ({
                teamNumber: t.teamNumber,
                teamName: t.nameShort || t.nameFull || `Team ${t.teamNumber}`,
            }));
            await setCachedData(cacheKey, teams, ttl);
            return teams;
        } catch (error) {
            console.error(`Error fetching event teams for ${eventCode}:`, error);
            return [];
        }
    });
}

export async function fetchTeamEvents(season: number, teamNumber: number): Promise<FTCEvent[]> {
    const cacheKey = `team_events_${season}_${teamNumber}`;

    return readThrough(cacheKey, 3600, async () => {
        try {
            const response = await fetchWithRetry(`${BASE_URL}/${season}/events?teamNumber=${teamNumber}`, {
                headers: AUTH_HEADER,
                next: { revalidate: 3600 },
            });

            if (!response.ok) return [];
            const data = await response.json();
            const events = data.events || [];
            await setCachedData(cacheKey, events, 3600);
            return events;
        } catch {
            return [];
        }
    });
}

export async function fetchTeamRankingsInSeason(season: number, teamNumber: number): Promise<TeamSeasonRanking[]> {
    const events = await fetchTeamEvents(season, teamNumber);
    const results: TeamSeasonRanking[] = [];

    await Promise.all(events.map(async (event) => {
        try {
            const [eventRankings, eventMatches] = await Promise.all([
                fetchRankings(season, event.code),
                fetchMatches(season, event.code)
            ]);

            const teamRank = eventRankings.find(r => r.teamNumber === teamNumber);
            if (teamRank) {
                // Calculate match-specific KPIs for this team at this event
                let totalNP = 0;
                let totalAuto = 0;
                let highScore = 0;
                let qualMatches = 0;

                const teamMatches = eventMatches.filter(m => m.teams.some(t => t.teamNumber === teamNumber));

                teamMatches.forEach(m => {
                    const isRed = m.teams.some(t => t.teamNumber === teamNumber && t.station.startsWith('Red'));
                    const score = isRed ? m.scoreRedFinal : m.scoreBlueFinal;
                    const foul = isRed ? m.scoreBlueFoul : m.scoreRedFoul;
                    const auto = isRed ? m.scoreRedAuto : m.scoreBlueAuto;

                    highScore = Math.max(highScore, score);

                    if (m.tournamentLevel === "QUALIFICATION") {
                        totalNP += (score - foul);
                        totalAuto += auto;
                        qualMatches++;
                    }
                });

                results.push({
                    ...teamRank,
                    eventCode: event.code,
                    eventName: event.name,
                    dateStart: event.dateStart,
                    avgNP: qualMatches > 0 ? totalNP / qualMatches : 0,
                    avgAuto: qualMatches > 0 ? totalAuto / qualMatches : 0,
                    highScore,
                    winRate: teamRank.matchesPlayed > 0 ? (teamRank.wins / teamRank.matchesPlayed) * 100 : 0
                });
            }
        } catch (e) {
            console.error(`Error processing event stats for ${event.code}:`, e);
        }
    }));

    // The Promise.all above pushes in RESOLUTION order, which is whatever the
    // network returns first — not chronological, and not even stable between
    // requests. Anything that reads the season as a series (growth slope,
    // "current form", the trend chart) would be reading noise. dateStart is an
    // ISO string, so a plain string compare is the chronological order; ties
    // fall back to the event code for determinism.
    return results.sort((a, b) =>
        a.dateStart === b.dateStart
            ? a.eventCode.localeCompare(b.eventCode)
            : a.dateStart < b.dateStart ? -1 : 1,
    );
}

// Wrapped with React.cache so the entire event list for a season is fetched
// at most once per request, regardless of how many getSmartTTL/aggregation calls
// reference it. This eliminates ~32 redundant Firestore RTTs per page load.
export const fetchEvents = cache(async (season: number): Promise<FTCEvent[]> => {
    const cacheKey = `events_${season}`;

    return readThrough(cacheKey, 86400, async () => { // 24h cache
        try {
            const response = await fetchWithRetry(`${BASE_URL}/${season}/events`, {
                headers: AUTH_HEADER,
                next: { revalidate: 86400 },
            });

            if (!response.ok) return [];
            const data = await response.json();
            const events = data.events || [];
            await setCachedData(cacheKey, events, 86400);
            return events;
        } catch (error) {
            console.error("Error fetching events:", error);
            return [];
        }
    });
});

export async function fetchEventAwards(season: number, eventCode: string): Promise<FTCAward[]> {
    const cacheKey = `event_awards_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);

    return readThrough(cacheKey, ttl, async () => {
        try {
            const response = await fetchWithRetry(`${BASE_URL}/${season}/awards/${eventCode}`, {
                headers: AUTH_HEADER,
                next: { revalidate: ttl < 60 ? 60 : ttl },
            });

            if (!response.ok) return [];
            const data = await response.json();
            const awards = data.awards || [];
            await setCachedData(cacheKey, awards, ttl);
            return awards;
        } catch {
            return [];
        }
    });
}

export async function fetchEventAwardsForTeam(season: number, eventCode: string, teamNumber: number): Promise<FTCAward[]> {
    const cacheKey = `awards_${season}_${eventCode}_${teamNumber}`;
    const ttl = await getSmartTTL(season, eventCode);

    return readThrough(cacheKey, ttl, async () => {
        try {
            const response = await fetchWithRetry(`${BASE_URL}/${season}/awards/${eventCode}/${teamNumber}`, {
                headers: AUTH_HEADER,
                next: { revalidate: ttl < 60 ? 60 : ttl },
            });

            if (!response.ok) return [];
            const data = await response.json();
            const awards = data.awards || [];
            await setCachedData(cacheKey, awards, ttl);
            return awards;
        } catch {
            return [];
        }
    });
}

export async function fetchTeamAwards(season: number, teamNumber: number): Promise<FTCAward[]> {
    const events = await fetchTeamEvents(season, teamNumber);
    if (events.length === 0) return [];

    const awardsResults = await Promise.all(
        events.map(event => fetchEventAwardsForTeam(season, event.code, teamNumber))
    );

    return awardsResults.flat();
}
