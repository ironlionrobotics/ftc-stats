import { TeamRanking, AdvancementResponse, AdvancementPoints, FTCMatch, FTCAward } from "@/types/ftc";
import { db } from "@/lib/firebase";
import { doc, getDoc, setDoc, Timestamp } from "firebase/firestore";

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

const CACHE_COLLECTION = "api_cache";

async function getCachedData<T>(key: string, ttlSeconds: number): Promise<T | null> {
    try {
        const docRef = doc(db, CACHE_COLLECTION, key);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const now = Timestamp.now();
            const diff = now.seconds - data.timestamp.seconds;

            if (diff < ttlSeconds) {
                // console.log(`Serving ${key} from cache`);
                return data.payload as T;
            }
        }
    } catch (e) {
        console.warn("Cache read error:", e);
    }
    return null;
}

async function setCachedData(key: string, payload: any) {
    try {
        const docRef = doc(db, CACHE_COLLECTION, key);
        await setDoc(docRef, {
            payload,
            timestamp: Timestamp.now(),
        });
    } catch (e) {
        console.warn("Cache write error:", e);
    }
}

export async function fetchRankings(season: number, eventCode: string): Promise<TeamRanking[]> {
    const cacheKey = `rankings_${season}_${eventCode}`;
    // Cache for 30 seconds
    const cached = await getCachedData<TeamRanking[]>(cacheKey, 30);
    if (cached) return cached;

    try {
        const response = await fetch(`${BASE_URL}/${season}/rankings/${eventCode}`, {
            headers: AUTH_HEADER,
            next: { revalidate: 30 },
        });

        if (!response.ok) {
            console.error(`Status: ${response.status} ${response.statusText} for ${eventCode} (${season})`);
            if (response.status === 404) return [];
            return [];
        }

        const data = await response.json();
        const rankings = data.rankings || [];
        await setCachedData(cacheKey, rankings);
        return rankings;
    } catch (error) {
        console.error(`Error fetching rankings for ${eventCode}:`, error);
        return [];
    }
}

export async function fetchAdvancement(season: number, eventCode: string): Promise<AdvancementResponse | null> {
    const cacheKey = `advancement_${season}_${eventCode}`;
    const cached = await getCachedData<AdvancementResponse>(cacheKey, 30);
    if (cached) return cached;

    try {
        const response = await fetch(`${BASE_URL}/${season}/advancement/${eventCode}`, {
            headers: AUTH_HEADER,
            next: { revalidate: 30 },
        });

        if (!response.ok) {
            console.error(`Failed to fetch advancement for ${eventCode}`);
            return null;
        }

        const data = await response.json();
        await setCachedData(cacheKey, data);
        return data;
    } catch (error) {
        console.error(`Error fetching advancement for ${eventCode}:`, error);
        return null;
    }
}

export async function fetchAdvancementPoints(season: number, eventCode: string): Promise<AdvancementPoints[]> {
    const cacheKey = `advancement_points_${season}_${eventCode}`;
    const cached = await getCachedData<AdvancementPoints[]>(cacheKey, 30);
    if (cached) return cached;

    try {
        const response = await fetch(`${BASE_URL}/${season}/advancement/${eventCode}/points`, {
            headers: AUTH_HEADER,
            next: { revalidate: 30 },
        });

        if (!response.ok) {
            console.error(`Failed to fetch advancement points for ${eventCode}`);
            return [];
        }

        const data = await response.json();
        const points = data || [];
        await setCachedData(cacheKey, points);
        return points;
    } catch (error) {
        console.error(`Error fetching advancement points for ${eventCode}:`, error);
        return [];
    }
}

export async function fetchMatches(season: number, eventCode: string): Promise<FTCMatch[]> {
    const cacheKey = `matches_v2_${season}_${eventCode}`; // Bumped version for new logic
    const cached = await getCachedData<FTCMatch[]>(cacheKey, 15);
    if (cached) return cached;

    try {
        // Fetch both Quals and Playoffs to be sure, as some seasons/live-states 
        // don't return everything in the base matches endpoint
        const [qualResult, playoffResult] = await Promise.all([
            fetch(`${BASE_URL}/${season}/matches/${eventCode}?tournamentLevel=qual`, { headers: AUTH_HEADER }).then(r => r.json()),
            fetch(`${BASE_URL}/${season}/matches/${eventCode}?tournamentLevel=playoff`, { headers: AUTH_HEADER }).then(r => r.json())
        ]);

        const qualMatches = qualResult.matches || [];
        const playoffMatches = playoffResult.matches || [];

        const allMatches = [...qualMatches, ...playoffMatches].sort((a, b) => a.matchNumber - b.matchNumber);

        await setCachedData(cacheKey, allMatches);
        return allMatches;
    } catch (error) {
        console.error(`Error fetching matches for ${eventCode}:`, error);

        // Fallback to base endpoint if params fail
        try {
            const resp = await fetch(`${BASE_URL}/${season}/matches/${eventCode}`, { headers: AUTH_HEADER });
            const data = await resp.json();
            return data.matches || [];
        } catch (e) {
            return [];
        }
    }
}

export async function fetchTeam(season: number, teamNumber: number): Promise<any | null> {
    const cacheKey = `team_${season}_${teamNumber}`;
    const cached = await getCachedData<any>(cacheKey, 86400); // Cache for 24 hours (metadata changes rarely)
    if (cached) return cached;

    try {
        const response = await fetch(`${BASE_URL}/${season}/teams?teamNumber=${teamNumber}`, {
            headers: AUTH_HEADER,
            next: { revalidate: 86400 },
        });

        if (!response.ok) {
            console.error(`Status: ${response.status} ${response.statusText} for team ${teamNumber}`);
            return null;
        }

        const data = await response.json();
        const team = data.teams?.[0] || null;
        await setCachedData(cacheKey, team);
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
        const response = await fetch(`${BASE_URL}/${season}/events?teamNumber=${teamNumber}`, {
            headers: AUTH_HEADER,
            next: { revalidate: 3600 },
        });

        if (!response.ok) return [];
        const data = await response.json();
        const events = data.events || [];
        await setCachedData(cacheKey, events);
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

export async function fetchEvents(season: number): Promise<any[]> {
    const cacheKey = `events_${season}`;
    const cached = await getCachedData<any[]>(cacheKey, 86400); // 24h cache
    if (cached) return cached;

    try {
        const response = await fetch(`${BASE_URL}/${season}/events`, {
            headers: AUTH_HEADER,
            next: { revalidate: 86400 },
        });

        if (!response.ok) return [];
        const data = await response.json();
        const events = data.events || [];
        await setCachedData(cacheKey, events);
        return events;
    } catch (error) {
        console.error("Error fetching events:", error);
        return [];
    }
}

export async function fetchEventAwardsForTeam(season: number, eventCode: string, teamNumber: number): Promise<FTCAward[]> {
    const cacheKey = `awards_${season}_${eventCode}_${teamNumber}`;
    const cached = await getCachedData<FTCAward[]>(cacheKey, 3600);
    if (cached) return cached;

    try {
        const response = await fetch(`${BASE_URL}/${season}/awards/${eventCode}/${teamNumber}`, {
            headers: AUTH_HEADER,
            next: { revalidate: 3600 },
        });

        if (!response.ok) return [];
        const data = await response.json();
        const awards = data.awards || [];
        await setCachedData(cacheKey, awards);
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
