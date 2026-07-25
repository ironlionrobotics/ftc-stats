"use client";

import { useState, useEffect, useMemo } from "react";
import { AggregatedTeamStats, MatchScouting, PitScouting } from "@/types/scouting";
import { Card } from "@/components/ui/Card";
import { X, Swords, AlertTriangle, Zap, Percent } from "lucide-react";
import { listenToMatchScouting, getPitScouting } from "@/lib/scouting-service";
import { useProgram } from "@/lib/stores/program-store";
import { calculateTeamProjection, predictMatch, MatchProjection, TeamProjection } from "@/lib/projections";
import SourceBadge from "@/components/scouting/SourceBadge";
import { useScoutReliabilities } from "@/lib/hooks/use-scout-reliabilities";
import clsx from "clsx";
import { guessActiveEventCode } from "@/lib/active-event";

interface MatchSimulatorProps {
    teams: AggregatedTeamStats[];
}

export default function MatchSimulator({ teams }: MatchSimulatorProps) {
    const { season } = useProgram();
    const scoutReliabilities = useScoutReliabilities();
    const [redAlliance, setRedAlliance] = useState<number[]>([]);
    const [blueAlliance, setBlueAlliance] = useState<number[]>([]);
    const [scoutingData, setScoutingData] = useState<MatchScouting[]>([]);
    const [pitData, setPitData] = useState<Record<number, PitScouting>>({});
    const [manualAdjustments, setManualAdjustments] = useState<Record<number, number>>({});

    // Listen for live scouting data
    useEffect(() => {
        const eventCode = guessActiveEventCode(teams) ?? "MXTOL";
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

    // Projection is pure derived state — a function of the picks, scouting,
    // pit data and the manual adjustments. useMemo (not an effect + setState)
    // so it recomputes synchronously with its inputs. This also fixes a stale
    // bug: `manualAdjustments` was read but missing from the old effect's deps,
    // so nudging a team's points didn't refresh the prediction.
    const projection = useMemo<MatchProjection | null>(() => {
        if (redAlliance.length !== 2 || blueAlliance.length !== 2) return null;

        const project = (id: number) => {
            const team = teams.find(t => t.teamNumber === id)!;
            const proj = calculateTeamProjection(team, scoutingData.filter(e => e.teamNumber === id), pitData[id]);
            if (manualAdjustments[id]) {
                proj.projectedPoints += manualAdjustments[id];
            }
            return proj;
        };

        return predictMatch(redAlliance.map(project), blueAlliance.map(project));
    }, [redAlliance, blueAlliance, scoutingData, pitData, teams, manualAdjustments]);

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
                <Card className="p-4 bg-muted border-border">
                    <h3 className="text-sm font-bold text-muted-foreground uppercase tracking-widest mb-4">Selección de Equipos</h3>
                    <div className="space-y-2 overflow-y-auto max-h-[60vh] custom-scrollbar pr-2">
                        {teams.map(team => (
                            <div key={team.teamNumber} className="flex items-center justify-between p-2 bg-muted rounded-lg border border-border group">
                                <span className="font-bold text-foreground">{team.teamNumber}</span>
                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                    <button
                                        onClick={() => addToAlliance(team.teamNumber, 'red')}
                                        disabled={redAlliance.includes(team.teamNumber) || blueAlliance.includes(team.teamNumber)}
                                        className="p-1 px-2 bg-danger/20 text-danger rounded text-[10px] font-bold"
                                    > Red </button>
                                    <button
                                        onClick={() => addToAlliance(team.teamNumber, 'blue')}
                                        disabled={redAlliance.includes(team.teamNumber) || blueAlliance.includes(team.teamNumber)}
                                        className="p-1 px-2 bg-secondary/20 text-secondary rounded text-[10px] font-bold"
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
                        <div className="w-16 h-16 bg-background border-4 border-border rounded-full flex items-center justify-center text-2xl font-black text-foreground italic">VS</div>
                    </div>

                    {/* Red Alliance */}
                    <AllianceBox
                        color="red"
                        teams={redAlliance}
                        allTeams={teams}
                        onRemove={(id: number) => setRedAlliance(redAlliance.filter(x => x !== id))}
                        projection={projection?.redAlliance}
                        setManualAdjustments={setManualAdjustments}
                        scoutingData={scoutingData}
                        scoutReliabilities={scoutReliabilities}
                    />

                    {/* Blue Alliance */}
                    <AllianceBox
                        color="blue"
                        teams={blueAlliance}
                        allTeams={teams}
                        onRemove={(id: number) => setBlueAlliance(blueAlliance.filter(x => x !== id))}
                        projection={projection?.blueAlliance}
                        setManualAdjustments={setManualAdjustments}
                        scoutingData={scoutingData}
                        scoutReliabilities={scoutReliabilities}
                    />
                </div>

                {/* Projection Results */}
                {projection && (
                    <div className="mt-8 space-y-6 animate-in fade-in zoom-in-95 duration-500">
                        {/* Summary Header */}
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            <Card className="p-8 bg-muted border-danger/20 overflow-hidden relative">
                                <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
                                    <Swords size={180} />
                                </div>
                                <div className="text-xs font-bold text-danger uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-danger animate-pulse" />
                                    Predicción Roja
                                </div>
                                <div className="text-6xl font-black text-foreground font-display mb-2">{projection.redAlliance.score}</div>
                                <p className="text-muted-foreground text-sm font-medium">Puntos estimados totales</p>
                            </Card>

                            <Card className="p-8 bg-card border-primary/20 flex flex-col items-center justify-center text-center relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-danger via-primary to-secondary" />
                                <div className="text-[10px] font-bold text-primary uppercase tracking-[0.3em] mb-4">Probabilidad de Victoria</div>
                                <div className="text-7xl font-black text-foreground font-display mb-2">{(projection.winProbability * 100).toFixed(0)}%</div>
                                <div className="w-full max-w-[200px] h-1.5 bg-muted rounded-full overflow-hidden mt-4">
                                    <div className="h-full bg-primary transition-all duration-1000" style={{ width: `${projection.winProbability * 100}%` }} />
                                </div>
                            </Card>

                            <Card className="p-8 bg-muted border-secondary/20 overflow-hidden relative">
                                <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none">
                                    <Swords size={180} />
                                </div>
                                <div className="text-xs font-bold text-secondary uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                                    Predicción Azul
                                </div>
                                <div className="text-6xl font-black text-foreground font-display mb-2">{projection.blueAlliance.score}</div>
                                <p className="text-muted-foreground text-sm font-medium">Puntos estimados totales</p>
                            </Card>
                        </div>

                        {/* AI Analyst Section */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <Card className="p-6 bg-muted border-border">
                                <h4 className="text-sm font-bold text-foreground uppercase tracking-widest mb-6 flex items-center gap-3">
                                    <div className="p-2 bg-primary/10 rounded-lg"><Zap size={18} className="text-primary" /></div>
                                    Análisis del Predictor IA
                                </h4>
                                <div className="space-y-4">
                                    {projection.insights.map((insight, i) => (
                                        <div key={i} className="flex gap-4 p-4 rounded-2xl bg-muted border border-border hover:bg-muted/70 transition-colors">
                                            <div className="mt-1 flex-shrink-0 w-5 h-5 bg-primary/20 rounded-full flex items-center justify-center">
                                                <div className="w-1.5 h-1.5 bg-primary rounded-full" />
                                            </div>
                                            <p className="text-sm text-foreground leading-relaxed font-medium">{insight}</p>
                                        </div>
                                    ))}
                                </div>
                            </Card>

                            <Card className="p-6 bg-muted border-border">
                                <h4 className="text-sm font-bold text-foreground uppercase tracking-widest mb-6 flex items-center gap-3">
                                    <div className="p-2 bg-secondary/10 rounded-lg"><Percent size={18} className="text-secondary" /></div>
                                    Desglose de Puntos Estimados
                                </h4>
                                <div className="space-y-6">
                                    <PointBreakdownRow label="Período Autónomo" red={projection.redAlliance.teams.reduce((a, b) => a + b.breakdown.auto, 0)} blue={projection.blueAlliance.teams.reduce((a, b) => a + b.breakdown.auto, 0)} />
                                    <PointBreakdownRow label="TeleOp (Anotación)" red={projection.redAlliance.teams.reduce((a, b) => a + b.breakdown.teleop, 0)} blue={projection.blueAlliance.teams.reduce((a, b) => a + b.breakdown.teleop, 0)} />
                                    <PointBreakdownRow label="Endgame / Colgado" red={projection.redAlliance.teams.reduce((a, b) => a + b.breakdown.endgame, 0)} blue={projection.blueAlliance.teams.reduce((a, b) => a + b.breakdown.endgame, 0)} />

                                    <div className="pt-6 border-t border-border">
                                        <div className="flex items-center justify-between p-4 bg-primary/5 rounded-2xl border border-primary/10">
                                            <div className="flex items-center gap-3">
                                                <AlertTriangle size={18} className="text-warning" />
                                                <div className="text-xs font-bold text-foreground">Confianza del Modelo</div>
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
                    <div className="mt-8 h-64 flex flex-col items-center justify-center border-2 border-dashed border-border rounded-3xl text-muted-foreground">
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
                <span className="text-danger">{red.toFixed(0)}</span>
                <span className="text-muted-foreground">{label}</span>
                <span className="text-secondary">{blue.toFixed(0)}</span>
            </div>
            <div className="h-1 bg-muted rounded-full overflow-hidden flex">
                <div
                    className="h-full bg-danger transition-all duration-1000"
                    style={{ width: `${redPct}%` }}
                />
                <div
                    className="h-full bg-secondary transition-all duration-1000"
                    style={{ width: `${100 - redPct}%` }}
                />
            </div>
        </div>
    );
}

function AllianceBox({
    color,
    teams,
    allTeams,
    onRemove,
    projection,
    setManualAdjustments,
    scoutingData,
    scoutReliabilities,
}: {
    color: 'red' | 'blue';
    teams: number[];
    allTeams: AggregatedTeamStats[];
    onRemove: (id: number) => void;
    projection?: { score: number; teams: TeamProjection[] };
    setManualAdjustments: React.Dispatch<React.SetStateAction<Record<number, number>>>;
    scoutingData: MatchScouting[];
    scoutReliabilities: Record<string, number>;
}) {
    const isRed = color === 'red';
    return (
        <Card className={clsx(
            "p-6 flex flex-col gap-4 transition-all duration-300",
            isRed ? "border-danger/20 bg-danger/5" : "border-secondary/20 bg-secondary/5",
            teams.length === 2 && "ring-2 ring-opacity-50",
            isRed && teams.length === 2 ? "ring-danger" : teams.length === 2 ? "ring-secondary" : ""
        )}>
            <div className="flex justify-between items-center px-2">
                <h2 className={clsx("font-black italic text-2xl uppercase tracking-tighter", isRed ? "text-danger" : "text-secondary")}>
                    {isRed ? "Alianza Roja" : "Alianza Azul"}
                </h2>
                {projection && (
                    <div className="text-right">
                        <div className="text-[10px] text-muted-foreground uppercase font-bold">Projected Score</div>
                        <div className="text-2xl font-bold text-foreground">{projection.score.toFixed(1)}</div>
                    </div>
                )}
            </div>

            <div className="space-y-3">
                {[0, 1].map(idx => {
                    const id = teams[idx];
                    const team = id ? allTeams.find((t: AggregatedTeamStats) => t.teamNumber === id) : null;
                    const teamProj = projection?.teams.find((t: TeamProjection) => t.teamNumber === id);

                    return (
                        <div key={idx} className={clsx(
                            "min-h-[100px] rounded-2xl border-2 flex items-center justify-between p-4 transition-all",
                            id ? "bg-muted border-border" : "border-dashed border-border bg-transparent"
                        )}>
                            {team ? (
                                <div className="flex-1 flex items-center justify-between">
                                    <div className="space-y-1.5">
                                        <div className="text-3xl font-black font-display text-foreground">{team.teamNumber}</div>
                                        <div className="text-[10px] text-muted-foreground font-bold uppercase truncate max-w-[120px]">{team.teamName}</div>
                                        <SourceBadge
                                            entries={scoutingData.filter(e => e.teamNumber === id)}
                                            scoutReliabilities={scoutReliabilities}
                                            variant="full"
                                        />
                                    </div>
                                    <div className="flex items-center gap-4">
                                        {teamProj && (
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col items-end gap-1">
                                                    <div className="text-[10px] text-muted-foreground font-bold">Est. Points</div>
                                                    <div className="text-xl font-bold text-primary">{teamProj.projectedPoints.toFixed(0)}</div>
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    <button
                                                        onClick={() => setManualAdjustments((prev: Record<number, number>) => ({ ...prev, [id]: (prev[id] || 0) + 10 }))}
                                                        className="p-1 bg-muted hover:bg-primary/20 rounded text-[10px] font-bold text-muted-foreground hover:text-primary transition-colors"
                                                        title="Aumentar proyección (+10)"
                                                    >+10</button>
                                                    <button
                                                        onClick={() => setManualAdjustments((prev: Record<number, number>) => ({ ...prev, [id]: (prev[id] || 0) - 10 }))}
                                                        className="p-1 bg-muted hover:bg-danger/20 rounded text-[10px] font-bold text-muted-foreground hover:text-danger transition-colors"
                                                        title="Disminuir proyección (-10)"
                                                    >-10</button>
                                                </div>
                                            </div>
                                        )}
                                        <button
                                            onClick={() => onRemove(id)}
                                            aria-label="Remover de alianza"
                                            className="min-w-[36px] min-h-[36px] flex items-center justify-center text-muted-foreground hover:text-danger hover:bg-danger/10 rounded-md active:scale-[0.95] transition-all"
                                        >
                                            <X size={20} />
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <span className="text-center w-full text-xs font-bold text-muted-foreground uppercase tracking-widest italic">Slot Vacío</span>
                            )}
                        </div>
                    );
                })}
            </div>
        </Card>
    );
}
