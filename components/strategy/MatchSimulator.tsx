"use client";

import { useState, useEffect } from "react";
import { AggregatedTeamStats, MatchScouting, PitScouting } from "@/types/ftc";
import { Card } from "@/components/ui/Card";
import { Search, Plus, X, Swords, AlertTriangle, Zap, Percent } from "lucide-react";
import { listenToMatchScouting, getPitScouting } from "@/lib/scouting-service";
import { useSeason } from "@/context/SeasonContext";
import { calculateTeamProjection, predictMatch, MatchProjection, TeamProjection } from "@/lib/projections";
import clsx from "clsx";

interface MatchSimulatorProps {
    teams: AggregatedTeamStats[];
}

export default function MatchSimulator({ teams }: MatchSimulatorProps) {
    const { season } = useSeason();
    const [redAlliance, setRedAlliance] = useState<number[]>([]);
    const [blueAlliance, setBlueAlliance] = useState<number[]>([]);
    const [scoutingData, setScoutingData] = useState<MatchScouting[]>([]);
    const [pitData, setPitData] = useState<Record<number, PitScouting>>({});
    const [projection, setProjection] = useState<MatchProjection | null>(null);
    const [manualAdjustments, setManualAdjustments] = useState<Record<number, number>>({});

    // Listen for live scouting data
    useEffect(() => {
        const eventCode = teams[0]?.events[0]?.eventCode || "MXTOL";
        const unsubscribe = listenToMatchScouting(season, eventCode, (entries) => {
            setScoutingData(entries);
        });
        return () => unsubscribe();
    }, [season, teams]);

    // Load Pit Data for selected teams
    useEffect(() => {
        const uniqueTeams = Array.from(new Set([...redAlliance, ...blueAlliance]));
        uniqueTeams.forEach(async (t) => {
            if (!pitData[t]) {
                const data = await getPitScouting(season, t);
                if (data) setPitData(prev => ({ ...prev, [t]: data }));
            }
        });
    }, [redAlliance, blueAlliance, season, pitData]);

    // Calculate projection whenever picks or scouting change
    useEffect(() => {
        if (redAlliance.length === 2 && blueAlliance.length === 2) {
            const redProjections = redAlliance.map(id => {
                const team = teams.find(t => t.teamNumber === id)!;
                const proj = calculateTeamProjection(team, scoutingData.filter(e => e.teamNumber === id), pitData[id]);
                if (manualAdjustments[id]) {
                    proj.projectedPoints += manualAdjustments[id];
                }
                return proj;
            });

            const blueProjections = blueAlliance.map(id => {
                const team = teams.find(t => t.teamNumber === id)!;
                const proj = calculateTeamProjection(team, scoutingData.filter(e => e.teamNumber === id), pitData[id]);
                if (manualAdjustments[id]) {
                    proj.projectedPoints += manualAdjustments[id];
                }
                return proj;
            });

            setProjection(predictMatch(redProjections, blueProjections));
        } else {
            setProjection(null);
        }
    }, [redAlliance, blueAlliance, scoutingData, pitData, teams]);

    const addToAlliance = (teamNumber: number, alliance: 'red' | 'blue') => {
        if (alliance === 'red') {
            if (redAlliance.length < 2 && !blueAlliance.includes(teamNumber)) setRedAlliance([...redAlliance, teamNumber]);
        } else {
            if (blueAlliance.length < 2 && !redAlliance.includes(teamNumber)) setBlueAlliance([...blueAlliance, teamNumber]);
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 min-h-[70vh]">
            {/* Pickers */}
            <div className="xl:col-span-1 space-y-4">
                <Card className="p-4 bg-white/5 border-white/10">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-widest mb-4">Selección de Equipos</h3>
                    <div className="space-y-2 overflow-y-auto max-h-[60vh] custom-scrollbar pr-2">
                        {teams.map(team => (
                            <div key={team.teamNumber} className="flex items-center justify-between p-2 bg-white/5 rounded-lg border border-white/5 group">
                                <span className="font-bold text-white">{team.teamNumber}</span>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    <button
                                        onClick={() => addToAlliance(team.teamNumber, 'red')}
                                        disabled={redAlliance.includes(team.teamNumber) || blueAlliance.includes(team.teamNumber)}
                                        className="p-1 px-2 bg-red-500/20 text-red-500 rounded text-[10px] font-bold"
                                    > Red </button>
                                    <button
                                        onClick={() => addToAlliance(team.teamNumber, 'blue')}
                                        disabled={redAlliance.includes(team.teamNumber) || blueAlliance.includes(team.teamNumber)}
                                        className="p-1 px-2 bg-blue-500/20 text-blue-500 rounded text-[10px] font-bold"
                                    > Blue </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </Card>
            </div>

            {/* Battle Arena */}
            <div className="xl:col-span-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 hidden md:block">
                        <div className="w-16 h-16 bg-background border-4 border-white/10 rounded-full flex items-center justify-center text-2xl font-black text-white italic">VS</div>
                    </div>

                    {/* Red Alliance */}
                    <AllianceBox
                        color="red"
                        teams={redAlliance}
                        allTeams={teams}
                        onRemove={(id: number) => setRedAlliance(redAlliance.filter(x => x !== id))}
                        projection={projection?.redAlliance}
                        setManualAdjustments={setManualAdjustments}
                    />

                    {/* Blue Alliance */}
                    <AllianceBox
                        color="blue"
                        teams={blueAlliance}
                        allTeams={teams}
                        onRemove={(id: number) => setBlueAlliance(blueAlliance.filter(x => x !== id))}
                        projection={projection?.blueAlliance}
                        setManualAdjustments={setManualAdjustments}
                    />
                </div>

                {/* Projection Results */}
                {projection && (
                    <div className="mt-8 space-y-6 animate-in fade-in zoom-in-95 duration-500">
                        {/* Summary Header */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card className="p-8 bg-gradient-to-br from-red-950/20 to-black border-red-500/20 overflow-hidden relative">
                                <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
                                    <Swords size={180} />
                                </div>
                                <div className="text-xs font-bold text-red-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                    Predicción Roja
                                </div>
                                <div className="text-6xl font-black text-white font-display mb-2">{projection.redAlliance.score}</div>
                                <p className="text-gray-500 text-sm font-medium">Puntos estimados totales</p>
                            </Card>

                            <Card className="p-8 bg-black border-primary/20 flex flex-col items-center justify-center text-center relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-primary to-blue-500" />
                                <div className="text-[10px] font-bold text-primary uppercase tracking-[0.3em] mb-4">Probabilidad de Victoria</div>
                                <div className="text-7xl font-black text-white font-display mb-2">{(projection.winProbability * 100).toFixed(0)}%</div>
                                <div className="w-full max-w-[200px] h-1.5 bg-white/5 rounded-full overflow-hidden mt-4">
                                    <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${projection.winProbability * 100}%` }} />
                                </div>
                            </Card>

                            <Card className="p-8 bg-gradient-to-br from-blue-950/20 to-black border-blue-500/20 overflow-hidden relative">
                                <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
                                    <Swords size={180} />
                                </div>
                                <div className="text-xs font-bold text-blue-500 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                    Predicción Azul
                                </div>
                                <div className="text-6xl font-black text-white font-display mb-2">{projection.blueAlliance.score}</div>
                                <p className="text-gray-500 text-sm font-medium">Puntos estimados totales</p>
                            </Card>
                        </div>

                        {/* AI Analyst Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card className="p-6 bg-white/[0.02] border-white/5">
                                <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                                    <div className="p-2 bg-primary/10 rounded-lg"><Zap size={18} className="text-primary" /></div>
                                    Análisis del Predictor IA
                                </h4>
                                <div className="space-y-4">
                                    {projection.insights.map((insight, i) => (
                                        <div key={i} className="flex gap-4 p-4 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/5 transition-colors">
                                            <div className="mt-1 flex-shrink-0 w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center">
                                                <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                                            </div>
                                            <p className="text-sm text-gray-300 leading-relaxed font-medium">{insight}</p>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card className="p-6 bg-white/[0.02] border-white/5">
                                <h4 className="text-sm font-bold text-white uppercase tracking-widest mb-6 flex items-center gap-3">
                                    <div className="p-2 bg-secondary/10 rounded-lg"><Percent size={18} className="text-secondary" /></div>
                                    Desglose de Puntos Estimados
                                </h4>
                                <div className="space-y-6">
                                    <PointBreakdownRow label="Período Autónomo" red={projection.redAlliance.teams.reduce((a, b) => a + b.breakdown.auto, 0)} blue={projection.blueAlliance.teams.reduce((a, b) => a + b.breakdown.auto, 0)} />
                                    <PointBreakdownRow label="TeleOp (Anotación)" red={projection.redAlliance.teams.reduce((a, b) => a + b.breakdown.teleop, 0)} blue={projection.blueAlliance.teams.reduce((a, b) => a + b.breakdown.teleop, 0)} />
                                    <PointBreakdownRow label="Endgame / Colgado" red={projection.redAlliance.teams.reduce((a, b) => a + b.breakdown.endgame, 0)} blue={projection.blueAlliance.teams.reduce((a, b) => a + b.breakdown.endgame, 0)} />

                                    <div className="pt-6 border-t border-white/5">
                                        <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10">
                                            <div className="flex items-center gap-3">
                                                <AlertTriangle size={18} className="text-yellow-500" />
                                                <div className="text-xs font-bold text-white">Confianza del Modelo</div>
                                            </div>
                                            <div className="text-sm font-black text-primary">
                                                {(projection.redAlliance.teams.reduce((a, b) => a + b.confidence, 0) / 4 * 100).toFixed(0)}%
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </div>
                )}

                {!projection && (
                    <div className="mt-8 h-64 flex flex-col items-center justify-center border-2 border-dashed border-white/5 rounded-3xl text-gray-500">
                        <Swords size={48} className="mb-4 opacity-20" />
                        <p className="font-medium">Selecciona 2 equipos por alianza para ver la simulación</p>
                    </div>
                )}
            </div>
        </div>
    );
}

function PointBreakdownRow({ label, red, blue }: { label: string, red: number, blue: number }) {
    const total = red + blue;
    const redPct = total > 0 ? (red / total) * 100 : 50;

    return (
        <div className="space-y-2">
            <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight">
                <span className="text-red-400">{red.toFixed(0)}</span>
                <span className="text-gray-500">{label}</span>
                <span className="text-blue-400">{blue.toFixed(0)}</span>
            </div>
            <div className="h-1 bg-white/5 rounded-full overflow-hidden flex">
                <div
                    className="h-full bg-red-500 transition-all duration-1000"
                    style={{ width: `${redPct}%` }}
                />
                <div
                    className="h-full bg-blue-500 transition-all duration-1000"
                    style={{ width: `${100 - redPct}%` }}
                />
            </div>
        </div>
    );
}

function AllianceBox({ color, teams, allTeams, onRemove, projection, setManualAdjustments }: any) {
    const isRed = color === 'red';
    return (
        <Card className={clsx(
            "p-6 flex flex-col gap-4 transition-all duration-300",
            isRed ? "border-red-500/20 bg-red-500/5" : "border-blue-500/20 bg-blue-500/5",
            teams.length === 2 && "ring-2 ring-opacity-50",
            isRed && teams.length === 2 ? "ring-red-500" : teams.length === 2 ? "ring-blue-500" : ""
        )}>
            <div className="flex justify-between items-center px-2">
                <h2 className={clsx("font-black italic text-2xl uppercase tracking-tighter", isRed ? "text-red-500" : "text-blue-500")}>
                    {isRed ? "Alianza Roja" : "Alianza Azul"}
                </h2>
                {projection && (
                    <div className="text-right">
                        <div className="text-[10px] text-gray-500 uppercase font-bold">Projected Score</div>
                        <div className="text-2xl font-bold text-white">{projection.score.toFixed(1)}</div>
                    </div>
                )}
            </div>

            <div className="space-y-3">
                {[0, 1].map(idx => {
                    const id = teams[idx];
                    const team = id ? allTeams.find((t: any) => t.teamNumber === id) : null;
                    const teamProj = projection?.teams.find((t: any) => t.teamNumber === id);

                    return (
                        <div key={idx} className={clsx(
                            "min-h-[100px] rounded-2xl border-2 flex items-center justify-between p-4 transition-all",
                            id ? "bg-white/5 border-white/10" : "border-dashed border-white/5 bg-transparent"
                        )}>
                            {team ? (
                                <div className="flex-1 flex items-center justify-between">
                                    <div>
                                        <div className="text-3xl font-black font-display text-white">{team.teamNumber}</div>
                                        <div className="text-[10px] text-gray-500 font-bold uppercase truncate max-w-[120px]">{team.teamName}</div>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {teamProj && (
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="text-[10px] text-gray-400 font-bold">Est. Points</div>
                                                    <div className="text-xl font-bold text-primary">{teamProj.projectedPoints.toFixed(0)}</div>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <button
                                                        onClick={() => setManualAdjustments((prev: Record<number, number>) => ({ ...prev, [id]: (prev[id] || 0) + 10 }))}
                                                        className="p-1 bg-white/5 hover:bg-primary/20 rounded text-[10px] font-bold text-gray-400 hover:text-primary transition-colors"
                                                        title="Aumentar proyección (+10)"
                                                    >+10</button>
                                                    <button
                                                        onClick={() => setManualAdjustments((prev: Record<number, number>) => ({ ...prev, [id]: (prev[id] || 0) - 10 }))}
                                                        className="p-1 bg-white/5 hover:bg-red-500/20 rounded text-[10px] font-bold text-gray-400 hover:text-red-500 transition-colors"
                                                        title="Disminuir proyección (-10)"
                                                    >-10</button>
                                                </div>
                                            </div>
                                        )}
                                        <button onClick={() => onRemove(id)} className="p-2 text-gray-600 hover:text-red-500">
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <span className="text-center w-full text-xs font-bold text-gray-700 uppercase tracking-widest italic">Slot Vacío</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
