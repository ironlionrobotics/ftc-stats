"use client";

import { FTCMatch, TeamRanking } from "@/types/ftc";
import { Trophy, Zap, BarChart3, Users, Target } from "lucide-react";
import { useMemo } from "react";

interface EventStatsProps {
    matches: FTCMatch[];
    rankings: TeamRanking[];
}

export default function EventStats({ matches, rankings }: EventStatsProps) {
    const stats = useMemo(() => {
        if (!matches || matches.length === 0) return null;

        let highFinalScore = -1;
        let highFinalMatch: FTCMatch | null = null;
        let highFinalAlliance: 'Red' | 'Blue' = 'Red';

        let highCleanScore = -1;
        let highCleanMatch: FTCMatch | null = null;
        let highCleanAlliance: 'Red' | 'Blue' = 'Red';

        let highAutoScore = -1;
        let highAutoMatch: FTCMatch | null = null;
        let highAutoAlliance: 'Red' | 'Blue' = 'Red';

        let totalPoints = 0;
        let totalAutoPoints = 0;
        let qualMatchesCount = 0;
        let playoffMatchesCount = 0;

        matches.forEach(match => {
            const redFinal = match.scoreRedFinal;
            const blueFinal = match.scoreBlueFinal;
            const redClean = redFinal - match.scoreRedFoul;
            const blueClean = blueFinal - match.scoreBlueFoul;
            const redAuto = match.scoreRedAuto;
            const blueAuto = match.scoreBlueAuto;

            // Totals for averages
            totalPoints += (redFinal + blueFinal);
            totalAutoPoints += (redAuto + blueAuto);

            if (match.tournamentLevel === "QUALIFICATION") {
                qualMatchesCount++;
            } else {
                playoffMatchesCount++;
            }

            // High Score (with fouls)
            if (redFinal > highFinalScore) {
                highFinalScore = redFinal;
                highFinalMatch = match;
                highFinalAlliance = 'Red';
            }
            if (blueFinal > highFinalScore) {
                highFinalScore = blueFinal;
                highFinalMatch = match;
                highFinalAlliance = 'Blue';
            }

            // High Clean Score (no fouls)
            if (redClean > highCleanScore) {
                highCleanScore = redClean;
                highCleanMatch = match;
                highCleanAlliance = 'Red';
            }
            if (blueClean > highCleanScore) {
                highCleanScore = blueClean;
                highCleanMatch = match;
                highCleanAlliance = 'Blue';
            }

            // High Auto Score
            if (redAuto > highAutoScore) {
                highAutoScore = redAuto;
                highAutoMatch = match;
                highAutoAlliance = 'Red';
            }
            if (blueAuto > highAutoScore) {
                highAutoScore = blueAuto;
                highAutoMatch = match;
                highAutoAlliance = 'Blue';
            }
        });

        const totalAlliances = matches.length * 2;
        const avgScore = totalPoints / totalAlliances;
        const avgAuto = totalAutoPoints / totalAlliances;

        const getTeams = (match: FTCMatch | null, alliance: 'Red' | 'Blue') => {
            if (!match) return [];
            return match.teams
                .filter(t => t.station.startsWith(alliance))
                .map(t => t.teamNumber);
        };

        return {
            highFinal: {
                score: highFinalScore,
                match: highFinalMatch,
                teams: getTeams(highFinalMatch, highFinalAlliance),
                alliance: highFinalAlliance
            },
            highClean: {
                score: highCleanScore,
                match: highCleanMatch,
                teams: getTeams(highCleanMatch, highCleanAlliance),
                alliance: highCleanAlliance
            },
            highAuto: {
                score: highAutoScore,
                match: highAutoMatch,
                teams: getTeams(highAutoMatch, highAutoAlliance),
                alliance: highAutoAlliance
            },
            avgScore,
            avgAuto,
            qualMatchesCount,
            playoffMatchesCount,
            totalTeams: rankings.length
        };
    }, [matches, rankings]);

    if (!stats) return null;

    const StatCard = ({ title, value, subValue, icon: Icon, colorClass }: any) => (
        <div className="relative overflow-hidden p-6 rounded-3xl border border-border bg-card transition-all duration-300 hover:bg-muted/50 group shadow-sm">
            <div className={`absolute top-0 right-0 -mr-4 -mt-4 w-24 h-24 blur-3xl opacity-10 dark:opacity-20 bg-gradient-to-br ${colorClass} group-hover:opacity-40 transition-opacity`} />
            <div className="relative flex flex-col gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br ${colorClass} shadow-lg shadow-black/10`}>
                    <Icon className="text-white" size={24} />
                </div>
                <div>
                    <p className="text-muted-foreground text-xs font-bold mb-1 uppercase tracking-widest">{title}</p>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black text-foreground tabular-nums">{value}</span>
                        {subValue && <span className="text-muted-foreground text-xs font-bold">{subValue}</span>}
                    </div>
                </div>
            </div>
        </div>
    );

    const MatchHighlight = ({ data, label, icon: Icon, color }: { data: any, label: string, icon: any, color: string }) => (
        <div className="p-6 rounded-3xl border border-border bg-card space-y-4 hover:border-primary/30 transition-all duration-300 shadow-sm hover:shadow-md">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg bg-${color}-500/10 text-${color}-600 dark:text-${color}-400`}>
                        <Icon size={14} />
                    </div>
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em]">{label}</span>
                </div>
                <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider ${data.alliance === 'Red' ? 'bg-red-500/10 text-red-600 dark:text-red-500 border border-red-500/10' : 'bg-blue-500/10 text-blue-600 dark:text-blue-500 border border-blue-500/10'
                    }`}>
                    {data.alliance} Alliance
                </span>
            </div>
            <div className="flex items-end justify-between gap-4">
                <div>
                    <h3 className="text-4xl font-black text-foreground mb-0.5 tracking-tight">{data.score}</h3>
                    <p className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">
                        {data.match?.description.replace('Qualification', 'Quals')}
                    </p>
                </div>
                <div className="flex -space-x-3">
                    {data.teams.map((t: number) => (
                        <div key={t} className="w-10 h-10 rounded-full bg-muted border-2 border-background flex items-center justify-center text-[10px] font-black text-foreground shadow-sm transition-transform hover:-translate-y-1 hover:z-10 cursor-pointer">
                            {t}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6 mb-12 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Main Stats Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard
                    title="Avg Score"
                    value={stats.avgScore.toFixed(1)}
                    icon={BarChart3}
                    colorClass="from-orange-500 to-amber-500"
                />
                <StatCard
                    title="Avg Auto"
                    value={stats.avgAuto.toFixed(1)}
                    icon={Zap}
                    colorClass="from-purple-500 to-indigo-500"
                />
                <StatCard
                    title="Matches"
                    value={stats.qualMatchesCount + stats.playoffMatchesCount}
                    subValue={`${stats.qualMatchesCount}Q | ${stats.playoffMatchesCount}P`}
                    icon={Users}
                    colorClass="from-emerald-500 to-teal-500"
                />
                <StatCard
                    title="Teams"
                    value={stats.totalTeams}
                    icon={Trophy}
                    colorClass="from-pink-500 to-rose-500"
                />
            </div>

            {/* Match Highlights Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <MatchHighlight data={stats.highFinal} label="Highest Score" icon={Trophy} color="amber" />
                <MatchHighlight data={stats.highClean} label="Highest Clean" icon={Target} color="emerald" />
                <MatchHighlight data={stats.highAuto} label="Highest Auto" icon={Zap} color="purple" />
            </div>
        </div>
    );
}
