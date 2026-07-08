"use client";

import { useState } from "react";
import { useForm, Controller, useController, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AggregatedTeamStats, MatchScouting, CURRENT_GAME_SCHEMA } from "@/types/scouting";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { DEFAULT_ORG_ID, scoutIdFromUser, scoutNameFromUser } from "@/lib/orgs";
import { useSaveMatchScouting } from "@/lib/hooks/use-scouting-mutations";
import { ftcIntoTheDeepFormSchema, type FTCIntoTheDeepFormValues } from "@/lib/schemas/scouting";
import { Card } from "@/components/ui/Card";
import { Save, Plus, User, Trophy, Minus, ClipboardList, Loader2, AlertCircle } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

interface MatchScoutingFormProps {
    team: AggregatedTeamStats;
    entries: MatchScouting[];
}

const DEFAULTS: FTCIntoTheDeepFormValues = {
    matchNumber: 1,
    autoLaunchLine: false,
    autoPurpleArtifacts: 0,
    autoGreenArtifacts: 0,
    autoMotifStarted: false,
    movementRP: false,
    teleopPurpleArtifacts: 0,
    teleopGreenArtifacts: 0,
    patternsCompleted: 0,
    gatesUsed: false,
    driverSkill: 3,
    endgameBaseParking: "None",
    dualParking: false,
    motifCompleted: false,
    goalRP: false,
    patternRP: false,
    notes: "",
};

/**
 * FTC Into-The-Deep (DECODE) match scouting form (RHF + Zod).
 *
 * Why this matters for perf: the previous useState version re-rendered the
 * whole form on every keystroke and counter tick. RHF keeps inputs
 * uncontrolled and only triggers re-renders for the specific Controllers
 * that subscribe — important on slower tablets in the venue.
 */
export default function FTC_IntoTheDeepForm({ team, entries }: MatchScoutingFormProps) {
    const { user, orgId } = useAuth();
    const { season } = useProgram();
    const [isAdding, setIsAdding] = useState(false);
    const saveMutation = useSaveMatchScouting();

    // See SuperScoutingForm for the `as any` rationale (Zod coerce TInput/TOutput mismatch).
    const {
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
        reset,
        getValues,
    } = useForm<FTCIntoTheDeepFormValues>({
        resolver: zodResolver(ftcIntoTheDeepFormSchema) as any,
        defaultValues: DEFAULTS,
    });

    const onSubmit = async (values: FTCIntoTheDeepFormValues) => {
        if (!user) {
            toast.error("Debes iniciar sesión");
            return;
        }
        const eventCode = team.events[0]?.eventCode || "MXTOL";
        const scoutId = scoutIdFromUser(user);
        const scoutName = scoutNameFromUser(user);
        const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;

        await saveMutation.mutateAsync({
            teamNumber: team.teamNumber,
            eventCode,
            program: "FTC",
            season,
            orgId: effectiveOrgId,
            scoutId,
            scoutName,
            scouterId: scoutId,
            scouterName: scoutName,
            confidence: "high",
            gameSchemaVersion: CURRENT_GAME_SCHEMA.FTC,
            matchNumber: values.matchNumber,
            autoParked: values.endgameBaseParking !== "None",
            autoLaunchLine: values.autoLaunchLine,
            autoPurpleArtifacts: values.autoPurpleArtifacts,
            autoGreenArtifacts: values.autoGreenArtifacts,
            autoMotifStarted: values.autoMotifStarted,
            movementRP: values.movementRP,
            autoPoints: 0,
            teleopPurpleArtifacts: values.teleopPurpleArtifacts,
            teleopGreenArtifacts: values.teleopGreenArtifacts,
            patternsCompleted: values.patternsCompleted,
            gatesUsed: values.gatesUsed,
            driverSkill: values.driverSkill,
            endgameBaseParking: values.endgameBaseParking,
            dualParking: values.dualParking,
            motifCompleted: values.motifCompleted,
            goalRP: values.goalRP,
            patternRP: values.patternRP,
            notes: values.notes,
            timestamp: null,
        } as MatchScouting);

        toast.success(`Match #${values.matchNumber} guardado`);
        setIsAdding(false);
        // Reset for next observation, auto-increment match number
        reset({ ...DEFAULTS, matchNumber: values.matchNumber + 1 });
    };

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
                    type="button"
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
                <form onSubmit={handleSubmit(onSubmit)}>
                    <Card className="p-6 bg-white/[0.02] border-primary/20 animate-in slide-in-from-top duration-300 shadow-2xl">
                        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                            {/* Config & Auto */}
                            <div className="space-y-6 lg:col-span-1 border-r border-white/5 pr-6">
                                <div className="pb-4 border-b border-white/5">
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Match Number</label>
                                    <Controller
                                        name="matchNumber"
                                        control={control}
                                        render={({ field }) => (
                                            <input
                                                {...field}
                                                type="number"
                                                className="w-full px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white font-bold text-xl focus:ring-2 focus:ring-primary outline-none"
                                            />
                                        )}
                                    />
                                    {errors.matchNumber && (
                                        <p className="text-xs text-red-400 mt-1">{errors.matchNumber.message}</p>
                                    )}
                                </div>

                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold text-primary uppercase tracking-widest">Periodo Autónomo</h4>
                                    <BooleanCheckbox control={control} name="autoLaunchLine" label="Salió Launch Line" />
                                    <BooleanCheckbox control={control} name="autoMotifStarted" label="Detectó Motif Pattern" />
                                    <div className="grid grid-cols-2 gap-2">
                                        <Counter control={control} name="autoPurpleArtifacts" label="Purple Art." color="purple" />
                                        <Counter control={control} name="autoGreenArtifacts" label="Green Art." color="green" />
                                    </div>
                                    <BooleanCheckbox control={control} name="movementRP" label="Movement RP Achieved" />
                                </div>
                            </div>

                            {/* Teleop */}
                            <div className="space-y-6 lg:col-span-2 px-2">
                                <h4 className="text-xs font-bold text-primary uppercase tracking-widest">Driver Controlled (TeleOp)</h4>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
                                    <Counter control={control} name="teleopPurpleArtifacts" label="Purple Artifacts" color="purple" />
                                    <Counter control={control} name="teleopGreenArtifacts" label="Green Artifacts" color="green" />
                                    <Counter control={control} name="patternsCompleted" label="Patrones/Motifs" />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <BooleanCheckbox control={control} name="gatesUsed" label="Usó Gates (Limpieza Rampa)" />
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Driver Skill (1-5)</label>
                                        <Controller
                                            name="driverSkill"
                                            control={control}
                                            render={({ field }) => (
                                                <div className="flex gap-2">
                                                    {[1, 2, 3, 4, 5].map(s => (
                                                        <button
                                                            key={s}
                                                            type="button"
                                                            onClick={() => field.onChange(s)}
                                                            className={clsx(
                                                                "flex-1 py-2 rounded-lg font-bold transition-all border",
                                                                field.value === s
                                                                    ? "bg-primary border-primary text-white"
                                                                    : "bg-white/5 border-white/10 text-gray-500 hover:border-white/30"
                                                            )}
                                                        >
                                                            {s}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        />
                                    </div>
                                </div>

                                <div className="mt-6">
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase mb-2">Notas Críticas del Partido</label>
                                    <Controller
                                        name="notes"
                                        control={control}
                                        render={({ field }) => (
                                            <textarea
                                                {...field}
                                                className="w-full h-32 px-4 py-2 bg-black/40 border border-white/10 rounded-lg text-white text-sm focus:ring-2 focus:ring-primary outline-none"
                                                placeholder="Ej: Problemas de conexión en el minuto 1:20, defensa muy agresiva..."
                                            />
                                        )}
                                    />
                                </div>
                            </div>

                            {/* Endgame */}
                            <div className="space-y-6 lg:col-span-1 border-l border-white/5 pl-6">
                                <h4 className="text-xs font-bold text-primary uppercase tracking-widest">Endgame & Rankings</h4>

                                <div className="space-y-3">
                                    <label className="block text-[10px] font-bold text-gray-500 uppercase">Base Parking</label>
                                    <Controller
                                        name="endgameBaseParking"
                                        control={control}
                                        render={({ field }) => (
                                            <div className="grid grid-cols-3 gap-1">
                                                {(['None', 'Partial', 'Full'] as const).map(p => (
                                                    <button
                                                        key={p}
                                                        type="button"
                                                        onClick={() => field.onChange(p)}
                                                        className={clsx(
                                                            "py-2 text-[10px] font-bold rounded border transition-all",
                                                            field.value === p
                                                                ? "bg-white text-black border-white"
                                                                : "bg-white/5 border-white/10 text-gray-500"
                                                        )}
                                                    >
                                                        {p === 'None' ? 'N/A' : p === 'Partial' ? 'Parc.' : 'Full'}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    />
                                </div>

                                <div className="space-y-3 pt-2">
                                    <BooleanCheckbox control={control} name="dualParking" label="Dual Parking (Aliado)" />
                                    <BooleanCheckbox control={control} name="motifCompleted" label="Motif Final Completado" />
                                </div>

                                <div className="pt-4 space-y-3 border-t border-white/5">
                                    <label className="text-[10px] font-bold text-yellow-500/70 uppercase">Potential RP Tracker</label>
                                    <BooleanCheckbox control={control} name="goalRP" label="Possible Goal RP" />
                                    <BooleanCheckbox control={control} name="patternRP" label="Possible Pattern RP" />
                                </div>
                            </div>
                        </div>

                        {saveMutation.isError && (
                            <div className="mt-4 flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs">
                                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                                <span>Error al guardar: {String((saveMutation.error as Error)?.message ?? saveMutation.error)}</span>
                            </div>
                        )}

                        <div className="mt-8 pt-6 border-t border-white/10 sticky bottom-0 bg-background/80 backdrop-blur-md p-4 -mx-6 -mb-6 rounded-b-xl z-20 border-t-0 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.5)]">
                            <button
                                type="submit"
                                disabled={isSubmitting || saveMutation.isPending}
                                className="w-full py-4 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-3 shadow-2xl transition-all text-lg group active:scale-[0.98]"
                            >
                                {isSubmitting || saveMutation.isPending ? (
                                    <Loader2 size={22} className="animate-spin" />
                                ) : (
                                    <Save size={22} className="group-hover:scale-110 transition-transform" />
                                )}
                                {isSubmitting || saveMutation.isPending ? "Guardando..." : "Finalizar y Guardar Scouting"}
                            </button>
                        </div>
                    </Card>
                </form>
            )}

            <div className="grid grid-cols-1 gap-4">
                {entries.length === 0 ? (
                    <div className="text-center py-16 bg-white/[0.02] rounded-2xl border border-dashed border-white/10 text-gray-500 flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                            <ClipboardList size={32} className="opacity-30" />
                        </div>
                        <div>
                            <p className="font-medium text-gray-400">
                                Sin observaciones para este equipo
                            </p>
                            <p className="text-xs mt-1 opacity-70">
                                Captura el primer match para empezar el análisis del robot.
                            </p>
                        </div>
                        {!isAdding && (
                            <button
                                type="button"
                                onClick={() => setIsAdding(true)}
                                className="px-5 py-2 bg-primary hover:bg-primary/90 text-white text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                            >
                                <Plus size={14} /> Capturar primera observación
                            </button>
                        )}
                    </div>
                ) : (
                    entries.sort((a, b) => b.matchNumber - a.matchNumber).map((item, idx) => {
                        const entry = item as import("@/types/scouting").FTCMatchScouting;
                        return (
                            <div key={idx} className="bg-white/[0.03] border border-white/10 rounded-2xl p-6 hover:bg-white/[0.05] transition-all relative overflow-hidden group">
                                <div className="absolute top-0 left-0 w-1 h-full bg-primary/30 group-hover:bg-primary transition-colors" />

                                <div className="flex flex-col md:flex-row justify-between gap-6">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-4 flex-wrap">
                                            <div className="px-3 py-1 bg-primary/20 text-primary rounded-md text-xs font-black tracking-tighter">
                                                MATCH #{entry.matchNumber}
                                            </div>
                                            {entry.orgId && (
                                                <div className="px-2 py-0.5 bg-white/5 border border-white/10 text-gray-400 rounded text-[10px] font-black tracking-wider uppercase">
                                                    #{entry.orgId}
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 text-gray-500 text-xs font-medium">
                                                <User size={14} className="opacity-50" />
                                                {entry.scoutName ?? entry.scouterName}
                                                <span className="opacity-30">•</span>
                                                {entry.timestamp?.seconds
                                                    ? new Date(entry.timestamp.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                    : "..."}
                                            </div>
                                            {(() => {
                                                const otherEntries = entries.filter(
                                                    other =>
                                                        other !== item &&
                                                        other.matchNumber === entry.matchNumber &&
                                                        other.teamNumber === entry.teamNumber,
                                                );
                                                if (otherEntries.length === 0) return null;
                                                return (
                                                    <div
                                                        className="px-2 py-0.5 bg-amber-500/15 text-amber-400 border border-amber-500/30 rounded text-[10px] font-bold uppercase tracking-wider"
                                                        title={`Otra(s) ${otherEntries.length} observación(es) existen para este match-equipo`}
                                                    >
                                                        +{otherEntries.length} obs
                                                    </div>
                                                );
                                            })()}
                                        </div>

                                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                            <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                                <span className="block text-[9px] text-gray-500 font-bold uppercase mb-1">Auto Pts (Est)</span>
                                                <div className="flex items-baseline gap-1">
                                                    <span className="text-xl font-black text-white">{(entry.autoPurpleArtifacts ?? 0) + (entry.autoGreenArtifacts ?? 0) > 0 ? '✓' : '0'}</span>
                                                    {entry.autoMotifStarted && <span className="text-[10px] text-primary font-bold">MOTIF</span>}
                                                </div>
                                            </div>
                                            <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                                <span className="block text-[9px] text-gray-500 font-bold uppercase mb-1">Artifacts Total</span>
                                                <div className="flex items-end gap-2">
                                                    <span className="text-xl font-black text-white">{(entry.teleopPurpleArtifacts ?? 0) + (entry.teleopGreenArtifacts ?? 0)}</span>
                                                    <span className="text-[10px] text-purple-400 font-bold">P:{entry.teleopPurpleArtifacts ?? 0}</span>
                                                    <span className="text-[10px] text-green-400 font-bold">G:{entry.teleopGreenArtifacts ?? 0}</span>
                                                </div>
                                            </div>
                                            <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                                <span className="block text-[9px] text-gray-500 font-bold uppercase mb-1">Patterns</span>
                                                <span className="text-xl font-black text-white">{entry.patternsCompleted ?? 0}</span>
                                            </div>
                                            <div className="bg-black/40 p-3 rounded-xl border border-white/5">
                                                <span className="block text-[9px] text-gray-500 font-bold uppercase mb-1">Endgame</span>
                                                <div className="flex items-center gap-2">
                                                    <span className={clsx("text-xs font-bold", (entry.endgameBaseParking ?? 'None') !== 'None' ? "text-green-400" : "text-red-400")}>
                                                        {entry.endgameBaseParking ?? 'None'}
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
                                                {[1, 2, 3, 4, 5].map(star => {
                                                    const skill = entry.driverSkill ?? 3;
                                                    return (
                                                        <div
                                                            key={star}
                                                            className={clsx(
                                                                "h-2 flex-1 rounded-full",
                                                                star <= skill
                                                                    ? (skill >= 4 ? "bg-green-500" : skill >= 2 ? "bg-primary" : "bg-red-500")
                                                                    : "bg-white/5"
                                                            )}
                                                        />
                                                    );
                                                })}
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
                        );
                    })
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Controllers — small reusable form pieces that wrap the existing visual
// design without re-introducing useState. Each only re-renders when its own
// field changes.
// ---------------------------------------------------------------------------

function Counter({
    control,
    name,
    label,
    color = "primary",
}: {
    control: Control<FTCIntoTheDeepFormValues>;
    name: keyof FTCIntoTheDeepFormValues;
    label: string;
    color?: "primary" | "purple" | "green";
}) {
    const { field } = useController({ control, name: name as any });
    const value = (field.value as number) ?? 0;
    return (
        <div className="flex flex-col gap-1">
            <label className="text-[10px] font-bold text-gray-500 uppercase">{label}</label>
            <div className="flex items-center gap-3 bg-black/40 p-1 rounded-lg border border-white/5">
                <button
                    type="button"
                    onClick={() => field.onChange(Math.max(0, value - 1))}
                    className="p-4 bg-white/5 rounded-md hover:bg-white/10 text-gray-400 active:bg-white/20 transition-colors"
                >
                    <Minus size={16} />
                </button>
                <span className={clsx(
                    "text-xl font-black w-12 text-center",
                    color === "purple" ? "text-purple-400" : color === "green" ? "text-green-400" : "text-white"
                )}>
                    {value}
                </span>
                <button
                    type="button"
                    onClick={() => field.onChange(value + 1)}
                    className="p-4 bg-white/5 rounded-md hover:bg-white/10 text-gray-400 active:bg-white/20 transition-colors"
                >
                    <Plus size={16} />
                </button>
            </div>
        </div>
    );
}

function BooleanCheckbox({
    control,
    name,
    label,
}: {
    control: Control<FTCIntoTheDeepFormValues>;
    name: keyof FTCIntoTheDeepFormValues;
    label: string;
}) {
    const { field } = useController({ control, name: name as any });
    const checked = !!field.value;
    return (
        <label className={clsx(
            "flex items-center gap-3 p-3 rounded-lg border transition-all cursor-pointer group",
            checked ? "bg-primary/20 border-primary/50" : "bg-white/5 border-white/10 hover:border-white/20"
        )}>
            <input
                type="checkbox"
                checked={checked}
                onChange={e => field.onChange(e.target.checked)}
                className="w-4 h-4 accent-primary"
            />
            <span className={clsx(
                "text-sm font-medium transition-colors",
                checked ? "text-white" : "text-gray-400 group-hover:text-gray-300"
            )}>
                {label}
            </span>
        </label>
    );
}
