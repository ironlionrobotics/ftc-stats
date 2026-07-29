"use client";

import { useState, useMemo, useEffect } from "react";
import MatchList from "./MatchList";
import RankingTable from "./RankingTable";
import ParticipantList from "./ParticipantList";
import AlliancePredictor from "../analytics/AlliancePredictor";
import { FTCMatch, TeamRanking, MatchScouting, AdvancementResponse, FTCAward, AdvancementPoints, FTCMatchScouting, FTCHybridScheduleMatch, FTCAllianceSelection } from "@/types/scouting";
import { TeamEvolution } from "@/app/actions/analytics";
import { Trophy, LayoutList, History, Sparkles, Medal, Target, Zap as LucideZap } from "lucide-react";
// lib/scouting-service is imported dynamically in the effect below: it reaches
// the Firebase client SDK, and this is the public event page — the one people
// load most on venue wifi. Statically importing it put ~397 KB of Firestore in
// front of the first paint of a page that server-renders its rankings and
// matches from the FTC API and only needs live scouting for two of its tabs.
import clsx from "clsx";
import { Users as LucideUsers } from "lucide-react";
import AwardList from "./AwardList";
import AdvancementList from "./AdvancementList";
import Link from "next/link";

interface EventViewManagerProps {
    matches: FTCMatch[];
    rankings: TeamRanking[];
    advancement: AdvancementResponse | null;
    awards: FTCAward[];
    advancementPoints: AdvancementPoints[];
    schedule: FTCHybridScheduleMatch[];
    /** Official playoff alliances once selection is published (empty before). */
    selectedAlliances?: FTCAllianceSelection[];
    eventCode: string;
    season: number;
}

export default function EventViewManager({ matches, rankings, advancement, awards, advancementPoints, schedule, selectedAlliances, eventCode, season }: EventViewManagerProps) {
    const [activeTab, setActiveTab] = useState<"matches" | "rankings" | "oracle" | "teams" | "advancement" | "awards">("teams");
    const [scoutingData, setScoutingData] = useState<MatchScouting[]>([]);
    const [filterTeam, setFilterTeam] = useState<number | null>(null);

    // Determine total rounds based on max plays by any team, defaults to 5 if not found
    const totalRounds = useMemo(() => {
        if (!rankings.length) return 5;
        return Math.max(...rankings.map(r => r.matchesPlayed)) || 5;
    }, [rankings]);

    const [selectedRound, setSelectedRound] = useState<number>(totalRounds);

    // Fetch scouting data when Oracle or Matches is active
    useEffect(() => {
        if (!((activeTab === 'oracle' || activeTab === 'matches') && eventCode)) return;
        let cancelled = false;
        let unsubscribe: (() => void) | undefined;
        (async () => {
            const { listenToMatchScouting } = await import("@/lib/scouting-service");
            if (cancelled) return;
            unsubscribe = listenToMatchScouting(season, eventCode, (data) => {
                setScoutingData(data);
            });
        })();
        return () => { cancelled = true; unsubscribe?.(); };
    }, [activeTab, eventCode, season]);

    const matchesPerRound = useMemo(() => {
        if (!rankings.length) return 0;
        const qualMatches = matches.filter(m => m.tournamentLevel === 'QUALIFICATION');
        return Math.ceil(qualMatches.length / totalRounds);
    }, [matches, rankings.length, totalRounds]);

    const simulatedRankings = useMemo(() => {
        if (selectedRound >= totalRounds) {
            return rankings;
        }

        const matchLimit = selectedRound * matchesPerRound;
        const validMatches = matches
            .filter(m => m.tournamentLevel === 'QUALIFICATION')
            .sort((a, b) => a.matchNumber - b.matchNumber)
            .slice(0, matchLimit);

        const teamNames = new Map(rankings.map(r => [r.teamNumber, r.teamName]));
        const stats = new Map<number, {
            teamNumber: number;
            rp: number;
            tbp1: number;
            tbp2: number;
            matchesPlayed: number;
            wins: number;
            losses: number;
            ties: number;
            highScore: number;
        }>();

        rankings.forEach(r => {
            stats.set(r.teamNumber, {
                teamNumber: r.teamNumber,
                rp: 0,
                tbp1: 0,
                tbp2: 0,
                matchesPlayed: 0,
                wins: 0,
                losses: 0,
                ties: 0,
                highScore: 0
            });
        });

        validMatches.forEach(m => {
            const processTeam = (teamNumber: number, alliance: 'Red' | 'Blue', myScore: number, oppScore: number, myAuto: number, myFoulGiven: number) => {
                const s = stats.get(teamNumber);
                if (!s) return;
                s.matchesPlayed++;
                if (myScore > oppScore) { s.rp += 2; s.wins++; }
                else if (myScore < oppScore) { s.losses++; }
                else { s.rp += 1; s.ties++; }
                const np = myScore - myFoulGiven;
                s.tbp1 += np;
                s.tbp2 += myAuto;
                s.highScore = Math.max(s.highScore, myScore);
            };
            m.teams.forEach(t => {
                const isRed = t.station.startsWith('Red');
                // np subtracts penalties RECEIVED (= the opponent's committed fouls).
                if (isRed) processTeam(t.teamNumber, 'Red', m.scoreRedFinal, m.scoreBlueFinal, m.scoreRedAuto, m.scoreBlueFoul);
                else processTeam(t.teamNumber, 'Blue', m.scoreBlueFinal, m.scoreRedFinal, m.scoreBlueAuto, m.scoreRedFoul);
            });
        });

        const calculated = Array.from(stats.values()).map(s => {
            const played = s.matchesPlayed || 1;
            return {
                rank: 0,
                teamNumber: s.teamNumber,
                teamName: teamNames.get(s.teamNumber) || `Team ${s.teamNumber}`,
                sortOrder1: s.rp / played,
                sortOrder2: s.tbp1 / played,
                sortOrder3: 0,
                sortOrder4: s.tbp2 / played,
                wins: s.wins,
                losses: s.losses,
                ties: s.ties,
                matchesPlayed: s.matchesPlayed,
                dq: 0
            } as TeamRanking;
        });

        calculated.sort((a, b) => {
            if (b.sortOrder1 !== a.sortOrder1) return b.sortOrder1 - a.sortOrder1;
            if (b.sortOrder2 !== a.sortOrder2) return b.sortOrder2 - a.sortOrder2;
            return b.sortOrder4 - a.sortOrder4;
        });

        calculated.forEach((item, index) => { item.rank = index + 1; });
        return calculated;
    }, [matches, rankings, selectedRound, totalRounds, matchesPerRound]);

    // MAP TO TEAM EVOLUTION FOR ORACLE
    const oracleTeams = useMemo(() => {
        // 1. Calculate OPR Metrics based on current match filter
        const matchLimit = selectedRound * matchesPerRound;
        const validMatches = matches
            .filter(m => m.tournamentLevel === 'QUALIFICATION')
            .sort((a, b) => a.matchNumber - b.matchNumber)
            .slice(0, matchLimit);

        const calculateComponentOPR = (getValue: (m: FTCMatch, alliance: 'Red' | 'Blue') => number) => {
            const teamsList = simulatedRankings.map(r => r.teamNumber);
            const n = teamsList.length;
            if (n === 0) return new Map();
            const teamToIndex = new Map(teamsList.map((t, i) => [t, i]));
            const A = Array.from({ length: n }, () => new Float64Array(n));
            const B = new Float64Array(n);

            validMatches.forEach(m => {
                const process = (alliance: 'Red' | 'Blue') => {
                    const allianceTeams = m.teams.filter(t => t.station.startsWith(alliance));
                    const indices = allianceTeams.map(t => teamToIndex.get(t.teamNumber)).filter((idx): idx is number => idx !== undefined);
                    const value = getValue(m, alliance);
                    indices.forEach(i => {
                        B[i] += value;
                        indices.forEach(j => { A[i][j] += 1; });
                    });
                };
                process('Red');
                process('Blue');
            });

            // Gauss-Seidel Solver (50 iterations for speed/responsiveness)
            const x = new Float64Array(n).fill(0);
            for (let iter = 0; iter < 50; iter++) {
                for (let i = 0; i < n; i++) {
                    let sum = 0;
                    for (let j = 0; j < n; j++) if (i !== j) sum += A[i][j] * x[j];
                    if (A[i][i] > 0) x[i] = (B[i] - sum) / A[i][i];
                }
            }
            return new Map(teamsList.map((t, i) => [t, x[i]]));
        };

        const overallOPR = calculateComponentOPR((m, alliance) => alliance === 'Red' ? (m.scoreRedFinal - m.scoreBlueFoul) : (m.scoreBlueFinal - m.scoreRedFoul));
        const autoOPR = calculateComponentOPR((m, alliance) => alliance === 'Red' ? m.scoreRedAuto : m.scoreBlueAuto);
        const drawnFoul = calculateComponentOPR((m, alliance) => alliance === 'Red' ? m.scoreBlueFoul : m.scoreRedFoul);
        const committedFoul = calculateComponentOPR((m, alliance) => alliance === 'Red' ? m.scoreRedFoul : m.scoreBlueFoul);

        // Calculate maxes for normalization
        const maxPower = Math.max(...simulatedRankings.map(r => r.sortOrder2 + r.sortOrder4)) || 1;

        return simulatedRankings.map(rank => {
            // Trend logic: compare last 2 matches vs overall event avg
            // reusing validMatches which is already sorted
            const teamMatches = validMatches.filter(m => m.teams.some(t => t.teamNumber === rank.teamNumber));
            const lastTwo = teamMatches.slice(-2);
            let trend: 'up' | 'down' | 'stable' = 'stable';

            if (lastTwo.length >= 2) {
                const recentAvg = lastTwo.reduce((acc, m) => {
                    const isRed = m.teams.some(t => t.teamNumber === rank.teamNumber && t.station.startsWith('Red'));
                    return acc + (isRed ? m.scoreRedFinal - m.scoreBlueFoul : m.scoreBlueFinal - m.scoreRedFoul);
                }, 0) / 2;

                const overallAvg = rank.sortOrder2;
                if (recentAvg > overallAvg * 1.1) trend = 'up';
                else if (recentAvg < overallAvg * 0.9) trend = 'down';
            }

            const powerScore = ((rank.sortOrder2 + rank.sortOrder4) / maxPower) * 100;

            const opr = overallOPR.get(rank.teamNumber) || 0;
            const auto = autoOPR.get(rank.teamNumber) || 0;
            const tele = opr - auto;
            const netDisc = (drawnFoul.get(rank.teamNumber) || 0) - (committedFoul.get(rank.teamNumber) || 0);

            // RP Probabilities (Hybrid: API inferred + Scouting fallback)
            // We calculate the % of matches where the team's ALLIANCE achieved thresholds likely to grant RPs.
            const rpTeamMatches = validMatches.filter(m => m.teams.some(t => t.teamNumber === rank.teamNumber));
            const totalMatches = rpTeamMatches.length;

            let rpMovement = 0;
            let rpArtifacts = 0;
            let rpPattern = 0;

            if (totalMatches > 0) {
                let autoSuccess = 0;
                let teleSuccess = 0;
                let patternSuccess = 0;

                rpTeamMatches.forEach(m => {
                    const isRed = m.teams.some(t => t.teamNumber === rank.teamNumber && t.station.startsWith('Red'));
                    const autoScore = isRed ? m.scoreRedAuto : m.scoreBlueAuto;
                    const totalScore = isRed ? m.scoreRedFinal : m.scoreBlueFinal;
                    const teleScore = totalScore - autoScore - (isRed ? m.scoreBlueFoul : m.scoreRedFoul); // Approx teleop (minus RECEIVED penalties)

                    // Thresholds for "Into The Deep" (Estimated)
                    // Auto RP usually requires specific tasks (Ascent + Samples). ~40pts is a good proxy for high auto achievement.
                    if (autoScore >= 35) autoSuccess++;

                    // Artifacts/Volume RP equivalent -> High TeleOp throughput. ~80pts implies significant cycling.
                    if (teleScore >= 75) teleSuccess++;

                    // Pattern/Endgame? Hard to infer. Let's use a very high score threshold (>130) as specific "Complete Game" proxy.
                    if (totalScore >= 130) patternSuccess++;
                });

                rpMovement = autoSuccess / totalMatches;
                rpArtifacts = teleSuccess / totalMatches;
                rpPattern = patternSuccess / totalMatches;
            }

            // Fallback/Augment with Scouting if available (take the higher value to be generous/accurate)
            const teamScoutingMatches = scoutingData.filter(m => m.teamNumber === rank.teamNumber);
            if (teamScoutingMatches.length > 0) {
                const sTotal = teamScoutingMatches.length;
                const sMov = teamScoutingMatches.filter(m => (m as FTCMatchScouting).movementRP).length / sTotal;
                const sArt = teamScoutingMatches.filter(m => (m as FTCMatchScouting).goalRP).length / sTotal;
                const sPat = teamScoutingMatches.filter(m => (m as FTCMatchScouting).patternRP).length / sTotal;

                rpMovement = Math.max(rpMovement, sMov);
                rpArtifacts = Math.max(rpArtifacts, sArt);
                rpPattern = Math.max(rpPattern, sPat);
            }

            const lastEventStats = {
                eventCode: "CURRENT",
                rank: rank.rank,
                avgPoints: rank.sortOrder2 + rank.sortOrder4,
                avgAuto: rank.sortOrder4,
                avgTeleOp: rank.sortOrder2,
                avgFoul: 0,
                maxPoints: 0,
                rankingPoints: rank.sortOrder1,
                matchesPlayed: rank.matchesPlayed,
                wins: rank.wins || 0,
                losses: rank.losses || 0,
                ties: rank.ties || 0,
                avgEndGame: 0,
                awards: []
            };

            return {
                teamNumber: rank.teamNumber,
                teamName: rank.teamName,
                isAdvanced: false,
                events: [lastEventStats],
                consistencyScore: 0.8, // simplified
                trend,
                powerScore,
                opr,
                autoOPR: auto,
                teleOPR: tele,
                netDiscipline: netDisc,
                rpMovement,
                rpArtifacts,
                rpPattern
            } as TeamEvolution;
        });
    }, [simulatedRankings, matches, selectedRound, matchesPerRound, scoutingData]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                {/* Tab bar scrolls inside itself on mobile — 7 fixed-width
                    buttons used to force the whole page to pan sideways. */}
                <div className="flex p-1 bg-card border border-border rounded-xl w-full md:w-fit shadow-sm overflow-x-auto max-w-full">
                    {/* One accent for active state (modern-technical: a single
                        violet, not a rainbow per tab). */}
                    {([
                        { key: "teams", label: "Teams", icon: <LucideUsers size={18} /> },
                        { key: "rankings", label: "Rankings", icon: <Trophy size={18} /> },
                        { key: "matches", label: "Matches", icon: <LayoutList size={18} /> },
                        { key: "oracle", label: "Oracle", icon: <Sparkles size={18} /> },
                        { key: "advancement", label: "Advancement", icon: <Target size={18} /> },
                        { key: "awards", label: "Awards", icon: <Medal size={18} /> },
                    ] as const).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            className={clsx(
                                "shrink-0 flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 rounded-lg text-sm font-bold whitespace-nowrap transition-all duration-200",
                                activeTab === tab.key
                                    ? "bg-primary text-primary-foreground shadow-sm"
                                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                            )}
                        >
                            {tab.icon} {tab.label}
                        </button>
                    ))}
                    <Link
                        href={`/event/${eventCode}/pro`}
                        className="shrink-0 flex items-center justify-center gap-2 px-4 md:px-6 py-2.5 rounded-lg text-sm font-black whitespace-nowrap transition-all duration-200 text-secondary hover:bg-secondary/10 border border-transparent hover:border-secondary/20"
                    >
                        <LucideZap size={18} /> PRO
                    </Link>
                </div>

                {activeTab !== "matches" && (
                    <div className="flex flex-col gap-1 w-full md:w-auto min-w-[240px]">
                        <div className="flex justify-between items-center px-1">
                            <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                                <History size={12} /> Historia por Ronda
                            </label>
                            <span className="text-xs font-bold text-primary bg-primary/10 px-2 py-0.5 rounded">
                                {selectedRound === totalRounds ? "FINAL" : `Ronda ${selectedRound}`}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 bg-card p-2 rounded-xl border border-border shadow-sm">
                            <span className="text-[10px] font-bold text-muted-foreground">R1</span>
                            <input
                                type="range"
                                min="1"
                                max={totalRounds}
                                step="1"
                                value={selectedRound}
                                onChange={(e) => setSelectedRound(parseInt(e.target.value))}
                                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                            <span className="text-[10px] font-bold text-muted-foreground">Final</span>
                        </div>
                    </div>
                )}
            </div>

            <div className="animate-in fade-in duration-500">
                {activeTab === "rankings" && (
                    <RankingTable
                        rankings={simulatedRankings}
                        matches={matches}
                        onTeamClick={(teamNumber) => {
                            setFilterTeam(teamNumber);
                            setActiveTab("matches");
                        }}
                    />
                )}
                {activeTab === "teams" && (
                    <ParticipantList
                        rankings={rankings}
                        onTeamClick={(teamNumber) => {
                            setFilterTeam(teamNumber);
                            setActiveTab("matches");
                        }}
                    />
                )}
                {activeTab === "matches" && (
                    <MatchList
                        matches={matches}
                        rankings={simulatedRankings}
                        filterTeam={filterTeam}
                        setFilterTeam={setFilterTeam}
                        scoutingData={scoutingData}
                        schedule={schedule}
                        awards={awards}
                        selectedAlliances={selectedAlliances}
                    />
                )}
                {activeTab === "oracle" && (
                    <div className="space-y-6">
                        {selectedAlliances && selectedAlliances.length > 0 && (
                            <SelectedAlliancesPanel alliances={selectedAlliances} />
                        )}
                        <AlliancePredictor
                            teams={oracleTeams}
                            scoutingData={scoutingData}
                            officialAlliances={selectedAlliances}
                            eventCode={eventCode}
                            playoffMatches={matches.filter(m => m.tournamentLevel !== "QUALIFICATION" && m.tournamentLevel !== "PRACTICE")}
                        />
                    </div>
                )}
                {activeTab === "advancement" && (
                    <AdvancementList advancement={advancement} points={advancementPoints} rankings={rankings} />
                )}
                {activeTab === "awards" && (
                    <AwardList awards={awards} rankings={rankings} />
                )}
            </div>
        </div>
    );
}

/**
 * Official playoff alliances as published by the FIRST API. Detects the
 * event's format from the data itself: any alliance with a round-2 pick means
 * 3-robot alliances (Competition Manual §15.3 — any 2 of the 3 play each
 * match). Module-level per the React Compiler static-components rule.
 */
function SelectedAlliancesPanel({ alliances }: { alliances: FTCAllianceSelection[] }) {
    const isThreeRobot = alliances.some(a => a.round2 != null);
    return (
        <div className="bg-card border border-border rounded-xl p-4 md:p-5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <span className="w-1.5 h-6 bg-primary rounded-full" />
                    Alianzas oficiales
                </h3>
                <span className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
                    {alliances.length} alianzas · {isThreeRobot ? "3 robots (juegan 2 por match, §15.3)" : "2 robots"}
                </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {alliances.map(a => (
                    <div key={a.number} className="bg-muted rounded-lg px-3 py-2.5 flex items-center gap-3">
                        <span className="w-7 h-7 shrink-0 rounded-md bg-primary/10 text-primary font-display font-bold text-sm flex items-center justify-center">
                            {a.number}
                        </span>
                        <div className="font-mono text-xs text-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                            {a.captain && <span className="font-bold" title={a.captain.teamName ?? undefined}>{a.captain.teamNumber}</span>}
                            {a.round1 && <span title={a.round1.teamName ?? undefined}>· {a.round1.teamNumber}</span>}
                            {a.round2 && <span className="text-muted-foreground" title={a.round2.teamName ?? undefined}>· {a.round2.teamNumber}</span>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
