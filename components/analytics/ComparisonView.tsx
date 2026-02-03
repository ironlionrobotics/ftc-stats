import React, { useState } from "react";
import { EventAnalysisData, TeamEvolution } from "@/app/actions/analytics";
import { Card } from "@/components/ui/Card";
import {
    ArrowUpRight,
    ArrowDownRight,
    Minus,
    TrendingUp,
    Trophy,
    Activity,
    AlertCircle,
    ChevronDown,
    ChevronUp,
    Users,
    Zap,
    Skull,
    Star,
    Award
} from "lucide-react";
import clsx from "clsx";
import Link from "next/link";

interface ComparisonViewProps {
    eventStats: EventAnalysisData[];
    teamEvolution: TeamEvolution[];
}

export default function ComparisonView({ eventStats, teamEvolution }: ComparisonViewProps) {
    const [expandedTeam, setExpandedTeam] = useState<number | null>(null);
    const [sortBy, setSortBy] = useState<'number' | 'power'>('power');

    // Sort events by date (assuming they came in sorted)
    const sortedStats = [...eventStats];

    // Find max values for normalization
    const maxScore = Math.max(...sortedStats.map(s => s.avgScore), 1);
    const maxAuto = Math.max(...sortedStats.map(s => s.avgAuto), 1);
    const maxEventHigh = Math.max(...sortedStats.map(s => s.maxScore), 1);

    // Filter teams and ensure they are sorted by team number ASC as requested
    const teamsToShow = [...teamEvolution].sort((a, b) => {
        if (sortBy === 'power') {
            return b.powerScore - a.powerScore;
        }
        return a.teamNumber - b.teamNumber;
    });

    const toggleExpand = (teamNumber: number) => {
        setExpandedTeam(expandedTeam === teamNumber ? null : teamNumber);
    };

    return (
        <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700">

            {/* Macro Analysis Section */}
            <section>
                <div className="flex justify-between items-end mb-8">
                    <div>
                        <h2 className="text-3xl font-bold text-foreground flex items-center gap-3">
                            <Activity className="text-primary w-8 h-8" /> Comparativa de Eventos
                        </h2>
                        <p className="text-muted-foreground mt-1 text-lg">Métricas agregadas por sede para evaluar dificultad y nivel.</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sortedStats.map(stat => (
                        <Card key={stat.eventCode} className="p-6 border-t-4 border-t-primary relative overflow-hidden group bg-card border-border hover:shadow-2xl transition-all hover:-translate-y-1">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="font-bold text-xl text-foreground" title={stat.eventName}>
                                        {stat.eventName}
                                    </h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="text-xs text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">{stat.eventCode}</span>
                                        <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                            <Users size={12} /> {stat.teamCount} Equipos
                                        </span>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1">Matches</div>
                                    <div className="text-lg font-black text-foreground">{stat.matches.length}</div>
                                </div>
                            </div>

                            <div className="space-y-6">
                                {/* Avg Score */}
                                <div>
                                    <div className="flex justify-between text-sm mb-1.5 items-end">
                                        <span className="text-muted-foreground font-medium text-xs">PROM. ALIANZA</span>
                                        <span className="text-foreground font-bold">{stat.avgScore.toFixed(1)} <span className="text-[10px] opacity-60">PTS</span></span>
                                    </div>
                                    <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-primary to-orange-400 transition-all duration-1000 ease-out"
                                            style={{ width: `${(stat.avgScore / maxScore) * 100}%` }}
                                        />
                                    </div>
                                </div>

                                {/* Metrics Grid */}
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
                                    <div className="space-y-1">
                                        <div className="text-[10px] text-muted-foreground font-bold uppercase">Máximo Score</div>
                                        <div className="text-lg font-bold text-foreground flex items-baseline gap-1">
                                            {stat.maxScore} <span className="text-[10px] font-normal opacity-60">pts</span>
                                        </div>
                                        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-accent" style={{ width: `${(stat.maxScore / maxEventHigh) * 100}%` }} />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[10px] text-muted-foreground font-bold uppercase">Prom. Auto</div>
                                        <div className="text-lg font-bold text-secondary flex items-baseline gap-1">
                                            {(stat.avgAuto ?? 0).toFixed(1)} <span className="text-[10px] font-normal opacity-60">pts</span>
                                        </div>
                                        <div className="w-full h-1 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-secondary" style={{ width: `${(stat.avgAuto / maxAuto) * 100}%` }} />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="text-[10px] text-muted-foreground font-bold uppercase">Prom. Faltas</div>
                                        <div className="text-lg font-bold text-red-500/80 flex items-baseline gap-1">
                                            {(stat.avgFoul ?? 0).toFixed(1)} <span className="text-[10px] font-normal opacity-60">pts</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </section>

            {/* Team Evolution Section */}
            <section>
                <div className="flex flex-col md:flex-row md:items-end justify-between mb-8 gap-4">
                    <div>
                        <h2 className="text-3xl font-bold text-foreground flex items-center gap-3">
                            <TrendingUp className="text-accent w-8 h-8" /> Evolución de Equipos
                        </h2>
                        <p className="text-muted-foreground mt-1 text-lg">Progresión detallada y estabilidad de rendimiento en la temporada.</p>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2 bg-muted rounded-lg p-1 border border-border">
                            <button
                                onClick={() => setSortBy('power')}
                                className={clsx(
                                    "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                                    sortBy === 'power' ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Probabilidad
                            </button>
                            <button
                                onClick={() => setSortBy('number')}
                                className={clsx(
                                    "px-3 py-1 rounded-md text-[10px] font-bold uppercase transition-all",
                                    sortBy === 'number' ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                # Equipo
                            </button>
                        </div>
                        <span className="text-xs font-bold text-muted-foreground bg-muted py-1.5 px-4 rounded-full border border-border">
                            {teamsToShow.length} equipos analizados
                        </span>
                        <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">
                            <Zap size={12} className="text-accent" /> Click en fila para ver detalle
                        </div>
                    </div>
                </div>

                <div className="bg-card border border-border rounded-2xl overflow-hidden shadow-2xl relative">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[1000px]">
                            <thead>
                                <tr className="bg-muted/50 border-b border-border text-muted-foreground text-[10px] uppercase font-black tracking-[0.15em]">
                                    <th className="p-5 font-bold sticky left-0 z-20 bg-background/95 backdrop-blur shadow-[2px_0_5px_rgba(0,0,0,0.1)] border-r border-border">Equipo</th>
                                    <th className="p-5 font-bold text-center">Tendencia</th>
                                    <th className="p-5 font-bold text-center" title="Coeficiente de Variación (Menor es mejor)">Consistencia</th>
                                    {sortedStats.map(evt => (
                                        <th key={evt.eventCode} className="p-5 font-bold text-center">
                                            <div className="flex flex-col items-center">
                                                <span className="text-foreground">{evt.eventName}</span>
                                                <span className="text-[9px] font-normal opacity-60">Rank / Score</span>
                                            </div>
                                        </th>
                                    ))}
                                    <th className="p-5 font-bold text-center">Power Score</th>
                                    <th className="p-5 font-bold text-center">Posición Nacional (Proy)</th>
                                    <th className="p-5 font-bold text-center">Análisis / Insight</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {teamsToShow.map(team => {
                                    const isExpanded = expandedTeam === team.teamNumber;
                                    const totalAwards = team.events.reduce((sum, e) => sum + e.awards.length, 0);
                                    const bestEvent = team.events.reduce((prev, curr) => (curr.avgPoints > prev.avgPoints) ? curr : prev, team.events[0]);
                                    const bestEventName = sortedStats.find(s => s.eventCode === bestEvent?.eventCode)?.eventName || 'Regional';

                                    return (
                                        <React.Fragment key={team.teamNumber}>
                                            <tr
                                                key={team.teamNumber}
                                                onClick={() => toggleExpand(team.teamNumber)}
                                                className={clsx(
                                                    "transition-all cursor-pointer group hover:z-10 relative",
                                                    isExpanded ? "bg-primary/5 translate-x-1" : "hover:bg-muted/30"
                                                )}
                                            >
                                                <td className="p-5 sticky left-0 z-20 bg-background/95 backdrop-blur shadow-[2px_0_5px_rgba(0,0,0,0.1)] border-r border-border">
                                                    <div className="flex items-center gap-4">
                                                        <div className={clsx(
                                                            "transition-transform duration-300",
                                                            isExpanded ? "rotate-180" : ""
                                                        )}>
                                                            <ChevronDown size={14} className="text-muted-foreground" />
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-black text-xl text-foreground tabular-nums">{team.teamNumber}</span>
                                                                {team.isAdvanced && (
                                                                    <div className="flex items-center gap-1 bg-accent/20 text-accent text-[9px] font-black px-1.5 py-0.5 rounded border border-accent/30 uppercase animate-pulse">
                                                                        <Star size={10} fill="currentColor" /> National
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-muted-foreground font-medium truncate max-w-[150px]">{team.teamName}</div>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="p-5 text-center">
                                                    <div className={clsx(
                                                        "inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[10px] font-black uppercase",
                                                        team.trend === 'up' ? "bg-green-500/10 border-green-500/30 text-green-500" :
                                                            team.trend === 'down' ? "bg-red-500/10 border-red-500/30 text-red-500" :
                                                                "bg-muted border-border text-muted-foreground"
                                                    )}>
                                                        {team.trend === 'up' && <ArrowUpRight size={14} />}
                                                        {team.trend === 'down' && <ArrowDownRight size={14} />}
                                                        {team.trend === 'stable' && <Minus size={14} />}
                                                        {team.trend === 'up' ? "Mejora" : team.trend === 'down' ? "Caída" : "Constante"}
                                                    </div>
                                                </td>

                                                <td className="p-5 text-center">
                                                    <div className="relative h-2 w-20 bg-muted border border-border rounded-full mx-auto overflow-hidden mb-1">
                                                        <div
                                                            className={clsx(
                                                                "h-full rounded-full transition-all duration-1000 delay-300",
                                                                team.consistencyScore < 0.15 ? "bg-green-500" :
                                                                    team.consistencyScore < 0.3 ? "bg-yellow-500" : "bg-red-500"
                                                            )}
                                                            style={{ width: `${Math.max(10, Math.min((1 - team.consistencyScore) * 100, 100))}%` }}
                                                        />
                                                    </div>
                                                    <span className="text-[10px] font-black text-muted-foreground/80">
                                                        {((1 - team.consistencyScore) * 100).toFixed(0)}% Estabilidad
                                                    </span>
                                                </td>

                                                {sortedStats.map(evt => {
                                                    const eventData = team.events.find(e => e.eventCode === evt.eventCode);
                                                    return (
                                                        <td key={evt.eventCode} className="p-5 text-center">
                                                            {eventData ? (
                                                                <div className="flex flex-col items-center">
                                                                    <div className="flex items-baseline gap-1">
                                                                        <span className="text-foreground font-black text-lg">{(eventData.avgPoints ?? 0).toFixed(1)}</span>
                                                                        <span className="text-[9px] opacity-50 font-bold">AVG</span>
                                                                    </div>
                                                                    <span className="text-[10px] font-bold text-primary bg-primary/10 px-1.5 rounded-sm">#{eventData.rank}</span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-muted-foreground/20 text-xs font-black">-</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}

                                                <td className="p-5 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <span className="text-xl font-black text-foreground tabular-nums">{team.powerScore.toFixed(1)}</span>
                                                        <span className="text-[9px] font-black text-muted-foreground uppercase opacity-40">Probabilidad</span>
                                                    </div>
                                                </td>

                                                <td className="p-5 text-center">
                                                    {team.isAdvanced ? (
                                                        <div className="flex flex-col items-center">
                                                            <div className="relative">
                                                                <Trophy size={24} className="text-yellow-500/20" />
                                                                <span className="absolute inset-0 flex items-center justify-center font-black text-lg text-yellow-500">
                                                                    #{team.projectedNationalRank || '?'}
                                                                </span>
                                                            </div>
                                                            <span className="text-[9px] font-black text-yellow-500/60 uppercase mt-1 tracking-widest">Estimado</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground/20 text-xs font-black">-</span>
                                                    )}
                                                </td>

                                                <td className="p-5">
                                                    <div className="flex flex-col gap-2">
                                                        {team.projectedNationalRank && team.projectedNationalRank <= 5 && (
                                                            <div className="flex items-center gap-2 text-[10px] font-black text-yellow-500 bg-yellow-500/10 px-3 py-1.5 rounded-lg border border-yellow-500/20 uppercase tracking-tight">
                                                                <Star size={14} className="shrink-0" fill="currentColor" /> Favorito al Podio
                                                            </div>
                                                        )}
                                                        {team.powerScore >= 60 && (
                                                            <div className="flex items-center gap-2 text-[10px] font-black text-green-500 bg-green-500/10 px-3 py-1.5 rounded-lg border border-green-500/20 uppercase tracking-tight">
                                                                <Trophy size={14} className="shrink-0" /> Candidato Fuerte
                                                            </div>
                                                        )}
                                                        {team.trend === 'up' && team.consistencyScore < 0.25 && team.powerScore < 60 && (
                                                            <div className="flex items-center gap-2 text-[10px] font-black text-green-500/60 bg-green-500/5 px-3 py-1.5 rounded-lg border border-green-500/10 uppercase tracking-tight">
                                                                <Zap size={14} className="shrink-0" /> Potencial
                                                            </div>
                                                        )}
                                                        {team.isAdvanced && (
                                                            <div className="flex items-center gap-2 text-[10px] font-black text-accent bg-accent/10 px-3 py-1.5 rounded-lg border border-accent/20 uppercase tracking-tight">
                                                                <Award size={14} className="shrink-0" /> Ya Clasificado
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Expandable Content */}
                                            {isExpanded && (
                                                <tr className="bg-primary/5 animate-in fade-in slide-in-from-top-2 duration-300">
                                                    <td colSpan={5 + sortedStats.length} className="p-0 border-b border-primary/20">
                                                        <div className="p-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
                                                            {/* Detailed Stats per Event */}
                                                            <div className="lg:col-span-3">
                                                                <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em] mb-4">Análisis por Sede</h4>
                                                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                                                    {team.events.map(e => (
                                                                        <div key={e.eventCode} className="bg-background/60 border border-border p-4 rounded-xl shadow-sm">
                                                                            <div className="flex justify-between items-center mb-3">
                                                                                <span className="font-bold text-sm text-foreground">{sortedStats.find(s => s.eventCode === e.eventCode)?.eventName || e.eventCode}</span>
                                                                                <span className="text-[10px] font-mono opacity-50">{e.eventCode}</span>
                                                                            </div>
                                                                            <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                                                                                <div className="space-y-0.5">
                                                                                    <div className="text-[9px] text-muted-foreground uppercase font-bold">Máximo</div>
                                                                                    <div className="text-sm font-black text-foreground">{e.maxPoints} <span className="text-[9px] font-normal opacity-60">pts</span></div>
                                                                                </div>
                                                                                <div className="space-y-0.5">
                                                                                    <div className="text-[9px] text-muted-foreground uppercase font-bold">Auto Avg</div>
                                                                                    <div className="text-sm font-black text-secondary">{(e.avgAuto ?? 0).toFixed(1)} <span className="text-[9px] font-normal opacity-60">pts</span></div>
                                                                                </div>
                                                                                <div className="space-y-0.5">
                                                                                    <div className="text-[9px] text-muted-foreground uppercase font-bold">TeleOp Avg</div>
                                                                                    <div className="text-sm font-black text-accent">{(e.avgTeleOp ?? 0).toFixed(1)} <span className="text-[9px] font-normal opacity-60">pts</span></div>
                                                                                </div>
                                                                                <div className="space-y-0.5">
                                                                                    <div className="text-[9px] text-muted-foreground uppercase font-bold">Fouls Avg</div>
                                                                                    <div className="text-sm font-black text-red-500">-{(e.avgFoul ?? 0).toFixed(1)} <span className="text-[9px] font-normal opacity-60">pts</span></div>
                                                                                </div>
                                                                            </div>
                                                                            {/* Awards in this event */}
                                                                            {e.awards.length > 0 && (
                                                                                <div className="mt-4 pt-3 border-t border-border/50 flex flex-wrap gap-2">
                                                                                    {e.awards.map((a, idx) => (
                                                                                        <div key={idx} className="flex items-center gap-1.5 bg-yellow-500/10 text-yellow-500 text-[9px] font-black px-2 py-1 rounded border border-yellow-500/20 uppercase">
                                                                                            <Award size={10} /> {a.awardName || (a as any).name || "Premio"}
                                                                                        </div>
                                                                                    ))}
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>

                                                            {/* IA Insight / Rationale */}
                                                            <div className="bg-primary/10 border border-primary/20 rounded-2xl p-6 flex flex-col justify-between">
                                                                <div>
                                                                    <div className="flex justify-between items-center mb-4">
                                                                        <h4 className="text-xs font-black text-primary uppercase tracking-[0.2em]">Data Lab Insight</h4>
                                                                        <div className="flex flex-col items-end">
                                                                            <span className="text-[10px] font-bold text-muted-foreground uppercase">Power Score</span>
                                                                            <span className="text-xl font-black text-white">{team.powerScore.toFixed(1)}</span>
                                                                        </div>
                                                                    </div>
                                                                    <p className="text-sm text-foreground/80 leading-relaxed italic">
                                                                        {team.isAdvanced && team.projectedNationalRank ? (
                                                                            `Proyección Nacional: #${team.projectedNationalRank}. El equipo ${team.teamNumber} combina un desempeño técnico de ${bestEventName} con un fuerte historial de premios (${totalAwards} obtenidos), lo que lo posiciona como un competidor de élite para el Regional México.`
                                                                        ) : team.powerScore >= 60 ? (
                                                                            `El equipo ${team.teamNumber} muestra un perfil de alta competitividad con un Power Score de ${team.powerScore.toFixed(1)}. Su ${((1 - team.consistencyScore) * 100).toFixed(0)}% de estabilidad y tendencia lo posicionan como un claro favorito para podio.`
                                                                        ) : (
                                                                            `Rendimiento sólido con un Power Score de ${team.powerScore.toFixed(1)}. Sus ${totalAwards} reconocimientos demuestran una ejecución equilibrada entre robot y documentación.`
                                                                        )}
                                                                    </p>
                                                                </div>
                                                                <Link
                                                                    href={`/team/${team.teamNumber}`}
                                                                    className="mt-6 flex items-center justify-center gap-2 w-full py-2.5 bg-primary text-white text-xs font-black rounded-lg hover:bg-primary/80 transition-all shadow-lg shadow-primary/20"
                                                                >
                                                                    VER PERFIL COMPLETO <Zap size={14} />
                                                                </Link>
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
                </div>
            </section>
        </div>
    );
}
