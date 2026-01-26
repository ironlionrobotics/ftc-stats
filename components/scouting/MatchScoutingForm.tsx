"use client";

import { useState } from "react";
import { AggregatedTeamStats, MatchScouting } from "@/types/ftc";
import { saveMatchScouting } from "@/lib/scouting-service";
import { useAuth } from "@/context/AuthContext";
import { useSeason } from "@/context/SeasonContext";
import { Card } from "@/components/ui/Card";
import { Save, Plus, Trash2, User, Trophy, Minus } from "lucide-react";
import clsx from "clsx";

interface MatchScoutingFormProps {
    team: AggregatedTeamStats;
    entries: MatchScouting[];
}

export default function MatchScoutingForm({ team, entries }: MatchScoutingFormProps) {
    const { user } = useAuth();
    const { season } = useSeason();
    const [isAdding, setIsAdding] = useState(false);

    const [matchNum, setMatchNum] = useState<number>(1);
    const [autoPark, setAutoPark] = useState(false);
    const [autoSample, setAutoSample] = useState(0);
    const [teleopSample, setTeleopSample] = useState(0);
    const [skill, setSkill] = useState(3);
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
            autoParked: autoPark,
            autoSampleScored: autoSample,
            autoSpecimenScored: 0,
            autoPoints: 0,
            autoNav: false,
            teleopSamples: teleopSample,
            teleopSpecimens: 0,
            teleopHangLevel: 0,
            driverSkill: skill,
            notes,
            timestamp: new Date()
        });

        setIsAdding(false);
        // Reset form
        setAutoSample(0);
        setTeleopSample(0);
        setNotes("");
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Trophy className="text-primary" /> Historial de Partidos Observados
                </h3>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg font-bold hover:bg-primary/80 transition-all shadow-lg"
                >
                    {isAdding ? <X size={18} /> : <Plus size={18} />}
                    {isAdding ? "Cancelar" : "Nuevo Registro"}
                </button>
            </div>

            {isAdding && (
                <Card className="p-6 bg-white/[0.02] border-primary/20 animate-in slide-in-from-top duration-300">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Match #</label>
                            <input
                                type="number"
                                value={matchNum}
                                onChange={e => setMatchNum(Number(e.target.value))}
                                className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white"
                            />
                        </div>
                        <div className="flex items-center gap-3">
                            <label className="flex items-center gap-3 p-3 rounded-lg border border-white/10 bg-white/5 cursor-pointer w-full">
                                <input type="checkbox" checked={autoPark} onChange={e => setAutoPark(e.target.checked)} className="w-4 h-4 accent-primary" />
                                <span className="text-sm font-medium text-white">Auto Parked?</span>
                            </label>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Auto Samples</label>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setAutoSample(Math.max(0, autoSample - 1))} className="p-2 bg-white/5 rounded-lg hover:bg-white/10"><Minus size={16} /></button>
                                <span className="text-xl font-bold w-8 text-center">{autoSample}</span>
                                <button onClick={() => setAutoSample(autoSample + 1)} className="p-2 bg-white/5 rounded-lg hover:bg-white/10"><Plus size={16} /></button>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Teleop Samples</label>
                            <div className="flex items-center gap-3">
                                <button onClick={() => setTeleopSample(Math.max(0, teleopSample - 1))} className="p-2 bg-white/5 rounded-lg hover:bg-white/10"><Minus size={16} /></button>
                                <span className="text-xl font-bold w-12 text-center">{teleopSample}</span>
                                <button onClick={() => setTeleopSample(teleopSample + 1)} className="p-2 bg-white/5 rounded-lg hover:bg-white/10"><Plus size={16} /></button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-1">Habilidad Conductor (1-5)</label>
                            <div className="flex gap-2">
                                {[1, 2, 3, 4, 5].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setSkill(s)}
                                        className={clsx(
                                            "w-10 h-10 rounded-lg font-bold transition-all",
                                            skill === s ? "bg-primary text-white" : "bg-white/5 text-gray-500 hover:bg-white/10"
                                        )}
                                    >
                                        {s}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-400 mb-1">Notas del Partido</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            className="w-full h-24 px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white"
                            placeholder="Ej: El robot tuvo problemas con la garra en el minuto 1..."
                        />
                    </div>

                    <button
                        onClick={handleSave}
                        className="w-full py-3 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-xl transition-all"
                    >
                        <Save size={20} /> Guardar Observación
                    </button>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-4">
                {entries.length === 0 ? (
                    <div className="text-center py-12 bg-white/5 rounded-2xl border border-white/5 text-gray-500 italic">
                        No hay observaciones registradas para este equipo aún.
                    </div>
                ) : (
                    entries.map((entry, idx) => (
                        <div key={idx} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.08] transition-all">
                            <div className="flex justify-between items-start mb-3">
                                <div>
                                    <span className="text-xs font-bold text-primary uppercase tracking-widest">Match #{entry.matchNumber}</span>
                                    <div className="flex items-center gap-2 text-gray-400 text-xs mt-1">
                                        <User size={12} /> {entry.scouterName} • {new Date(entry.timestamp?.seconds * 1000 || Date.now()).toLocaleTimeString()}
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <div className="text-right">
                                        <div className="text-[10px] text-gray-500 uppercase">Skill</div>
                                        <div className="flex gap-0.5">
                                            {[1, 2, 3, 4, 5].map(star => (
                                                <div key={star} className={clsx("w-1.5 h-1.5 rounded-full", star <= entry.driverSkill ? "bg-yellow-500" : "bg-white/10")} />
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                                <div className="bg-black/20 p-2 rounded-lg">
                                    <span className="block text-[10px] text-gray-500 uppercase">Auto Samples</span>
                                    <span className="text-lg font-bold text-white">{entry.autoSampleScored}</span>
                                </div>
                                <div className="bg-black/20 p-2 rounded-lg">
                                    <span className="block text-[10px] text-gray-500 uppercase">Teleop Samples</span>
                                    <span className="text-lg font-bold text-white">{entry.teleopSamples}</span>
                                </div>
                                <div className="bg-black/20 p-2 rounded-lg">
                                    <span className="block text-[10px] text-gray-500 uppercase">Auto Parked</span>
                                    <span className={clsx("text-lg font-bold", entry.autoParked ? "text-green-500" : "text-red-500")}>
                                        {entry.autoParked ? "SI" : "NO"}
                                    </span>
                                </div>
                            </div>

                            {entry.notes && (
                                <p className="text-sm text-gray-300 italic bg-black/20 p-3 rounded-lg border-l-2 border-primary/50">
                                    "{entry.notes}"
                                </p>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}

function X({ size }: { size: number }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
    )
}
