"use client";

import { useState } from "react";
import { AggregatedTeamStats, FRCMatchScouting, MatchScouting, CURRENT_GAME_SCHEMA } from "@/types/scouting";
import { saveToLocal } from "@/lib/localDatabase";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { DEFAULT_ORG_ID, scoutIdFromUser, scoutNameFromUser } from "@/lib/orgs";
import { toast } from "sonner";
import { Card } from "@/components/ui/Card";
import { Save, Plus, Trophy, Minus, QrCode } from "lucide-react";
import clsx from "clsx";

interface FRC_ReefscapeFormProps {
    team: AggregatedTeamStats;
    entries: MatchScouting[];
    onSaveSuccess: () => void;
}

export default function FRC_ReefscapeForm({ team, entries, onSaveSuccess }: FRC_ReefscapeFormProps) {
    const { user, orgId } = useAuth();
    const { season } = useProgram();
    const [isAdding, setIsAdding] = useState(false);

    // Form State for REEFSCAPE
    const [matchNum, setMatchNum] = useState<number>(1);

    // Auto
    const [autoLeave, setAutoLeave] = useState(false);
    const [autoCoralL1, setAutoCoralL1] = useState(0);
    const [autoCoralL2, setAutoCoralL2] = useState(0);
    const [autoCoralL3, setAutoCoralL3] = useState(0);
    const [autoCoralL4, setAutoCoralL4] = useState(0);
    const [autoAlgaeProcessor, setAutoAlgaeProcessor] = useState(0);
    const [autoAlgaeNet, setAutoAlgaeNet] = useState(0);

    // Teleop
    const [teleopCoralL1, setTeleopCoralL1] = useState(0);
    const [teleopCoralL2, setTeleopCoralL2] = useState(0);
    const [teleopCoralL3, setTeleopCoralL3] = useState(0);
    const [teleopCoralL4, setTeleopCoralL4] = useState(0);
    const [teleopAlgaeProcessor, setTeleopAlgaeProcessor] = useState(0);
    const [teleopAlgaeNet, setTeleopAlgaeNet] = useState(0);
    const [driverSkill, setDriverSkill] = useState(3);
    const [defenseRating, setDefenseRating] = useState(1);

    // Endgame
    const [endgameParked, setEndgameParked] = useState(false);
    const [endgameClimbState, setEndgameClimbState] = useState<'None' | 'Shallow' | 'Deep'>('None');

    const [notes, setNotes] = useState("");

    const handleSave = async () => {
        if (!user) {
            toast.error("Debes iniciar sesión para hacer scouting");
            return;
        }

        const scoutId = scoutIdFromUser(user);
        const scoutName = scoutNameFromUser(user);
        const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;

        const data: Omit<FRCMatchScouting, 'id'> = {
            teamNumber: team.teamNumber,
            eventCode: team.events[0]?.eventCode || "MXFRC",
            matchNumber: matchNum,
            season,
            program: 'FRC',

            // Federated attribution
            orgId: effectiveOrgId,
            scoutId,
            scoutName,
            // Legacy aliases kept populated until backfill of historical docs
            scouterId: scoutId,
            scouterName: scoutName,
            confidence: "high",
            gameSchemaVersion: CURRENT_GAME_SCHEMA.FRC,

            notes,
            timestamp: null,

            autoLeave,
            autoCoralL1,
            autoCoralL2,
            autoCoralL3,
            autoCoralL4,
            autoAlgaeProcessor,
            autoAlgaeNet,

            teleopCoralL1,
            teleopCoralL2,
            teleopCoralL3,
            teleopCoralL4,
            teleopAlgaeProcessor,
            teleopAlgaeNet,
            driverSkill,
            defenseRating,

            endgameParked,
            endgameClimbState,
        };

        // Offline storage
        await saveToLocal(data as FRCMatchScouting);

        setIsAdding(false);
        onSaveSuccess();

        // Reset
        setAutoCoralL1(0); setAutoCoralL2(0); setAutoCoralL3(0); setAutoCoralL4(0);
        setAutoAlgaeProcessor(0); setAutoAlgaeNet(0);
        setTeleopCoralL1(0); setTeleopCoralL2(0); setTeleopCoralL3(0); setTeleopCoralL4(0);
        setTeleopAlgaeProcessor(0); setTeleopAlgaeNet(0);
        setNotes("");
    };

    const Counter = ({ label, value, setter, color = "primary" }: { label: string; value: number; setter: (v: number) => void; color?: string }) => (
        <div className="flex flex-col gap-1 items-center">
            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</label>
            <div className="flex items-center gap-1 bg-black/40 p-1 rounded-xl border border-white/5 shadow-inner">
                <button onClick={() => setter(Math.max(0, value - 1))} className="p-2 sm:p-3 bg-white/5 rounded-lg hover:bg-white/10 active:bg-white/20 transition text-gray-400"><Minus size={14} /></button>
                <span className={clsx("text-xl font-black w-8 text-center", color === 'cyan' ? 'text-cyan-400' : 'text-white')}>{value}</span>
                <button onClick={() => setter(value + 1)} className="p-2 sm:p-3 bg-white/5 rounded-lg hover:bg-white/10 active:bg-white/20 transition text-gray-400"><Plus size={14} /></button>
            </div>
        </div>
    );

    const Checkbox = ({ label, checked, setter }: { label: string; checked: boolean; setter: (v: boolean) => void }) => (
        <label className={clsx(
            "flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer group flex-1",
            checked ? "bg-cyan-500/20 border-cyan-500/50" : "bg-white/5 border-white/10 hover:border-white/20"
        )}>
            <input type="checkbox" checked={checked} onChange={e => setter(e.target.checked)} className="w-4 h-4 accent-cyan-500" />
            <span className={clsx("text-sm font-medium transition", checked ? "text-white" : "text-gray-400 group-hover:text-gray-300")}>{label}</span>
        </label>
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-cyan-900/20 p-4 rounded-2xl border border-cyan-500/20">
                <div className="flex flex-col">
                    <h3 className="text-xl font-black text-cyan-400 flex items-center gap-2">
                        <Trophy size={20} /> Match Scouting: FRC REEFSCAPE
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">Temporada 2025 • Coral & Algae</p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className={clsx(
                        "flex items-center gap-2 px-6 py-2 rounded-xl font-bold transition shadow-lg",
                        isAdding ? "bg-red-500/20 text-red-500 border border-red-500/30" : "bg-cyan-500 text-slate-900 hover:bg-cyan-400"
                    )}
                >
                    {isAdding ? "Cancelar" : <><Plus size={18} /> Nuevo Registro</>}
                </button>
            </div>

            {isAdding && (
                <Card className="p-6 bg-[#0a0f16] border-cyan-500/20 shadow-2xl animate-in slide-in-from-top-4">
                    <div className="flex flex-col gap-8">
                        {/* Upper Section */}
                        <div className="flex flex-col md:flex-row gap-6">
                            <div className="md:w-1/4">
                                <label className="block text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Match Number</label>
                                <input
                                    type="number"
                                    value={matchNum}
                                    onChange={e => setMatchNum(Number(e.target.value))}
                                    className="w-full px-4 py-3 bg-black/50 border border-white/10 rounded-xl text-white font-black text-2xl focus:ring-2 focus:ring-cyan-500 outline-none transition"
                                />
                            </div>
                            <div className="md:w-3/4 flex flex-col justify-end">
                                <Checkbox label="Salió de la zona de inicio (Auto Leave)" checked={autoLeave} setter={setAutoLeave} />
                            </div>
                        </div>

                        {/* Middle Section: Auto vs Teleop */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-white/5 pt-8">
                            {/* Auto Grid */}
                            <div className="space-y-6">
                                <h4 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-cyan-400" /> Autónomo</h4>
                                <div className="space-y-4 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                                    <div className="text-center text-xs font-bold text-gray-600 uppercase">Coral Score (Auto)</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <Counter label="L1" value={autoCoralL1} setter={setAutoCoralL1} color="cyan" />
                                        <Counter label="L2" value={autoCoralL2} setter={setAutoCoralL2} color="cyan" />
                                        <Counter label="L3" value={autoCoralL3} setter={setAutoCoralL3} color="cyan" />
                                        <Counter label="L4" value={autoCoralL4} setter={setAutoCoralL4} color="cyan" />
                                    </div>
                                    <div className="border-t border-white/5 pt-4 grid grid-cols-2 gap-2">
                                        <Counter label="Proc." value={autoAlgaeProcessor} setter={setAutoAlgaeProcessor} color="primary" />
                                        <Counter label="Net" value={autoAlgaeNet} setter={setAutoAlgaeNet} color="primary" />
                                    </div>
                                </div>
                            </div>

                            {/* Teleop Grid */}
                            <div className="space-y-6">
                                <h4 className="text-sm font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-cyan-400" /> TeleOp</h4>
                                <div className="space-y-4 bg-white/[0.02] p-4 rounded-2xl border border-white/5">
                                    <div className="text-center text-xs font-bold text-gray-600 uppercase">Coral Score (Tele)</div>
                                    <div className="grid grid-cols-4 gap-2">
                                        <Counter label="L1" value={teleopCoralL1} setter={setTeleopCoralL1} color="cyan" />
                                        <Counter label="L2" value={teleopCoralL2} setter={setTeleopCoralL2} color="cyan" />
                                        <Counter label="L3" value={teleopCoralL3} setter={setTeleopCoralL3} color="cyan" />
                                        <Counter label="L4" value={teleopCoralL4} setter={setTeleopCoralL4} color="cyan" />
                                    </div>
                                    <div className="border-t border-white/5 pt-4 grid grid-cols-2 gap-2">
                                        <Counter label="Proc." value={teleopAlgaeProcessor} setter={setTeleopAlgaeProcessor} color="primary" />
                                        <Counter label="Net" value={teleopAlgaeNet} setter={setTeleopAlgaeNet} color="primary" />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Lower Section: Attributes & Endgame */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-white/5 pt-8">
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Driver Skill (1-5)</label>
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <button
                                                key={`drive-${s}`}
                                                onClick={() => setDriverSkill(s)}
                                                className={clsx("flex-1 py-3 rounded-xl font-black transition", driverSkill === s ? "bg-cyan-500 text-slate-900 shadow-lg" : "bg-white/5 text-gray-500 hover:bg-white/10")}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Defense Rating (1-5)</label>
                                    <div className="flex gap-2">
                                        {[1, 2, 3, 4, 5].map(s => (
                                            <button
                                                key={`def-${s}`}
                                                onClick={() => setDefenseRating(s)}
                                                className={clsx("flex-1 py-3 rounded-xl font-black transition", defenseRating === s ? "bg-red-500 text-white shadow-lg" : "bg-white/5 text-gray-500 hover:bg-white/10")}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">1 = Nula/Cero defensa, 5 = Defensa asfixiante e impenetrable.</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <h4 className="text-sm font-black text-cyan-400 uppercase tracking-widest">Endgame</h4>
                                <div className="space-y-4">
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest">Climb State (Escindida en la jaula)</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {(['None', 'Shallow', 'Deep'] as const).map(c => (
                                            <button
                                                key={c}
                                                onClick={() => setEndgameClimbState(c)}
                                                className={clsx("py-3 rounded-xl font-black transition border", endgameClimbState === c ? "bg-yellow-500 text-slate-900 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.3)]" : "bg-white/5 border-white/10 text-gray-500 hover:bg-white/10")}
                                            >
                                                {c.toUpperCase()}
                                            </button>
                                        ))}
                                    </div>
                                    <Checkbox label="Parked (No climb)" checked={endgameParked} setter={setEndgameParked} />
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Notas</label>
                            <textarea
                                value={notes}
                                onChange={e => setNotes(e.target.value)}
                                className="w-full h-32 px-4 py-3 bg-black/40 border border-white/10 rounded-xl text-white focus:ring-2 focus:ring-cyan-500 outline-none transition"
                                placeholder="Escribe aquí si el robot se descompuso, causó faltas, o tuvo alguna jugada espectacular."
                            />
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-white/10 sticky bottom-0 bg-[#0a0f16]/90 backdrop-blur-xl p-4 -mx-6 -mb-6 rounded-b-2xl z-20 flex flex-col gap-3">
                        <button
                            onClick={handleSave}
                            className="w-full py-4 bg-cyan-500 hover:bg-cyan-400 text-slate-900 rounded-xl font-black flex items-center justify-center gap-3 shadow-[0_0_30px_rgba(6,182,212,0.3)] transition text-lg"
                        >
                            <Save size={22} />
                            Guardar Scouting Localmente
                        </button>
                        <p className="text-center font-bold text-xs text-yellow-500 flex items-center justify-center gap-1.5 opacity-80">
                            <QrCode size={14} /> Los datos se guardarán en tu dispositivo hasta que los sincronices con el código QR.
                        </p>
                    </div>
                </Card>
            )}

            <div className="grid grid-cols-1 gap-4">
                {entries.length === 0 ? (
                    <div className="text-center py-24 bg-white/[0.02] rounded-2xl border border-white/5 text-gray-500 italic">
                        No hay registros de Reefscape para este equipo.
                    </div>
                ) : (
                    entries.sort((a, b) => b.matchNumber - a.matchNumber).map((item, idx) => {
                        const entry = item as FRCMatchScouting;
                        return (
                            <div key={idx} className="bg-white/[0.03] border border-white/5 rounded-2xl p-6 flex flex-col md:flex-row gap-6">
                                <div className="font-black text-2xl text-cyan-500 w-16">
                                    Q{entry.matchNumber}
                                </div>
                                <div className="flex-1 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-bold">
                                    <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                        <div className="text-gray-500 uppercase tracking-widest text-[9px] mb-1">Total Auto Coral</div>
                                        <div className="text-lg text-white">{(entry.autoCoralL1 ?? 0) + (entry.autoCoralL2 ?? 0) + (entry.autoCoralL3 ?? 0) + (entry.autoCoralL4 ?? 0)}</div>
                                    </div>
                                    <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                        <div className="text-gray-500 uppercase tracking-widest text-[9px] mb-1">Total Tele Coral</div>
                                        <div className="text-lg text-white">{(entry.teleopCoralL1 ?? 0) + (entry.teleopCoralL2 ?? 0) + (entry.teleopCoralL3 ?? 0) + (entry.teleopCoralL4 ?? 0)}</div>
                                    </div>
                                    <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                        <div className="text-gray-500 uppercase tracking-widest text-[9px] mb-1">Climb State</div>
                                        <div className={clsx("text-lg", (entry.endgameClimbState ?? 'None') === 'None' ? "text-gray-500" : "text-yellow-400")}>
                                            {entry.endgameClimbState ?? 'None'}
                                        </div>
                                    </div>
                                    <div className="bg-black/40 p-3 rounded-xl border border-white/5 flex flex-col justify-center">
                                        <div className="text-gray-500 uppercase tracking-widest text-[9px] mb-1">Driver</div>
                                        <div className="text-lg text-green-400">{entry.driverSkill ?? '—'} / 5</div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
}
