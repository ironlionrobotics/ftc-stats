"use server";

import { fetchTeamEvents, fetchRankings, fetchMatches, fetchMatchScores, getCachedData, setCachedData, fetchTeam, FTCMatchScoreEntry, FTCAllianceScoreBreakdown } from "@/lib/ftc-api";
import { TeamRanking, FTCMatch } from "@/types/scouting";

// Match score entries from the FIRST API `/scores` endpoint use a
// `matchLevel` string ("Qualification", "Playoff", etc.) that doesn't
// necessarily match FTCMatch.tournamentLevel's casing/wording
// ("QUALIFICATION", "PLAYOFF"). Compare via a normalized prefix match,
// mirroring the already-correct pattern in app/actions/analytics.ts.
export function levelsMatch(tournamentLevel: string, matchLevel: string): boolean {
    return matchLevel.toUpperCase().startsWith(tournamentLevel.substring(0, 4).toUpperCase());
}

// Guards the zero-length case so `consistency` is never persisted as NaN
// (e.g. a team whose events are all still upcoming, or a data gap).
export function computeStdDev(scores: number[], mean: number): number {
    if (scores.length === 0) return 0;
    const variance = scores.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / scores.length;
    return Math.sqrt(variance);
}

export interface TeamSeasonStats {
    teamNumber: number;
    teamName: string;
    rookieYear: number;
    eventsPlayed: number;
    avgOPR: number;
    avgAuto: number;
    avgTele: number;
    avgEnd: number;
    maxScore: number;
    consistency: number; // Standard Deviation of scores
    highScores: number[];
    last5Matches: {
        eventCode: string;
        matchInfo: string;
        score: number;
        result: 'W' | 'L' | 'T';
    }[];
}

export async function fetchEventParticipants(season: number, eventCode: string): Promise<TeamRanking[]> {
    return await fetchRankings(season, eventCode);
}

export async function fetchTeamSeasonHistory(season: number, teamNumber: number): Promise<TeamSeasonStats> {
    const cacheKey = `season_stats_v1_${season}_${teamNumber}`;
    const cached = await getCachedData<TeamSeasonStats>(cacheKey, 3600); // 1 hour cache
    if (cached) return cached;

    // 1. Fetch Basic Info
    const teamInfo = await fetchTeam(season, teamNumber);

    // 2. Fetch All Events
    const events = await fetchTeamEvents(season, teamNumber);
    const completedEvents = events.filter(e => new Date(e.dateEnd || e.dateStart) < new Date());

    const allMatches: FTCMatch[] = [];
    const allScores: FTCMatchScoreEntry[] = [];

    // 3. Aggregate Matches & Scores from all events
    // Parallelize for speed, but limit concurrency if needed
    await Promise.all(completedEvents.map(async (event) => {
        const [matches, scores] = await Promise.all([
            fetchMatches(season, event.code),
            fetchMatchScores(season, event.code)
        ]);

        // Filter for this team
        const teamMatches = matches.filter(m => m.teams.some(t => t.teamNumber === teamNumber));
        allMatches.push(...teamMatches);

        // Filter scores for this team's matches
        const relevantScores = scores.filter(s => teamMatches.some(tm => tm.matchNumber === s.matchNumber && levelsMatch(tm.tournamentLevel, s.matchLevel)));
        allScores.push(...relevantScores);
    }));

    // 4. Calculate Stats
    const scoresList: number[] = [];
    const autos: number[] = [];
    const teles: number[] = [];
    const ends: number[] = [];
    const recentMatches: TeamSeasonStats['last5Matches'] = [];

    // Sort matches by date (heuristic using event code or actual date metadata if available)
    // For now, simpler: just process linear

    allMatches.forEach(m => {
        if (m.tournamentLevel !== 'QUALIFICATION') return; // Focus on Quals for consistency

        const isRed = m.teams.some(t => t.teamNumber === teamNumber && t.station.startsWith('Red'));
        const score = isRed ? m.scoreRedFinal : m.scoreBlueFinal;
        scoresList.push(score);

        // Breakdown lookup — each FTCMatchScoreEntry represents a single
        // alliance (its own `alliance` field), so find the entry matching
        // both this match and this team's alliance color, then use its
        // scoreBreakdown directly (it's not nested by color).
        const allianceColor = isRed ? 'red' : 'blue';
        const matchScore = allScores.find(s =>
            s.matchNumber === m.matchNumber &&
            levelsMatch(m.tournamentLevel, s.matchLevel) &&
            s.alliance.toLowerCase() === allianceColor
        );

        const auto = isRed ? m.scoreRedAuto : m.scoreBlueAuto;
        let tele = 0;
        let end = 0;

        if (matchScore) {
            const allianceData = matchScore.scoreBreakdown;

            if (allianceData) {
                // Robust extraction logic similar to analytics.ts
                const getEndgame = (data: FTCAllianceScoreBreakdown) => data.endgamePoints ?? data.endGamePoints ??
                    ((data.parkingPoints || 0) + (data.ascentPoints || 0));
                const getTeleop = (data: FTCAllianceScoreBreakdown) => data.teleopPoints ?? data.teleOpPoints ?? data.dcPoints ?? 0;

                tele = getTeleop(allianceData);
                end = getEndgame(allianceData);
            } else {
                // Fallback estimate
                tele = Math.max(0, score - auto - (isRed ? m.scoreBlueFoul : m.scoreRedFoul));
            }
        } else {
            // Fallback estimate
            tele = Math.max(0, score - auto);
        }

        autos.push(auto);
        teles.push(tele);
        ends.push(end);

        // Add to recent if not full
        // Real implementation should sort allMatches first
    });

    // Populate Last 5 (approximate by taking last 5 processed)
    const sortedMatches = allMatches.sort(() => {
        // We assume newer matches are later in the array if fetched chronologically,
        // but robust sorting requires event dates. For MVP, take slice from end.
        return 0;
    });

    sortedMatches.slice(-5).reverse().forEach(m => {
        const isRed = m.teams.some(t => t.teamNumber === teamNumber && t.station.startsWith('Red'));
        const myScore = isRed ? m.scoreRedFinal : m.scoreBlueFinal;
        const oppScore = isRed ? m.scoreBlueFinal : m.scoreRedFinal;
        recentMatches.push({
            eventCode: 'UNK', // Need to map back to event
            matchInfo: `Q${m.matchNumber}`,
            score: myScore,
            result: myScore > oppScore ? 'W' : (myScore < oppScore ? 'L' : 'T')
        });
    });

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const max = (arr: number[]) => arr.length > 0 ? Math.max(...arr) : 0;

    // Standard Deviation
    const mean = avg(scoresList);
    const stdDev = computeStdDev(scoresList, mean);

    const stats: TeamSeasonStats = {
        teamNumber,
        teamName: teamInfo?.nameShort || `Team ${teamNumber}`,
        rookieYear: teamInfo?.rookieYear || 0,
        eventsPlayed: completedEvents.length,
        avgOPR: mean, // Using Avg Score as proxy for OPR in this aggreg view for now
        avgAuto: avg(autos),
        avgTele: avg(teles),
        avgEnd: avg(ends),
        maxScore: max(scoresList),
        consistency: stdDev,
        highScores: scoresList.sort((a, b) => b - a).slice(0, 5),
        last5Matches: recentMatches
    };

    await setCachedData(cacheKey, stats);
    return stats;
}

