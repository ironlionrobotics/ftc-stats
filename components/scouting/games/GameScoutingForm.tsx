"use client";

import { useState } from "react";
import { useForm, Controller, type Resolver, type Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { AggregatedTeamStats, MatchScouting, CURRENT_GAME_SCHEMA } from "@/types/scouting";
import type { GameDefinition, GameField } from "@/types/game-definition";
import { defaultsForDefinition } from "@/types/game-definition";
import { zodSchemaFromDefinition } from "@/lib/games/zod-from-definition";
import { buildEntryGameFields } from "@/lib/games/build-entry";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { DEFAULT_ORG_ID, scoutIdFromUser, scoutNameFromUser } from "@/lib/orgs";
import { useSaveMatchScouting, type MatchScoutingSaveResult } from "@/lib/hooks/use-scouting-mutations";
import DynamicGameForm from "./DynamicGameForm";
import { Card } from "@/components/ui/Card";
import { Save, Plus, User, Trophy, ClipboardList, Loader2, AlertCircle } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { guessActiveEventCode } from "@/lib/active-event";

interface GameScoutingFormProps {
    definition: GameDefinition;
    team: AggregatedTeamStats;
    entries: MatchScouting[];
}

type FormValues = Record<string, unknown>;

/**
 * Declarative match-scouting form: the same capture/save/list behaviour the
 * hand-written per-game forms had, driven entirely by a GameDefinition. The
 * field surface is rendered by DynamicGameForm; the Zod schema comes from
 * zodSchemaFromDefinition; the entry mapping (including derived fields) comes
 * from buildEntryGameFields + def.toEntry. Adding the 2026-2027 game is then a
 * single new definition file — no React changes. See
 * docs/architecture/game-schema-migration.md.
 *
 * `matchNumber` is universal (not a per-game field), so it's added to the
 * schema and rendered here rather than in the definition.
 */
export default function GameScoutingForm({ definition, team, entries }: GameScoutingFormProps) {
    const { user, orgId } = useAuth();
    const { season } = useProgram();
    const [isAdding, setIsAdding] = useState(false);
    const saveMutation = useSaveMatchScouting();

    // Definition schema + the universal matchNumber. Mirrors the shared
    // `matchNumber` primitive in lib/schemas/scouting.ts.
    const schema = zodSchemaFromDefinition(definition).extend({
        matchNumber: z.coerce.number().int().positive("Match # debe ser positivo"),
    });

    const defaults: FormValues = { ...defaultsForDefinition(definition), matchNumber: 1 };

    // Resolver cast: Zod coerce makes TInput/TOutput diverge (same rationale as
    // the hand-written forms). Values are validated at submit regardless.
    const {
        control,
        handleSubmit,
        formState: { errors, isSubmitting },
        reset,
    } = useForm<FormValues>({
        resolver: zodResolver(schema) as Resolver<FormValues>,
        defaultValues: defaults,
    });

    const onSubmit = async (values: FormValues) => {
        if (!user) {
            toast.error("Debes iniciar sesión");
            return;
        }
        const eventCode = guessActiveEventCode([team]) ?? "MXTOL";
        const scoutId = scoutIdFromUser(user);
        const scoutName = scoutNameFromUser(user);
        const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;
        const matchNumber = values.matchNumber as number;

        const entry = {
            teamNumber: team.teamNumber,
            eventCode,
            program: definition.program,
            season,
            orgId: effectiveOrgId,
            scoutId,
            scoutName,
            scouterId: scoutId,
            scouterName: scoutName,
            confidence: "high",
            gameSchemaVersion: CURRENT_GAME_SCHEMA[definition.program],
            matchNumber,
            ...buildEntryGameFields(definition, values),
            timestamp: null,
        } as MatchScouting;

        let result: MatchScoutingSaveResult;
        try {
            result = await saveMutation.mutateAsync(entry);
        } catch (e) {
            console.error("[scouting] save failed completely:", e);
            toast.error(`No se pudo guardar el match #${matchNumber} — revisa e intenta de nuevo`);
            return;
        }

        if (result.savedTo === "local") {
            toast.success(`Match #${matchNumber} guardado offline — se sincronizará al volver la conexión`);
        } else {
            toast.success(`Match #${matchNumber} guardado`);
        }
        setIsAdding(false);
        reset({ ...defaults, matchNumber: matchNumber + 1 });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex flex-col">
                    <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                        <Trophy className="text-primary" /> Match Scouting: {definition.label}
                    </h3>
                    <p className="text-xs text-muted-foreground">Temporada {definition.season}-{definition.season + 1}</p>
                </div>
                <button
                    type="button"
                    onClick={() => setIsAdding(!isAdding)}
                    className={clsx(
                        "flex items-center gap-2 px-6 py-2 rounded-lg font-bold transition-all shadow-lg",
                        isAdding ? "bg-danger/20 text-danger border border-danger/50" : "bg-primary text-primary-foreground"
                    )}
                >
                    {isAdding ? "Cancelar" : <><Plus size={18} /> Nuevo Registro</>}
                </button>
            </div>

            {isAdding && (
                <form onSubmit={handleSubmit(onSubmit)}>
                    <Card className="p-6 bg-muted border-primary/20 animate-in slide-in-from-top duration-300 shadow-sm space-y-4">
                        <div>
                            <label className="block text-[10px] font-bold text-muted-foreground uppercase mb-2">Match Number</label>
                            <Controller
                                name="matchNumber"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        value={(field.value as number) ?? 1}
                                        type="number"
                                        className="w-40 px-4 py-2 bg-muted border border-border rounded-lg text-foreground font-bold text-xl focus:ring-2 focus:ring-primary outline-none"
                                    />
                                )}
                            />
                            {errors.matchNumber && (
                                <p className="text-xs text-danger mt-1">{String(errors.matchNumber.message)}</p>
                            )}
                        </div>

                        <DynamicGameForm
                            definition={definition}
                            control={control as unknown as Control<Record<string, unknown>>}
                        />

                        {saveMutation.isError && (
                            <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">
                                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                                <span>Error al guardar: {String((saveMutation.error as Error)?.message ?? saveMutation.error)}</span>
                            </div>
                        )}

                        <div className="pt-4 border-t border-border">
                            <button
                                type="submit"
                                disabled={isSubmitting || saveMutation.isPending}
                                className="w-full py-4 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-3 shadow-sm transition-all text-lg group active:scale-[0.98]"
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

            <EntriesList definition={definition} team={team} entries={entries} onAdd={() => setIsAdding(true)} isAdding={isAdding} />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Generic entry list — renders any definition's captured observations. The
// hand-written forms had bespoke stat cards per game; the generic renderer
// shows each declared field with its value, which works for every season.
// ---------------------------------------------------------------------------

function EntriesList({
    definition,
    entries,
    onAdd,
    isAdding,
}: {
    definition: GameDefinition;
    team: AggregatedTeamStats;
    entries: MatchScouting[];
    onAdd: () => void;
    isAdding: boolean;
}) {
    if (entries.length === 0) {
        return (
            <div className="text-center py-16 bg-muted rounded-2xl border border-dashed border-border text-muted-foreground flex flex-col items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
                    <ClipboardList size={32} className="opacity-30" />
                </div>
                <div>
                    <p className="font-medium text-muted-foreground">Sin observaciones para este equipo</p>
                    <p className="text-xs mt-1 opacity-70">Captura el primer match para empezar el análisis del robot.</p>
                </div>
                {!isAdding && (
                    <button
                        type="button"
                        onClick={onAdd}
                        className="px-5 py-2 bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-bold rounded-lg flex items-center gap-2 transition-colors"
                    >
                        <Plus size={14} /> Capturar primera observación
                    </button>
                )}
            </div>
        );
    }

    const sorted = [...entries].sort((a, b) => b.matchNumber - a.matchNumber);

    return (
        <div className="grid grid-cols-1 gap-4">
            {sorted.map((entry, idx) => {
                const record = entry as unknown as Record<string, unknown>;
                return (
                    <div key={idx} className="bg-muted border border-border rounded-2xl p-6 relative overflow-hidden group">
                        <div className="absolute top-0 left-0 w-1 h-full bg-primary/30 group-hover:bg-primary transition-colors" />
                        <div className="flex items-center gap-3 mb-4 flex-wrap">
                            <div className="px-3 py-1 bg-primary/20 text-primary rounded-md text-xs font-black tracking-tighter">
                                MATCH #{entry.matchNumber}
                            </div>
                            {entry.orgId && (
                                <div className="px-2 py-0.5 bg-muted border border-border text-muted-foreground rounded text-[10px] font-black tracking-wider uppercase">
                                    #{entry.orgId}
                                </div>
                            )}
                            <div className="flex items-center gap-2 text-muted-foreground text-xs font-medium">
                                <User size={14} className="opacity-50" />
                                {entry.scoutName ?? entry.scouterName}
                                <span className="opacity-30">•</span>
                                {entry.timestamp?.seconds
                                    ? new Date(entry.timestamp.seconds * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
                                    : "..."}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {definition.sections.flatMap(section =>
                                section.fields
                                    .filter(f => f.kind !== "textarea" && f.kind !== "text")
                                    .map(field => (
                                        <div key={field.id} className="bg-muted p-3 rounded-xl border border-border">
                                            <span className="block text-[9px] text-muted-foreground font-bold uppercase mb-1">{field.label}</span>
                                            <span className="text-sm font-black text-foreground">{formatFieldValue(field, record[field.id])}</span>
                                        </div>
                                    ))
                            )}
                        </div>

                        {renderNotes(definition, record)}
                    </div>
                );
            })}
        </div>
    );
}

/** Human-readable value for a field in the entry list. */
function formatFieldValue(field: GameField, value: unknown): string {
    switch (field.kind) {
        case "boolean":
            return value ? "Sí" : "—";
        case "stars":
            return `${(value as number) ?? 0}/${field.max ?? 5}`;
        case "enum": {
            const opt = field.options.find(o => o.value === value);
            return opt?.label ?? String(value ?? "—");
        }
        case "counter":
            return String((value as number) ?? 0);
        default:
            return String(value ?? "—");
    }
}

function renderNotes(definition: GameDefinition, record: Record<string, unknown>) {
    const noteFields = definition.sections
        .flatMap(s => s.fields)
        .filter(f => f.kind === "textarea" || f.kind === "text");
    const rendered = noteFields
        .map(f => record[f.id])
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    if (rendered.length === 0) return null;
    return (
        <p className="text-[11px] text-muted-foreground mt-3 italic line-clamp-3 border-t border-border pt-3">
            {rendered.join(" · ")}
        </p>
    );
}
