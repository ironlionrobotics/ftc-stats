import { fetchRankings, fetchAdvancementPoints, fetchAdvancement, fetchMatches } from "./ftc-api";
import { MEXICAN_EVENTS } from "./constants";
import { AggregatedTeamStats } from "@/types/ftc";

export async function getAggregatedStats(season: number = 2024): Promise<AggregatedTeamStats[]> {
    const teamMap = new Map<number, AggregatedTeamStats>();

    const results = [];

    // Process events sequentially to avoid "Failed to fetch" due to rate limits or connection exhaustion
    for (const event of MEXICAN_EVENTS) {
        try {
            const [rankings, advPoints, advancement, matches] = await Promise.all([
                fetchRankings(season, event.code).catch(e => { console.error(`Error fetching rankings for ${event.code}`, e); return []; }),
                fetchAdvancementPoints(season, event.code).catch(e => { console.error(`Error fetching points for ${event.code}`, e); return []; }),
                fetchAdvancement(season, event.code).catch(e => { console.error(`Error fetching advancement for ${event.code}`, e); return null; }),
                fetchMatches(season, event.code).catch(e => { console.error(`Error fetching matches for ${event.code}`, e); return []; }),
            ]);
            results.push({ event, rankings, advPoints, advancement, matches });
        } catch (error) {
            console.error(`Unexpected error processing event ${event.code}`, error);
        }
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

                redTeams.forEach(t => {
                    if (isQual) {
                        if (!teamEventNP[t.teamNumber]) teamEventNP[t.teamNumber] = [];
                        teamEventNP[t.teamNumber].push(redNP);
                    }
                    teamEventHigh[t.teamNumber] = Math.max(teamEventHigh[t.teamNumber] || 0, match.scoreRedFinal);
                });

                blueTeams.forEach(t => {
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
                eventCode: event.abbr || event.code,
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

    return finalStats.sort((a, b) => b.averageRS - a.averageRS);
}
