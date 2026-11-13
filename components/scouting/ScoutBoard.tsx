"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import clsx from "clsx";
import { useAuth } from "@/context/AuthContext";
import { listenToScoutClaims } from "@/lib/scouting-service";
import { claimRobotAction, releaseRobotAction, myScoutIdentityAction } from "@/app/actions/scout-claims";
import { claimDocId, matchCoverage, suggestions, type ClaimDoc, type ScheduledMatch } from "@/lib/scout-claims";

/**
 * Scout assignment board (#103): every upcoming qualification match with its
 * four robots, who is watching each (team letters, pseudonymous) and the
 * coverage of the match. A scout taps a robot to take it; teams split the
 * field instead of all watching the same robots.
 */
export default function ScoutBoard({
    season,
    eventCode,
    matches,
    onScoutTeam,
}: {
    season: number;
    eventCode: string;
    matches: ScheduledMatch[];
    onScoutTeam: (teamNumber: number) => void;
}) {
    const t = useTranslations("ScoutBoard");
    const tErr = useTranslations("Errors");
    const format = useFormatter();
    const { user } = useAuth();
    const [docs, setDocs] = useState<Record<string, ClaimDoc>>({});
    const [me, setMe] = useState<{ alias: string; scout: string } | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    useEffect(() => listenToScoutClaims(season, eventCode, setDocs), [season, eventCode]);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            try {
                const r = await myScoutIdentityAction({ idToken: await user.getIdToken(), season, eventCode });
                if (!cancelled && r.ok) setMe({ alias: r.alias, scout: r.scout });
            } catch { /* board still works read-only */ }
        })();
        return () => { cancelled = true; };
    }, [user, season, eventCode]);

    const next = useMemo(
        () => (me ? suggestions(matches, docs, season, eventCode, me.scout, 3) : []),
        [matches, docs, season, eventCode, me],
    );

    const act = async (matchNumber: number, teamNumber: number | null) => {
        if (!user) return;
        const key = `${matchNumber}_${teamNumber ?? "x"}`;
        setBusy(key);
        try {
            const idToken = await user.getIdToken();
            const r = teamNumber === null
                ? await releaseRobotAction({ idToken, season, eventCode, matchNumber })
                : await claimRobotAction({ idToken, season, eventCode, matchNumber, teamNumber });
            if (!r.ok) toast.error(tErr(r.code));
        } catch {
            toast.error(tErr("generic"));
        } finally {
            setBusy(null);
        }
    };

    if (!user) return <p className="p-6 text-muted-foreground">{t("signIn")}</p>;
    if (matches.length === 0) return <p className="p-6 text-muted-foreground">{t("noSchedule")}</p>;

    return (
        <div className="space-y-4">
            {me && <p className="text-sm text-muted-foreground">{t("intro", { alias: me.alias })}</p>}

            {next.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-3">
                    <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("suggested")}</h3>
                    <div className="flex flex-wrap gap-2">
                        {next.map(s => (
                            <button key={`${s.match.matchNumber}_${s.team}`} type="button" disabled={busy !== null}
                                onClick={() => act(s.match.matchNumber, s.team)}
                                className="min-h-[40px] rounded-lg border border-primary/40 bg-primary/10 px-3 text-sm font-semibold text-foreground hover:bg-primary/20">
                                {t("takeShort", { match: s.match.description, team: s.team })}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            <ul className="space-y-2">
                {matches.map(m => {
                    const claims = docs[claimDocId(season, eventCode, m.level, m.matchNumber)]?.claims ?? {};
                    const cov = matchCoverage(m, claims);
                    const time = m.startTime && Number.isFinite(Date.parse(m.startTime))
                        ? format.dateTime(new Date(m.startTime), { hour: "numeric", minute: "2-digit" }) : null;
                    const myTeam = me ? Object.entries(claims).find(([, list]) => list.some(c => c.scout === me.scout))?.[0] : undefined;
                    return (
                        <li key={m.matchNumber} className="rounded-xl border border-border bg-card p-3">
                            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                                <span className="font-mono font-black">{m.description}{time && <span className="ml-2 text-xs font-normal text-muted-foreground">{time}</span>}</span>
                                <span className={clsx("text-xs font-semibold", cov.covered === cov.total ? "text-success" : "text-muted-foreground")}>
                                    {t("coverage", { covered: cov.covered, total: cov.total })}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                                {[...m.red.map(n => ({ n, red: true })), ...m.blue.map(n => ({ n, red: false }))].map(({ n, red }) => {
                                    const list = claims[String(n)] ?? [];
                                    const mine = myTeam === String(n);
                                    return (
                                        <div key={n} className={clsx("rounded-lg border p-2", mine ? "border-primary bg-primary/10" : "border-border")}
                                            style={{ borderLeftWidth: 4, borderLeftColor: red ? "var(--color-alliance-red)" : "var(--color-alliance-blue)" }}>
                                            <Link href={`/card/${n}`} className="font-mono text-lg font-black tabular-nums hover:underline">{n}</Link>
                                            <div className="min-h-[1.25rem] text-xs text-muted-foreground">
                                                {list.length === 0 ? t("free") : t("watchedBy", { who: [...new Set(list.map(c => c.alias))].join(", ") })}
                                                {list.length > 1 && <span className="ml-1 text-warning">· {t("duplicate")}</span>}
                                            </div>
                                            <div className="mt-1 flex gap-1">
                                                {mine ? (
                                                    <>
                                                        <button type="button" onClick={() => onScoutTeam(n)} className="min-h-[36px] flex-1 rounded-md bg-primary px-2 text-xs font-bold text-primary-foreground">{t("scoutNow")}</button>
                                                        <button type="button" disabled={busy !== null} onClick={() => act(m.matchNumber, null)} className="min-h-[36px] rounded-md border border-border px-2 text-xs">{t("release")}</button>
                                                    </>
                                                ) : (
                                                    <button type="button" disabled={busy !== null} onClick={() => act(m.matchNumber, n)}
                                                        className="min-h-[36px] w-full rounded-md border border-border px-2 text-xs font-semibold hover:bg-muted">
                                                        {busy === `${m.matchNumber}_${n}` ? "…" : t("take")}
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
