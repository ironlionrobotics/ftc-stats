"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { getEventPoolAction, type EventPoolResult } from "@/app/actions/scouting-pool";
import type { PoolBucket } from "@/lib/scouting-pool";

/**
 * Every robot of the event as seen by all contributing teams (#102): typical
 * contribution per phase from official matches, how many observations and
 * sources back it. Sorted by total — a starting point for the picklist.
 */
export default function EventPoolTable({ season, eventCode }: { season: number; eventCode: string }) {
    const t = useTranslations("ScoutingPool");
    const tErr = useTranslations("Errors");
    const { user } = useAuth();
    const [result, setResult] = useState<EventPoolResult | null>(null);

    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        (async () => {
            const r = await getEventPoolAction({ idToken: await user.getIdToken(), season, eventCode });
            if (!cancelled) setResult(r);
        })();
        return () => { cancelled = true; };
    }, [user, season, eventCode]);

    if (!user) return <p className="p-6 text-muted-foreground">{t("signIn")}</p>;
    if (!result) return <p className="p-6 text-muted-foreground">{t("loading")}</p>;
    if (!result.ok) return <p className="p-6 text-danger">{tErr(result.code)}</p>;
    if (result.locked) {
        return (
            <div className="space-y-2 rounded-xl border border-border bg-muted p-6">
                <div className="flex items-center gap-2 font-bold"><Lock size={18} /> {t("lockedTitle")}</div>
                <p className="text-sm text-muted-foreground">{t("lockedBody", { needed: result.needed, event: eventCode })}</p>
                <p className="text-xs text-muted-foreground">{t("progress", { n: result.myCount, needed: result.needed })}</p>
            </div>
        );
    }
    const total = (b: PoolBucket | null) => (b?.score ? b.score.auto + b.score.teleop + b.score.endgame : null);
    const rows = [...result.teams].sort((a, b) => (total(b.official) ?? -1) - (total(a.official) ?? -1));
    const r1 = (n: number | null | undefined) => (n == null ? "—" : Math.round(n * 10) / 10);

    return (
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{t("summary", { sources: result.sourceCount, alias: result.myAlias })}</p>
            <div className="overflow-x-auto rounded-xl border border-border">
                <table className="w-full text-sm">
                    <thead className="bg-muted text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <tr>
                            <th className="px-3 py-2">{t("team")}</th>
                            <th className="px-3 py-2">{t("colOfficial")}</th>
                            <th className="px-3 py-2">{t("auto")}</th>
                            <th className="px-3 py-2">{t("teleop")}</th>
                            <th className="px-3 py-2">{t("endgame")}</th>
                            <th className="px-3 py-2">{t("backing")}</th>
                            <th className="px-3 py-2">{t("colPractice")}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {rows.map(row => (
                            <tr key={row.teamNumber}>
                                <td className="px-3 py-2 font-mono font-bold">{row.teamNumber}</td>
                                <td className="px-3 py-2 font-mono font-black tabular-nums">{r1(total(row.official))}</td>
                                <td className="px-3 py-2 tabular-nums">{r1(row.official?.score?.auto)}</td>
                                <td className="px-3 py-2 tabular-nums">{r1(row.official?.score?.teleop)}</td>
                                <td className="px-3 py-2 tabular-nums">{r1(row.official?.score?.endgame)}</td>
                                <td className="px-3 py-2 text-xs text-muted-foreground">
                                    {row.official ? t("bucketNote", { obs: row.official.observations, sources: row.official.sources.length }) : t("noData")}
                                </td>
                                <td className="px-3 py-2 tabular-nums text-muted-foreground">{r1(total(row.practice))}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-muted-foreground">{t("tableLegend")}</p>
        </div>
    );
}
