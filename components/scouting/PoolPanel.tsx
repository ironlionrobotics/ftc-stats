"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock, Users, RefreshCw } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getEventPoolAction, type EventPoolResult } from "@/app/actions/scouting-pool";
import { gameDefinitionFor } from "@/lib/games/registry";
import { selfReportDefinition, type GameDefinition, type GameField } from "@/types/game-definition";
import { shareableFieldIds, type PoolBucket, type PoolField } from "@/lib/scouting-pool";
import { getTeamProfile } from "@/lib/team-profile-service";
import type { TeamProfile } from "@/types/team-profile";

/**
 * Shared event pool for one robot (#102): what the team says about itself
 * (Trading Card self-report), what all contributing teams observed in
 * official matches, and in practice — side by side, field by field.
 * Sources are pseudonymous letters; the pool unlocks after contributing.
 */
export default function PoolPanel({ season, eventCode, teamNumber }: { season: number; eventCode: string; teamNumber: number }) {
    const t = useTranslations("ScoutingPool");
    const tGames = useTranslations("Games");
    const tErr = useTranslations("Errors");
    const { user } = useAuth();
    const [result, setResult] = useState<EventPoolResult | null>(null);
    const [profile, setProfile] = useState<TeamProfile | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    const def = gameDefinitionFor("FTC", season);
    const selfReport = selfReportDefinition(def);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            const idToken = await user.getIdToken();
            const [pool, prof] = await Promise.all([
                getEventPoolAction({ idToken, season, eventCode, teamNumber }),
                getTeamProfile(season, teamNumber).catch(() => null),
            ]);
            if (cancelled) return;
            setResult(pool);
            setProfile(prof);
        })();
        return () => { cancelled = true; };
    }, [user, season, eventCode, teamNumber, reloadKey]);

    if (!user) return <p className="p-6 text-muted-foreground">{t("signIn")}</p>;
    if (!result) return <p className="p-6 text-muted-foreground">{t("loading")}</p>;
    if (!result.ok) return <p className="p-6 text-danger">{tErr(result.code)}</p>;

    if (result.locked) {
        return (
            <div className="rounded-xl border border-border bg-muted p-6 space-y-3">
                <div className="flex items-center gap-2 font-bold text-foreground"><Lock size={18} /> {t("lockedTitle")}</div>
                <p className="text-sm text-muted-foreground">{t("lockedBody", { needed: result.needed, event: eventCode })}</p>
                <div className="h-2 w-full overflow-hidden rounded-full bg-background" role="progressbar" aria-valuemin={0} aria-valuemax={result.needed} aria-valuenow={result.myCount}>
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (result.myCount / result.needed) * 100)}%` }} />
                </div>
                <p className="text-xs text-muted-foreground">{t("progress", { n: result.myCount, needed: result.needed })}</p>
                <SelfReportOnly profile={profile} selfReport={selfReport} />
            </div>
        );
    }

    const summary = result.teams.find(s => s.teamNumber === teamNumber);
    const fields: GameField[] = def
        ? def.sections.flatMap(s => s.fields).filter(f => shareableFieldIds(def).includes(f.id))
        : [];
    const answers = profile && selfReport && profile.answersDefinitionId === selfReport.id ? profile.answers : undefined;
    const claimScore = answers && def?.score ? def.score({
        num: id => Number(answers[id] ?? 0) || 0,
        flag: id => answers[id] === true,
        cat: id => (typeof answers[id] === "string" ? (answers[id] as string) : undefined),
    }) : null;

    const fmt = (f: PoolField | undefined) => {
        if (!f) return "—";
        if (f.kind === "numeric") return f.sd > 0 ? `${f.mean} ±${f.sd}` : String(f.mean);
        return `${valueLabel(f.value)} · ${Math.round(f.share * 100)}%`;
    };
    const valueLabel = (v: unknown, field?: GameField) => {
        if (v === true) return t("yes");
        if (v === false) return t("no");
        if (field?.kind === "enum") {
            const opt = field.options.find(o => o.value === v);
            if (opt) return tGames(opt.label);
        }
        return v === undefined || v === null || v === "" ? "—" : String(v);
    };
    const total = (s: { auto: number; teleop: number; endgame: number } | null | undefined) =>
        s ? Math.round((s.auto + s.teleop + s.endgame) * 10) / 10 : null;

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Users size={16} /> {t("summary", { sources: result.sourceCount, alias: result.myAlias })}
                </p>
                <button type="button" onClick={() => setReloadKey(k => k + 1)} className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground hover:text-foreground">
                    <RefreshCw size={14} /> {t("refresh")}
                </button>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center">
                <Total label={t("colClaim")} value={total(claimScore)} />
                <Total label={t("colOfficial")} value={total(summary?.official?.score)} note={bucketNote(summary?.official, t)} />
                <Total label={t("colPractice")} value={total(summary?.practice?.score)} note={bucketNote(summary?.practice, t)} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                    <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2">{t("colField")}</th>
                            <th className="px-3 py-2">{t("colClaim")}</th>
                            <th className="px-3 py-2">{t("colOfficial")}</th>
                            <th className="px-3 py-2">{t("colPractice")}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {fields.map(f => (
                            <tr key={f.id}>
                                <td className="px-3 py-2 text-foreground">{tGames(f.label)}</td>
                                <td className="px-3 py-2 tabular-nums">{answers && f.id in answers ? valueLabel(answers[f.id], f) : "—"}</td>
                                <td className={`px-3 py-2 tabular-nums ${summary?.official?.flagged.includes(f.id) ? "text-warning" : ""}`}>{fmt(summary?.official?.fields[f.id])}</td>
                                <td className="px-3 py-2 tabular-nums text-muted-foreground">{fmt(summary?.practice?.fields[f.id])}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-muted-foreground">{t("legend")}</p>

            {result.pit.length > 0 && (
                <div className="space-y-2">
                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("pitTitle")}</h4>
                    {result.pit.map((p, i) => (
                        <p key={i} className="rounded-lg border border-border bg-muted p-3 text-sm">
                            <span className="mr-2 font-mono text-xs text-muted-foreground">{t("source", { alias: p.source })}</span>{p.text}
                        </p>
                    ))}
                </div>
            )}
        </div>
    );
}

function bucketNote(b: PoolBucket | null | undefined, t: ReturnType<typeof useTranslations<"ScoutingPool">>): string {
    if (!b) return t("noData");
    return t("bucketNote", { obs: b.observations, sources: b.sources.length });
}

function Total({ label, value, note }: { label: string; value: number | null; note?: string }) {
    return (
        <div className="rounded-xl border border-border bg-card p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
            <div className="font-mono text-2xl font-black tabular-nums">{value ?? "—"}</div>
            {note && <div className="text-[11px] text-muted-foreground">{note}</div>}
        </div>
    );
}

function SelfReportOnly({ profile, selfReport }: { profile: TeamProfile | null; selfReport: GameDefinition | null }) {
    const t = useTranslations("ScoutingPool");
    const tGames = useTranslations("Games");
    const answers = profile?.answers && selfReport && profile.answersDefinitionId === selfReport.id ? profile.answers : null;
    if (!answers || !selfReport) return <p className="text-xs text-muted-foreground">{t("noSelfReport")}</p>;
    const rows = selfReport.sections.flatMap(sec => sec.fields).filter(f => f.id in answers && answers[f.id] !== "" && answers[f.id] !== false);
    return (
        <div className="space-y-1 pt-2">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("colClaim")}</h4>
            <ul className="grid grid-cols-1 gap-x-4 text-sm sm:grid-cols-2">
                {rows.map(f => {
                    const v = answers[f.id];
                    const opt = f.kind === "enum" ? f.options.find(o => o.value === v) : undefined;
                    return (
                        <li key={f.id} className="flex justify-between gap-2 border-b border-border py-1">
                            <span className="text-muted-foreground">{tGames(f.label)}</span>
                            <span className="tabular-nums">{v === true ? t("yes") : opt ? tGames(opt.label) : String(v)}</span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
