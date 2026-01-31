"use client";

import { useState } from "react";
import { AggregatedTeamStats, MatchScouting } from "@/types/ftc";
import { saveMatchScouting } from "@/lib/scouting-service";
import { useAuth } from "@/context/AuthContext";
import { useSeason } from "@/context/SeasonContext";
import { Card } from "@/components/ui/Card";
import { Save, Plus, User, Trophy, Minus } from "lucide-react";
import clsx from "clsx";

interface MatchScoutingFormProps {
    team: AggregatedTeamStats;
    entries: MatchScouting[];
}

export default function MatchScoutingForm({ team, entries }: MatchScoutingFormProps) {
    const { user } = useAuth();
    const { season } = useSeason();
    const [isAdding, setIsAdding] = useState(false);

    // Form State for DECODE
    const [matchNum, setMatchNum] = useState<number>(1);

    // Auto
    const [autoLaunchLine, setAutoLaunchLine] = useState(false);
    const [autoPurple, setAutoPurple] = useState(0);
    const [autoGreen, setAutoGreen] = useState(0);
    const [autoMotif, setAutoMotif] = useState(false);
    const [movementRP, setMovementRP] = useState(false);

    // Teleop
    const [telePurple, setTelePurple] = useState(0);
    const [teleGreen, setTeleGreen] = useState(0);
    const [patterns, setPatterns] = useState(0);
    const [gates, setGates] = useState(false);
    const [skill, setSkill] = useState(3);

    // Endgame
    const [baseParking, setBaseParking] = useState<'None' | 'Partial' | 'Full'>('None');
    const [dualParking, setDualParking] = useState(false);
    const [motifCompleted, setMotifCompleted] = useState(false);
    const [goalRP, setGoalRP] = useState(false);
    const [patternRP, setPatternRP] = useState(false);

    const [notes, setNotes] = useState("");

    const handleSave = async () => {
        if (!user) return alert("Debe iniciar sesión");

        const eventCode = team.events[0]?.eventCode || "MXTOL";

        await saveMatchScouting({
            teamNumber: team.teamNumber,
            eventCode,
            matchNumber: matchNum,
            season,
            scouterName: user.displayName || user.email || "Anonymous",
            scouterId: user.uid,

            // Auto
            autoParked: baseParking !== 'None',
            autoLaunchLine,
            autoPurpleArtifacts: autoPurple,
            autoGreenArtifacts: autoGreen,
            autoMotifStarted: autoMotif,
            movementRP,
            autoPoints: 0,

            // Teleop
            teleopPurpleArtifacts: telePurple,
            teleopGreenArtifacts: teleGreen,
            patternsCompleted: patterns,
            gatesUsed: gates,
            driverSkill: skill,

            // Endgame
            endgameBaseParking: baseParking,
            dualParking,
            motifCompleted,
            goalRP,
            patternRP,

            notes,

            timestamp: null
        });

        setIsAdding(false);
        // Reset form (partial reset)
        setAutoPurple(0);
        setAutoGreen(0);
        setTelePurple(0);
        setTeleGreen(0);
        setPatterns(0);
        setNotes("");
    };

    interface CounterProps {
        label: string;
        value: number;
        setter: (val: number) => void;
        color?: "primary" | "purple" | "green";
    }

    const Counter = ({ label, value, setter, color = "primary" }: CounterProps) => (
        <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">{label}</label>
            <div className="flex items-center gap-3 bg-black/40 p-1 rounded-lg border border-white/5">
                <button onClick={() => setter(Math.max(0, value - 1))} className="p-2 bg-white/5 rounded-md hover:bg-white/10 text-gray-400"><Minus size={14} /></button>
                <span className={clsx("text-lg font-bold w-8 text-center", color === "purple" ? "text-purple-400" : color === "green" ? "text-green-400" : "text-white")}>{value}</span>
                <button onClick={() => setter(value + 1)} className="p-2 bg-white/5 rounded-md hover:bg-white/10 text-gray-400"><Plus size={14} /></button>
            </div>
        </div>
    );

    interface CheckboxProps {
        label: string;
        checked: boolean;
        setter: (checked: boolean) => void;
    }

    const Checkbox = ({ label, checked, setter }: CheckboxProps) => (
        <label className={clsx(
            "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group",
            checked ? "bg-primary/20 border-primary/50" : "bg-white/5 border-white/10 hover:border-white/20"
        )}>
            <input type="checkbox" checked={checked} onChange={e => setter(e.target.checked)} className="w-4 h-4 accent-primary" />
            <span className={clsx("text-sm font-medium transition-colors", checked ? "text-white" : "text-gray-400 group-hover:text-gray-300")}>{label}</span>
        </label>
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                        <Trophy className="text-primary" /> Match Scouting: DECODE
                    </h3>
                    <p className="text-xs text-gray-500">Temporada 2025-2026 • Artifacts & Patterns</p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className={clsx(
                        "flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition-all shadow-lg",
                        isAdding ? "bg-red-500/20 text-red-400 border border-red-500/50" : "bg-primary text-white"
                    )}
                >
                    {isAdding ? "Cancelar" : <><Plus size={18} /> Nuevo Registro</>}
                </button>
            </div>

            {isAdding && (
                <Card className="p-6 bg-white/[0.02] border-primary/20 animate-in slide-in-from-top duration-300 shadow-2xl">
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        {/* Config & Auto */}
                        <div className="space-y-6 lg:col-span-1 border-r border-white/5 pr-6">
                            <div className="pb-4 border-b border-white/5">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Match Number</label>
                                <input
                                    type="number"
                                    value={matchNum}
                                    onChange={e => setMatchNum(Number(e.target.value))}
                                    className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white font-bold text-xl focus:ring-2 focus:ring-primary outline-none"
                                />
                            </div>

                            <div className="space-y-4">
                                <h4 className="text-xs font-bold text-primary uppercase tracking-widest">Periodo Autónomo</h4>
                                <Checkbox label="Salió Launch Line" checked={autoLaunchLine} setter={setAutoLaunchLine} />
                                <Checkbox label="Detectó Motif Pattern" checked={autoMotif} setter={setAutoMotif} />
                                <div className="grid grid-cols-2 gap-2">
                                    <Counter label="Purple Art." value={autoPurple} setter={setAutoPurple} color="purple" />
                                    <Counter label="Green Art." value={autoGreen} setter={setAutoGreen} color="green" />
                                </div>
                                <Checkbox label="Movement RP Achieved" checked={movementRP} setter={setMovementRP} />
                            </div>
                        </div>

                        {/* Teleop */}
                        <div className="space-y-6 lg:col-span-2 px-2">
                            <h4 className="text-xs font-bold text-primary uppercase tracking-widest">Driver Controlled (TeleOp)</h4>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                <Counter label="Purple Artifacts" value={telePurple} setter={setTelePurple} color="purple" />
                                <Counter label="Green Artifacts" value={teleGreen} setter={setTeleGreen} color="green" />
                                <Counter label="Patrones/Motifs" value={patterns} setter={setPatterns} />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Checkbox label="Usó Gates (Limpieza Rampa)" checked={gates} setter={setGates} />
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Driver Skill (1-5)</label>
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <button
                                                key={s}
                                                onClick={() => setSkill(s)}
                                                className={clsx(
                                                    "flex-1 py-2 rounded-lg font-bold transition-all border",
                                                    skill === s ? "bg-primary border-primary text-white" : "bg-white/5 border-white/10 text-gray-500 hover:border-white/30"
                                                )}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Notas Críticas del Partido</label>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    className="w-full h-32 px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-primary outline-none"
                                    placeholder="Ej: Problemas de conexión en el minuto 1:20, defensa muy agresiva..."
                                />
                            </div>
                        </div>

                        {/* Endgame */}
                        <div className="space-y-6 lg:col-span-1 border-l border-white/5 pl-6">
                            <h4 className="text-xs font-bold text-primary uppercase tracking-widest">Endgame & Rankings</h4>

                            <div className="space-y-3">
                                <label className="block text-[10px] font-bold text-gray-500 uppercase">Base Parking</label>
                                <div className="grid grid-cols-3 gap-1">
                                    {(['None', 'Partial', 'Full'] as const).map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setBaseParking(p)}
                                            className={clsx(
                                                "py-2 text-[10px] font-bold rounded border transition-all",
                                                baseParking === p ? "bg-white text-black border-white" : "bg-white/5 border-white/10 text-gray-500"
                                            )}
                                        >
                                            {p === 'None' ? 'N/A' : p === 'Partial' ? 'Parc.' : 'Full'}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-3 pt-2">
                                <Checkbox label="Dual Parking (Aliado)" checked={dualParking} setter={setDualParking} />
                                <Checkbox label="Motif Final Completado" checked={motifCompleted} setter={setMotifCompleted} />
                            </div>

                            <div className="pt-4 space-y-3 border-t border-white/5">
                                <label className="text-[10px] font-bold text-yellow-500/70 uppercase">Potential RP Tracker</label>
                                <Checkbox label="Possible Goal RP" checked={goalRP} setter={setGoalRP} />
                                <Checkbox label="Possible Pattern RP" checked={patternRP} setter={setPatternRP} />
                            </div>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-white/10">
                        <button
                            onClick={handleSave}
                            className="w-full py-4 bg-primary hover:bg-primary/90 text-white rounded-xl font-bold flex items-center justify-center gap-3 shadow-2xl transition-all text-lg group"
                        >
                            <Save size={22} className="group-hover:scale-110 transition-transform" />
                            Finalizar y Guardar Scouting
                        </button>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-4">
                {entries.length === 0 ? (
                    <div className="text-center py-24 bg-white/[0.02] rounded-2xl border border-white/5 text-gray-500 italic flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                            <ClipboardList size={32} className="opacity-20" />
                        </div>
                        No hay observaciones registradas para este equipo aún.
                    </div>
                ) : (
                    entries.sort((a, b) => b.matchNumber - a.matchNumber).map((entry, idx) => (
                        <div key={idx} className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.05] transition-all relative overflow-hidden group">
                            {/* Accent Line */}
                            <div className="absolute top-0 left-0 w-1 h-full bg-primary/30 group-hover:bg-primary transition-colors" />

                            <div className="flex flex-col md:flex-row justify-between gap-6">
                                <div className="flex-1">
                                    <div className="flex items-center gap-4 mb-4">
                                        <div className="px-3 py-1 bg-primary/20 text-primary rounded-md text-xs font-black tracking-tighter">
                                            MATCH #{entry.matchNumber}
                                        </div>
                                        <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                                            <User size={14} className="opacity-50" /> {entry.scouterName}
                                            <span className="opacity-30">•</span>
                                            {entry.timestamp?.seconds
                                                ? new Date(entry.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                : "..."}
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                        <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                            <span className="block text-[9px] text-gray-500 font-bold uppercase mb-1">Auto Pts (Est)</span>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-xl font-black text-white">{entry.autoPurpleArtifacts + entry.autoGreenArtifacts > 0 ? '✓' : '0'}</span>
                                                {entry.autoMotifStarted && <span className="text-[10px] text-primary font-bold">MOTIF</span>}
                                            </div>
                                        </div>
                                        <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                            <span className="block text-[9px] text-gray-500 font-bold uppercase mb-1">Artifacts Total</span>
                                            <div className="flex items-end gap-2">
                                                <span className="text-xl font-black text-white">{entry.teleopPurpleArtifacts + entry.teleopGreenArtifacts}</span>
                                                <span className="text-[10px] text-purple-400 font-bold">P:{entry.teleopPurpleArtifacts}</span>
                                                <span className="text-[10px] text-green-400 font-bold">G:{entry.teleopGreenArtifacts}</span>
                                            </div>
                                        </div>
                                        <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                            <span className="block text-[9px] text-gray-500 font-bold uppercase mb-1">Patterns</span>
                                            <span className="text-xl font-black text-white">{entry.patternsCompleted}</span>
                                        </div>
                                        <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                            <span className="block text-[9px] text-gray-500 font-bold uppercase mb-1">Endgame</span>
                                            <div className="flex items-center gap-2">
                                                <span className={clsx("text-xs font-bold", entry.endgameBaseParking !== 'None' ? "text-green-400" : "text-red-400")}>
                                                    {entry.endgameBaseParking}
                                                </span>
                                                {entry.dualParking && <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-500 rounded text-[8px] font-black">DUAL</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="md:w-64 flex flex-col gap-3">
                                    <div className="bg-white/5 rounded-xl p-4 border border-white/10 flex-1">
                                        <label className="block text-[9px] text-gray-500 font-bold uppercase mb-2">Driver Performance</label>
                                        <div className="flex gap-1.5">
                                            {[1, 2, 3, 4, 5].map(star => (
                                                <div
                                                    key={star}
                                                    className={clsx(
                                                        "h-2 flex-1 rounded-full",
                                                        star <= entry.driverSkill
                                                            ? (entry.driverSkill >= 4 ? "bg-green-500" : entry.driverSkill >= 2 ? "bg-primary" : "bg-red-500")
                                                            : "bg-white/5"
                                                    )}
                                                />
                                            ))}
                                        </div>
                                        <p className="text-[10px] text-gray-400 mt-2 italic line-clamp-3">
                                            {entry.notes || "Sin notas adicionales."}
                                        </p>
                                    </div>
                                    <div className="flex gap-2">
                                        {entry.movementRP && <div className="flex-1 bg-blue-500/10 text-blue-400 text-[8px] font-black p-1 rounded text-center border border-blue-500/20">MOVE RP</div>}
                                        {entry.goalRP && <div className="flex-1 bg-orange-500/10 text-orange-400 text-[8px] font-black p-1 rounded text-center border border-orange-500/20">GOAL RP</div>}
                                        {entry.patternRP && <div className="flex-1 bg-purple-500/10 text-purple-400 text-[8px] font-black p-1 rounded text-center border border-purple-500/20">PATT RP</div>}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}



function ClipboardList({ size, className }: { size: number, className?: string }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><rect width="8" height="4" x="8" y="2" rx="1" ry="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="M12 11h4" /><path d="M12 16h4" /><path d="M8 11h.01" /><path d="M8 16h.01" /></svg>
    )
}

