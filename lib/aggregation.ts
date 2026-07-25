import { fetchRankings, fetchAdvancementPoints, fetchAdvancement, fetchMatches, fetchEvents, getCachedData, setCachedData } from "./ftc-api";
import { MEXICAN_EVENTS } from "./constants";
import { AggregatedTeamStats, FTCMatch, FTCMatchTeam, TeamRanking, AdvancementPoints, AdvancementResponse, FTCEvent } from "@/types/scouting";

export async function getAggregatedStats(season: number = 2024, filters?: { region?: string; eventType?: string; dateStart?: string; dateEnd?: string; eventCodes?: string[] }): Promise<{ teamStats: AggregatedTeamStats[]; events: (FTCEvent & { abbr?: string })[] }> {
    const teamMap = new Map<number, AggregatedTeamStats>();

    interface EventResult {
        event: FTCEvent & { abbr?: string };
        rankings: TeamRanking[];
        advPoints: AdvancementPoints[];
        advancement: AdvancementResponse | null;
        matches: FTCMatch[];
    }

    const results: EventResult[] = [];

    // Fetch all events for the season dynamically
    const allEvents = await fetchEvents(season);

    // Filter events
    // Default to Mexico if no region filter is provided, to maintain original behavior
    // "All" (world-wide) is not supported: it meant ~1,800 events × 4
    // endpoints of API fan-out and a multi-MB team payload serialized to the
    // client. Old shared URLs with ?region=All degrade to the MX default.
    const regionFilter = (filters?.region === "All") ? "MX" : (filters?.region || "MX");

    let filteredEvents = allEvents;

    if (filters?.eventCodes && filters.eventCodes.length > 0) {
        // If specific events are selected, prioritized them over region/type filters
        filteredEvents = filteredEvents.filter(e => filters.eventCodes!.includes(e.code));
    } else {
        // Apply standard filters
        if (regionFilter === "MX") {
            // Filter for Mexican events: Check country 'Mexico', countryCode 'MX', or code starting with 'MX'
            filteredEvents = filteredEvents.filter(e =>
                e.country === "Mexico" || e.countryCode === "MX" || e.code.startsWith("MX")
            );
        } else if (regionFilter === "US") {
            filteredEvents = filteredEvents.filter(e => e.country === "USA" || e.countryCode === "US");
        } else if (regionFilter && regionFilter !== "All") {
            // Generic region filter
            filteredEvents = filteredEvents.filter(e => e.stateProv === regionFilter || e.country === regionFilter);
        }

        if (filters?.eventType && filters.eventType !== "All") {
            filteredEvents = filteredEvents.filter(e =>
                (e.typeName && e.typeName.includes(filters.eventType!)) ||
                e.name.includes(filters.eventType!)
            );
        } else {
            // By default, exclude scrimmages, remote and off-season events when showing "All" 
            // to avoid test events appearing in general stats.
            filteredEvents = filteredEvents.filter(e =>
                !e.typeName?.includes("Scrimmage") &&
                !e.typeName?.includes("Off-season") &&
                !e.name.includes("Scrimmage") &&
                !e.name.includes("Off-Season") &&
                !e.name.includes("Hurdle") // Specifically catch those test events
            );
        }

        if (filters?.dateStart) {
            const start = new Date(filters.dateStart);
            filteredEvents = filteredEvents.filter(e => new Date(e.dateStart) >= start);
        }

        if (filters?.dateEnd) {
            const end = new Date(filters.dateEnd);
            filteredEvents = filteredEvents.filter(e => e.dateEnd ? new Date(e.dateEnd) <= end : false);
        }
    }


    // Cache Logic
    const filterKey = filters ? JSON.stringify(filters) : "default";
    // v3: events[].eventCode switched from abbreviation to real FIRST code.
    const cacheKey = `aggregation_v3_${season}_${filterKey}`;

    // Determine TTL based on filtered events status
    let ttl = 24 * 60 * 60; // Default 24h
    const now = new Date();

    const isAnyActive = filteredEvents.some(e => {
        // Date-only strings parse as UTC midnight — keep all arithmetic in
        // UTC (see getSmartTTL in ftc-api.ts for the timezone-mixing bug).
        const start = new Date(e.dateStart);
        const end = new Date(e.dateEnd || e.dateStart);
        end.setUTCHours(23, 59, 59, 999);
        const threeDaysAfter = new Date(end);
        threeDaysAfter.setUTCDate(threeDaysAfter.getUTCDate() + 3);
        return now >= start && now <= threeDaysAfter;
    });

    if (isAnyActive) ttl = 60;

    const cachedResult = await getCachedData<{ teamStats: AggregatedTeamStats[]; events: (FTCEvent & { abbr?: string })[] }>(cacheKey, ttl);
    if (cachedResult) {
        console.log(`[Aggregation] Serving cached stats for ${filterKey} (TTL: ${ttl}s)`);
        return cachedResult;
    }

    console.log(`[Aggregation] Cache miss. Processing ${filteredEvents.length} events for ${season} (Region: ${regionFilter || "All"})`);

    // Break events into chunks to avoid overwhelming the API, but larger than before
    const CHUNK_SIZE = 10;
    for (let i = 0; i < filteredEvents.length; i += CHUNK_SIZE) {
        const chunk = filteredEvents.slice(i, i + CHUNK_SIZE);

        await Promise.all(chunk.map(async (event) => {
            // Look up abbreviation from constant if available, otherwise use code
            const knownEvent = MEXICAN_EVENTS.find(e => e.code === event.code);
            const eventAbbr = knownEvent ? knownEvent.abbr : event.code;
            const eventWithAbbr = { ...event, abbr: eventAbbr };

            try {
                // Inner calls are parallel
                const [rankings, advPoints, advancement, matches] = await Promise.all([
                    fetchRankings(season, event.code).catch(() => { console.warn(`[Aggregation] Skipping rankings for ${event.code}`); return []; }),
                    fetchAdvancementPoints(season, event.code).catch(() => { console.warn(`[Aggregation] Skipping points for ${event.code}`); return []; }),
                    fetchAdvancement(season, event.code).catch(() => { console.warn(`[Aggregation] Skipping advancement for ${event.code}`); return null; }),
                    fetchMatches(season, event.code).catch(() => { console.warn(`[Aggregation] Skipping matches for ${event.code}`); return []; }),
                ]);
                results.push({ event: eventWithAbbr, rankings, advPoints, advancement, matches });
            } catch (error) {
                console.error(`Unexpected error processing event ${event.code}`, error);
            }
        }));
    }

    for (const { event, rankings, advPoints, advancement, matches } of results) {
        if (!rankings) continue;

        // Calculate NP per team from matches in this event
        const teamEventNP: Record<number, number[]> = {};
        const teamEventHigh: Record<number, number> = {};

        if (matches) {
            for (const match of matches) {
                if (match.tournamentLevel === "PRACTICE") continue;

                const isQual = match.tournamentLevel === "QUALIFICATION";

                const redTeams = match.teams.filter(t => t.station.startsWith("Red"));
                const blueTeams = match.teams.filter(t => t.station.startsWith("Blue"));

                const redNP = match.scoreRedFinal - match.scoreBlueFoul;
                const blueNP = match.scoreBlueFinal - match.scoreRedFoul;

                redTeams.forEach((t: FTCMatchTeam) => {
                    if (isQual) {
                        if (!teamEventNP[t.teamNumber]) teamEventNP[t.teamNumber] = [];
                        teamEventNP[t.teamNumber].push(redNP);
                    }
                    teamEventHigh[t.teamNumber] = Math.max(teamEventHigh[t.teamNumber] || 0, match.scoreRedFinal);
                });

                blueTeams.forEach((t: FTCMatchTeam) => {
                    if (isQual) {
                        if (!teamEventNP[t.teamNumber]) teamEventNP[t.teamNumber] = [];
                        teamEventNP[t.teamNumber].push(blueNP);
                    }
                    teamEventHigh[t.teamNumber] = Math.max(teamEventHigh[t.teamNumber] || 0, match.scoreBlueFinal);
                });
            }
        }

        for (const rank of rankings) {
            if (!teamMap.has(rank.teamNumber)) {
                teamMap.set(rank.teamNumber, {
                    teamNumber: rank.teamNumber,
                    teamName: rank.teamName,
                    regionalsAttended: 0,
                    totalRS: 0,
                    averageRS: 0,
                    totalMatchPoints: 0,
                    averageMatchPoints: 0,
                    totalBasePoints: 0,
                    averageBasePoints: 0,
                    totalAutoPoints: 0,
                    averageAutoPoints: 0,
                    totalNP: 0,
                    averageNP: 0,
                    opr: 0,
                    totalHighScore: 0,
                    averageHighScore: 0,
                    totalWins: 0,
                    totalLosses: 0,
                    totalTies: 0,
                    bestRank: 999,
                    averageRank: 0,
                    hasAdvanced: false,
                    advancementPoints: {
                        total: 0,
                        judging: 0,
                        playoff: 0,
                        selection: 0,
                        qualification: 0,
                    },
                    events: [],
                });
            }

            const teamStats = teamMap.get(rank.teamNumber)!;
            teamStats.regionalsAttended += 1;
            teamStats.totalRS += rank.sortOrder1;
            teamStats.totalMatchPoints += rank.sortOrder2;
            teamStats.totalBasePoints += rank.sortOrder3;
            teamStats.totalAutoPoints += rank.sortOrder4;

            // Use Math.max for High Score across events
            const eventHigh = teamEventHigh[rank.teamNumber] || 0;
            teamStats.totalHighScore = Math.max(teamStats.totalHighScore, eventHigh);

            // NP Aggregation
            const matchNPList = teamEventNP[rank.teamNumber] || [];
            const avgNPInEvent = matchNPList.length > 0 ? matchNPList.reduce((a, b) => a + b, 0) / matchNPList.length : 0;
            teamStats.totalNP += avgNPInEvent;

            teamStats.totalWins += rank.wins;
            teamStats.totalLosses += rank.losses;
            teamStats.totalTies += rank.ties;
            teamStats.bestRank = Math.min(teamStats.bestRank, rank.rank);
            teamStats.events.push({
                // Real FIRST code — scouting writes/reads and /event/[code]
                // key off this. The abbreviation is display-only.
                eventCode: event.code,
                abbr: event.abbr,
                dateStart: event.dateStart,
                dateEnd: event.dateEnd,
                rank: rank.rank,
                rs: rank.sortOrder1,
                matchPoints: rank.sortOrder2,
            });
        }

        if (advPoints) {
            for (const teamAdv of advPoints) {
                const teamStats = teamMap.get(teamAdv.team);
                if (teamStats) {
                    teamStats.advancementPoints.total += teamAdv.points[0] || 0;
                    teamStats.advancementPoints.judging += teamAdv.points[1] || 0;
                    teamStats.advancementPoints.playoff += teamAdv.points[2] || 0;
                    teamStats.advancementPoints.selection += teamAdv.points[3] || 0;
                    teamStats.advancementPoints.qualification += teamAdv.points[4] || 0;
                }
            }
        }

        if (advancement && advancement.advancement) {
            for (const slot of advancement.advancement) {
                const teamStats = teamMap.get(slot.team);
                if (teamStats && !slot.declined) {
                    teamStats.hasAdvanced = true;
                }
            }
        }
    }

    // Finalize averages
    const finalStats: AggregatedTeamStats[] = [];

    for (const stats of teamMap.values()) {
        const count = stats.regionalsAttended;
        stats.averageRS = stats.totalRS / count;
        stats.averageMatchPoints = stats.totalMatchPoints / count;
        stats.averageBasePoints = stats.totalBasePoints / count;
        stats.averageAutoPoints = stats.totalAutoPoints / count;
        stats.averageHighScore = stats.totalHighScore;
        stats.averageNP = stats.totalNP / count;
        stats.opr = stats.averageNP;

        const rankSum = stats.events.reduce((sum, e) => sum + e.rank, 0);
        stats.averageRank = rankSum / count;

        finalStats.push(stats);
    }

    // Return both stats and the list of events that contributed to these stats
    const finalResult = {
        teamStats: finalStats.sort((a, b) => b.averageRS - a.averageRS),
        events: results.map(r => r.event)
    };

    // Cache the processed result with the same smart TTL used for the lookup
    await setCachedData(cacheKey, finalResult, ttl);

    return finalResult;
}
