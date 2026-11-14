"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, type Control } from "react-hook-form";
import { useFormatter, useTranslations } from "next-intl";
import { Save, Edit2, Lock, Share2, Globe, Loader2, IdCard } from "lucide-react";
import clsx from "clsx";
import type { ScoutTeam, PitScouting } from "@/types/scouting";
import DynamicGameForm from "@/components/scouting/games/DynamicGameForm";
import { zodSchemaFromDefinition } from "@/lib/games/zod-from-definition";
import { defaultsForDefinition, type GameDefinition } from "@/types/game-definition";
import { generalQuestions, GENERAL_QUESTIONS_VERSION } from "@/lib/team-profile/general-questions";

/**
 * Pit interview for seasons whose game defines self-report questions (#108).
 *
 * The pit scout asks another team exactly what that team's Trading Card asks
 * it about itself: the general questions (every season, #107) plus the
 * season's selfReport (#101). Same field ids and same storage shape
 * (`general`/`generalVersion`, `answers`/`answersDefinitionId`), so what a
 * team SAYS on its card lines up field by field with what our scout heard in
 * its pit — and with what the shared pool measured. No question of another
 * season can appear (the old form mixed DECODE patterns and dual parking into
 * BIOBUZZ). Questionnaire mode: an untouched option stays unanswered.
 *
 * Private notes and the opt-in public summary are unchanged from the legacy
 * form (components/scouting/ScoutingForm.tsx, kept for older seasons).
 */

type Answers = Record<string, number | boolean | string>;
interface MetaValues { robotName: string; notes: string; publicSummary: string }

const LIMITS = { robotName: 100, notes: 5000, publicSummary: 1000 } as const;

// Module scope: Date.now() is impure (React Compiler purity); only called on submit.
function nowFirestoreTimestamp(): { seconds: number; nanoseconds: number } {
    return { seconds: Math.floor(Date.now() / 1000), nanoseconds: 0 };
}

function metaFrom(data?: PitScouting): MetaValues {
    return { robotName: data?.robotName ?? "", notes: data?.notes ?? "", publicSummary: data?.publicSummary ?? "" };
}

function answersFrom(def: GameDefinition, stored: Answers | undefined, matches: boolean): Record<string, unknown> {
    return { ...defaultsForDefinition(def), ...(matches && stored ? stored : {}) };
}

export default function PitQuestionnaire({ team, season, seasonDef, selfReport, initialData, onSave }: {
    team: ScoutTeam;
    season: number;
    seasonDef: GameDefinition;
    selfReport: GameDefinition;
    initialData?: PitScouting;
    onSave: (data: PitScouting) => Promise<void> | void;
}) {
    const t = useTranslations("ScoutingPit");
    const format = useFormatter();
    const [isEditing, setIsEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(false);

    const general = useMemo(() => generalQuestions(seasonDef), [seasonDef]);
    const generalSchema = useMemo(() => zodSchemaFromDefinition(general), [general]);
    const seasonSchema = useMemo(() => zodSchemaFromDefinition(selfReport), [selfReport]);

    const generalMatches = initialData?.generalVersion === GENERAL_QUESTIONS_VERSION;
    const seasonMatches = initialData?.answersDefinitionId === selfReport.id;
    const metaForm = useForm<MetaValues>({ defaultValues: metaFrom(initialData) });
    const generalForm = useForm<Record<string, unknown>>({ defaultValues: answersFrom(general, initialData?.general, generalMatches) });
    const seasonForm = useForm<Record<string, unknown>>({ defaultValues: answersFrom(selfReport, initialData?.answers, seasonMatches) });

    // Pit data arrives async after the per-team remount: sync the forms (imperative
    // RHF reset only; the reset functions are stable, the useForm objects are not).
    const resetMeta = metaForm.reset;
    const resetGeneral = generalForm.reset;
    const resetSeason = seasonForm.reset;
    useEffect(() => {
        resetMeta(metaFrom(initialData));
        resetGeneral(answersFrom(general, initialData?.general, initialData?.generalVersion === GENERAL_QUESTIONS_VERSION));
        resetSeason(answersFrom(selfReport, initialData?.answers, initialData?.answersDefinitionId === selfReport.id));
    }, [initialData, general, selfReport, resetMeta, resetGeneral, resetSeason]);

    const submit = async () => {
        const g = generalSchema.safeParse(generalForm.getValues());
        const s = seasonSchema.safeParse(seasonForm.getValues());
        if (!g.success || !s.success) { setError(true); return; }
        setError(false);
        const meta = metaForm.getValues();
        const publicSummary = meta.publicSummary.trim().slice(0, LIMITS.publicSummary);
        const merged: PitScouting = {
            teamNumber: team.teamNumber,
            season,
            robotName: meta.robotName.trim().slice(0, LIMITS.robotName),
            general: g.data as Answers,
            generalVersion: GENERAL_QUESTIONS_VERSION,
            answers: s.data as Answers,
            answersDefinitionId: selfReport.id,
            notes: meta.notes.slice(0, LIMITS.notes),
            publicSummary,
            publicSummarySharedAt: publicSummary ? nowFirestoreTimestamp() : initialData?.publicSummarySharedAt ?? null,
            orgId: initialData?.orgId,
            scoutedBy: initialData?.scoutedBy,
            lastUpdatedBy: initialData?.lastUpdatedBy,
        };
        setSaving(true);
        try {
            await onSave(merged);
            setIsEditing(false);
        } finally {
            setSaving(false);
        }
    };

    const inputCls = "w-full px-4 py-2 bg-muted border rounded-lg text-foreground focus:outline-none focus:ring-2 disabled:opacity-50";

    return (
        <form onSubmit={e => { e.preventDefault(); void submit(); }} className="flex-1 bg-muted border border-border rounded-xl overflow-hidden flex flex-col h-full">
            <div className="px-4 md:px-6 py-3 border-b border-border flex flex-wrap justify-between items-center gap-3 bg-muted">
                <div className="flex items-center gap-4 min-w-0">
                    <div className="flex flex-col min-w-0">
                        <h2 className="text-lg md:text-2xl font-bold text-foreground flex items-center gap-2 md:gap-3 min-w-0">
                            <span className="text-primary font-display text-2xl md:text-3xl shrink-0">{team.teamNumber}</span>
                            <span className="truncate">{team.teamName}</span>
                        </h2>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">{t("season", { season, game: seasonDef.label })}</span>
                    </div>
                    <span className={clsx("px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border",
                        !isEditing ? "bg-secondary/10 border-secondary/30 text-secondary" : "bg-success/10 border-success/30 text-success")}>
                        {!isEditing ? t("readOnly") : t("editing")}
                    </span>
                </div>
                {/* Distinct keys: reusing one <button> whose type flips to "submit"
                    mid-click makes the browser submit right after "Edit". */}
                {isEditing ? (
                    <button key="save" type="submit" disabled={saving}
                        className="min-h-[44px] px-6 py-2 rounded-lg font-bold flex items-center gap-2 bg-success hover:bg-success/90 text-white disabled:opacity-50">
                        {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                        {saving ? t("saving") : t("save")}
                    </button>
                ) : (
                    <button key="edit" type="button" onClick={() => setIsEditing(true)}
                        className="min-h-[44px] px-6 py-2 rounded-lg font-bold flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
                        <Edit2 size={18} /> {t("edit")}
                    </button>
                )}
            </div>

            <div className="p-4 md:p-6 overflow-y-auto custom-scrollbar space-y-6 pb-16">
                <p className="flex items-start gap-2 text-xs text-muted-foreground">
                    <IdCard size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
                    {t("sameAsCard")}
                </p>
                {error && <p role="alert" className="text-sm text-danger">{t("invalid")}</p>}

                <div>
                    <label htmlFor="pit-robot-name" className="block text-sm font-medium text-muted-foreground mb-1">{t("robotName")}</label>
                    <input id="pit-robot-name" {...metaForm.register("robotName")} maxLength={LIMITS.robotName} disabled={!isEditing}
                        placeholder={t("robotNamePh")} className={clsx(inputCls, "border-border focus:ring-primary")} />
                </div>

                <section className="space-y-2">
                    <h3 className="text-xl font-bold text-foreground border-b border-border pb-2">{t("secGeneral")}</h3>
                    <DynamicGameForm definition={general} control={generalForm.control as unknown as Control<Record<string, unknown>>} disabled={!isEditing} />
                </section>

                <section className="space-y-2">
                    <h3 className="text-xl font-bold text-foreground border-b border-border pb-2">{t("secSeason", { game: seasonDef.label })}</h3>
                    <p className="text-xs text-muted-foreground">{t("seasonHint")}</p>
                    <DynamicGameForm definition={selfReport} control={seasonForm.control as unknown as Control<Record<string, unknown>>} disabled={!isEditing} />
                </section>

                <section>
                    <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <Lock size={16} className="text-warning" />
                            <h3 className="text-lg font-bold text-warning">{t("privateNotes")}</h3>
                            <span className="ml-auto px-2 py-0.5 bg-warning/20 text-warning rounded text-[10px] font-black uppercase tracking-wider border border-warning/30">{t("onlyMyTeam")}</span>
                        </div>
                        <p className="text-xs text-warning/70 leading-relaxed">{t.rich("privateNotesHint", { b: (c) => <strong>{c}</strong> })}</p>
                        <textarea {...metaForm.register("notes")} maxLength={LIMITS.notes} disabled={!isEditing} placeholder={t("privateNotesPh")}
                            className={clsx(inputCls, "h-32 border-warning/20 focus:ring-warning/50")} />
                    </div>
                </section>

                <section>
                    <div className="rounded-2xl border border-success/30 bg-success/5 p-5 space-y-3">
                        <div className="flex items-center gap-2">
                            <Share2 size={16} className="text-success" />
                            <h3 className="text-lg font-bold text-success">{t("publicSummary")}</h3>
                            <span className="ml-auto px-2 py-0.5 bg-success/20 text-success rounded text-[10px] font-black uppercase tracking-wider border border-success/30 flex items-center gap-1.5"><Globe size={10} /> {t("visibleOthers")}</span>
                        </div>
                        <p className="text-xs text-success/70 leading-relaxed">{t.rich("publicSummaryHint", { b: (c) => <strong>{c}</strong> })}</p>
                        <textarea {...metaForm.register("publicSummary")} maxLength={LIMITS.publicSummary} disabled={!isEditing} placeholder={t("publicSummaryPh")}
                            className={clsx(inputCls, "h-24 border-success/20 focus:ring-success/50")} />
                        {initialData?.publicSummarySharedAt?.seconds && (
                            <div className="text-[10px] text-success/60 font-medium">
                                {t("lastShared")} {format.dateTime(new Date(initialData.publicSummarySharedAt.seconds * 1000), { dateStyle: "medium", timeStyle: "short" })}
                            </div>
                        )}
                    </div>
                </section>

                {initialData?.lastUpdatedBy && (
                    <p className="text-xs text-muted-foreground italic">{t("lastUpdatedBy", { name: initialData.lastUpdatedBy })}</p>
                )}
            </div>
        </form>
    );
}
