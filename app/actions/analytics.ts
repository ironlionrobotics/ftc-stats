"use server";

import { fetchMatches, fetchRankings, fetchEvents, fetchEventAwards, fetchMatchScores, getCachedData, setCachedData } from "@/lib/ftc-api";
import { FTCMatch, TeamRanking, FTCAward } from "@/types/scouting";
import { allianceScoreComponents, inferTeamRpProbability } from "@/lib/rp-inference";
import { getRpModelAction } from "./train-rp-models";

export interface EventAnalysisData {
    eventCode: string;
    eventName: string;
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
        avgEndGame: number;
        avgFoul: number;
        maxPoints: number;
        rankingPoints: number;
        matchesPlayed: number;
        wins: number;
        losses: number;
        ties: number;
        awards: FTCAward[];
    }[];
    consistencyScore: number;
    trend: 'up' | 'down' | 'stable';
    powerScore: number; // 0-100 internal metric
    projectedNationalRank?: number;
    opr?: number;
    autoOPR?: number;
    teleOPR?: number;
    endgameOPR?: number;
    netDiscipline?: number;
    rpMovement?: number; // 0-1 probability
    rpArtifacts?: number; // 0-1 probability
    rpPattern?: number; // 0-1 probability
}

export async function getAvailableEvents(season: number) {
    const events = await fetchEvents(season);
    return events.sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());
}

export async function analyzeMultipleEvents(season: number, eventCodes: string[], maxMatchesPerTeam?: number, forceRefresh = false) {
    const sortedCodes = [...eventCodes].sort().join('_');
    // Using a hash if strings get too long? Firestore limit is 1500 bytes for ID. 
    // 20 events * 10 chars = 200 chars. Totally fine.
    const cacheKey = `analytics_v2_${season}_${sortedCodes}_${maxMatchesPerTeam || 'all'}`;

    const allEvents = await getAvailableEvents(season);

    // Determine TTL
    let ttl = 24 * 60 * 60; // Default 24h
    const now = new Date();

    // If ANY event is active or very recent (last 3 days), use short TTL
    const isAnyActive = allEvents.some(e => {
        if (!eventCodes.includes(e.code)) return false;

        const start = new Date(e.dateStart);
        const end = new Date(e.dateEnd || e.dateStart);
        end.setHours(23, 59, 59, 999);

        // Active OR finished recently (within 3 days)
        const threeDaysAfter = new Date(end);
        threeDaysAfter.setDate(threeDaysAfter.getDate() + 3);

        return now >= start && now <= threeDaysAfter;
    });

    if (isAnyActive) {
        ttl = 60; // 60s for active events
    }

    if (!forceRefresh) {
        const cachedResult = await getCachedData<any>(cacheKey, ttl);
        if (cachedResult) {
            console.log(`[Analytics] Serving cached analysis for ${sortedCodes} (TTL: ${ttl}s)`);
            return cachedResult;
        }
    }

    console.log(`[Analytics] Cache miss. Computing for ${sortedCodes} (TTL: ${ttl}s)`);

    const results: EventAnalysisData[] = [];
    const teamMap = new Map<number, TeamEvolution>();

    // Load trained per-RP logistic models once per analysis. When the cache
    // is cold or Redis is unconfigured, both come back as null and the team
    // loop transparently falls back to the empirical heuristic (preserving
    // pre-C.3 behavior). See lib/rp-inference.ts.
    const [rpMovementModel, rpArtifactModel] = await Promise.all([
        getRpModelAction({ season, target: "movement" }),
        getRpModelAction({ season, target: "artifact" }),
    ]);

    // No need to fetch allEvents again, already fetched above


    const selectedEvents = allEvents
        .filter(e => eventCodes.includes(e.code))
        .sort((a, b) => {
            const dateA = new Date(a.dateStart || 0).getTime();
            const dateB = new Date(b.dateStart || 0).getTime();
            return dateA - dateB;
        });

    // Process events in chunks to avoid overwhelming the server/API
    const CHUNK_SIZE = 3;
    const eventAnalysisResults: { eventData: EventAnalysisData, rankings: TeamRanking[], matches: FTCMatch[], awards: FTCAward[] }[] = [];

    for (let i = 0; i < selectedEvents.length; i += CHUNK_SIZE) {
        const chunk = selectedEvents.slice(i, i + CHUNK_SIZE);
        console.log(`[Analytics] Processing chunk ${i / CHUNK_SIZE + 1} of ${Math.ceil(selectedEvents.length / CHUNK_SIZE)}`);

        const chunkResults = await Promise.all(chunk.map(async (event) => {
            const code = event.code;
            const rawName = event.name || (event as any).eventName || (event as any).nameShort || code;

            const eventName = rawName.replace("Torneo Regional ", "")
                .replace("FTC ", "")
                .replace("Regional ", "")
                .replace("FIRST Tech Challenge ", "")
                .replace("Torneo ", "");

            const [rankings, matches, awards, scores] = await Promise.all([
                fetchRankings(season, code),
                fetchMatches(season, code),
                fetchEventAwards(season, code),
                fetchMatchScores(season, code)
            ]);

            // Merge scores into matches for accurate breakdown
            const processedMatches = matches.map(m => {
                const matchScores = (scores || []).filter(s =>
                    s.matchNumber === m.matchNumber &&
                    (s.matchLevel.toUpperCase().startsWith(m.tournamentLevel.substring(0, 4).toUpperCase()))
                );

                // Case-insensitive lookup for alliance
                const redScoreData = matchScores.find(s => s.alliance.toLowerCase() === "red")?.scoreBreakdown || {};
                const blueScoreData = matchScores.find(s => s.alliance.toLowerCase() === "blue")?.scoreBreakdown || {};

                // Intelligent field extraction for different seasons
                const getEndgame = (data: any) => {
                    // Try direct fields first
                    if (data.endgamePoints !== undefined) return data.endgamePoints;
                    if (data.endGamePoints !== undefined) return data.endGamePoints;

                    // Fallback: Sum up components if main field is missing (CenterStage/IntoTheDeep variants)
                    return (data.parkingPoints || 0) +
                        (data.dronePoints || 0) +
                        (data.stagePoints || 0) +
                        (data.ascentPoints || 0) +
                        (data.hangPoints || 0);
                };

                const getTeleop = (data: any) => {
                    return data.teleopPoints ?? data.teleOpPoints ?? data.dcPoints ?? 0;
                };

                return {
                    ...m,
                    scoreRedEndgame: getEndgame(redScoreData),
                    scoreBlueEndgame: getEndgame(blueScoreData),
                    scoreRedTeleOp: getTeleop(redScoreData),
                    scoreBlueTeleOp: getTeleop(blueScoreData),
                };
            });

            let totalScore = 0;
            let totalAuto = 0;
            let totalFoul = 0;
            let totalTele = 0;
            let totalEnd = 0;
            let maxEventScore = 0;
            let count = 0;

            processedMatches.forEach(m => {
                if (m.tournamentLevel === 'QUALIFICATION') {
                    const scoreR = m.scoreRedFinal;
                    const scoreB = m.scoreBlueFinal;

                    // Shared decomposition — MUST match the training-side
                    // extraction in lib/rp-inference.ts (train-serve parity).
                    const red = allianceScoreComponents(m, "red");
                    const blue = allianceScoreComponents(m, "blue");

                    totalScore += scoreR + scoreB;
                    totalAuto += red.auto + blue.auto;
                    totalFoul += m.scoreRedFoul + m.scoreBlueFoul;
                    totalTele += red.tele + blue.tele;
                    totalEnd += red.end + blue.end;
                    maxEventScore = Math.max(maxEventScore, scoreR, scoreB);
                    count += 2;
                }
            });

            const eventData: EventAnalysisData = {
                eventCode: code,
                eventName: eventName,
                avgScore: count > 0 ? totalScore / count : 0,
                avgAuto: count > 0 ? totalAuto / count : 0,
                avgFoul: count > 0 ? totalFoul / count : 0,
                maxScore: maxEventScore,
                teamCount: rankings.length,
                avgTeleOp: count > 0 ? totalTele / count : 0,
                avgEndGame: count > 0 ? totalEnd / count : 0,
            };

            return { eventData, rankings, matches: processedMatches, awards };
        }));

        eventAnalysisResults.push(...chunkResults);
    }

    for (const { eventData, rankings, matches, awards } of eventAnalysisResults) {
        results.push(eventData);
        const code = eventData.eventCode;

        rankings.forEach(rank => {
            if (!teamMap.has(rank.teamNumber)) {
                teamMap.set(rank.teamNumber, {
                    teamNumber: rank.teamNumber,
                    teamName: rank.teamName,
                    isAdvanced: false,
                    events: [],
                    consistencyScore: 0,
                    trend: 'stable',
                    powerScore: 0,
                    opr: 0,
                    autoOPR: 0,
                    teleOPR: 0,
                    netDiscipline: 0,
                    rpMovement: 0,
                    rpArtifacts: 0,
                    rpPattern: 0
                });
            }

            const teamEntry = teamMap.get(rank.teamNumber)!;

            let teamMatches = matches
                .filter(m => m.teams.some(t => t.teamNumber === rank.teamNumber))
                .sort((a, b) => a.matchNumber - b.matchNumber);

            if (maxMatchesPerTeam && maxMatchesPerTeam > 0) {
                teamMatches = teamMatches.slice(0, maxMatchesPerTeam);
            }

            let teamTotalPoints = 0;
            let teamTotalAuto = 0;
            let teamTotalTele = 0;
            let teamTotalEndGame = 0;
            let teamTotalFoul = 0;
            let teamMaxPoints = 0;
            let teamQualMatches = 0;

            // RP Accumulators
            let rpMovCount = 0;
            let rpArtCount = 0;
            let rpPatCount = 0;

            teamMatches.forEach(m => {
                if (m.tournamentLevel === 'QUALIFICATION') {
                    const isRed = m.teams.some(t => t.teamNumber === rank.teamNumber && t.station.startsWith('Red'));

                    const score = isRed ? m.scoreRedFinal : m.scoreBlueFinal;
                    const foul = isRed ? m.scoreRedFoul : m.scoreBlueFoul;

                    // Shared decomposition — this profile feeds
                    // inferTeamRpProbability, so it MUST be built with the
                    // exact same function the model was trained with
                    // (lib/rp-inference.ts allianceScoreComponents).
                    const comps = allianceScoreComponents(m, isRed ? "red" : "blue");

                    teamTotalPoints += score;
                    teamTotalAuto += comps.auto;
                    teamTotalTele += comps.tele;
                    teamTotalEndGame += comps.end;
                    teamTotalFoul += foul;
                    teamMaxPoints = Math.max(teamMaxPoints, score);
                    teamQualMatches++;

                    // RP Logic
                    if (isRed) {
                        if (m.scoreRedRp1 >= 1) rpMovCount++;
                        if (m.scoreRedRp2 >= 1) rpArtCount++;
                    } else {
                        if (m.scoreBlueRp1 >= 1) rpMovCount++;
                        if (m.scoreBlueRp2 >= 1) rpArtCount++;
                    }
                }
            });

            const teamAwards = awards.filter(a => a.teamNumber == rank.teamNumber);

            teamEntry.events.push({
                eventCode: code,
                rank: rank.rank,
                avgPoints: teamQualMatches > 0 ? teamTotalPoints / teamQualMatches : rank.sortOrder1,
                avgAuto: teamQualMatches > 0 ? teamTotalAuto / teamQualMatches : rank.sortOrder4 || 0,
                avgTeleOp: teamQualMatches > 0 ? teamTotalTele / teamQualMatches : 0,
                avgEndGame: teamQualMatches > 0 ? teamTotalEndGame / teamQualMatches : 0,
                avgFoul: teamQualMatches > 0 ? teamTotalFoul / teamQualMatches : 0,
                maxPoints: teamMaxPoints,
                rankingPoints: rank.sortOrder1,
                matchesPlayed: teamQualMatches,
                wins: rank.wins || 0,
                losses: rank.losses || 0,
                ties: rank.ties || 0,
                awards: teamAwards
            });

            // Update running season averages/probs.
            // C.3: if a trained logistic model is available, prefer its prediction
            // over the empirical rate. When the model is null (cold cache,
            // pre-training, Redis offline), inferTeamRpProbability falls back
            // to the heuristic — same behavior as before.
            if (teamQualMatches > 0) {
                const eventMovProb = rpMovCount / teamQualMatches;
                const eventArtProb = rpArtCount / teamQualMatches;
                const profile = {
                    avgAuto: teamTotalAuto / teamQualMatches,
                    avgTele: teamTotalTele / teamQualMatches,
                    avgEnd: teamTotalEndGame / teamQualMatches,
                    heuristicMovementProb: eventMovProb,
                    heuristicArtifactProb: eventArtProb,
                };
                const predMov = inferTeamRpProbability(profile, "movement", rpMovementModel);
                const predArt = inferTeamRpProbability(profile, "artifact", rpArtifactModel);
                const predPat = inferTeamRpProbability(profile, "pattern", rpArtifactModel);

                // Keep the highest probability observed across events for the Oracle.
                teamEntry.rpMovement = Math.max(teamEntry.rpMovement || 0, predMov);
                teamEntry.rpArtifacts = Math.max(teamEntry.rpArtifacts || 0, predArt);
                teamEntry.rpPattern = Math.max(teamEntry.rpPattern || 0, predPat);
            }
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
        const autos = team.events.map(e => e.avgAuto);
        const teles = team.events.map(e => e.avgTeleOp);
        const fouls = team.events.map(e => e.avgFoul);

        // Aggregate across events
        team.opr = scores.reduce((a, b) => a + b, 0) / scores.length;
        team.autoOPR = autos.reduce((a, b) => a + b, 0) / autos.length;
        team.teleOPR = teles.reduce((a, b) => a + b, 0) / teles.length;
        team.netDiscipline = -(fouls.reduce((a, b) => a + b, 0) / fouls.length); // Negative because foul is bad

        // RP Probs (Heuristic based on consistency or just mean)
        // For simplicity, we can use the mean probability if we had counts per match,
        // but since we only have avg per event in this specific view, we'll use event means.
        // If we want better data, we'd need to roll up match-level RPs.
        // Let's assume a simplified success rate for now or extract from event data if available.
        // (In a real scenario, we'd roll these up in the match loop above)

        if (scores.length >= 2) {
            const mean = team.opr;
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

    const finalResult = {
        eventStats: sortedResults,
        teamEvolution: finalEvolution
    };

    // Cache the processed result
    await setCachedData(cacheKey, finalResult);

    return finalResult;
}
