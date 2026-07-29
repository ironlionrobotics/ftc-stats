"use client";

import { useEffect, useState } from "react";
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

export default function TradingCardEditor() {
    const t = useTranslations("TradingCard");
    const { user, orgId } = useAuth();
    const season = getCurrentSeason();
    const teamNumber = orgId ? Number(orgId) : null;

    const [measured, setMeasured] = useState<MeasuredStats | null>(null);
    const [loaded, setLoaded] = useState(false);

    const { control, handleSubmit, reset, formState: { isSubmitting } } = useForm<TeamProfileFormValues>({
        resolver: zodResolver(teamProfileFormSchema) as Resolver<TeamProfileFormValues>,
        defaultValues: profileToForm(emptyTeamProfile(teamNumber ?? 0, season)),
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
            setMeasured(stats);
            setLoaded(true);
        })();
        return () => { cancelled = true; };
    }, [teamNumber, season, reset]);

    // Live preview reflects unsaved edits.
    const values = useWatch({ control }) as TeamProfileFormValues;
    const livePreview = formToProfile(values, teamNumber ?? 0, season);

    const onSubmit = async (v: TeamProfileFormValues) => {
        if (!teamNumber) return;
        try {
            await saveTeamProfile(formToProfile(v, teamNumber, season));
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
                {/* Capabilities */}
                <Section title={t("capabilities")}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <Toggle control={control} name="canClimb" label={t("canClimb")} />
                        <TextField control={control} name="climbLevel" label={t("climbLevel")} placeholder={t("climbLevelPlaceholder")} />
                        <Toggle control={control} name="scoresNear" label={t("scoresNear")} />
                        <Toggle control={control} name="scoresFar" label={t("scoresFar")} />
                        <Toggle control={control} name="groundIntake" label={t("groundIntake")} />
                        <Toggle control={control} name="sourceIntake" label={t("sourceIntake")} />
                        <TextField control={control} name="drivetrain" label={t("drivetrain")} placeholder={t("drivetrainPlaceholder")} />
                    </div>
                </Section>

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
                <TradingCardPreview profile={livePreview} measured={loaded ? measured : null} />
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

function Toggle({ control, name, label }: { control: Ctl; name: "canClimb" | "scoresNear" | "scoresFar" | "groundIntake" | "sourceIntake"; label: string }) {
    return (
        <Controller
            control={control}
            name={name}
            render={({ field }) => (
                <label className={`min-h-[44px] flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${field.value ? "bg-primary/15 border-primary/40" : "bg-muted border-border hover:border-foreground/20"}`}>
                    <input type="checkbox" checked={!!field.value} onChange={e => field.onChange(e.target.checked)} className="w-4 h-4 accent-primary" />
                    <span className={`text-sm font-medium ${field.value ? "text-foreground" : "text-muted-foreground"}`}>{label}</span>
                </label>
            )}
        />
    );
}

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
