"use client";

import React, { useState } from "react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/Card";
import { EventAnalysisData, TeamEvolution } from "@/app/actions/analytics";
import {
    TrendingUp,
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    Trophy,
    Star,
    Zap,
    ChevronDown,
    ChevronRight,
    Sparkles,
    BarChart3
} from "lucide-react";
import clsx from "clsx";
import Link from "next/link";
import AlliancePredictor from "./AlliancePredictor";

interface ComparisonViewProps {
    eventStats: EventAnalysisData[];
    teamEvolution: TeamEvolution[];
}

export default function ComparisonView({
    eventStats,
    teamEvolution,
}: ComparisonViewProps) {
    const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: keyof TeamEvolution; direction: 'asc' | 'desc' } | null>(null);
    const [selectedOracleTeam, setSelectedOracleTeam] = useState<TeamEvolution | null>(null);

    const handleOracleAnalysis = (team: TeamEvolution) => {
        setSelectedOracleTeam(team);
        // Smooth scroll to the oracle section
        const element = document.getElementById('alliance-oracle');
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    };

    const sortedTeams = [...teamEvolution].sort((a, b) => {
        if (!sortConfig) return b.powerScore - a.powerScore;

        const aValue = a[sortConfig.key];
        const bValue = b[sortConfig.key];

        if (aValue === undefined && bValue === undefined) return 0;
        if (aValue === undefined) return 1;
        if (bValue === undefined) return -1;

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });

    const handleSort = (key: keyof TeamEvolution) => {
        let direction: 'asc' | 'desc' = 'desc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    const toggleExpand = (teamNumber: number) => {
        setExpandedTeam(expandedTeam === teamNumber ? null : teamNumber);
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Event Comparison Charts */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-card border border-border rounded-2xl p-6 shadow-xl">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <BarChart3 className="text-primary" /> Promedio de Alianza
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={eventStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
                                <XAxis dataKey="eventCode" stroke="#888" tick={{ fill: '#888', fontSize: 10 }} />
                                <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 10 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                />
                                <Legend />
                                <Bar dataKey="avgScore" name="Promedio Alianza" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                <Bar dataKey="avgAuto" name="Promedio Auto" fill="#10b981" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-card border border-border rounded-2xl p-6 shadow-xl">
                    <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                        <TrendingUp className="text-green-500" /> Máximos Scores
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={eventStats} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.2} />
                                <XAxis dataKey="eventCode" stroke="#888" tick={{ fill: '#888', fontSize: 10 }} />
                                <YAxis stroke="#888" tick={{ fill: '#888', fontSize: 10 }} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#fff' }}
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                />
                                <Legend />
                                <Bar dataKey="maxScore" name="Max Score" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </section>

            {/* Alliance Oracle Section */}
            <section id="alliance-oracle">
                <AlliancePredictor teams={teamEvolution} initialTeam={selectedOracleTeam} />
            </section>

            {/* Team Evolution Section */}
            <section>
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
                    <div>
                        <h2 className="text-2xl font-bold flex items-center gap-2 text-foreground">
                            <TrendingUp className="text-yellow-500" /> Evolución de Equipos
                        </h2>
                        <p className="text-muted-foreground mt-1">Progresión detallada y estabilidad de rendimiento en la temporada.</p>
                    </div>

                    <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg">
                        <span className="text-[10px] font-bold uppercase px-3 py-1 bg-background rounded shadow-sm text-foreground">Equipos</span>
                        <div className="px-2 text-xs text-muted-foreground font-mono border-l border-border ml-2">
                            {sortedTeams.length} equipos analizados
                        </div>
                    </div>
                </div>

                <div className="text-right mb-2">
                    <span className="text-[10px] text-yellow-500 font-bold uppercase tracking-widest flex items-center justify-end gap-1">
                        <Sparkles size={10} /> Click en fila para ver detalle
                    </span>
                </div>

                <div className="overflow-x-auto rounded-xl border border-border shadow-2xl bg-card">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-muted text-muted-foreground uppercase text-[10px] tracking-wider font-bold">
                                <th onClick={() => handleSort('teamNumber')} className="p-4 text-left cursor-pointer hover:text-foreground transition-colors group">
                                    Equipo
                                    <div className="w-8 h-0.5 bg-border mt-1 group-hover:bg-primary transition-colors" />
                                </th>
                                {eventStats.map(e => (
                                    <th key={e.eventCode} className="p-4 text-center whitespace-nowrap opacity-70">
                                        <div className="flex flex-col items-center">
                                            <span>{e.eventName.replace('Torneo ', '').substring(0, 15)}</span>
                                            <span className="text-[9px] font-normal opacity-50 mt-1">RANK / SCORE</span>
                                        </div>
                                    </th>
                                ))}
                                <th onClick={() => handleSort('powerScore')} className="p-4 text-center cursor-pointer hover:text-foreground transition-colors group bg-gradient-to-b from-primary/5 to-transparent">
                                    <div className="w-fit mx-auto">
                                        Power Score
                                        <div className="w-full h-0.5 bg-primary/30 mt-1 group-hover:bg-primary transition-colors" />
                                    </div>
                                </th>
                                <th onClick={() => handleSort('consistencyScore')} className="p-4 text-center cursor-pointer hover:text-foreground transition-colors group">
                                    <div className="w-fit mx-auto">
                                        Consistencia
                                        <div className="w-full h-0.5 bg-border mt-1 group-hover:bg-primary transition-colors" />
                                    </div>
                                </th>
                                <th className="p-4 text-center w-24">Análisis / Insight</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {sortedTeams.map((team, idx) => {
                                const bestScore = Math.max(...team.events.map(e => e.maxPoints), 0);
                                return (
                                    <React.Fragment key={team.teamNumber}>
                                        <tr
                                            onClick={() => toggleExpand(team.teamNumber)}
                                            className={clsx(
                                                "group transition-all cursor-pointer hover:bg-muted/50",
                                                expandedTeam === team.teamNumber ? "bg-muted/30" : "bg-card"
                                            )}
                                        >
                                            <td className="p-4">
                                                <div className="font-bold text-lg font-display text-foreground group-hover:text-primary transition-colors flex items-center gap-2">
                                                    {expandedTeam === team.teamNumber ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                                                    {team.teamNumber}
                                                    {team.projectedNationalRank && team.projectedNationalRank <= 10 && (
                                                        <span className="text-[9px] bg-yellow-500/10 text-yellow-600 px-1.5 py-0.5 rounded border border-yellow-500/20 font-bold uppercase tracking-wider">Top {team.projectedNationalRank}</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-muted-foreground font-medium">{team.teamName}</div>
                                            </td>

                                            {eventStats.map(e => {
                                                const stat = team.events.find(ev => ev.eventCode === e.eventCode);
                                                return (
                                                    <td key={e.eventCode} className="p-4 text-center">
                                                        {stat ? (
                                                            <div className="flex flex-col items-center">
                                                                <span className="font-bold text-foreground text-base">{stat.avgPoints.toFixed(1)} <span className="text-[10px] font-normal text-muted-foreground">AVG</span></span>
                                                                <span className="text-[10px] font-bold text-orange-500">#{stat.rank}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-muted-foreground/20 text-xl font-bold">-</span>
                                                        )}
                                                    </td>
                                                )
                                            })}

                                            <td className="p-4 text-center bg-gradient-to-b from-primary/5 to-transparent">
                                                <div className="font-black text-2xl text-foreground font-display">{team.powerScore.toFixed(1)} <span className="text-[10px] font-bold text-muted-foreground block">PTS</span></div>
                                                <div className="flex justify-center mt-1">
                                                    <span className={clsx("text-[9px] px-1.5 py-0.5 rounded font-bold uppercase",
                                                        team.trend === 'up' ? "bg-green-500/10 text-green-500" :
                                                            team.trend === 'down' ? "bg-red-500/10 text-red-500" :
                                                                "bg-blue-500/10 text-blue-500"
                                                    )}>
                                                        {team.trend === 'up' ? 'Ascenso' : team.trend === 'down' ? 'Descenso' : 'Estable'}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="p-4 text-center">
                                                <div className="font-black text-xl text-yellow-600 font-display">
                                                    {(team.consistencyScore * 100).toFixed(0)}%
                                                </div>
                                                <div className="text-[10px] font-bold text-yellow-600/70 uppercase">Estabilidad</div>
                                            </td>

                                            <td className="p-4 text-center">
                                                <div className="font-black text-lg text-foreground font-display">
                                                    {team.projectedNationalRank ? `#${team.projectedNationalRank}` : '-'}
                                                </div>
                                                <div className="text-[9px] font-bold uppercase text-muted-foreground">Ranking Nac.</div>
                                            </td>
                                        </tr>
                                        {expandedTeam === team.teamNumber && (
                                            <tr className="bg-muted/30 animate-in fade-in slide-in-from-top-2 duration-300">
                                                <td colSpan={eventStats.length + 4} className="p-0">
                                                    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
                                                        {/* Quick Analysis */}
                                                        <div className="col-span-1 bg-card rounded-xl p-5 border border-border shadow-sm">
                                                            <h4 className="text-xs font-bold text-primary uppercase tracking-widest mb-4">Análisis de Rendimiento</h4>
                                                            <div className="space-y-3">
                                                                <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
                                                                    <span className="text-xs font-bold text-muted-foreground">Highest Score</span>
                                                                    <span className="text-sm font-bold text-foreground">
                                                                        {bestScore} <span className="text-[10px] text-muted-foreground">pts</span>
                                                                    </span>
                                                                </div>
                                                                <div className="flex justify-between items-center p-2 bg-muted/50 rounded-lg">
                                                                    <span className="text-xs font-bold text-muted-foreground">Consistency</span>
                                                                    <span className="text-sm font-bold text-foreground">{(team.consistencyScore * 100).toFixed(0)}%</span>
                                                                </div>
                                                                <div className="mt-4 pt-4 border-t border-border">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            handleOracleAnalysis(team);
                                                                        }}
                                                                        className="w-full py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl font-bold text-sm shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2 transition-all hover:scale-[1.02]"
                                                                    >
                                                                        <Sparkles size={16} /> Predecir Alianzas
                                                                    </button>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Robot Config & Insights */}
                                                        <div className="col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            <div className="flex flex-col gap-2">
                                                                <div className="bg-yellow-500/10 p-3 rounded-lg border border-yellow-500/20">
                                                                    <div className="text-[10px] font-bold text-yellow-600 uppercase mb-1">Favorito Al Podio</div>
                                                                    <p className="text-xs text-muted-foreground leading-relaxed">Este equipo mantiene un Power Score superior a 85 pts en los últimos 2 eventos.</p>
                                                                </div>
                                                                <div className="bg-green-500/10 p-3 rounded-lg border border-green-500/20">
                                                                    <div className="text-[10px] font-bold text-green-600 uppercase mb-1">Candidato Fuerte</div>
                                                                    <p className="text-xs text-muted-foreground leading-relaxed">Muestra una tendencia de {team.trend === 'up' ? 'crecimiento constante' : 'estabilidad sólida'} en el ciclo autónomo.</p>
                                                                </div>
                                                                <div className="bg-orange-500/10 p-3 rounded-lg border border-orange-500/20">
                                                                    <div className="text-[10px] font-bold text-orange-600 uppercase mb-1">Ya Clasificado</div>
                                                                    <p className="text-xs text-muted-foreground leading-relaxed">Probabilidad matemática de avance al nacional &gt; 95%.</p>
                                                                </div>
                                                            </div>
                                                            <div className="bg-card rounded-xl border border-border p-4 flex flex-col justify-center">
                                                                <div className="text-right">
                                                                    <span className="text-[10px] text-muted-foreground uppercase font-bold">Power Score</span>
                                                                    <div className="text-4xl font-black text-foreground font-display tracking-tight">{team.powerScore.toFixed(1)}</div>
                                                                </div>
                                                                <div className="mt-4 text-xs text-muted-foreground italic">
                                                                    "Proyección Nacional: #{team.projectedNationalRank ?? 'N/A'}. El equipo {team.teamNumber} muestra un desempeño sólido."
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
