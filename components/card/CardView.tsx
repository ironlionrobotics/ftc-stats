"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { getTeamProfile } from "@/lib/team-profile-service";
import { getMeasuredStatsAction } from "@/app/actions/team-card";
import { gameDefinitionFor } from "@/lib/games/registry";
import { selfReportDefinition, type GameDefinition } from "@/types/game-definition";
import { generalQuestions } from "@/lib/team-profile/general-questions";
import type { MeasuredStats, TeamProfile } from "@/types/team-profile";
import type { TeamMedia } from "@/lib/team-media";
import TradingCardPreview from "./TradingCardPreview";
import MediaGallery, { useProfilePhotoUrl } from "./MediaGallery";

/**
 * Another team's Trading Card (#106/#107), for members of approved teams:
 * the card, its photos and clips, every answer (general + this season) and
 * the official facts from FIRST next to them.
 */
export default function CardView({ season, teamNumber }: { season: number; teamNumber: number }) {
    const t = useTranslations("CardView");
    const { user, orgId, userDoc, loading } = useAuth();
    const [profile, setProfile] = useState<TeamProfile | null | undefined>(undefined);
    const [measured, setMeasured] = useState<MeasuredStats | null>(null);
    const [media, setMedia] = useState<TeamMedia[]>([]);
    const seasonDef = useMemo(() => gameDefinitionFor("FTC", season), [season]);
    const selfReport = useMemo(() => selfReportDefinition(seasonDef), [seasonDef]);
    const general = useMemo(() => generalQuestions(seasonDef), [seasonDef]);
    const [profileMediaId, setProfileMediaId] = useState<string | null>(null);
    const photo = useProfilePhotoUrl(media, profileMediaId);
    const own = orgId === String(teamNumber);
    const canManage = own && (userDoc?.role === "admin" || userDoc?.role === "lead");

    useEffect(() => {
        if (!orgId) return;
        let cancelled = false;
        (async () => {
            const [p, m] = await Promise.all([
                getTeamProfile(season, teamNumber).catch(() => null),
                getMeasuredStatsAction(season, teamNumber).catch(() => null),
            ]);
            if (cancelled) return;
            setProfile(p);
            setProfileMediaId(p?.profileMediaId ?? null);
            setMeasured(m);
        })();
        return () => { cancelled = true; };
    }, [orgId, season, teamNumber]);

    if (loading) return null;
    if (!user) return <Notice>{t("signIn")}</Notice>;
    if (!orgId) return <Notice>{t("needTeam")}</Notice>;
    if (profile === undefined) return <Notice>{t("loading")}</Notice>;

    const shown: TeamProfile = profile ?? { teamNumber, season, capabilities: { canClimb: false, climbLevel: "", scoresNear: false, scoresFar: false, groundIntake: false, sourceIntake: false, drivetrain: "" }, points: { auto: { low: 0, high: 0 }, teleop: { low: 0, high: 0 }, endgame: { low: 0, high: 0 } }, descriptions: { robot: "", autonomous: "", strategy: "" }, photoUrl: "" };
    const answers = profile && selfReport && profile.answersDefinitionId === selfReport.id ? profile.answers : undefined;

    return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
            <div className="space-y-4">
                <TradingCardPreview profile={shown} teamName={measured?.team?.name} measured={measured} selfReport={selfReport} general={general} profilePhotoUrl={photo} />
                {own && <Link href="/card" className="block text-sm underline">{t("editOwn")}</Link>}
                <Facts measured={measured} />
            </div>
            <div className="space-y-6">
                {!profile && <Notice>{t("noCard")}</Notice>}
                <section>
                    <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">{t("media")}</h2>
                    <MediaGallery season={season} teamNumber={teamNumber} uid={user.uid} canManage={canManage}
                        profileMediaId={profileMediaId} onMedia={setMedia} onProfileChange={setProfileMediaId} />
                </section>
                <Answers title={t("general")} def={general} values={profile?.general} />
                {selfReport && <Answers title={t("season", { game: seasonDef?.label ?? "" })} def={selfReport} values={answers} />}
            </div>
        </div>
    );
}

function Notice({ children }: { children: React.ReactNode }) {
    return <p className="rounded-xl border border-border bg-muted p-6 text-muted-foreground">{children}</p>;
}

function Facts({ measured }: { measured: MeasuredStats | null }) {
    const t = useTranslations("CardView");
    const team = measured?.team;
    if (!team && !measured?.awards?.length) return null;
    return (
        <div className="space-y-1 rounded-xl border border-border bg-card p-3 text-sm">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("facts")}</h3>
            {team?.rookieYear && <p>{t("rookie", { year: team.rookieYear })}</p>}
            {(team?.city || team?.state) && <p>{[team.city, team.state, team.country].filter(Boolean).join(", ")}</p>}
            {measured?.awards && measured.awards.length > 0 && <p>{t("awards", { list: measured.awards.join(" · ") })}</p>}
        </div>
    );
}

function Answers({ title, def, values }: { title: string; def: GameDefinition; values?: Record<string, number | boolean | string> }) {
    const t = useTranslations("CardView");
    const tGames = useTranslations("Games");
    const rows = def.sections.flatMap(s => s.fields).filter(f => values && f.id in values && values[f.id] !== "" && values[f.id] !== false && !(f.kind === "counter" && values[f.id] === 0));
    return (
        <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted-foreground">{title}</h2>
            {rows.length === 0 ? <p className="text-sm text-muted-foreground">{t("noAnswers")}</p> : (
                <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                    {rows.map(f => {
                        const v = values![f.id];
                        const opt = f.kind === "enum" ? f.options.find(o => o.value === v) : undefined;
                        return (
                            <div key={f.id} className="flex justify-between gap-3 border-b border-border py-1.5 text-sm">
                                <dt className="text-muted-foreground">{tGames(f.label)}</dt>
                                <dd className="text-right font-medium tabular-nums">{v === true ? t("yes") : opt ? tGames(opt.label) : String(v)}</dd>
                            </div>
                        );
                    })}
                </dl>
            )}
        </section>
    );
}
