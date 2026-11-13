"use client";

import { useState } from "react";
import { useForm, Controller, Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ScoutTeam, MatchScouting, CURRENT_GAME_SCHEMA, FTCMatchScouting } from "@/types/scouting";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { gameDefinitionFor } from "@/lib/games/registry";
import { DEFAULT_ORG_ID, scoutIdFromUser, scoutNameFromUser } from "@/lib/orgs";
import { useSaveMatchScouting, type MatchScoutingSaveResult } from "@/lib/hooks/use-scouting-mutations";
import { superScoutingFormSchema, type SuperScoutingFormValues } from "@/lib/schemas/scouting";
import { useZodMessage } from "@/lib/hooks/use-zod-message";
import { Card } from "@/components/ui/Card";
import SourceBadge from "@/components/scouting/SourceBadge";
import { useScoutReliabilities } from "@/lib/hooks/use-scout-reliabilities";
import { Save, Star, Shield, Wrench, ThumbsUp, ThumbsDown, Eye, User, Loader2, AlertCircle } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

interface SuperScoutingFormProps {
    team: ScoutTeam;
    eventCode: string;
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
export default function SuperScoutingForm({ team, eventCode, entries }: SuperScoutingFormProps) {
    const { user, orgId } = useAuth();
    const { season } = useProgram();
    const scoutReliabilities = useScoutReliabilities();
    const [isAdding, setIsAdding] = useState(false);
    const saveMutation = useSaveMatchScouting();
    const zodMsg = useZodMessage();
    const t = useTranslations("ScoutingSuper");

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
            toast.error(t("signIn"));
            return;
        }
        const scoutId = scoutIdFromUser(user);
        const scoutName = scoutNameFromUser(user);
        const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;

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
            // Provenance per the ACTIVE season's game (a 2025 super-scout is not v3).
            gameSchemaVersion: gameDefinitionFor("FTC", season)?.schemaVersion ?? CURRENT_GAME_SCHEMA.FTC,
            scoutingMode: "super",
            driverSkill: values.driverSkill,
            defenseRating: values.defenseRating,
            reliability: values.reliability,
            wouldPick: values.wouldPick,
            notes: values.notes,
            timestamp: null,
        };

        let result: MatchScoutingSaveResult;
        try {
            result = await saveMutation.mutateAsync(payload as MatchScouting);
        } catch (e) {
            console.error("[super-scouting] save failed completely:", e);
            toast.error(t("saveFailed", { match: values.matchNumber }));
            return;
        }
        if (result.savedTo === "local") {
            toast.success(t("savedOffline", { match: values.matchNumber }));
        } else {
            toast.success(t("saved", { match: values.matchNumber }));
        }

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
            <Card className="p-6 bg-muted border-primary/20">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <Eye className="text-primary" size={20} />
                            <h2 className="text-2xl font-black text-foreground">{t("title")}</h2>
                            <span className="px-2 py-0.5 bg-primary/20 text-primary rounded text-[10px] font-black uppercase tracking-wider border border-primary/30">
                                {t("subjective")}
                            </span>
                        </div>
                        <p className="text-xs text-primary/60 max-w-md leading-relaxed">
                            {t.rich("intro", { b: (chunks) => <strong>{chunks}</strong> })}
                        </p>
                    </div>
                    {!isAdding && (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="min-h-[44px] px-4 py-2 bg-primary hover:bg-primary/90 active:scale-[0.98] text-primary-foreground font-bold rounded-lg flex items-center gap-2 text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                        >
                            <Star size={16} /> {t("newObservation")}
                        </button>
                    )}
                </div>

                <SourceBadge entries={superEntries} scoutReliabilities={scoutReliabilities} className="mb-2" />
            </Card>

            {isAdding && (
                <form onSubmit={handleSubmit(onSubmit)}>
                    <Card className="p-6 bg-muted border-border space-y-6">
                        <div className="flex items-center gap-4">
                            <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                                {t("matchNumber")}
                            </label>
                            <Controller
                                name="matchNumber"
                                control={control}
                                render={({ field }) => (
                                    <input
                                        {...field}
                                        type="number"
                                        min={1}
                                        className="w-20 px-3 py-1.5 bg-muted border border-border rounded text-foreground text-center font-bold"
                                    />
                                )}
                            />
                            {errors.matchNumber && (
                                <span className="text-xs text-danger">{zodMsg(errors.matchNumber.message)}</span>
                            )}
                        </div>

                        <Controller
                            name="driverSkill"
                            control={control}
                            render={({ field }) => (
                                <StarPicker
                                    label={t("driverSkill")}
                                    icon={<User size={14} />}
                                    value={field.value}
                                    onChange={field.onChange}
                                    helperText={t("driverSkillHelp")}
                                />
                            )}
                        />
                        <Controller
                            name="defenseRating"
                            control={control}
                            render={({ field }) => (
                                <StarPicker
                                    label={t("defense")}
                                    icon={<Shield size={14} />}
                                    value={field.value}
                                    onChange={field.onChange}
                                    helperText={t("defenseHelp")}
                                />
                            )}
                        />
                        <Controller
                            name="reliability"
                            control={control}
                            render={({ field }) => (
                                <StarPicker
                                    label={t("reliability")}
                                    icon={<Wrench size={14} />}
                                    value={field.value}
                                    onChange={field.onChange}
                                    helperText={t("reliabilityHelp")}
                                />
                            )}
                        />

                        <div className="space-y-2">
                            <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                                {t("wouldPick")}
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
                                                    ? "bg-success/20 border-success/50 text-success"
                                                    : "bg-muted border-border text-muted-foreground hover:border-success/30",
                                            )}
                                        >
                                            <ThumbsUp size={16} /> {t("yes")}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => field.onChange(false)}
                                            className={clsx(
                                                "flex-1 py-3 rounded-lg border font-bold flex items-center justify-center gap-2 transition-all",
                                                field.value === false
                                                    ? "bg-danger/20 border-danger/50 text-danger"
                                                    : "bg-muted border-border text-muted-foreground hover:border-danger/30",
                                            )}
                                        >
                                            <ThumbsDown size={16} /> {t("no")}
                                        </button>
                                    </div>
                                )}
                            />
                            {errors.wouldPick && (
                                <span className="text-xs text-danger">{zodMsg(errors.wouldPick.message)}</span>
                            )}
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                                {t("notes")}
                            </label>
                            <Controller
                                name="notes"
                                control={control}
                                render={({ field }) => (
                                    <textarea
                                        {...field}
                                        placeholder={t("notesPh")}
                                        className="w-full h-24 px-4 py-2 bg-muted border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 placeholder:text-muted-foreground"
                                    />
                                )}
                            />
                            {errors.notes && (
                                <span className="text-xs text-danger">{zodMsg(errors.notes.message)}</span>
                            )}
                        </div>

                        {saveMutation.isError && (
                            <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">
                                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                                <span>
                                    {t("saveError", { message: String((saveMutation.error as Error)?.message ?? saveMutation.error) })}
                                </span>
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="px-4 py-2 bg-muted hover:bg-border text-muted-foreground rounded-lg font-bold text-sm"
                            >
                                {t("cancel")}
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting || saveMutation.isPending}
                                className="flex-1 min-h-[44px] py-2.5 bg-primary hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50 text-primary-foreground font-bold rounded-lg flex items-center justify-center gap-2 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                            >
                                {isSubmitting || saveMutation.isPending ? (
                                    <Loader2 size={16} className="animate-spin" />
                                ) : (
                                    <Save size={16} />
                                )}
                                {isSubmitting || saveMutation.isPending ? t("saving") : t("save")}
                            </button>
                        </div>
                    </Card>
                </form>
            )}

            <div className="space-y-3">
                {superEntries.length === 0 ? (
                    <div className="text-center py-12 bg-muted rounded-xl border border-dashed border-border text-muted-foreground flex flex-col items-center gap-3">
                        <Eye size={32} className="opacity-20" />
                        <div>
                            <p className="text-sm text-muted-foreground font-medium">{t("emptyTitle")}</p>
                            <p className="text-xs mt-0.5 opacity-70">
                                {t("emptyHint")}
                            </p>
                        </div>
                        {!isAdding && (
                            <button
                                type="button"
                                onClick={() => setIsAdding(true)}
                                className="px-4 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-lg flex items-center gap-2"
                            >
                                <Star size={12} /> {t("firstObservation")}
                            </button>
                        )}
                    </div>
                ) : (
                    superEntries
                        .sort((a, b) => b.matchNumber - a.matchNumber)
                        .map((raw, i) => {
                            const e = raw as FTCMatchScouting;
                            return (
                                <Card key={i} className="p-4 bg-muted border-border">
                                    <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                                        <div className="flex items-center gap-3">
                                            <div className="px-2 py-1 bg-primary/20 text-primary rounded text-[10px] font-black tracking-tighter">
                                                M#{e.matchNumber}
                                            </div>
                                            {e.orgId && (
                                                <div className="px-2 py-0.5 bg-muted border border-border text-muted-foreground rounded text-[10px] font-black tracking-wider uppercase">
                                                    #{e.orgId}
                                                </div>
                                            )}
                                            <span className="text-xs text-muted-foreground">
                                                {e.scoutName ?? e.scouterName}
                                            </span>
                                        </div>
                                        {e.wouldPick !== undefined && (
                                            <span
                                                className={clsx(
                                                    "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
                                                    e.wouldPick
                                                        ? "bg-success/15 text-success border border-success/30"
                                                        : "bg-danger/15 text-danger border border-danger/30",
                                                )}
                                            >
                                                {e.wouldPick ? t("pick") : t("skip")}
                                            </span>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-3 gap-3 text-xs">
                                        <RatingBadge label={t("badgeDriver")} value={e.driverSkill} icon={<User size={12} />} />
                                        <RatingBadge label={t("defense")} value={e.defenseRating} icon={<Shield size={12} />} />
                                        <RatingBadge label={t("reliability")} value={e.reliability} icon={<Wrench size={12} />} />
                                    </div>
                                    {e.notes && e.notes.trim().length > 0 && (
                                        <p className="mt-3 text-xs text-muted-foreground italic leading-relaxed border-l-2 border-primary/30 pl-3">
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
                <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider flex items-center gap-2">
                    {icon}
                    {label}
                </label>
                {helperText && (
                    <span className="text-[10px] text-muted-foreground italic">{helperText}</span>
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
                                ? "bg-primary/20 border-primary/50 text-primary"
                                : "bg-muted border-border text-muted-foreground hover:border-primary/30",
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
            <div className="p-2 bg-muted rounded-lg border border-border text-muted-foreground flex items-center gap-2">
                {icon}
                <div>
                    <div className="text-[9px] uppercase tracking-wider">{label}</div>
                    <div className="text-sm font-bold">—</div>
                </div>
            </div>
        );
    }
    return (
        <div className="p-2 bg-muted rounded-lg border border-border flex items-center gap-2">
            {icon}
            <div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</div>
                <div className="text-sm font-bold text-foreground">{value}/5</div>
            </div>
        </div>
    );
}
