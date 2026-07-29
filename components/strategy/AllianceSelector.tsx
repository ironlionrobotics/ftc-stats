"use client";

import { useState, useEffect } from "react";
import { AggregatedTeamStats, MatchScouting } from "@/types/scouting";
import { Card } from "@/components/ui/Card";
import { Search, Plus, X, Trash2, Star, Zap, Sparkles, Bot } from "lucide-react";
import { listenToMatchScouting } from "@/lib/scouting-service";
import { useProgram } from "@/lib/stores/program-store";
import { FTCMatchScouting } from "@/types/scouting";
import clsx from "clsx";
import { toast } from "sonner";
import { guessActiveEventCode } from "@/lib/active-event";
import { useAuth } from "@/context/AuthContext";
import { DEFAULT_ORG_ID } from "@/lib/constants";

interface AllianceSelectorProps {
    teams: AggregatedTeamStats[];
}

interface ScoutingSummary {
    avgSkill: number;
    avgSamples: number;
    count: number;
}

export default function AllianceSelector({ teams }: AllianceSelectorProps) {
    const { season } = useProgram();
    const { orgId } = useAuth();
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedTeams, setSelectedTeams] = useState<AggregatedTeamStats[]>([]);
    const [scoutingEntries, setScoutingEntries] = useState<MatchScouting[]>([]);
    const [sortBy, setSortBy] = useState<"opr" | "auto" | "scouted">("opr");

    // Real-time listen to scouting data to inform strategy
    useEffect(() => {
        const eventCode = guessActiveEventCode(teams) ?? "MXTOL";
        const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;
        const unsubscribe = listenToMatchScouting(season, eventCode, effectiveOrgId, (entries) => {
            setScoutingEntries(entries);
        });
        return () => unsubscribe();
    }, [season, teams, orgId]);

    // Helper to get aggregated scouting info for a team
    const getScoutingSummary = (teamNumber: number) => {
        const teamEntries = scoutingEntries.filter(e => e.teamNumber === teamNumber);
        if (teamEntries.length === 0) return null;

        const avgSkill = teamEntries.reduce((acc, e) => acc + (e.driverSkill ?? 3), 0) / teamEntries.length;
        const avgSamples = teamEntries.reduce((acc, match) => {
            const e = match as FTCMatchScouting;
            return acc + ((e.teleopPurpleArtifacts || 0) + (e.teleopGreenArtifacts || 0)) + ((e.autoPurpleArtifacts || 0) + (e.autoGreenArtifacts || 0))
        }, 0) / teamEntries.length;

        return {
            avgSkill,
            avgSamples,
            count: teamEntries.length
        };
    };

    // Sorting logic
    const sortedTeams = [...teams].sort((a, b) => {
        if (sortBy === "opr") return b.averageMatchPoints - a.averageMatchPoints;
        if (sortBy === "auto") return b.averageAutoPoints - a.averageAutoPoints;

        const summaryA = getScoutingSummary(a.teamNumber);
        const summaryB = getScoutingSummary(b.teamNumber);
        return (summaryB?.avgSamples || 0) - (summaryA?.avgSamples || 0);
    });

    const filteredTeams = sortedTeams.filter(t =>
        (t.teamNumber.toString().includes(searchTerm) || t.teamName.toLowerCase().includes(searchTerm.toLowerCase())) &&
        !selectedTeams.find(s => s.teamNumber === t.teamNumber)
    );

    const addToAlliance = (team: AggregatedTeamStats) => {
        if (selectedTeams.length >= 3) {
            toast.warning("Alliance full (Top 3)");
            return;
        }
        setSelectedTeams([...selectedTeams, team]);
    };

    const removeFromAlliance = (teamNumber: number) => {
        setSelectedTeams(selectedTeams.filter(t => t.teamNumber !== teamNumber));
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-160px)]">
            {/* Left Column: Team List */}
            <div className="lg:col-span-2 flex flex-col gap-4 h-full">
                <div className="flex flex-wrap gap-2 mb-2">
                    <button onClick={() => setSortBy("opr")} className={clsx("px-4 py-2 rounded-xl text-xs font-bold transition-all border", sortBy === "opr" ? "bg-primary border-primary text-primary-foreground" : "bg-muted border-border text-muted-foreground")}>
                        Sort by OPR
                    </button>
                    <button onClick={() => setSortBy("auto")} className={clsx("px-4 py-2 rounded-xl text-xs font-bold transition-all border", sortBy === "auto" ? "bg-primary border-primary text-primary-foreground" : "bg-muted border-border text-muted-foreground")}>
                        Sort by Auto
                    </button>
                    <button onClick={() => setSortBy("scouted")} className={clsx("px-4 py-2 rounded-xl text-xs font-bold transition-all border", sortBy === "scouted" ? "bg-accent border-accent text-accent-foreground" : "bg-muted border-border text-muted-foreground")}>
                        Sort by Scouted Samples
                    </button>
                </div>

                <Card className="flex-1 flex flex-col p-0 overflow-hidden bg-card border-border">
                    <div className="p-4 border-b border-border bg-muted">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                            <input
                                type="text"
                                placeholder="Search team by number or name..."
                                className="pl-10 pr-4 py-3 bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm w-full"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>
                    </div>

                    <div className="overflow-y-auto flex-1 p-4 custom-scrollbar">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                            {filteredTeams.map(team => {
                                const scouting = getScoutingSummary(team.teamNumber);
                                return (
                                    <div key={team.teamNumber} className="bg-muted p-4 rounded-xl flex justify-between items-center hover:bg-muted/70 transition-all border border-border group">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <div className="font-bold text-xl text-foreground font-display">{team.teamNumber}</div>
                                                <div className="text-[10px] text-muted-foreground font-medium uppercase truncate max-w-[120px]">{team.teamName}</div>
                                            </div>
                                            <div className="flex flex-wrap gap-2 text-[10px]">
                                                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded font-bold">OPR: {team.averageMatchPoints.toFixed(1)}</span>
                                                <span className="bg-secondary/10 text-secondary px-2 py-0.5 rounded font-bold">Auto: {team.averageAutoPoints.toFixed(1)}</span>
                                                {scouting && (
                                                    <span className="bg-accent/10 text-accent px-2 py-0.5 rounded font-bold flex items-center gap-1 shadow-sm">
                                                        <Zap size={10} /> Scouted: {scouting.avgSamples.toFixed(1)}
                                                    </span>
                                                )}
                                            </div>
                                            {scouting && (
                                                <div className="flex items-center gap-1 mt-1">
                                                    {[1, 2, 3, 4, 5].map(star => (
                                                        <Star key={star} size={10} className={clsx(star <= Math.round(scouting.avgSkill) ? "text-warning fill-warning" : "text-muted-foreground/30")} />
                                                    ))}
                                                    <span className="text-[10px] text-muted-foreground ml-1">({scouting.count} obs)</span>
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => addToAlliance(team)}
                                            className="p-3 bg-primary/10 hover:bg-primary/40 text-primary rounded-xl transition-all scale-90 group-hover:scale-100 shadow-md"
                                        >
                                            <Plus size={24} />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Card>
            </div>

            {/* Right Column: Alliance Builder */}
            <div className="flex flex-col gap-4 h-full">
                <Card className="h-full flex flex-col p-4 bg-muted border-primary/20 shadow-sm relative overflow-hidden">
                    {/* Background Glow */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 blur-[80px] rounded-full pointer-events-none" />

                    <h2 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2 relative z-10">
                        <span className="w-1.5 h-6 bg-primary rounded-full"></span>
                        Alliance Stack
                    </h2>

                    <div className="space-y-4 flex-1 relative z-10">
                        {/* Slots */}
                        {["Captain", "1st Pick", "2nd Pick (rota/backup)"].map((label, idx) => (
                            <div key={label} className="relative p-6 rounded-2xl border-2 border-dashed border-border min-h-[110px] flex flex-col justify-center items-center bg-muted shadow-inner transition-colors hover:border-border/80 group/slot">
                                <span className="absolute top-2 left-3 text-[10px] font-bold text-muted-foreground uppercase tracking-widest group-hover/slot:text-primary transition-colors">{label}</span>
                                {selectedTeams[idx] ? (
                                    <SelectedTeamCard
                                        team={selectedTeams[idx]}
                                        onRemove={() => removeFromAlliance(selectedTeams[idx].teamNumber)}
                                        scouting={getScoutingSummary(selectedTeams[idx].teamNumber)}
                                    />
                                ) : (
                                    <div className="flex flex-col items-center gap-2">
                                        <span className="text-muted-foreground/30 font-bold uppercase tracking-tighter text-lg">Empty Slot</span>
                                        {idx > 0 && selectedTeams.length === idx && (
                                            <span className="text-[10px] text-primary/50 animate-pulse">Select next partner</span>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Automatic Recommendations */}
                        {selectedTeams.length > 0 && selectedTeams.length < 3 && (
                            <div className="mt-4 p-4 bg-muted rounded-xl border border-border">
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                                    <Sparkles size={12} className="text-warning" /> Top Recommendations
                                </h3>
                                <div className="space-y-2">
                                    {sortedTeams
                                        .filter(t => !selectedTeams.find(s => s.teamNumber === t.teamNumber))
                                        .slice(0, 3)
                                        .map(rec => (
                                            <button
                                                key={rec.teamNumber}
                                                onClick={() => addToAlliance(rec)}
                                                className="w-full flex justify-between items-center p-2 rounded-lg hover:bg-muted transition-colors group/rec text-left"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-foreground font-display text-sm">{rec.teamNumber}</span>
                                                    <span className="text-[10px] text-muted-foreground truncate max-w-[100px]">{rec.teamName}</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] font-mono text-primary">+{rec.averageMatchPoints.toFixed(1)} OPR</span>
                                                    <Plus size={14} className="text-muted-foreground group-hover/rec:text-foreground" />
                                                </div>
                                            </button>
                                        ))}
                                </div>
                            </div>
                        )}

                        {selectedTeams.length > 0 && (
                            <div className="mt-8 p-6 bg-gradient-to-r from-primary/20 to-secondary/20 rounded-2xl border border-border shadow-lg animate-in zoom-in-95 duration-300">
                                <div className="text-[10px] text-center text-muted-foreground font-bold uppercase tracking-widest mb-2">Estimated Alliance Score</div>
                                <div className="text-4xl font-bold text-center text-foreground font-display">
                                    {/* Only 2 robots play each match (rule 15.3) — with 3
                                        selected, project the strongest pair, not the sum. */}
                                    {([...selectedTeams]
                                        .sort((a, b) => b.averageMatchPoints - a.averageMatchPoints)
                                        .slice(0, 2)
                                        .reduce((acc, t) => acc + t.averageMatchPoints, 0)).toFixed(1)}
                                </div>
                                {selectedTeams.length === 3 && (
                                    <p className="text-[10px] text-center text-muted-foreground mt-2">
                                        Mejor par de los 3 — en cancha solo juegan 2 robots por match (regla 15.3).
                                    </p>
                                )}
                            </div>
                        )}
                    </div>

                    <div className="mt-6 flex gap-3">
                        <button
                            onClick={() => {
                                const allianceNames = selectedTeams.map(t => `${t.teamNumber} (${t.teamName})`).join(", ");
                                const totalOPR = selectedTeams.reduce((acc, t) => acc + t.averageMatchPoints, 0).toFixed(1);
                                const prompt = `Analyze this FTC alliance capability: ${allianceNames}. Their combined OPR is ${totalOPR}. What are their strengths and weaknesses together? Who else would complement them well?`;

                                const event = new CustomEvent('open-ai-chat', { detail: { message: prompt } });
                                window.dispatchEvent(event);
                            }}
                            disabled={selectedTeams.length === 0}
                            className="flex-1 p-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:shadow-none"
                        >
                            <Bot size={18} /> Ask AI Strategy
                        </button>

                        <button
                            onClick={() => setSelectedTeams([])}
                            className="p-3 rounded-xl text-danger/60 hover:text-danger hover:bg-danger/10 transition-all border border-transparent hover:border-danger/20"
                            disabled={selectedTeams.length === 0}
                        >
                            <Trash2 size={18} />
                        </button>
                    </div>
                </Card>
            </div>
        </div>
    );
}

function SelectedTeamCard({ team, onRemove, scouting }: { team: AggregatedTeamStats, onRemove: () => void, scouting: ScoutingSummary | null }) {
    return (
        <div className="w-full flex justify-between items-center group animate-in slide-in-from-right-4 duration-200">
            <div className="space-y-1">
                <div className="text-3xl font-bold text-foreground font-display leading-none">{team.teamNumber}</div>
                <div className="text-[10px] text-secondary font-medium truncate max-w-[140px]">{team.teamName}</div>
                {scouting && (
                    <div className="flex items-center gap-1">
                        <Star size={10} className="text-warning fill-warning" />
                        <span className="text-[10px] text-muted-foreground">{scouting.avgSkill.toFixed(1)} Driver</span>
                    </div>
                )}
            </div>
            <button
                onClick={onRemove}
                className="p-3 bg-danger/10 text-danger rounded-xl hover:bg-danger/20 transition-all opacity-0 group-hover:opacity-100"
            >
                <X size={20} />
            </button>
        </div>
    );
}
