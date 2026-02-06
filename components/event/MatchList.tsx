"use client";

import { useState } from "react";
import { FTCMatch, TeamRanking, FTCMatchTeam } from "@/types/ftc";
import clsx from "clsx";
import { Trophy, Zap, Star, Hash } from "lucide-react";

interface MatchListProps {
    matches: FTCMatch[];
    rankings: TeamRanking[];
}

export default function MatchList({ matches, rankings }: MatchListProps) {
    const [filterTeam, setFilterTeam] = useState<number | null>(null);

    const filteredMatches = filterTeam
        ? matches.filter(m => m.teams.some(t => t.teamNumber === filterTeam))
        : matches;

    const qualMatches = filteredMatches.filter(m => m.tournamentLevel === "QUALIFICATION");
    const otherMatches = filteredMatches.filter(m => m.tournamentLevel !== "QUALIFICATION" && m.tournamentLevel !== "PRACTICE");

    const teamNamesMap = new Map(rankings.map(r => [r.teamNumber, r.teamName]));

    // Calculate Dynamic KPIs for filtered team
    const stats = { wins: 0, losses: 0, ties: 0, totalNP: 0, highScore: 0, count: 0 };
    if (filterTeam) {
        filteredMatches.forEach(m => {
            const isRed = m.teams.some(t => t.teamNumber === filterTeam && t.station.startsWith('Red'));
            const teamScore = isRed ? m.scoreRedFinal : m.scoreBlueFinal;
            const oppFoul = isRed ? m.scoreBlueFoul : m.scoreRedFoul;
            const oppScore = isRed ? m.scoreBlueFinal : m.scoreRedFinal;

            stats.totalNP += (teamScore - oppFoul);
            stats.highScore = Math.max(stats.highScore, teamScore);
            stats.count++;

            if (teamScore > oppScore) stats.wins++;
            else if (teamScore < oppScore) stats.losses++;
            else stats.ties++;
        });
    }

    const winRate = stats.count > 0 ? (stats.wins / stats.count) * 100 : 0;
    const avgNP = stats.count > 0 ? stats.totalNP / stats.count : 0;

    return (
        <div className="space-y-8">
            {filterTeam && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                    {/* Filter Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-3xl gap-6">
                        <div className="flex items-center gap-5">
                            <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center text-3xl font-black text-white shadow-lg shadow-primary/20">
                                {filterTeam}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-foreground tracking-tight leading-none mb-2">{teamNamesMap.get(filterTeam)}</h2>
                                <div className="flex items-center gap-3 text-muted-foreground text-sm font-medium">
                                    <span className="flex items-center gap-1.5"><Trophy size={14} className="text-primary" /> {stats.count} Matches analizados</span>
                                    <span className="w-1 h-1 rounded-full bg-border" />
                                    <span>Sistema Decode 2025</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setFilterTeam(null)}
                            className="px-6 py-3 bg-muted hover:bg-muted/80 text-foreground text-sm font-bold rounded-2xl transition-all border border-border flex items-center justify-center gap-2 group"
                        >
                            Quitar Filtro <span className="text-primary group-hover:rotate-90 transition-transform">×</span>
                        </button>
                    </div>

                    {/* KPI Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <KPICard
                            label="Win Rate"
                            value={`${winRate.toFixed(0)}%`}
                            icon={<Trophy className="text-yellow-500" size={20} />}
                            subline={`${stats.wins} victorias en ${stats.count} matches`}
                        />
                        <KPICard
                            label="NP Average"
                            value={avgNP.toFixed(1)}
                            icon={<Zap className="text-primary" size={20} />}
                            subline="Puntos limpios por match"
                        />
                        <KPICard
                            label="Season High"
                            value={stats.highScore.toString()}
                            icon={<Star className="text-orange-500" size={20} />}
                            subline="Puntuación máxima registrada"
                        />
                        <KPICard
                            label="Record"
                            value={`${stats.wins}-${stats.losses}-${stats.ties}`}
                            icon={<Hash className="text-blue-500" size={20} />}
                            subline="W - L - T Balance"
                        />
                    </div>
                </div>
            )}

            {qualMatches.length > 0 && (
                <section>
                    <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                        <span className="w-2 h-8 bg-primary rounded-full transition-all" />
                        Qualification Matches {filterTeam && <span className="text-muted-foreground text-sm font-normal">— {qualMatches.length} partidos</span>}
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="text-muted-foreground border-b border-border text-sm uppercase tracking-wider">
                                    <th className="p-4 font-medium min-w-[150px]">Match</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-red-500/5 text-red-600 dark:text-red-400 rounded-tl-lg border-x border-border/50">Red Alliance</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-blue-500/5 text-blue-600 dark:text-blue-400 rounded-tr-lg border-x border-border/50">Blue Alliance</th>
                                    <th className="p-4 font-medium text-center min-w-[120px]">Score</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {qualMatches.map((match) => (
                                    <MatchRow key={match.matchNumber} match={match} teamNamesMap={teamNamesMap} onTeamClick={setFilterTeam} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {otherMatches.length > 0 && (
                <section>
                    <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                        <span className="w-2 h-8 bg-secondary rounded-full" />
                        Playoffs {filterTeam && <span className="text-muted-foreground text-sm font-normal">— {otherMatches.length} partidos</span>}
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="text-muted-foreground border-b border-border text-sm uppercase tracking-wider">
                                    <th className="p-4 font-medium min-w-[150px]">Match</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-red-500/5 text-red-600 dark:text-red-400 rounded-tl-lg border-x border-border/50">Red Alliance</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-blue-500/5 text-blue-600 dark:text-blue-400 rounded-tr-lg border-x border-border/50">Blue Alliance</th>
                                    <th className="p-4 font-medium text-center min-w-[120px]">Score</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {otherMatches.map((match) => (
                                    <MatchRow key={match.description} match={match} teamNamesMap={teamNamesMap} onTeamClick={setFilterTeam} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {filteredMatches.length === 0 && (
                <div className="text-muted-foreground italic text-center py-8">No match data available for this filter.</div>
            )}
        </div>
    );
}

function KPICard({ label, value, icon, subline }: { label: string, value: string, icon: React.ReactNode, subline: string }) {
    return (
        <div className="bg-card border border-border rounded-2xl p-4 hover:border-primary/30 transition-all group shadow-sm">
            <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
                <div className="p-2 bg-muted rounded-lg group-hover:bg-primary/10 transition-colors">
                    {icon}
                </div>
            </div>
            <div className="text-2xl font-black text-foreground font-display mb-1">{value}</div>
            <div className="text-[10px] text-muted-foreground font-medium">{subline}</div>
        </div>
    );
}

function TeamInfo({ team, teamNamesMap, onTeamClick }: { team?: FTCMatchTeam, teamNamesMap: Map<number, string>, onTeamClick: (id: number) => void }) {
    if (!team) return <div className="min-w-[120px]" />;
    const name = teamNamesMap.get(team.teamNumber) || "Team";
    const isRed = team.station.startsWith('Red');
    return (
        <button
            onClick={() => onTeamClick(team.teamNumber)}
            className="flex flex-col items-center min-w-[120px] px-2 group/team hover:bg-muted rounded-lg py-1 transition-all"
            key={team.teamNumber}
        >
            <span className={clsx(
                "font-mono font-bold text-base transition-all group-hover/team:scale-110",
                isRed ? "text-red-500 dark:text-red-400" : "text-blue-500 dark:text-blue-400"
            )}>
                {team.teamNumber}
            </span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-tighter truncate max-w-[110px] group-hover/team:text-foreground transition-colors font-medium">
                {name}
            </span>
        </button>
    );
}

function MatchRow({ match, teamNamesMap, onTeamClick }: { match: FTCMatch, teamNamesMap: Map<number, string>, onTeamClick: (id: number) => void }) {
    const redTeams = match.teams.filter(t => t.station.startsWith('Red')).sort((a, b) => a.station.localeCompare(b.station));
    const blueTeams = match.teams.filter(t => t.station.startsWith('Blue')).sort((a, b) => a.station.localeCompare(b.station));

    const shortenDescription = (desc: string) => {
        return desc
            .replace(/Round\s+/g, 'R')
            .replace(/Match\s+/g, 'M')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const redWin = match.scoreRedFinal > match.scoreBlueFinal;
    const blueWin = match.scoreBlueFinal > match.scoreRedFinal;

    return (
        <tr className="hover:bg-muted/50 transition-colors border-b border-border/50 last:border-0">
            <td className="p-4">
                <div className="font-bold text-foreground whitespace-nowrap">
                    {shortenDescription(match.description)}
                </div>
            </td>

            {/* Red Alliance Teams (2 columns) */}
            <td className={clsx("p-4 border-l-4", redWin ? "border-red-500 bg-red-500/5" : "border-transparent")}>
                <TeamInfo team={redTeams[0]} teamNamesMap={teamNamesMap} onTeamClick={onTeamClick} />
            </td>
            <td className={clsx("p-4 border-r border-border/20", redWin ? "bg-red-500/5" : "border-transparent")}>
                <TeamInfo team={redTeams[1]} teamNamesMap={teamNamesMap} onTeamClick={onTeamClick} />
            </td>

            {/* Blue Alliance Teams (2 columns) */}
            <td className={clsx("p-4", blueWin ? "bg-blue-500/5" : "border-transparent")}>
                <TeamInfo team={blueTeams[0]} teamNamesMap={teamNamesMap} onTeamClick={onTeamClick} />
            </td>
            <td className={clsx("p-4 border-r-4", blueWin ? "border-blue-500 bg-blue-500/5" : "border-transparent")}>
                <TeamInfo team={blueTeams[1]} teamNamesMap={teamNamesMap} onTeamClick={onTeamClick} />
            </td>

            {/* Score */}
            <td className="p-4 text-center">
                <div className="flex items-center justify-center gap-3 font-display text-lg px-4">
                    <span className={clsx("font-black", redWin ? "text-red-500" : "text-muted-foreground/50")}>
                        {match.scoreRedFinal}
                    </span>
                    <span className="text-border">-</span>
                    <span className={clsx("font-black", blueWin ? "text-blue-500" : "text-muted-foreground/50")}>
                        {match.scoreBlueFinal}
                    </span>
                </div>
            </td>
        </tr>
    );
}
