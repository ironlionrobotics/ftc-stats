"use server";

import { fetchMatches, fetchRankings, fetchEvents, fetchEventAwards } from "@/lib/ftc-api";
import { FTCMatch, TeamRanking, FTCAward } from "@/types/ftc";

export interface EventAnalysisData {
    eventCode: string;
    eventName: string;
    rankings: TeamRanking[];
    matches: FTCMatch[];
    avgAuto: number;
    avgTeleOp: number;
    avgEndGame: number;
    avgScore: number;
    avgFoul: number;
    maxScore: number;
    teamCount: number;
    opr?: number;
}

export interface TeamEvolution {
    teamNumber: number;
    teamName: string;
    isAdvanced: boolean;
    events: {
        eventCode: string;
        rank: number;
        avgPoints: number;
        avgAuto: number;
        avgTeleOp: number;
        avgFoul: number;
        maxPoints: number;
        rankingPoints: number;
        matchesPlayed: number;
        awards: FTCAward[];
    }[];
    consistencyScore: number;
    trend: 'up' | 'down' | 'stable';
    powerScore: number; // 0-100 internal metric
    projectedNationalRank?: number;
}

export async function getAvailableEvents(season: number) {
    const events = await fetchEvents(season);
    return events.sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());
}

export async function analyzeMultipleEvents(season: number, eventCodes: string[]) {
    const results: EventAnalysisData[] = [];
    const teamMap = new Map<number, TeamEvolution>();

    const allEvents = await getAvailableEvents(season);

    const selectedEvents = allEvents
        .filter(e => eventCodes.includes(e.code))
        .sort((a, b) => {
            const dateA = new Date(a.dateStart || 0).getTime();
            const dateB = new Date(b.dateStart || 0).getTime();
            return dateA - dateB;
        });

    for (const event of selectedEvents) {
        const code = event.code;
        const rawName = event.name || (event as any).eventName || (event as any).nameShort || code;

        const eventName = rawName.replace("Torneo Regional ", "")
            .replace("FTC ", "")
            .replace("Regional ", "")
            .replace("FIRST Tech Challenge ", "")
            .replace("Torneo ", "");

        const [rankings, matches, awards] = await Promise.all([
            fetchRankings(season, code),
            fetchMatches(season, code),
            fetchEventAwards(season, code)
        ]);

        let totalScore = 0;
        let totalAuto = 0;
        let totalFoul = 0;
        let maxEventScore = 0;
        let count = 0;

        matches.forEach(m => {
            if (m.tournamentLevel === 'QUALIFICATION') {
                totalScore += m.scoreRedFinal + m.scoreBlueFinal;
                totalAuto += m.scoreRedAuto + m.scoreBlueAuto;
                totalFoul += m.scoreRedFoul + m.scoreBlueFoul;
                maxEventScore = Math.max(maxEventScore, m.scoreRedFinal, m.scoreBlueFinal);
                count += 2;
            }
        });

        results.push({
            eventCode: code,
            eventName: eventName,
            rankings,
            matches,
            avgScore: count > 0 ? totalScore / count : 0,
            avgAuto: count > 0 ? totalAuto / count : 0,
            avgFoul: count > 0 ? totalFoul / count : 0,
            maxScore: maxEventScore,
            teamCount: rankings.length,
            avgTeleOp: 0,
            avgEndGame: 0
        });

        rankings.forEach(rank => {
            if (!teamMap.has(rank.teamNumber)) {
                teamMap.set(rank.teamNumber, {
                    teamNumber: rank.teamNumber,
                    teamName: rank.teamName,
                    isAdvanced: false,
                    events: [],
                    consistencyScore: 0,
                    trend: 'stable',
                    powerScore: 0
                });
            }

            const teamEntry = teamMap.get(rank.teamNumber)!;
            const teamMatches = matches.filter(m => m.teams.some(t => t.teamNumber === rank.teamNumber));
            let teamTotalPoints = 0;
            let teamTotalAuto = 0;
            let teamTotalFoul = 0;
            let teamMaxPoints = 0;
            let teamQualMatches = 0;

            teamMatches.forEach(m => {
                if (m.tournamentLevel === 'QUALIFICATION') {
                    const isRed = m.teams.some(t => t.teamNumber === rank.teamNumber && t.station.startsWith('Red'));
                    const score = isRed ? m.scoreRedFinal : m.scoreBlueFinal;
                    const foul = isRed ? m.scoreRedFoul : m.scoreBlueFoul;
                    const auto = isRed ? m.scoreRedAuto : m.scoreBlueAuto;

                    teamTotalPoints += score;
                    teamTotalAuto += auto;
                    teamTotalFoul += foul;
                    teamMaxPoints = Math.max(teamMaxPoints, score);
                    teamQualMatches++;
                }
            });

            // Find awards for this team at this event
            const teamAwards = awards.filter(a => a.teamNumber == rank.teamNumber);

            teamEntry.events.push({
                eventCode: code,
                rank: rank.rank,
                avgPoints: teamQualMatches > 0 ? teamTotalPoints / teamQualMatches : rank.sortOrder1,
                avgAuto: teamQualMatches > 0 ? teamTotalAuto / teamQualMatches : rank.sortOrder4 || 0,
                avgTeleOp: teamQualMatches > 0 ? (teamTotalPoints - teamTotalAuto - teamTotalFoul) / teamQualMatches : 0,
                avgFoul: teamQualMatches > 0 ? teamTotalFoul / teamQualMatches : 0,
                maxPoints: teamMaxPoints,
                rankingPoints: rank.sortOrder1,
                matchesPlayed: rank.matchesPlayed,
                awards: teamAwards
            });
        });
    }

    // -------------------------------------------------------------------------
    // Event Strength Calculation
    // -------------------------------------------------------------------------
    const maxTeamCount = Math.max(...results.map(e => e.teamCount), 1);
    const maxAvgScore = Math.max(...results.map(e => e.avgScore), 1);
    const maxAvgAuto = Math.max(...results.map(e => e.avgAuto), 1);

    const eventStrengthMap = new Map<string, number>();
    results.forEach(e => {
        const countFactor = e.teamCount / maxTeamCount;
        const scoreFactor = e.avgScore / maxAvgScore;
        const autoFactor = e.avgAuto / maxAvgAuto;

        const rawStrength = (countFactor * 0.3) + (scoreFactor * 0.5) + (autoFactor * 0.2);
        const strength = 0.6 + (rawStrength * 0.5);
        eventStrengthMap.set(e.eventCode, strength);
    });

    const getAwardValue = (award: FTCAward) => {
        const awardName = award.awardName || award.name || "";
        const name = awardName.toLowerCase();
        const place = award.series || 1;

        if (!name) return 0;

        if (name.includes('inspire')) {
            if (place === 1) return 60;
            if (place === 2) return 30;
            if (place === 3) return 15;
            return 10;
        }

        if (name.includes('winning') || name.includes('ganadora')) return 40;
        if (name.includes('finalist')) return 20;

        if (place === 1) return 12;
        if (place === 2) return 6;
        if (place === 3) return 3;

        return 2;
    };

    // Post-process Team trends and stats
    const teamEvolutionList = Array.from(teamMap.values()).map(team => {
        if (team.events.length === 0) return team;

        const scores = team.events.map(e => e.avgPoints);

        if (scores.length >= 2) {
            const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
            const variance = scores.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / scores.length;
            const stdDev = Math.sqrt(variance);
            team.consistencyScore = mean > 0 ? (stdDev / mean) : 0;

            const first = scores[0];
            const last = scores[scores.length - 1];
            if (last > first * 1.05) team.trend = 'up';
            else if (last < first * 0.95) team.trend = 'down';
            else team.trend = 'stable';
        }

        const sortedByWeightedPerf = [...team.events].sort((a, b) => {
            const strA = eventStrengthMap.get(a.eventCode) || 0.8;
            const strB = eventStrengthMap.get(b.eventCode) || 0.8;
            return (b.avgPoints * strB) - (a.avgPoints * strA);
        });

        const bestEvent = sortedByWeightedPerf[0];
        const bestEventStrength = eventStrengthMap.get(bestEvent?.eventCode || "") || 0.8;
        const perfScore = Math.min(100, ((bestEvent.avgPoints * bestEventStrength) / 200) * 100);

        const awardPointsSum = team.events.reduce((sum, evt) => {
            const evtStrength = eventStrengthMap.get(evt.eventCode) || 0.8;
            return sum + evt.awards.reduce((aSum, a) => aSum + (getAwardValue(a) * evtStrength), 0);
        }, 0);

        team.powerScore = (perfScore * 0.6) + (Math.min(100, awardPointsSum) * 0.4);

        return team;
    });

    const mxChampionship = allEvents.find(e => e.code === "MXCMP");
    if (mxChampionship) {
        const mxcmpRankings = await fetchRankings(season, "MXCMP");
        const advancedTeamNumbers = new Set(mxcmpRankings.map(r => r.teamNumber));
        teamEvolutionList.forEach(team => {
            if (advancedTeamNumbers.has(team.teamNumber)) {
                team.isAdvanced = true;
            }
        });

        const advancedTeams = teamEvolutionList.filter(t => t.isAdvanced).sort((a, b) => b.powerScore - a.powerScore);
        advancedTeams.forEach((team, idx) => {
            team.projectedNationalRank = idx + 1;
        });
    }

    const finalEvolution = teamEvolutionList.sort((a, b) => a.teamNumber - b.teamNumber);

    const sortedResults = results.sort((a, b) => {
        const indexA = selectedEvents.findIndex(e => e.code === a.eventCode);
        const indexB = selectedEvents.findIndex(e => e.code === b.eventCode);
        return indexA - indexB;
    });

    return {
        eventStats: sortedResults,
        teamEvolution: finalEvolution
    };
}
