import "server-only";
import { cache } from "react";
import { TeamRanking, AdvancementResponse, AdvancementPoints, FTCMatch, FTCAward, FTCEvent } from "@/types/scouting";
import { getRedis } from "@/lib/redis";

const BASE_URL = "https://ftc-api.firstinspires.org/v2.0";

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

// Reads cached payload from Upstash Redis. The TTL parameter is kept in the
// signature for backward compatibility but Redis manages expiration natively
// via SET ... EX, so we no longer need to compare timestamps client-side.
// Returns null on cache miss, cache disabled, or read error.
export async function getCachedData<T>(key: string, _ttlSeconds: number): Promise<T | null> {
    const redis = getRedis();
    if (!redis) return null;

    try {
        const cached = await redis.get<T>(CACHE_PREFIX + key);
        return cached ?? null;
    } catch (e) {
        console.warn(
            `[cache] read error for ${key}:`,
            e instanceof Error ? e.message : e,
        );
        return null;
    }
}

// Writes payload to Upstash Redis with an explicit TTL so expired entries are
// reclaimed automatically. Callers MUST pass a sensible ttlSeconds — defaults
// to 5 minutes if omitted to avoid permanently stale data.
export async function setCachedData(key: string, payload: any, ttlSeconds: number = 300) {
    const redis = getRedis();
    if (!redis) return;

    try {
        await redis.set(CACHE_PREFIX + key, payload, { ex: ttlSeconds });
    } catch (e) {
        console.warn(
            `[cache] write error for ${key}:`,
            e instanceof Error ? e.message : e,
        );
    }
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
        // Parse dates (assuming YYYY-MM-DD or ISO string)
        const start = new Date(event.dateStart);
        const end = new Date(event.dateEnd || event.dateStart);

        // Adjust end date to include the whole day (until midnight)
        end.setHours(23, 59, 59, 999);

        // If event is in the past (completed) -> Long Cache (30 days)
        if (now > end) {
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

    // console.log(`[Cache] Checking ${cacheKey} with TTL: ${ttl}s`);
    const cached = await getCachedData<TeamRanking[]>(cacheKey, ttl);
    if (cached) return cached;

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
}

export async function fetchAdvancement(season: number, eventCode: string): Promise<AdvancementResponse | null> {
    const cacheKey = `advancement_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);
    const cached = await getCachedData<AdvancementResponse>(cacheKey, ttl);
    if (cached) return cached;

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
}

export async function fetchAdvancementPoints(season: number, eventCode: string): Promise<AdvancementPoints[]> {
    const cacheKey = `advancement_points_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);
    const cached = await getCachedData<AdvancementPoints[]>(cacheKey, ttl);
    if (cached) return cached;

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
}

export async function fetchMatches(season: number, eventCode: string): Promise<FTCMatch[]> {
    const cacheKey = `matches_v2_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);
    const cached = await getCachedData<FTCMatch[]>(cacheKey, ttl);
    if (cached) return cached;

    const qualUrl = `${BASE_URL}/${season}/matches/${eventCode}?tournamentLevel=qual`;
    const playoffUrl = `${BASE_URL}/${season}/matches/${eventCode}?tournamentLevel=playoff`;

    // Debug logging
    console.log(`[fetchMatches] Fetching for ${eventCode} (Season: ${season})`);
    if (!AUTH_HEADER.Authorization || AUTH_HEADER.Authorization.includes("undefined")) {
        console.warn("[fetchMatches] Warning: Auth header appears invalid or missing credentials.");
    }

    try {
        const [qualResult, playoffResult] = await Promise.all([
            fetchWithRetry(qualUrl, { headers: AUTH_HEADER, next: { revalidate: ttl < 60 ? 60 : ttl } }).then(async r => {
                if (!r.ok) {
                    if (r.status !== 404) console.warn(`[fetchMatches] Quals fetch failed: ${r.status} ${r.statusText}`);
                    return { matches: [] };
                }
                return r.json().catch(e => {
                    console.error("[fetchMatches] Error parsing Quals JSON:", e);
                    return { matches: [] };
                });
            }),
            fetchWithRetry(playoffUrl, { headers: AUTH_HEADER, next: { revalidate: ttl < 60 ? 60 : ttl } }).then(async r => {
                if (!r.ok) {
                    if (r.status !== 404) console.warn(`[fetchMatches] Playoffs fetch failed: ${r.status} ${r.statusText}`);
                    return { matches: [] };
                }
                return r.json().catch(e => {
                    console.error("[fetchMatches] Error parsing Playoffs JSON:", e);
                    return { matches: [] };
                });
            })
        ]);

        const qualMatches = qualResult.matches || [];
        const playoffMatches = playoffResult.matches || [];
        const allMatches = [...qualMatches, ...playoffMatches].sort((a, b) => a.matchNumber - b.matchNumber);

        console.log(`[fetchMatches] Found ${allMatches.length} matches for ${eventCode}`);

        await setCachedData(cacheKey, allMatches, ttl);
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
}

export async function fetchMatchScores(season: number, eventCode: string): Promise<any[]> {
    const cacheKey = `scores_v4_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);
    const cached = await getCachedData<any[]>(cacheKey, ttl);
    if (cached) return cached;

    // Use PascalCase for the level as per some documentation variants
    const qualUrl = `${BASE_URL}/${season}/scores/${eventCode}/Qual`;
    const playoffUrl = `${BASE_URL}/${season}/scores/${eventCode}/Playoff`;

    try {
        const [qualResult, playoffResult] = await Promise.all([
            fetchWithRetry(qualUrl, { headers: AUTH_HEADER, next: { revalidate: ttl < 60 ? 60 : ttl } }).then(r => r.ok ? r.json() : { scores: [] }),
            fetchWithRetry(playoffUrl, { headers: AUTH_HEADER, next: { revalidate: ttl < 60 ? 60 : ttl } }).then(r => r.ok ? r.json() : { scores: [] })
        ]);

        const allScores = [...(qualResult.scores || []), ...(playoffResult.scores || [])];

        // Log to console for debugging on server-side
        if (allScores.length > 0) {
            console.log(`[fetchMatchScores] Successfully fetched ${allScores.length} score breakdowns for ${eventCode}`);
        } else {
            console.warn(`[fetchMatchScores] No scores found for ${eventCode} at ${qualUrl}`);
        }

        await setCachedData(cacheKey, allScores, ttl);
        return allScores;
    } catch (error) {
        console.error(`[fetchMatchScores] Error for ${eventCode}:`, error);
        return [];
    }
}

export async function fetchTeam(season: number, teamNumber: number): Promise<any | null> {
    const cacheKey = `team_${season}_${teamNumber}`;
    const cached = await getCachedData<any>(cacheKey, 86400); // Cache for 24 hours (metadata changes rarely)
    if (cached) return cached;

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
        await setCachedData(cacheKey, team, 86400);
        return team;
    } catch (error) {
        console.error(`Error fetching team ${teamNumber}:`, error);
        return null;
    }
}

export async function fetchTeamEvents(season: number, teamNumber: number): Promise<any[]> {
    const cacheKey = `team_events_${season}_${teamNumber}`;
    const cached = await getCachedData<any[]>(cacheKey, 3600);
    if (cached) return cached;

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
    } catch (error) {
        return [];
    }
}

export async function fetchTeamRankingsInSeason(season: number, teamNumber: number): Promise<any[]> {
    const events = await fetchTeamEvents(season, teamNumber);
    const results: any[] = [];

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

    return results;
}

// Wrapped with React.cache so the entire event list for a season is fetched
// at most once per request, regardless of how many getSmartTTL/aggregation calls
// reference it. This eliminates ~32 redundant Firestore RTTs per page load.
export const fetchEvents = cache(async (season: number): Promise<FTCEvent[]> => {
    const cacheKey = `events_${season}`;
    const cached = await getCachedData<any[]>(cacheKey, 86400); // 24h cache
    if (cached) return cached;

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

export async function fetchEventAwards(season: number, eventCode: string): Promise<FTCAward[]> {
    const cacheKey = `event_awards_${season}_${eventCode}`;
    const ttl = await getSmartTTL(season, eventCode);
    const cached = await getCachedData<FTCAward[]>(cacheKey, ttl);
    if (cached) return cached;

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
    } catch (error) {
        return [];
    }
}

export async function fetchEventAwardsForTeam(season: number, eventCode: string, teamNumber: number): Promise<FTCAward[]> {
    const cacheKey = `awards_${season}_${eventCode}_${teamNumber}`;
    const ttl = await getSmartTTL(season, eventCode);
    const cached = await getCachedData<FTCAward[]>(cacheKey, ttl);
    if (cached) return cached;

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
    } catch (error) {
        return [];
    }
}

export async function fetchTeamAwards(season: number, teamNumber: number): Promise<FTCAward[]> {
    const events = await fetchTeamEvents(season, teamNumber);
    if (events.length === 0) return [];

    const awardsResults = await Promise.all(
        events.map(event => fetchEventAwardsForTeam(season, event.code, teamNumber))
    );

    return awardsResults.flat();
}
