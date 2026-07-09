"use client";

import { useEffect, useState, useMemo } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { fetchLiveProjectionAction } from "@/app/actions/live-projection";
import type { LiveProjectionResult, RankingProjection } from "@/lib/live-projection";
import type { AggregatedTeamStats } from "@/types/scouting";
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
 * suggests as primary) and gets a re-ranked table showing where each team
 * is projected to land if performance holds. Teams in the user's org are
 * highlighted so they're easy to spot in big events.
 *
 * Refresh button is manual — re-pulls rankings and matches via the cached
 * Smart TTL (60s during active events). No polling: leaving a tab open all
 * day shouldn't hammer the API.
 */
export default function LiveRankingProjection({ teams }: LiveRankingProjectionProps) {
    const { orgId } = useAuth();
    const { season } = useProgram();

    // Unique event codes from the loaded teams. Defaults to the most-frequent
    // one so the strategy lead lands on the event they're at.
    const eventCodes = useMemo(() => {
        const counts = new Map<string, number>();
        for (const t of teams) {
            for (const e of t.events) {
                counts.set(e.eventCode, (counts.get(e.eventCode) ?? 0) + 1);
            }
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([code]) => code);
    }, [teams]);

    const [eventCode, setEventCode] = useState<string>(eventCodes[0] ?? "");
    const [result, setResult] = useState<LiveProjectionResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
        setError(null);
        try {
            const res = await fetchLiveProjectionAction({ season, eventCode });
            if (!res.ok) {
                setError(res.error);
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
            <Card className="p-4 bg-white/[0.02] border-white/10">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                            <Trophy className="text-amber-400" size={22} />
                            Proyección final de rankings
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">
                            Extrapolación lineal del rendimiento actual al fin de qualifying.
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <select
                            value={eventCode}
                            onChange={e => setEventCode(e.target.value)}
                            className="px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-white text-xs font-mono"
                        >
                            {eventCodes.length === 0 && (
                                <option value="">Sin eventos</option>
                            )}
                            {eventCodes.map(code => (
                                <option key={code} value={code}>{code}</option>
                            ))}
                        </select>
                        <button
                            type="button"
                            onClick={refresh}
                            disabled={loading || !eventCode}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-white text-xs font-bold rounded-lg"
                        >
                            {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                            Actualizar
                        </button>
                    </div>
                </div>

                {result && !result.insufficientData && (
                    <div className="mt-3 text-xs text-gray-500 flex items-center gap-3 flex-wrap">
                        <span>
                            <strong className="text-gray-300">{result.qualMatchesPlayed}</strong> / {result.qualMatchesTotal} matches jugados
                        </span>
                        {lastRefresh && (
                            <span>· Actualizado {lastRefresh.toLocaleTimeString()}</span>
                        )}
                    </div>
                )}
            </Card>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs">
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
                </div>
            )}

            {result?.insufficientData && (
                <Card className="p-8 text-center text-gray-400">
                    Sin matches jugados aún en {result.eventCode}. La proyección
                    aparece una vez que comienza el qualifying.
                </Card>
            )}

            {result && !result.insufficientData && (
                <Card className="p-0 bg-white/[0.02] border-white/10 overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-white/5 text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                                <tr>
                                    <Th>Proyectado</Th>
                                    <Th>Actual</Th>
                                    <Th>Δ</Th>
                                    <Th align="left">Equipo</Th>
                                    <Th>MP/Sched</Th>
                                    <Th>RP actual</Th>
                                    <Th>RP/match</Th>
                                    <Th>Proyectado RP</Th>
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
                "border-t border-white/5 hover:bg-white/5 transition-colors",
                highlighted && "bg-primary/10",
            )}
        >
            <td className="px-3 py-2 text-right font-mono font-black text-white">
                {p.projectedFinalRank}
            </td>
            <td className="px-3 py-2 text-right font-mono text-gray-400">
                {p.currentRank}
            </td>
            <td className="px-3 py-2 text-right">
                <DeltaBadge delta={p.rankDelta} />
            </td>
            <td className="px-3 py-2 text-left">
                <div className="flex items-center gap-2">
                    {highlighted && <Star size={11} className="text-primary" fill="currentColor" />}
                    <span className="font-bold text-white">{p.teamNumber}</span>
                    <span className="text-gray-500 text-[10px] truncate">{p.teamName}</span>
                </div>
            </td>
            <td className="px-3 py-2 text-right font-mono text-gray-300">
                {p.matchesPlayed}/{p.matchesScheduled}
            </td>
            <td className="px-3 py-2 text-right font-mono text-gray-300">
                {p.currentRP.toFixed(0)}
            </td>
            <td className="px-3 py-2 text-right font-mono text-gray-300">
                {p.avgRPperMatch.toFixed(2)}
            </td>
            <td className="px-3 py-2 text-right font-mono font-bold text-primary">
                {p.projectedFinalRP.toFixed(1)}
            </td>
        </tr>
    );
}

function DeltaBadge({ delta }: { delta: number }) {
    if (delta === 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-gray-500 text-[10px]">
                <Minus size={10} /> 0
            </span>
        );
    }
    if (delta > 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-emerald-400 text-[10px] font-bold">
                <ArrowUp size={10} /> {delta}
            </span>
        );
    }
    return (
        <span className="inline-flex items-center gap-0.5 text-red-400 text-[10px] font-bold">
            <ArrowDown size={10} /> {Math.abs(delta)}
        </span>
    );
}
