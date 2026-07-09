"use client";

import { useState } from "react";
import { useForm, Controller, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AggregatedTeamStats, MatchScouting, CURRENT_GAME_SCHEMA, FTCMatchScouting } from "@/types/scouting";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { DEFAULT_ORG_ID, scoutIdFromUser, scoutNameFromUser } from "@/lib/orgs";
import { useSaveMatchScouting } from "@/lib/hooks/use-scouting-mutations";
import { superScoutingFormSchema, type SuperScoutingFormValues } from "@/lib/schemas/scouting";
import { Card } from "@/components/ui/Card";
import SourceBadge from "@/components/scouting/SourceBadge";
import { useScoutReliabilities } from "@/lib/hooks/use-scout-reliabilities";
import { Save, Star, Shield, Wrench, ThumbsUp, ThumbsDown, Eye, User, Loader2, AlertCircle } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

interface SuperScoutingFormProps {
    team: AggregatedTeamStats;
    entries: MatchScouting[];
}

/**
 * Super scouting form (RHF + Zod).
 *
 * Captures the SUBJECTIVE side of an observation: driver skill, defense
 * effectiveness, reliability, and a "would-pick" flag. Per the federated
 * model (design doc §3.3), subjective fields are kept per-org and NEVER
 * merged across orgs — different teams calibrate the 1-5 scale differently.
 *
 * Stored as a regular match_scouting entry with `scoutingMode: "super"` so
 * the objective aggregator skips it for numeric/categorical counters.
 */
export default function SuperScoutingForm({ team, entries }: SuperScoutingFormProps) {
    const { user, orgId } = useAuth();
    const { season } = useProgram();
    const scoutReliabilities = useScoutReliabilities();
    const [isAdding, setIsAdding] = useState(false);
    const saveMutation = useSaveMatchScouting();

    // RHF replaces ~5 useState calls. Validation, default values, and the
    // submit handler all flow through the schema, which is the single source
    // of truth for what a "valid super-scout entry" looks like.
    // Cast on the resolver: Zod's `.coerce.*` makes input type broader than
    // output (TInput = unknown, TOutput = number), which trips RHF's strict
    // generic match. The runtime behavior is correct.
    const {
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
        reset,
    } = useForm<SuperScoutingFormValues>({
        resolver: zodResolver(superScoutingFormSchema) as Resolver<SuperScoutingFormValues>,
        defaultValues: {
            matchNumber: 1,
            driverSkill: 3,
            defenseRating: 1,
            reliability: 3,
            wouldPick: undefined as unknown as boolean, // force user to choose
            notes: "",
        },
    });

    const onSubmit = async (values: SuperScoutingFormValues) => {
        if (!user) {
            toast.error("Debes iniciar sesión");
            return;
        }
        const scoutId = scoutIdFromUser(user);
        const scoutName = scoutNameFromUser(user);
        const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;
        const eventCode = team.events[0]?.eventCode || "MXTOL";

        // Super entry: numeric/categorical counters intentionally left undefined.
        const payload: Partial<FTCMatchScouting> & {
            teamNumber: number;
            eventCode: string;
            matchNumber: number;
            season: number;
            program: 'FTC';
            notes: string;
            timestamp: null;
        } = {
            teamNumber: team.teamNumber,
            eventCode,
            matchNumber: values.matchNumber,
            program: "FTC",
            season,
            orgId: effectiveOrgId,
            scoutId,
            scoutName,
            scouterId: scoutId,
            scouterName: scoutName,
            confidence: "high",
            gameSchemaVersion: CURRENT_GAME_SCHEMA.FTC,
            scoutingMode: "super",
            driverSkill: values.driverSkill,
            defenseRating: values.defenseRating,
            reliability: values.reliability,
            wouldPick: values.wouldPick,
            notes: values.notes,
            timestamp: null,
        };

        await saveMutation.mutateAsync(payload as MatchScouting);
        toast.success(`Observación M#${values.matchNumber} guardada`);

        // Reset for next observation, auto-increment match number
        const nextMatch = values.matchNumber + 1;
        reset({
            matchNumber: nextMatch,
            driverSkill: 3,
            defenseRating: 1,
            reliability: 3,
            wouldPick: undefined as unknown as boolean,
            notes: "",
        });
        setIsAdding(false);
    };

    const superEntries = entries.filter(e => (e.scoutingMode ?? "match") === "super");

    return (
        <div className="space-y-6">
            <Card className="p-6 bg-gradient-to-br from-purple-950/30 to-black border-purple-500/20">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Eye className="text-purple-400" size={20} />
                            <h2 className="text-2xl font-black text-white">Super Scouting</h2>
                            <span className="px-2 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[10px] font-black uppercase tracking-wider border border-purple-500/30">
                                Subjetivo
                            </span>
                        </div>
                        <p className="text-xs text-purple-200/60 max-w-md leading-relaxed">
                            Captura impresiones cualitativas. Tus valoraciones <strong>quedan dentro de tu equipo</strong>; otros equipos ven sus propias escalas por separado.
                        </p>
                    </div>
                    {!isAdding && (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="min-h-[44px] px-4 py-2 bg-purple-500 hover:bg-purple-400 active:scale-[0.98] text-white font-bold rounded-lg flex items-center gap-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40"
                        >
                            <Star size={16} /> Nueva observación
                        </button>
                    )}
                </div>

                <SourceBadge entries={superEntries} scoutReliabilities={scoutReliabilities} className="mb-2" />
            </Card>

            {isAdding && (
                <form onSubmit={handleSubmit(onSubmit)}>
                    <Card className="p-6 bg-white/[0.03] border-white/10 space-y-6">
                        <div className="flex items-center gap-4">
                            <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                                Match #
                            </label>
                            <Controller
                                name="matchNumber"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        type="number"
                                        min={1}
                                        className="w-20 px-3 py-1.5 bg-black/40 border border-white/10 rounded text-white text-center font-bold"
                                    />
                                )}
                            />
                            {errors.matchNumber && (
                                <span className="text-xs text-red-400">{errors.matchNumber.message}</span>
                            )}
                        </div>

                        <Controller
                            name="driverSkill"
                            control={control}
                            render={({ field }) => (
                                <StarPicker
                                    label="Driver Skill"
                                    icon={<User size={14} />}
                                    value={field.value}
                                    onChange={field.onChange}
                                    helperText="¿Qué tan bien manejaba el robot?"
                                />
                            )}
                        />
                        <Controller
                            name="defenseRating"
                            control={control}
                            render={({ field }) => (
                                <StarPicker
                                    label="Defense"
                                    icon={<Shield size={14} />}
                                    value={field.value}
                                    onChange={field.onChange}
                                    helperText="¿Qué tan efectivos son jugando defensa?"
                                />
                            )}
                        />
                        <Controller
                            name="reliability"
                            control={control}
                            render={({ field }) => (
                                <StarPicker
                                    label="Reliability"
                                    icon={<Wrench size={14} />}
                                    value={field.value}
                                    onChange={field.onChange}
                                    helperText="¿Tuvo problemas mecánicos / desconexiones?"
                                />
                            )}
                        />

                        <div className="space-y-2">
                            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                                ¿Lo escogerías en alliance selection?
                            </div>
                            <Controller
                                name="wouldPick"
                                control={control}
                                render={({ field }) => (
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => field.onChange(true)}
                                            className={clsx(
                                                "flex-1 py-3 rounded-lg border font-bold flex items-center justify-center gap-2 transition-all",
                                                field.value === true
                                                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                                                    : "bg-black/20 border-white/10 text-gray-500 hover:border-emerald-500/30",
                                            )}
                                        >
                                            <ThumbsUp size={16} /> Sí
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => field.onChange(false)}
                                            className={clsx(
                                                "flex-1 py-3 rounded-lg border font-bold flex items-center justify-center gap-2 transition-all",
                                                field.value === false
                                                    ? "bg-red-500/20 border-red-500/50 text-red-300"
                                                    : "bg-black/20 border-white/10 text-gray-500 hover:border-red-500/30",
                                            )}
                                        >
                                            <ThumbsDown size={16} /> No
                                        </button>
                                    </div>
                                )}
                            />
                            {errors.wouldPick && (
                                <span className="text-xs text-red-400">{errors.wouldPick.message}</span>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                                Notas
                            </label>
                            <Controller
                                name="notes"
                                control={control}
                                render={({ field }) => (
                                    <textarea
                                        {...field}
                                        placeholder="Ej: 'Driver tarda en reaccionar pero el robot tiene buen ciclo'"
                                        className="w-full h-24 px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-purple-500/50 placeholder:text-gray-600"
                                    />
                                )}
                            />
                            {errors.notes && (
                                <span className="text-xs text-red-400">{errors.notes.message}</span>
                            )}
                        </div>

                        {saveMutation.isError && (
                            <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs">
                                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                                <span>
                                    Error al guardar: {String((saveMutation.error as Error)?.message ?? saveMutation.error)}
                                </span>
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg font-bold text-sm"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || saveMutation.isPending}
                                className="flex-1 min-h-[44px] py-2.5 bg-purple-500 hover:bg-purple-400 active:scale-[0.98] disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40"
                            >
                                {isSubmitting || saveMutation.isPending ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <Save size={16} />
                                )}
                                {isSubmitting || saveMutation.isPending ? "Guardando..." : "Guardar observación"}
                            </button>
                        </div>
                    </Card>
                </form>
            )}

            <div className="space-y-3">
                {superEntries.length === 0 ? (
                    <div className="text-center py-12 bg-white/[0.02] rounded-xl border border-dashed border-white/10 text-gray-500 flex flex-col items-center gap-3">
                        <Eye size={32} className="opacity-20" />
                        <div>
                            <p className="text-sm text-gray-400 font-medium">Sin observaciones cualitativas</p>
                            <p className="text-xs mt-0.5 opacity-70">
                                Driver skill, defense y &quot;would-pick&quot; alimentan la lista de alianzas.
                            </p>
                        </div>
                        {!isAdding && (
                            <button
                                type="button"
                                onClick={() => setIsAdding(true)}
                                className="px-4 py-1.5 bg-purple-500 hover:bg-purple-400 text-white text-xs font-bold rounded-lg flex items-center gap-2"
                            >
                                <Star size={12} /> Primera observación
                            </button>
                        )}
                    </div>
                ) : (
                    superEntries
                        .sort((a, b) => b.matchNumber - a.matchNumber)
                        .map((raw, i) => {
                            const e = raw as FTCMatchScouting;
                            return (
                                <Card key={i} className="p-4 bg-white/[0.02] border-white/5">
                                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                        <div className="flex items-center gap-3">
                                            <div className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-[10px] font-black tracking-tighter">
                                                M#{e.matchNumber}
                                            </div>
                                            {e.orgId && (
                                                <div className="px-2 py-0.5 bg-white/5 border border-white/10 text-gray-400 rounded text-[10px] font-black tracking-wider uppercase">
                                                    #{e.orgId}
                                                </div>
                                            )}
                                            <span className="text-xs text-gray-500">
                                                {e.scoutName ?? e.scouterName}
                                            </span>
                                        </div>
                                        {e.wouldPick !== undefined && (
                                            <span
                                                className={clsx(
                                                    "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
                                                    e.wouldPick
                                                        ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                                                        : "bg-red-500/15 text-red-300 border border-red-500/30",
                                                )}
                                            >
                                                {e.wouldPick ? "Pick" : "Skip"}
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 text-xs">
                                        <RatingBadge label="Driver" value={e.driverSkill} icon={<User size={12} />} />
                                        <RatingBadge label="Defense" value={e.defenseRating} icon={<Shield size={12} />} />
                                        <RatingBadge label="Reliability" value={e.reliability} icon={<Wrench size={12} />} />
                                    </div>
                                    {e.notes && e.notes.trim().length > 0 && (
                                        <p className="mt-3 text-xs text-gray-400 italic leading-relaxed border-l-2 border-purple-500/30 pl-3">
                                            {e.notes}
                                        </p>
                                    )}
                                </Card>
                            );
                        })
                )}
            </div>
        </div>
    );
}

function StarPicker({
    label,
    icon,
    value,
    onChange,
    helperText,
}: {
    label: string;
    icon: React.ReactNode;
    value: number;
    onChange: (v: number) => void;
    helperText?: string;
}) {
    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <label className="text-[10px] text-gray-400 uppercase font-bold tracking-wider flex items-center gap-2">
                    {icon}
                    {label}
                </label>
                {helperText && (
                    <span className="text-[10px] text-gray-600 italic">{helperText}</span>
                )}
            </div>
            <div className="flex gap-1">
                {[1, 2, 3, 4, 5].map(star => (
                    <button
                        key={star}
                        type="button"
                        onClick={() => onChange(star)}
                        className={clsx(
                            "flex-1 py-3 rounded-lg border font-black text-lg transition-all",
                            star <= value
                                ? "bg-purple-500/20 border-purple-500/50 text-purple-200"
                                : "bg-black/20 border-white/10 text-gray-600 hover:border-purple-500/30",
                        )}
                    >
                        {star}
                    </button>
                ))}
            </div>
        </div>
    );
}

function RatingBadge({
    label,
    value,
    icon,
}: {
    label: string;
    value: number | undefined;
    icon: React.ReactNode;
}) {
    if (value === undefined) {
        return (
            <div className="p-2 bg-black/40 rounded-lg border border-white/5 text-gray-600 flex items-center gap-2">
                {icon}
                <div>
                    <div className="text-[9px] uppercase tracking-wider">{label}</div>
                    <div className="text-sm font-bold">—</div>
                </div>
            </div>
        );
    }
    return (
        <div className="p-2 bg-black/40 rounded-lg border border-white/5 flex items-center gap-2">
            {icon}
            <div>
                <div className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</div>
                <div className="text-sm font-bold text-white">{value}/5</div>
            </div>
        </div>
    );
}
