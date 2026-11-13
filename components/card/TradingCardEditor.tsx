"use client";

import { useEffect, useMemo, useState } from "react";
import { useForm, Controller, useWatch, type Control, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Save, Loader2, IdCard } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getCurrentSeason } from "@/lib/constants";
import { Card } from "@/components/ui/Card";
import { teamProfileFormSchema, type TeamProfileFormValues } from "@/lib/schemas/team-profile";
import {
    getTeamProfile,
    saveTeamProfile,
    profileToForm,
    formToProfile,
    emptyTeamProfile,
} from "@/lib/team-profile-service";
import { getMeasuredStatsAction } from "@/app/actions/team-card";
import type { MeasuredStats } from "@/types/team-profile";
import TradingCardPreview from "./TradingCardPreview";
import MediaGallery, { useProfilePhotoUrl } from "./MediaGallery";
import type { TeamMedia } from "@/lib/team-media";
import DynamicGameForm from "@/components/scouting/games/DynamicGameForm";
import { gameDefinitionFor } from "@/lib/games/registry";
import { zodSchemaFromDefinition } from "@/lib/games/zod-from-definition";
import { selfReportDefinition, defaultsForDefinition } from "@/types/game-definition";
import { generalQuestions, GENERAL_QUESTIONS_VERSION } from "@/lib/team-profile/general-questions";

export default function TradingCardEditor() {
    const t = useTranslations("TradingCard");
    const { user, orgId, userDoc } = useAuth();
    const canManageMedia = userDoc?.role === "admin" || userDoc?.role === "lead";
    const [media, setMedia] = useState<TeamMedia[]>([]);
    const [profileMediaId, setProfileMediaId] = useState<string | null>(null);
    const profilePhotoUrl = useProfilePhotoUrl(media, profileMediaId);
    const season = getCurrentSeason();
    const teamNumber = orgId ? Number(orgId) : null;

    const [measured, setMeasured] = useState<MeasuredStats | null>(null);
    const [loaded, setLoaded] = useState(false);

    const { control, handleSubmit, reset, formState: { isSubmitting } } = useForm<TeamProfileFormValues>({
        resolver: zodResolver(teamProfileFormSchema) as Resolver<TeamProfileFormValues>,
        defaultValues: profileToForm(emptyTeamProfile(teamNumber ?? 0, season)),
    });

    // The season's self-report questions (#101), rendered by the same engine as
    // scouting. A second form because DynamicGameForm binds field ids at the root.
    const seasonDef = useMemo(() => gameDefinitionFor("FTC", season), [season]);
    const selfReport = useMemo(() => selfReportDefinition(seasonDef), [seasonDef]);
    const general = useMemo(() => generalQuestions(seasonDef), [seasonDef]);
    const generalSchema = useMemo(() => zodSchemaFromDefinition(general), [general]);
    const generalForm = useForm<Record<string, unknown>>({ defaultValues: defaultsForDefinition(general) });
    const selfReportSchema = useMemo(() => (selfReport ? zodSchemaFromDefinition(selfReport) : null), [selfReport]);
    const answersForm = useForm<Record<string, unknown>>({
        defaultValues: selfReport ? defaultsForDefinition(selfReport) : {},
    });

    // Load the team's published card + its measured stats once the team is known.
    useEffect(() => {
        if (!teamNumber) return;
        let cancelled = false;
        (async () => {
            const [profile, stats] = await Promise.all([
                getTeamProfile(season, teamNumber),
                getMeasuredStatsAction(season, teamNumber),
            ]);
            if (cancelled) return;
            if (profile) reset(profileToForm(profile));
            setProfileMediaId(profile?.profileMediaId ?? null);
            if (profile?.general) {
                generalForm.reset({ ...defaultsForDefinition(general), ...profile.general });
            }
            if (profile?.answers && selfReport && profile.answersDefinitionId === selfReport.id) {
                answersForm.reset({ ...defaultsForDefinition(selfReport), ...profile.answers });
            }
            setMeasured(stats);
            setLoaded(true);
        })();
        return () => { cancelled = true; };
    }, [teamNumber, season, reset, selfReport, answersForm, general, generalForm]);

    // Live preview reflects unsaved edits.
    const values = useWatch({ control }) as TeamProfileFormValues;
    const liveGeneral = useWatch({ control: generalForm.control });
    const parsedGeneral = generalSchema.safeParse(liveGeneral);
    const liveAnswers = useWatch({ control: answersForm.control });
    const parsedAnswers = selfReportSchema?.safeParse(liveAnswers);
    const livePreview = {
        ...formToProfile(values, teamNumber ?? 0, season),
        ...(parsedGeneral.success ? { general: parsedGeneral.data as Record<string, number | boolean | string>, generalVersion: GENERAL_QUESTIONS_VERSION } : {}),
        ...(selfReport && parsedAnswers?.success
            ? { answers: parsedAnswers.data as Record<string, number | boolean | string>, answersDefinitionId: selfReport.id }
            : {}),
    };

    const onSubmit = async (v: TeamProfileFormValues) => {
        if (!teamNumber) return;
        const generalParsed = generalSchema.safeParse(generalForm.getValues());
        if (!generalParsed.success) {
            toast.error(t("saveError"));
            return;
        }
        let answers: Record<string, number | boolean | string> | undefined;
        if (selfReport && selfReportSchema) {
            const parsed = selfReportSchema.safeParse(answersForm.getValues());
            if (!parsed.success) {
                toast.error(t("saveError"));
                return;
            }
            answers = parsed.data as Record<string, number | boolean | string>;
        }
        try {
            await saveTeamProfile({
                ...formToProfile(v, teamNumber, season),
                general: generalParsed.data as Record<string, number | boolean | string>,
                generalVersion: GENERAL_QUESTIONS_VERSION,
                ...(answers && selfReport ? { answers, answersDefinitionId: selfReport.id } : {}),
            });
            toast.success(t("saved"));
        } catch {
            toast.error(t("saveError"));
        }
    };

    if (!user) return <Gate>{t("signInToEdit")}</Gate>;
    if (!teamNumber) return <Gate>{t("onboardToEdit")}</Gate>;

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6 items-start">
            <div className="space-y-6 min-w-0">
                {/* Robot photos, clips and YouTube links (#106) */}
                <Section title={t("mediaTitle")} hint={canManageMedia ? t("mediaHint") : t("mediaHintViewer")}>
                    <MediaGallery
                        season={season}
                        teamNumber={teamNumber}
                        uid={user.uid}
                        canManage={canManageMedia}
                        profileMediaId={profileMediaId}
                        onMedia={setMedia}
                        onProfileChange={setProfileMediaId}
                    />
                </Section>

                {/* Questions common to every season (#107) */}
                <Section title={t("generalTitle")} hint={t("generalHint")}>
                    <DynamicGameForm
                        definition={general}
                        control={generalForm.control as unknown as Control<Record<string, unknown>>}
                    />
                </Section>

                {/* This season's game (#101/#107) */}
                {selfReport && (
                    <Section title={t("selfReportTitle")} hint={t("selfReportHint")}>
                        <DynamicGameForm
                            definition={selfReport}
                            control={answersForm.control as unknown as Control<Record<string, unknown>>}
                        />
                    </Section>
                )}

                {/* Self-reported points */}
                <Section title={t("points")} hint={t("pointsHint")}>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <PhaseRange control={control} label={t("auto")} lowName="autoLow" highName="autoHigh" lowLabel={t("low")} highLabel={t("high")} />
                        <PhaseRange control={control} label={t("teleop")} lowName="teleopLow" highName="teleopHigh" lowLabel={t("low")} highLabel={t("high")} />
                        <PhaseRange control={control} label={t("endgame")} lowName="endgameLow" highName="endgameHigh" lowLabel={t("low")} highLabel={t("high")} />
                    </div>
                </Section>

                {/* Descriptions */}
                <Section title={t("descriptions")}>
                    <div className="space-y-4">
                        <TextArea control={control} name="robot" label={t("robot")} placeholder={t("robotPlaceholder")} />
                        <TextArea control={control} name="autonomous" label={t("autonomous")} placeholder={t("autonomousPlaceholder")} />
                        <TextArea control={control} name="strategy" label={t("strategy")} placeholder={t("strategyPlaceholder")} />
                        <TextField control={control} name="photoUrl" label={t("photo")} placeholder={t("photoPlaceholder")} />
                    </div>
                </Section>

                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full py-4 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-3 shadow-sm transition-all text-lg active:scale-[0.99]"
                >
                    {isSubmitting ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                    {isSubmitting ? t("publishing") : t("publish")}
                </button>
            </div>

            {/* Live preview */}
            <div className="xl:sticky xl:top-6 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-muted-foreground">
                    <IdCard size={14} /> {t("previewTitle")}
                </div>
                <TradingCardPreview profile={livePreview} measured={loaded ? measured : null} selfReport={selfReport} general={general} profilePhotoUrl={profilePhotoUrl} />
            </div>
        </form>
    );
}

// ---------------------------------------------------------------------------

function Gate({ children }: { children: React.ReactNode }) {
    return (
        <Card className="p-10 bg-muted border-border text-center text-muted-foreground max-w-md mx-auto">
            {children}
        </Card>
    );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
    return (
        <Card className="p-5 bg-muted border-border space-y-4">
            <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-primary">{title}</h3>
                {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
            </div>
            {children}
        </Card>
    );
}

type Ctl = Control<TeamProfileFormValues>;

function TextField({ control, name, label, placeholder }: { control: Ctl; name: "climbLevel" | "drivetrain" | "photoUrl"; label: string; placeholder?: string }) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</label>
            <Controller
                control={control}
                name={name}
                render={({ field }) => (
                    <input
                        {...field}
                        value={(field.value as string) ?? ""}
                        placeholder={placeholder}
                        className="w-full min-h-[44px] px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:ring-2 focus:ring-primary outline-none"
                    />
                )}
            />
        </div>
    );
}

function TextArea({ control, name, label, placeholder }: { control: Ctl; name: "robot" | "autonomous" | "strategy"; label: string; placeholder?: string }) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{label}</label>
            <Controller
                control={control}
                name={name}
                render={({ field }) => (
                    <textarea
                        {...field}
                        value={(field.value as string) ?? ""}
                        placeholder={placeholder}
                        className="w-full h-20 px-3 py-2 bg-card border border-border rounded-lg text-foreground text-sm focus:ring-2 focus:ring-primary outline-none resize-none"
                    />
                )}
            />
        </div>
    );
}

function PhaseRange({
    control, label, lowName, highName, lowLabel, highLabel,
}: {
    control: Ctl;
    label: string;
    lowName: "autoLow" | "teleopLow" | "endgameLow";
    highName: "autoHigh" | "teleopHigh" | "endgameHigh";
    lowLabel: string;
    highLabel: string;
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-foreground mb-2">{label}</div>
            <div className="grid grid-cols-2 gap-2">
                <NumberBox control={control} name={lowName} label={lowLabel} />
                <NumberBox control={control} name={highName} label={highLabel} />
            </div>
        </div>
    );
}

function NumberBox({ control, name, label }: { control: Ctl; name: "autoLow" | "autoHigh" | "teleopLow" | "teleopHigh" | "endgameLow" | "endgameHigh"; label: string }) {
    return (
        <div>
            <label className="block text-[9px] font-bold text-muted-foreground uppercase mb-1">{label}</label>
            <Controller
                control={control}
                name={name}
                render={({ field }) => (
                    <input
                        {...field}
                        value={(field.value as number) ?? 0}
                        type="number"
                        min={0}
                        className="w-full min-h-[40px] px-2 py-1.5 bg-muted border border-border rounded-lg text-foreground text-sm font-bold tabular-nums focus:ring-2 focus:ring-primary outline-none"
                    />
                )}
            />
        </div>
    );
}
