"use client";

import { useEffect, useState } from "react";
import { useForm, Controller, type Control, type FieldPathByValue, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ScoutTeam, PitScouting } from "@/types/scouting";
import { pitScoutingFormSchema, type PitScoutingFormValues } from "@/lib/schemas/scouting";
import { useZodMessage } from "@/lib/hooks/use-zod-message";
import { Save, Edit2, Lock, Share2, Globe, Loader2 } from "lucide-react";
import clsx from "clsx";
import { useFormatter, useTranslations } from "next-intl";
import { useProgram } from "@/lib/stores/program-store";
import { seasonRulesFor } from "@/lib/games/season-rules";

interface ScoutingFormProps {
    team: ScoutTeam;
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
    const zodMsg = useZodMessage();
    const t = useTranslations("ScoutingPit");
    const format = useFormatter();
    const optionLabels = Object.fromEntries(
        ["Mecanno", "X-Drive", "Tanque", "Omnidireccional", "Swerve", "Otros", "Fricción (Ruedas)", "Garra", "Succión", "Activo-Vertical", "Otro", "Lanzador", "Elevador/Depósito", "Rampa Directa", "Close", "Mid", "Far"]
            .map(v => [v, t(`opt_${v}`)]),
    );
    const { season } = useProgram();

    // See SuperScoutingForm for the `as any` rationale (Zod coerce TInput/TOutput mismatch).
    const {
        control,
        handleSubmit,
        reset,
        formState: { errors, isSubmitting },
    } = useForm<PitScoutingFormValues>({
        resolver: zodResolver(pitScoutingFormSchema) as Resolver<PitScoutingFormValues>,
        defaultValues: initialDataToFormValues(team, season, initialData),
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
        reset(initialDataToFormValues(team, season, initialData));
    }, [team, season, initialData, reset]);

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
            canTipHive: values.canTipHive,
            scoresPollen: values.scoresPollen,
            scoresNectar: values.scoresNectar,
            scoresFlower: values.scoresFlower,
            scoresGarden: values.scoresGarden,
            maxCapacity: values.maxCapacity,
            launchRange: values.launchRange,
            autoTipsClaimed: values.autoTipsClaimed,
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
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{t("season", { season, game: seasonRulesFor(season).gameName })}</span>
                    </div>
                    <span className={clsx(
                        "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                        !isEditing ? "bg-secondary/10 border-secondary/30 text-secondary" : "bg-success/10 border-success/30 text-success"
                    )}>
                        {!isEditing ? t("readOnly") : t("editing")}
                    </span>
                </div>

                {isEditing ? (
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="min-h-[44px] px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg bg-success hover:bg-success/90 active:scale-[0.98] text-white disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-success/40"
                    >
                        {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        {isSubmitting ? t("saving") : t("save")}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                        <Edit2 size={18} /> {t("edit")}
                    </button>
                )}
            </div>

            <div className="p-6 md:p-8 pt-0 overflow-y-auto custom-scrollbar space-y-8 pb-16">
                <section>
                    <SectionTitle>{t("secSpecs")}</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <TextField control={control} name="robotName" label={t("robotName")} placeholder={t("robotNamePh")} disabled={!isEditing} error={zodMsg(errors.robotName?.message)} />
                        <SelectField control={control} name="driveTrain" label={t("driveTrain")} optionLabels={optionLabels} options={['Mecanno', 'X-Drive', 'Tanque', 'Omnidireccional', 'Swerve', 'Otros']} disabled={!isEditing} />
                        <NumberField control={control} name="servoCount" label={t("servoCount")} disabled={!isEditing} error={zodMsg(errors.servoCount?.message)} />
                        <TextField control={control} name="dimensions" label={t("dimensions")} placeholder={t("dimensionsPh")} disabled={!isEditing} />
                        <TextField control={control} name="weight" label={t("weight")} placeholder={t("weightPh")} disabled={!isEditing} />
                        <TextField control={control} name="motors" label={t("motors")} placeholder={t("motorsPh")} disabled={!isEditing} />
                    </div>
                </section>

                <section>
                    <SectionTitle>{t("secMechanisms")}</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <SelectField control={control} name="intakeType" label={t("intakeType")} optionLabels={optionLabels} options={['Fricción (Ruedas)', 'Garra', 'Succión', 'Activo-Vertical', 'Otro']} disabled={!isEditing} />
                        <SelectField control={control} name="scoringMechanism" label={t("scoringMechanism")} optionLabels={optionLabels} options={['Lanzador', 'Elevador/Depósito', 'Rampa Directa', 'Otro']} disabled={!isEditing} />
                        <TextField control={control} name="patternMechanism" label={t("patternMechanism")} placeholder={t("patternMechanismPh")} disabled={!isEditing} />
                    </div>
                </section>

                <section>
                    <SectionTitle>{t("secGame")}</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-4 bg-muted p-4 rounded-xl border border-border">
                            <BooleanField control={control} name="canDualPark" label={t("canDualPark")} disabled={!isEditing} />
                        </div>
                        <TextField control={control} name="sensors" label={t("sensors")} placeholder={t("sensorsPh")} disabled={!isEditing} />
                    </div>
                </section>

                <section>
                    <SectionTitle>{t("secBiobuzz")}</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <div className="space-y-4 bg-muted p-4 rounded-xl border border-border">
                            <BooleanField control={control} name="canTipHive" label={t("canTipHive")} disabled={!isEditing} />
                            <BooleanField control={control} name="scoresPollen" label={t("scoresPollen")} disabled={!isEditing} />
                            <BooleanField control={control} name="scoresNectar" label={t("scoresNectar")} disabled={!isEditing} />
                            <BooleanField control={control} name="scoresFlower" label={t("scoresFlower")} disabled={!isEditing} />
                            <BooleanField control={control} name="scoresGarden" label={t("scoresGarden")} disabled={!isEditing} />
                        </div>
                        <div className="space-y-4">
                            <NumberField control={control} name="maxCapacity" label={t("maxCapacity")} disabled={!isEditing} error={zodMsg(errors.maxCapacity?.message)} />
                            <SelectField control={control} name="launchRange" label={t("launchRange")} optionLabels={optionLabels} options={['Close', 'Mid', 'Far']} disabled={!isEditing} />
                            <NumberField control={control} name="autoTipsClaimed" label={t("autoTips")} disabled={!isEditing} error={zodMsg(errors.autoTipsClaimed?.message)} />
                        </div>
                    </div>
                </section>

                <section>
                    <SectionTitle>{t("secPhotos")}</SectionTitle>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="md:col-span-1">
                            <Label>{t("photoUrl")}</Label>
                            <TextField control={control} name="photoUrl" label="" placeholder="https://..." disabled={!isEditing} hideLabel />
                        </div>
                    </div>
                </section>

                {/* Private notes — never leaves the org. */}
                <section>
                    <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <Lock size={16} className="text-warning" />
                            <h3 className="text-lg font-bold text-warning">{t("privateNotes")}</h3>
                            <span className="ml-auto px-2 py-0.5 bg-warning/20 text-warning rounded text-[10px] font-black uppercase tracking-wider border border-warning/30">
                                {t("onlyMyTeam")}
                            </span>
                        </div>
                        <p className="text-xs text-warning/70 leading-relaxed">
                            {t.rich("privateNotesHint", { b: (chunks) => <strong>{chunks}</strong> })}
                        </p>
                        <Controller
                            name="notes"
                            control={control}
                            render={({ field }) => (
                                <textarea
                                    {...field}
                                    disabled={!isEditing}
                                    className="w-full h-32 px-4 py-3 bg-muted border border-warning/20 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-warning/50 disabled:opacity-50 placeholder:text-warning/30"
                                    placeholder={t("privateNotesPh")}
                                />
                            )}
                        />
                        {errors.notes && <p className="text-xs text-danger">{zodMsg(errors.notes.message)}</p>}
                    </div>
                </section>

                {/* Public summary — opt-in cross-org sharing. */}
                <section>
                    <div className="rounded-2xl border border-success/30 bg-success/5 p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <Share2 size={16} className="text-success" />
                            <h3 className="text-lg font-bold text-success">{t("publicSummary")}</h3>
                            <span className="ml-auto px-2 py-0.5 bg-success/20 text-success rounded text-[10px] font-black uppercase tracking-wider border border-success/30 flex items-center gap-1.5">
                                <Globe size={10} /> {t("visibleOthers")}
                            </span>
                        </div>
                        <p className="text-xs text-success/70 leading-relaxed">
                            {t.rich("publicSummaryHint", { b: (chunks) => <strong>{chunks}</strong> })}
                        </p>
                        <Controller
                            name="publicSummary"
                            control={control}
                            render={({ field }) => (
                                <textarea
                                    {...field}
                                    disabled={!isEditing}
                                    className="w-full h-24 px-4 py-3 bg-muted border border-success/20 rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-success/50 disabled:opacity-50 placeholder:text-success/30"
                                    placeholder={t("publicSummaryPh")}
                                />
                            )}
                        />
                        {errors.publicSummary && <p className="text-xs text-danger">{zodMsg(errors.publicSummary.message)}</p>}
                        {initialData?.publicSummarySharedAt?.seconds && (
                            <div className="text-[10px] text-success/60 font-medium">
                                {t("lastShared")}{" "}
                                {format.dateTime(new Date(initialData.publicSummarySharedAt.seconds * 1000), { dateStyle: "medium", timeStyle: "short" })}
                            </div>
                        )}
                    </div>
                </section>

                {initialData?.lastUpdatedBy && (
                    <p className="text-xs text-muted-foreground italic">
                        {t("lastUpdatedBy", { name: initialData.lastUpdatedBy })}
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
    optionLabels?: Record<string, string>;
}

function SelectField({ control, name, label, options, optionLabels, disabled }: SelectFieldProps) {
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
                            <option key={opt} value={opt} className="bg-card">{optionLabels?.[opt] ?? opt}</option>
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
    team: ScoutTeam,
    currentSeason: number,
    data?: PitScouting,
): PitScoutingFormValues {
    return {
        teamNumber: team.teamNumber,
        season: data?.season ?? currentSeason,
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
        canTipHive: data?.canTipHive ?? false,
        scoresPollen: data?.scoresPollen ?? false,
        scoresNectar: data?.scoresNectar ?? false,
        scoresFlower: data?.scoresFlower ?? false,
        scoresGarden: data?.scoresGarden ?? false,
        maxCapacity: data?.maxCapacity ?? 0,
        launchRange: data?.launchRange ?? "Close",
        autoTipsClaimed: data?.autoTipsClaimed ?? 0,
        photoUrl: data?.photoUrl ?? "",
        notes: data?.notes ?? "",
        publicSummary: data?.publicSummary ?? "",
    };
}
