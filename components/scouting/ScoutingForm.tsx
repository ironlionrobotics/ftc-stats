"use client";

import { useEffect, useState } from "react";
import { useForm, Controller, type Control, type FieldPathByValue, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AggregatedTeamStats, PitScouting } from "@/types/scouting";
import { pitScoutingFormSchema, type PitScoutingFormValues } from "@/lib/schemas/scouting";
import { Save, Edit2, Lock, Share2, Globe, Loader2 } from "lucide-react";
import clsx from "clsx";

interface ScoutingFormProps {
    team: AggregatedTeamStats;
    initialData?: PitScouting;
    onSave: (data: PitScouting) => Promise<void> | void;
}

// Module-level so the impure `Date.now()` lives outside the component's render
// scope. It's only ever called from the submit handler (an event, not render),
// but the React Compiler can't prove that for a function assigned in the body,
// so it would flag the inline Date.now() as a purity violation. Relocating the
// impurity here keeps the behavior (a submit-time "shared at" stamp) identical.
function nowFirestoreTimestamp(): { seconds: number; nanoseconds: number } {
    return { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
}

// Presentational helpers hoisted to module scope. Defined inside the component
// they'd be re-created every render (React Compiler `static-components`), which
// remounts them and drops any child state. They capture nothing from the
// component, so hoisting is behavior-neutral.
const SectionTitle = ({ children }: { children: React.ReactNode }) => (
    <h3 className="text-xl font-bold text-foreground mt-4 mb-4 border-b border-border pb-2 flex items-center gap-2">
        {children}
    </h3>
);

const Label = ({ children }: { children: React.ReactNode }) => (
    <label className="block text-sm font-medium text-muted-foreground mb-1">{children}</label>
);

/**
 * Pit scouting form (RHF + Zod).
 *
 * Keeps the same edit/view-toggle UX as the original — scouts see read-only
 * data by default and click "Editar" to switch into edit mode. Submit goes
 * through the parent `onSave` (which is wrapped in useSavePitScouting from
 * the client side). Validation is enforced by the Zod schema before save.
 *
 * The form has three visually-distinct note sections:
 *   - Notas privadas (amber)   — stays in this org, never shared.
 *   - Resumen público (green)  — opt-in cross-org publishing.
 *   - Fotos                    — neutral.
 */
export default function ScoutingForm({ team, initialData, onSave }: ScoutingFormProps) {
    const [isEditing, setIsEditing] = useState(false);

    // See SuperScoutingForm for the `as any` rationale (Zod coerce TInput/TOutput mismatch).
    const {
        control,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<PitScoutingFormValues>({
        resolver: zodResolver(pitScoutingFormSchema) as Resolver<PitScoutingFormValues>,
        defaultValues: initialDataToFormValues(team, initialData),
    });

    // Re-initialize the form when the selected team or its pit data changes.
    // `team` is a stable reference per selected team (ScoutingClient derives it
    // from a fixed initialTeams array and remounts this form via a per-team
    // `key`), so depending on the whole object doesn't cause spurious resets —
    // in practice the live trigger is `initialData` arriving from its async load.
    // Only the imperative RHF form sync lives here; edit-mode is reset by the
    // per-team remount and by onSubmit after save (so no setState in this
    // effect — which the React Compiler flags as a cascading-render hazard).
    useEffect(() => {
        reset(initialDataToFormValues(team, initialData));
    }, [team, initialData, reset]);

    const onSubmit = async (values: PitScoutingFormValues) => {
        // Merge values back into PitScouting shape, preserving fields that the
        // form doesn't manage (orgId, scoutedBy, lastUpdatedAt are set by the
        // parent client / service).
        const merged: PitScouting = {
            teamNumber: values.teamNumber,
            season: values.season,
            robotName: values.robotName,
            driveTrain: values.driveTrain,
            dimensions: values.dimensions,
            weight: values.weight,
            motors: values.motors,
            sensors: values.sensors,
            servoCount: values.servoCount,
            intakeType: values.intakeType,
            scoringMechanism: values.scoringMechanism,
            patternMechanism: values.patternMechanism,
            canDualPark: values.canDualPark,
            motifDetection: values.motifDetection,
            photoUrl: values.photoUrl,
            notes: values.notes,
            publicSummary: values.publicSummary,
            publicSummarySharedAt: values.publicSummary?.trim().length
                ? nowFirestoreTimestamp()
                : initialData?.publicSummarySharedAt ?? null,
            // Preserved from initialData (read-only in form):
            orgId: initialData?.orgId,
            scoutedBy: initialData?.scoutedBy,
            lastUpdatedBy: initialData?.lastUpdatedBy,
        };
        await onSave(merged);
        setIsEditing(false);
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 bg-muted border border-border rounded-xl overflow-hidden flex flex-col h-full">
            {/* Header */}
            <div className="px-4 md:px-6 py-3 border-b border-border flex flex-wrap justify-between items-center gap-3 bg-muted">
                <div className="flex items-center gap-4 min-w-0">
                    <div className="flex flex-col min-w-0">
                        <h2 className="text-lg md:text-2xl font-bold text-foreground flex items-center gap-2 md:gap-3 min-w-0">
                            <span className="text-primary font-display text-2xl md:text-3xl shrink-0">{team.teamNumber}</span>
                            <span className="truncate">{team.teamName}</span>
                        </h2>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Temporada 2025: DECODE</span>
                    </div>
                    <span className={clsx(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                        !isEditing ? "bg-secondary/10 border-secondary/30 text-secondary" : "bg-success/10 border-success/30 text-success"
                    )}>
                        {!isEditing ? "Lectura" : "Edición"}
                    </span>
                </div>

                {isEditing ? (
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="min-h-[44px] px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg bg-success hover:bg-success/90 active:scale-[0.98] text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
                    >
                        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        {isSubmitting ? "Guardando..." : "Guardar Pit Data"}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                        <Edit2 size={18} /> Editar Pit Data
                    </button>
                )}
            </div>

            <div className="p-6 md:p-8 pt-0 overflow-y-auto custom-scrollbar space-y-8 pb-16">
                <section>
                    <SectionTitle>Especificaciones Técnicas</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <TextField control={control} name="robotName" label="Nombre del Robot" placeholder="Ej: Iron Lion Bot" disabled={!isEditing} error={errors.robotName?.message} />
                        <SelectField control={control} name="driveTrain" label="Tipo de Tracción" options={['Mecanno', 'X-Drive', 'Tanque', 'Omnidireccional', 'Swerve', 'Otros']} disabled={!isEditing} />
                        <NumberField control={control} name="servoCount" label="Cantidad de Servos (Max 20)" disabled={!isEditing} error={errors.servoCount?.message} />
                        <TextField control={control} name="dimensions" label="Dimensiones (Pulgadas)" placeholder="Ej: 18x18x18" disabled={!isEditing} />
                        <TextField control={control} name="weight" label="Peso (Kg)" placeholder="Ej: 12.5" disabled={!isEditing} />
                        <TextField control={control} name="motors" label="Motores" placeholder="Ej: 4 Rev HD Hex" disabled={!isEditing} />
                    </div>
                </section>

                <section>
                    <SectionTitle>Mecanismos de Artifacts & Patterns</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <SelectField control={control} name="intakeType" label="Tipo de Intake" options={['Fricción (Ruedas)', 'Garra', 'Succión', 'Activo-Vertical', 'Otro']} disabled={!isEditing} />
                        <SelectField control={control} name="scoringMechanism" label="Mecanismo Scoring (Goal)" options={['Lanzador', 'Elevador/Depósito', 'Rampa Directa', 'Otro']} disabled={!isEditing} />
                        <TextField control={control} name="patternMechanism" label="Mecanismo de Patrones (Ramp)" placeholder="Ej: Rampa con Gates" disabled={!isEditing} />
                    </div>
                </section>

                <section>
                    <SectionTitle>Capacidades de Juego & Visión</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4 bg-muted p-4 rounded-xl border border-border">
                            <BooleanField control={control} name="motifDetection" label="¿Detecta Motif (Visión)?" disabled={!isEditing} />
                            <BooleanField control={control} name="canDualPark" label="¿Permite Dual Parking (18x18)?" disabled={!isEditing} />
                        </div>
                        <TextField control={control} name="sensors" label="Sensores / Cámaras" placeholder="Ej: Webcam C920, Sensores de color" disabled={!isEditing} />
                    </div>
                </section>

                <section>
                    <SectionTitle>Fotos</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-1">
                            <Label>URL de la Foto</Label>
                            <TextField control={control} name="photoUrl" label="" placeholder="https://..." disabled={!isEditing} hideLabel />
                        </div>
                    </div>
                </section>

                {/* Private notes — never leaves the org. */}
                <section>
                    <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <Lock size={16} className="text-warning" />
                            <h3 className="text-lg font-bold text-warning">Notas privadas</h3>
                            <span className="ml-auto px-2 py-0.5 bg-warning/20 text-warning rounded text-[10px] font-black uppercase tracking-wider border border-warning/30">
                                Solo mi equipo
                            </span>
                        </div>
                        <p className="text-xs text-warning/70 leading-relaxed">
                            Estas notas son <strong>internas de tu equipo</strong>. Otros equipos NUNCA verán este campo.
                            Útil para anotar debilidades estratégicas, planes de defensa, especulaciones.
                        </p>
                        <Controller
                            name="notes"
                            control={control}
                            render={({ field }) => (
                                <textarea
                                    {...field}
                                    disabled={!isEditing}
                                    className="w-full h-32 px-4 py-3 bg-muted border border-warning/20 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-warning/50 disabled:opacity-50 placeholder:text-warning/30"
                                    placeholder="Ej: 'Su intake se atora con artifacts verdes', 'Driver coach poco experimentado'..."
                                />
                            )}
                        />
                        {errors.notes && <p className="text-xs text-danger">{errors.notes.message}</p>}
                    </div>
                </section>

                {/* Public summary — opt-in cross-org sharing. */}
                <section>
                    <div className="rounded-2xl border border-success/30 bg-success/5 p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <Share2 size={16} className="text-success" />
                            <h3 className="text-lg font-bold text-success">Resumen público</h3>
                            <span className="ml-auto px-2 py-0.5 bg-success/20 text-success rounded text-[10px] font-black uppercase tracking-wider border border-success/30 flex items-center gap-1.5">
                                <Globe size={10} /> Visible a otros equipos
                            </span>
                        </div>
                        <p className="text-xs text-success/70 leading-relaxed">
                            Resumen <strong>opt-in</strong> que otros equipos en eventos compartidos podrán ver.
                            Déjalo vacío para no compartir nada.
                        </p>
                        <Controller
                            name="publicSummary"
                            control={control}
                            render={({ field }) => (
                                <textarea
                                    {...field}
                                    disabled={!isEditing}
                                    className="w-full h-24 px-4 py-3 bg-muted border border-success/20 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-success/50 disabled:opacity-50 placeholder:text-success/30"
                                    placeholder="Ej: 'Robot con tracción mecanno, intake de fricción, lanzador para meta. Climb tipo Full.'"
                                />
                            )}
                        />
                        {errors.publicSummary && <p className="text-xs text-danger">{errors.publicSummary.message}</p>}
                        {initialData?.publicSummarySharedAt?.seconds && (
                            <div className="text-[10px] text-success/60 font-medium">
                                Compartido por última vez:{" "}
                                {new Date(initialData.publicSummarySharedAt.seconds * 1000).toLocaleString()}
                            </div>
                        )}
                    </div>
                </section>

                {initialData?.lastUpdatedBy && (
                    <p className="text-xs text-muted-foreground italic">
                        Última actualización por {initialData.lastUpdatedBy}
                    </p>
                )}
            </div>
        </form>
    );
}

// ---------------------------------------------------------------------------
// Field building blocks — typed wrappers so we don't repeat the
// Controller + input boilerplate 20 times.
// ---------------------------------------------------------------------------

interface BaseFieldProps<TValue> {
    control: Control<PitScoutingFormValues>;
    name: FieldPathByValue<PitScoutingFormValues, TValue>;
    label: string;
    disabled?: boolean;
}

interface TextFieldProps extends BaseFieldProps<string> {
    placeholder?: string;
    error?: string;
    hideLabel?: boolean;
}

function TextField({
    control, name, label, placeholder, disabled, error, hideLabel,
}: TextFieldProps) {
    return (
        <div>
            {!hideLabel && <label className="block text-sm font-medium text-muted-foreground mb-1">{label}</label>}
            <Controller
                name={name}
                control={control}
                render={({ field }) => (
                    <input
                        {...field}
                        type="text"
                        disabled={disabled}
                        placeholder={placeholder}
                        className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    />
                )}
            />
            {error && <p className="text-xs text-danger mt-1">{error}</p>}
        </div>
    );
}

interface NumberFieldProps extends BaseFieldProps<number> {
    error?: string;
}

function NumberField({ control, name, label, disabled, error }: NumberFieldProps) {
    return (
        <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{label}</label>
            <Controller
                name={name}
                control={control}
                render={({ field }) => (
                    <input
                        {...field}
                        type="number"
                        disabled={disabled}
                        className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    />
                )}
            />
            {error && <p className="text-xs text-danger mt-1">{error}</p>}
        </div>
    );
}

interface SelectFieldProps extends BaseFieldProps<string> {
    options: string[];
}

function SelectField({ control, name, label, options, disabled }: SelectFieldProps) {
    return (
        <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1">{label}</label>
            <Controller
                name={name}
                control={control}
                render={({ field }) => (
                    <select
                        {...field}
                        disabled={disabled}
                        className="px-4 py-2 bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50 disabled:cursor-not-allowed appearance-none w-full"
                    >
                        {options.map((opt: string) => (
                            <option key={opt} value={opt} className="bg-card">{opt}</option>
                        ))}
                    </select>
                )}
            />
        </div>
    );
}

function BooleanField({ control, name, label, disabled }: BaseFieldProps<boolean>) {
    return (
        <Controller
            name={name}
            control={control}
            render={({ field }) => (
                <label className="flex items-center gap-3 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={!!field.value}
                        onChange={e => field.onChange(e.target.checked)}
                        disabled={disabled}
                        className="w-5 h-5 accent-primary"
                    />
                    <span className="text-foreground font-medium">{label}</span>
                </label>
            )}
        />
    );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function initialDataToFormValues(
    team: AggregatedTeamStats,
    data?: PitScouting,
): PitScoutingFormValues {
    return {
        teamNumber: team.teamNumber,
        season: data?.season ?? 2025,
        robotName: data?.robotName ?? "",
        driveTrain: data?.driveTrain ?? "Mecano",
        dimensions: data?.dimensions ?? "",
        weight: data?.weight ?? "",
        motors: data?.motors ?? "",
        sensors: data?.sensors ?? "",
        servoCount: data?.servoCount ?? 0,
        intakeType: data?.intakeType ?? "Fricción",
        scoringMechanism: data?.scoringMechanism ?? "Lanzador",
        patternMechanism: data?.patternMechanism ?? "Rampa",
        canDualPark: data?.canDualPark ?? false,
        motifDetection: data?.motifDetection ?? false,
        photoUrl: data?.photoUrl ?? "",
        notes: data?.notes ?? "",
        publicSummary: data?.publicSummary ?? "",
    };
}
