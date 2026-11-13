"use client";

import { useEffect, useState, useMemo } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { fetchLiveProjectionAction } from "@/app/actions/live-projection";
import type { LiveProjectionResult, RankingProjection } from "@/lib/live-projection";
import type { AggregatedTeamStats } from "@/types/scouting";
import { guessActiveEventCode } from "@/lib/active-event";
import { Card } from "@/components/ui/Card";
import { Loader2, ArrowUp, ArrowDown, Minus, RefreshCw, AlertCircle, Trophy, Star } from "lucide-react";
import clsx from "clsx";

interface LiveRankingProjectionProps {
    teams: AggregatedTeamStats[];
}

/**
 * Live ranking projection for an event in progress.
 *
 * The strategy lead picks an event (defaults to whatever the teams list
 * suggests as primary) and gets a re-ranked table: the median simulated final
 * rank, its 10–90% range, and the chance of finishing top 4 (lib/live-projection.ts,
 * Monte Carlo of the remaining schedule, decision #95). Teams in the user's org are
 * highlighted so they're easy to spot in big events.
 *
 * Refresh button is manual — re-pulls rankings and matches via the cached
 * Smart TTL (60s during active events). No polling: leaving a tab open all
 * day shouldn't hammer the API.
 */
export default function LiveRankingProjection({ teams }: LiveRankingProjectionProps) {
    const { orgId } = useAuth();
    const { season } = useProgram();
    const t = useTranslations("LiveRanking");
    const format = useFormatter();

    // Unique event codes from the loaded teams, with the event currently in
    // progress (or most recent) first so the strategy lead lands on the event
    // they're at.
    const eventCodes = useMemo(() => {
        const counts = new Map<string, number>();
        for (const t of teams) {
            for (const e of t.events) {
                counts.set(e.eventCode, (counts.get(e.eventCode) ?? 0) + 1);
            }
        }
        const byFrequency = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code);
        const active = guessActiveEventCode(teams);
        if (active && byFrequency.includes(active)) {
            return [active, ...byFrequency.filter(c => c !== active)];
        }
        return byFrequency;
    }, [teams]);

    const [eventCode, setEventCode] = useState<string>(eventCodes[0] ?? "");
    const [result, setResult] = useState<LiveProjectionResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

    const orgTeamNumber = orgId ? Number(orgId) : null;

    // Set of team numbers in any of the user's previously-tracked teams. Used
    // to highlight rows the strategy lead probably cares about most.
    const trackedTeams = useMemo(() => {
        const s = new Set<number>();
        if (orgTeamNumber) s.add(orgTeamNumber);
        return s;
    }, [orgTeamNumber]);

    const refresh = async () => {
        if (!eventCode) return;
        setLoading(true);
        setError(false);
        try {
            const res = await fetchLiveProjectionAction({ season, eventCode });
            if (!res.ok) {
                console.warn("[live-ranking]", res.error);
                setError(true);
                setResult(null);
            } else {
                setResult(res.result);
                setLastRefresh(new Date());
            }
        } finally {
            setLoading(false);
        }
    };

    // Auto-load on first mount once we have an eventCode.
    useEffect(() => {
        if (eventCode) refresh();
        // We intentionally don't include `refresh` in deps — it would loop.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [eventCode, season]);

    return (
        <div className="space-y-4">
            <Card className="p-4 bg-muted border-border">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                            <Trophy className="text-warning" size={22} />
                            {t("title")}
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">{t("subtitle")}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={eventCode}
                            onChange={e => setEventCode(e.target.value)}
                            className="px-3 py-1.5 bg-card border border-border rounded-lg text-foreground text-xs font-mono"
                        >
                            {eventCodes.length === 0 && (
                                <option value="">{t("noEvents")}</option>
                            )}
                            {eventCodes.map(code => (
                                <option key={code} value={code}>{code}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={refresh}
                            disabled={loading || !eventCode}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-xs font-bold rounded-lg"
                        >
                            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            {t("refresh")}
                        </button>
                    </div>
                </div>

                {result && !result.insufficientData && (
                    <div className="mt-3 text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
                        <span>{t("played", { played: result.qualMatchesPlayed, total: result.qualMatchesTotal })}</span>
                        {lastRefresh && (
                            <span>· {t("updatedAt", { time: format.dateTime(lastRefresh, { timeStyle: "short" }) })}</span>
                        )}
                    </div>
                )}
            </Card>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>{t("error")}</span>
                </div>
            )}

            {result?.insufficientData && (
                <Card className="p-8 text-center text-muted-foreground">
                    {t("insufficient", { event: result.eventCode })}
                </Card>
            )}

            {result && !result.insufficientData && (
                <Card className="p-0 bg-muted border-border overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-muted text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                                <tr>
                                    <Th>{t("col.projected")}</Th>
                                    <Th>{t("col.range")}</Th>
                                    <Th>{t("col.current")}</Th>
                                    <Th>Δ</Th>
                                    <Th align="left">{t("col.team")}</Th>
                                    <Th>{t("col.matches")}</Th>
                                    <Th>{t("col.rsNow")}</Th>
                                    <Th>{t("col.rsFinal")}</Th>
                                    <Th>{t("col.top4")}</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {result.teamProjections.map(p => (
                                    <Row
                                        key={p.teamNumber}
                                        projection={p}
                                        highlighted={trackedTeams.has(p.teamNumber)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}

function Th({ children, align = "right" }: { children: React.ReactNode; align?: "left" | "right" }) {
    return (
        <th className={clsx("px-3 py-2 font-bold", align === "right" ? "text-right" : "text-left")}>
            {children}
        </th>
    );
}

function Row({ projection: p, highlighted }: { projection: RankingProjection; highlighted: boolean }) {
    return (
        <tr
            className={clsx(
                "border-t border-border hover:bg-muted transition-colors",
                highlighted && "bg-primary/10",
            )}
        >
            <td className="px-3 py-2 text-right font-mono font-black text-foreground">
                {p.projectedFinalRank}
            </td>
            <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                {p.rankRange[0] === p.rankRange[1] ? p.rankRange[0] : `${p.rankRange[0]}–${p.rankRange[1]}`}
            </td>
            <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                {p.currentRank}
            </td>
            <td className="px-3 py-2 text-right">
                <DeltaBadge delta={p.rankDelta} />
            </td>
            <td className="px-3 py-2 text-left">
                <div className="flex items-center gap-2">
                    {highlighted && <Star size={11} className="text-primary" fill="currentColor" />}
                    <span className="font-bold text-foreground">{p.teamNumber}</span>
                    <span className="text-muted-foreground text-[10px] truncate">{p.teamName}</span>
                </div>
            </td>
            <td className="px-3 py-2 text-right font-mono text-foreground">
                {p.matchesPlayed}/{p.matchesScheduled}
            </td>
            <td className="px-3 py-2 text-right font-mono text-foreground">
                {p.avgRPperMatch.toFixed(2)}
            </td>
            <td className="px-3 py-2 text-right font-mono font-bold text-primary">
                {p.projectedFinalRS.toFixed(2)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-foreground">
                {Math.round(p.pTop4 * 100)}%
            </td>
        </tr>
    );
}

function DeltaBadge({ delta }: { delta: number }) {
    if (delta === 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-muted-foreground text-[10px]">
                <Minus size={10} /> 0
            </span>
        );
    }
    if (delta > 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-success text-[10px] font-bold">
                <ArrowUp size={10} /> {delta}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-0.5 text-danger text-[10px] font-bold">
            <ArrowDown size={10} /> {Math.abs(delta)}
        </span>
    );
}
