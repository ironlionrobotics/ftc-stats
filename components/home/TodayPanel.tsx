"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import {
    ArrowDown,
    ArrowRight,
    ArrowUp,
    ClipboardList,
    Loader2,
    Minus,
    RefreshCw,
    Swords,
    Trophy,
    Users,
} from "lucide-react";

import { computeCoverage, type NextMatchInfo } from "@/lib/today";
import { draftOdds } from "@/lib/draft-odds";
import { estimateAlliances } from "@/lib/event-selector";
import { fetchLiveProjectionAction } from "@/app/actions/live-projection";
import { fetchNextMatchAction } from "@/app/actions/today";
import type { LiveProjectionResult } from "@/lib/live-projection";
import type { AggregatedTeamStats } from "@/types/scouting";

/**
 * The home page's "Today" panel — the app's answer to *what is happening right
 * now*, as opposed to the global table below it, which answers *what happened
 * this season*.
 *
 * Mounted only by `TodayPanelLoader`, which has already established that the
 * user is signed in, has an org, and that org's team is competing at a live
 * event; that gate is what keeps this module off the critical path of `/`. So
 * `eventCode`, `teamNumber` and `orgId` arrive as props, resolved and non-null.
 *
 * BUNDLE CONTRACT (decisions.md #65). `/` ships 0 KB of Firebase and must keep
 * doing so. Nothing here may statically import `lib/firebase` or anything that
 * reaches it — notably `lib/scouting-service`, which is why the coverage card
 * imports it with a dynamic `import()` inside an effect. Everything imported
 * above is either pure (`today`, `draft-odds`, `event-selector`) or a server
 * action, which compiles to a fetch stub on the client.
 *
 * No polling, same call as `LiveRankingProjection`: one load on mount and a
 * manual refresh button. A tab left open in the stands all day should not
 * hammer the FIRST API.
 */

export interface TodayPanelProps {
    season: number;
    /**
     * The same array `StatsTable` already receives — no new payload crosses the
     * RSC boundary for this panel.
     */
    teams: AggregatedTeamStats[];
    /** The live event, already resolved by the loader. */
    eventCode: string;
    teamNumber: number;
    orgId: string;
}

export default function TodayPanel({ season, teams, eventCode, teamNumber, orgId }: TodayPanelProps) {
    const locale = useLocale();
    const t = useTranslations("Today");
    const tOdds = useTranslations("DraftOdds");
    const tCommon = useTranslations("Common");

    const myTeam = useMemo(
        () => teams.find(team => team.teamNumber === teamNumber) ?? null,
        [teams, teamNumber],
    );
    const myEvent = myTeam?.events.find(e => e.eventCode === eventCode) ?? null;

    // Everyone competing at the same event, used for field size and the OPR
    // percentile that sharpens the alliance odds.
    const field = useMemo(
        () => teams.filter(team => team.events.some(e => e.eventCode === eventCode)),
        [teams, eventCode],
    );

    const [projection, setProjection] = useState<LiveProjectionResult | null>(null);
    const [nextMatch, setNextMatch] = useState<NextMatchInfo | null>(null);
    const [scoutedMatches, setScoutedMatches] = useState<number[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [failed, setFailed] = useState(false);
    const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
    const [reloadKey, setReloadKey] = useState(0);

    // Live event data: ranking projection + next match, in parallel.
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setFailed(false);
        (async () => {
            try {
                const [proj, next] = await Promise.all([
                    fetchLiveProjectionAction({ season, eventCode }),
                    fetchNextMatchAction({ season, eventCode, teamNumber }),
                ]);
                if (cancelled) return;
                if (proj.ok) setProjection(proj.result);
                if (next.ok) setNextMatch(next.nextMatch);
                if (!proj.ok || !next.ok) setFailed(true);
                setUpdatedAt(new Date());
            } catch {
                // The actions never throw by contract, but the RSC transport
                // itself can reject when the device drops off the network.
                if (!cancelled) setFailed(true);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [eventCode, season, teamNumber, reloadKey]);

    // Scouting coverage. Firestore is reached ONLY here and ONLY via dynamic
    // import — see the bundle contract above. Failure is silent by design: an
    // offline device or a rules rejection degrades this one card, never the panel.
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const { getMatchScoutingOnce } = await import("@/lib/scouting-service");
                const entries = await getMatchScoutingOnce(season, eventCode, orgId);
                if (cancelled) return;
                // Playoff entries would inflate the ratio against a qual-only
                // denominator. Legacy docs with no level are treated as quals.
                setScoutedMatches(
                    entries.filter(e => e.tournamentLevel !== "PLAYOFF").map(e => e.matchNumber),
                );
            } catch {
                if (!cancelled) setScoutedMatches(null);
            }
        })();
        return () => { cancelled = true; };
    }, [eventCode, orgId, season, reloadKey]);

    const myRow = useMemo(() => {
        if (!projection || projection.insufficientData) return null;
        return projection.teamProjections.find(p => p.teamNumber === teamNumber) ?? null;
    }, [projection, teamNumber]);

    const coverage = useMemo(
        () => (scoutedMatches && projection ? computeCoverage(scoutedMatches, projection.qualMatchesPlayed) : null),
        [scoutedMatches, projection],
    );

    // Alliance odds are pure math on data already in hand — no action needed.
    // `draftOdds` takes the OPR percentile on a 0-100 scale (its bands read
    // `oprPct >= 90`), matching what `projectAtEvent` hands ConsistencyTracker.
    // Seed is the CURRENT rank: this card is the state of today, and the
    // projected rank is shown next to it as the direction of travel.
    const odds = useMemo(() => {
        if (!myRow || field.length === 0 || !myTeam) return null;
        const fieldSize = field.length;
        const below = field.filter(team => team.opr < myTeam.opr).length;
        const oprPct = (below / fieldSize) * 100;
        const alliances = estimateAlliances(fieldSize);
        const seed = myRow.currentRank;
        return { result: draftOdds(seed, alliances, oprPct), seed, fieldSize, alliances };
    }, [myRow, field, myTeam]);

    const timeFmt = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" });
    const matchTime = nextMatch?.startTime && Number.isFinite(Date.parse(nextMatch.startTime))
        ? timeFmt.format(new Date(nextMatch.startTime))
        : null;

    return (
        <section className="mb-8" aria-labelledby="today-heading">
            {/* ── Event banner ───────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-danger/30 bg-danger/10 px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-[0.15em] text-danger">
                        <span className="h-1.5 w-1.5 rounded-full bg-danger animate-pulse" aria-hidden />
                        {t("live")}
                    </span>
                    <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {t("kicker")}
                        </p>
                        <h2 id="today-heading" className="font-display font-black text-foreground text-lg leading-tight truncate">
                            {myEvent?.abbr ?? eventCode}
                            <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                                #{teamNumber}
                            </span>
                        </h2>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {updatedAt && !loading && (
                        <span className="hidden sm:inline font-mono text-[10px] text-muted-foreground">
                            {t("updated", { time: timeFmt.format(updatedAt) })}
                        </span>
                    )}
                    <button
                        type="button"
                        onClick={() => setReloadKey(k => k + 1)}
                        disabled={loading}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-border bg-muted px-3 py-1.5 text-xs font-bold text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
                    >
                        {loading
                            ? <Loader2 size={13} className="animate-spin" />
                            : <RefreshCw size={13} />}
                        {t("refresh")}
                    </button>
                    <Link
                        href="/strategy"
                        className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-primary hover:underline"
                    >
                        {t("strategyLink")}
                        <ArrowRight size={13} />
                    </Link>
                </div>
            </div>

            {failed && (
                <p className="mb-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                    {t("loadError")}
                </p>
            )}

            {/* ── The four cards ─────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* 1 · Next match */}
                <TodayCard icon={Swords} title={t("nextMatch.title")}>
                    {loading && !nextMatch ? (
                        <Placeholder label={tCommon("loading")} />
                    ) : !nextMatch ? (
                        <>
                            <p className="font-display text-base font-black text-muted-foreground leading-tight">
                                {t("nextMatch.none")}
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">{t("nextMatch.noneHint")}</p>
                        </>
                    ) : (
                        <>
                            <div className="flex items-baseline gap-2">
                                <span className="font-display text-2xl font-black text-foreground tabular-nums">
                                    {nextMatch.description}
                                </span>
                            </div>
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
                                <span
                                    className={clsx(
                                        "rounded px-1.5 py-0.5 font-bold uppercase tracking-wide",
                                        nextMatch.alliance === "Red"
                                            ? "bg-danger/15 text-danger"
                                            : "bg-secondary/15 text-secondary",
                                    )}
                                >
                                    {t(`alliance.${nextMatch.alliance}`)}
                                </span>
                                <span className="font-mono text-muted-foreground">
                                    {matchTime ?? t("nextMatch.timeTbd")}
                                </span>
                            </p>
                            <dl className="mt-2 space-y-1 text-[11px]">
                                <TeamLine label={t("nextMatch.partners")} teams={nextMatch.partners} tone="text-success" />
                                <TeamLine label={t("nextMatch.opponents")} teams={nextMatch.opponents} tone="text-muted-foreground" />
                            </dl>
                        </>
                    )}
                </TodayCard>

                {/* 2 · Ranking now → projected */}
                <TodayCard icon={Trophy} title={t("ranking.title")}>
                    {loading && !projection ? (
                        <Placeholder label={tCommon("loading")} />
                    ) : projection?.insufficientData ? (
                        <Placeholder label={t("ranking.insufficient")} />
                    ) : !myRow ? (
                        <Placeholder label={t("ranking.unranked")} />
                    ) : (
                        <>
                            <div className="flex items-center gap-2">
                                <span className="font-display text-3xl font-black text-foreground tabular-nums leading-none">
                                    #{myRow.currentRank}
                                </span>
                                <ArrowRight size={14} className="shrink-0 text-muted-foreground" />
                                <span className="font-display text-2xl font-black text-primary tabular-nums leading-none">
                                    #{myRow.projectedFinalRank}
                                </span>
                                <RankDelta delta={myRow.rankDelta} />
                            </div>
                            <p className="mt-2 flex gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                                <span>{t("ranking.now")}</span>
                                <span aria-hidden>·</span>
                                <span className="text-primary">{t("ranking.projected")}</span>
                            </p>
                            <p className="mt-1 text-[11px] text-muted-foreground">
                                {t("ranking.qualsLeft", { n: myRow.matchesRemaining })}
                            </p>
                        </>
                    )}
                </TodayCard>

                {/* 3 · Alliance odds */}
                <TodayCard icon={Users} title={t("odds.title")}>
                    {loading && !odds ? (
                        <Placeholder label={tCommon("loading")} />
                    ) : !odds ? (
                        <Placeholder label={t("odds.unavailable")} />
                    ) : (
                        <>
                            <span
                                className={clsx(
                                    "font-display text-3xl font-black tabular-nums leading-none",
                                    // Same thresholds as PickOdds in ConsistencyTracker.
                                    odds.result.probability >= 0.85
                                        ? "text-success"
                                        : odds.result.probability >= 0.6
                                            ? "text-warning"
                                            : "text-danger",
                                )}
                            >
                                {(odds.result.probability * 100).toFixed(0)}%
                            </span>
                            <p className="mt-2 font-mono text-[10px] text-muted-foreground">
                                {t("odds.field", {
                                    seed: odds.seed,
                                    fieldSize: odds.fieldSize,
                                    alliances: odds.alliances,
                                })}
                            </p>
                            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
                                {/* draftOdds returns a translation key + params, never prose. */}
                                {(() => {
                                    const { key, ...params } = odds.result.basis;
                                    return tOdds(key, params);
                                })()}
                            </p>
                        </>
                    )}
                </TodayCard>

                {/* 4 · Scouting coverage */}
                <TodayCard icon={ClipboardList} title={t("coverage.title")}>
                    {!coverage ? (
                        scoutedMatches === null && loading ? (
                            <Placeholder label={tCommon("loading")} />
                        ) : (
                            <>
                                <Placeholder label={t("coverage.unavailable")} />
                                <p className="mt-1 text-[11px] text-muted-foreground">
                                    {t("coverage.unavailableHint")}
                                </p>
                            </>
                        )
                    ) : (
                        <>
                            <span className="font-display text-3xl font-black text-foreground tabular-nums leading-none">
                                {(coverage.pct * 100).toFixed(0)}%
                            </span>
                            <p className="mt-2 text-[11px] text-muted-foreground">
                                {t("coverage.matches", { scouted: coverage.scouted, played: coverage.played })}
                            </p>
                            <div
                                className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted"
                                role="progressbar"
                                aria-valuenow={Math.round(coverage.pct * 100)}
                                aria-valuemin={0}
                                aria-valuemax={100}
                            >
                                <div
                                    className="h-full rounded-full bg-primary transition-all"
                                    style={{ width: `${coverage.pct * 100}%` }}
                                />
                            </div>
                        </>
                    )}
                </TodayCard>
            </div>
        </section>
    );
}

function TodayCard({
    icon: Icon,
    title,
    children,
}: {
    icon: React.ElementType;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                <Icon size={12} className="shrink-0" aria-hidden />
                <span className="truncate">{title}</span>
            </h3>
            {children}
        </div>
    );
}

function Placeholder({ label }: { label: string }) {
    return <p className="font-display text-base font-black leading-tight text-muted-foreground">{label}</p>;
}

function TeamLine({
    label,
    teams,
    tone,
}: {
    label: string;
    teams: { teamNumber: number; teamName: string | null }[];
    tone: string;
}) {
    if (teams.length === 0) return null;
    return (
        <div className="flex gap-1.5">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="flex flex-wrap gap-1.5">
                {teams.map(team => (
                    <Link
                        key={team.teamNumber}
                        href={`/team/${team.teamNumber}`}
                        title={team.teamName ?? undefined}
                        className={clsx("font-mono font-bold hover:underline", tone)}
                    >
                        {team.teamNumber}
                    </Link>
                ))}
            </dd>
        </div>
    );
}

function RankDelta({ delta }: { delta: number }) {
    if (delta === 0) {
        return (
            <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                <Minus size={10} aria-hidden /> 0
            </span>
        );
    }
    const up = delta > 0;
    return (
        <span
            className={clsx(
                "inline-flex items-center gap-0.5 text-[10px] font-bold",
                up ? "text-success" : "text-danger",
            )}
        >
            {up ? <ArrowUp size={10} aria-hidden /> : <ArrowDown size={10} aria-hidden />}
            {Math.abs(delta)}
        </span>
    );
}
