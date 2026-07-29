"use client";

import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Trophy, ImageIcon, ArrowUp, Crosshair, Target, Download, Upload } from "lucide-react";
import type { TeamProfile, MeasuredStats } from "@/types/team-profile";

/**
 * The shareable Trading Card. Left half of every stat pairing is SELF-REPORTED
 * (what the team claims); the "Measured · official" strip is derived from FIRST
 * results (MeasuredStats) — the ground-truth anchor. Presentation only: it
 * takes a fully-resolved profile so the editor can feed it live form values and
 * a future public view can feed a saved profile unchanged.
 */
export default function TradingCardPreview({
    profile,
    teamName,
    measured,
}: {
    profile: TeamProfile;
    teamName?: string;
    measured: MeasuredStats | null;
}) {
    const t = useTranslations("TradingCard");
    const { capabilities: cap, points, descriptions, photoUrl } = profile;

    const capChips: { on: boolean; label: string; icon: React.ElementType }[] = [
        { on: cap.canClimb, label: t("canClimb"), icon: ArrowUp },
        { on: cap.scoresNear, label: t("scoresNear"), icon: Crosshair },
        { on: cap.scoresFar, label: t("scoresFar"), icon: Target },
        { on: cap.groundIntake, label: t("groundIntake"), icon: Download },
        { on: cap.sourceIntake, label: t("sourceIntake"), icon: Upload },
    ].filter(c => c.on);

    return (
        <div className="w-full max-w-sm rounded-3xl border border-border bg-card overflow-hidden shadow-lg">
            {/* Header */}
            <div className="relative bg-gradient-to-br from-primary/25 via-card to-secondary/20 p-5 pb-4">
                <div className="flex items-start justify-between">
                    <div>
                        <div className="text-4xl font-black text-foreground font-display leading-none tracking-tight">
                            {profile.teamNumber}
                        </div>
                        {teamName && <div className="text-sm font-bold text-muted-foreground mt-1">{teamName}</div>}
                    </div>
                    {measured?.rank != null && (
                        <div className="flex items-center gap-1.5 rounded-full bg-primary/15 border border-primary/30 px-3 py-1 text-primary">
                            <Trophy size={13} />
                            <span className="text-xs font-black tracking-wider">{t("rank")} #{measured.rank}</span>
                        </div>
                    )}
                </div>
                {measured?.eventName && (
                    <div className="mt-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {measured.eventName}
                    </div>
                )}
            </div>

            {/* Robot photo */}
            <div className="mx-5 -mt-1 mb-4 aspect-video rounded-2xl border border-border bg-muted flex items-center justify-center overflow-hidden">
                {photoUrl ? (
                    // Arbitrary user-supplied URL (any domain) → plain <img>, not
                    // next/image, which would need every host in remotePatterns.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt={String(profile.teamNumber)} className="w-full h-full object-cover" />
                ) : (
                    <div className="flex flex-col items-center gap-1 text-muted-foreground/50">
                        <ImageIcon size={28} />
                    </div>
                )}
            </div>

            {/* Measured strip (ground truth) */}
            <div className="mx-5 mb-4 rounded-2xl border border-secondary/25 bg-secondary/5 p-3">
                <div className="text-[9px] font-black uppercase tracking-widest text-secondary mb-2">{t("measured")}</div>
                {measured ? (
                    <div className="grid grid-cols-3 gap-2 text-center">
                        <MiniStat label={t("rank")} value={measured.rank != null ? `#${measured.rank}` : t("none")} />
                        <MiniStat
                            label={t("record")}
                            value={measured.record ? `${measured.record.wins}-${measured.record.losses}-${measured.record.ties}` : t("none")}
                        />
                        <MiniStat label={t("avgScore")} value={measured.avgScore != null ? String(measured.avgScore) : t("none")} />
                    </div>
                ) : (
                    <div className="text-[11px] text-muted-foreground italic">{t("noMeasured")}</div>
                )}
            </div>

            {/* Self-reported points */}
            <div className="mx-5 mb-4">
                <div className="text-[9px] font-black uppercase tracking-widest text-primary mb-2">{t("claimed")}</div>
                <div className="grid grid-cols-3 gap-2">
                    <PhaseCell label={t("auto")} p={points.auto} />
                    <PhaseCell label={t("teleop")} p={points.teleop} />
                    <PhaseCell label={t("endgame")} p={points.endgame} />
                </div>
            </div>

            {/* Capability chips */}
            {(capChips.length > 0 || cap.drivetrain) && (
                <div className="mx-5 mb-4 flex flex-wrap gap-1.5">
                    {cap.drivetrain && (
                        <span className="rounded-full bg-muted border border-border px-2.5 py-1 text-[10px] font-bold text-foreground">
                            {cap.drivetrain}
                        </span>
                    )}
                    {capChips.map(c => (
                        <span key={c.label} className="inline-flex items-center gap-1 rounded-full bg-primary/10 border border-primary/25 px-2.5 py-1 text-[10px] font-bold text-primary">
                            <c.icon size={11} /> {c.label}
                            {c.label === t("canClimb") && cap.climbLevel ? ` · ${cap.climbLevel}` : ""}
                        </span>
                    ))}
                </div>
            )}

            {/* Robot description */}
            {descriptions.robot && (
                <p className="mx-5 mb-5 text-xs text-muted-foreground leading-relaxed line-clamp-4">
                    {descriptions.robot}
                </p>
            )}
        </div>
    );
}

function MiniStat({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <div className="text-sm font-black text-foreground tabular-nums">{value}</div>
            <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
        </div>
    );
}

function PhaseCell({ label, p }: { label: string; p: { low: number; high: number } }) {
    const empty = p.low === 0 && p.high === 0;
    return (
        <div className={clsx("rounded-xl border p-2 text-center", empty ? "border-border bg-muted/40" : "border-primary/20 bg-primary/5")}>
            <div className="text-sm font-black text-foreground tabular-nums">
                {empty ? "—" : p.low === p.high ? p.high : `${p.low}–${p.high}`}
            </div>
            <div className="text-[8px] font-bold uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
        </div>
    );
}
