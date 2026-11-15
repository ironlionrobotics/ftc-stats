"use client";

import Link from "next/link";
import { useCallback } from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Radio } from "lucide-react";
import clsx from "clsx";
import FollowStar from "@/components/home/FollowStar";
import { fetchFollowingSnapshotAction } from "@/app/actions/following";
import { useLivePoll } from "@/lib/hooks/use-live-poll";
import type { FollowingSnapshot, FollowedEventCard, FollowedTeamCard } from "@/lib/following-snapshot";
import type { MatchLine } from "@/lib/following-summary";

/**
 * "Siguiendo" on Hoy (decision #110): followed events and teams, refreshed
 * every 60 s while the tab is visible (server cache is 60 s while live, so
 * polling faster would only re-read the same data).
 */
const POLL_MS = 60_000;

export default function FollowingPanel({ initial, season }: { initial: FollowingSnapshot; season: number }) {
    const t = useTranslations("Following");
    const format = useFormatter();
    const now = useNow({ updateInterval: 30_000 });
    const anyLive = initial.events.some(e => e.phase === "live") || initial.teams.some(x => x.event?.phase === "live");
    const load = useCallback(async () => {
        const r = await fetchFollowingSnapshotAction();
        return r.ok ? r.snapshot : null;
    }, []);
    const { value: polled } = useLivePoll(load, POLL_MS, anyLive);
    // The server render (initial, refreshed by router.refresh) and the poll race: show the newer.
    const snap = polled && polled.at > initial.at ? polled : initial;
    const pct = (p: number) => format.number(p, { style: "percent", maximumFractionDigits: 0 });
    const shownAt = snap.at;

    return (
        <section aria-labelledby="following-heading" className="mt-8">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="following-heading" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("title")}</h2>
                {anyLive && (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <Radio size={12} className="text-success" aria-hidden />
                        {t("updated", { when: format.relativeTime(Math.min(shownAt, now.getTime()), now) })}
                    </span>
                )}
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                {snap.events.map(e => <EventCard key={e.code} e={e} season={season} pct={pct} />)}
                {snap.teams.map(x => <TeamCard key={x.teamNumber} c={x} season={season} pct={pct} />)}
            </div>
        </section>
    );
}

function PhaseLine({ phase, inDays }: { phase: string; inDays: number }) {
    const t = useTranslations("Following");
    return (
        <span className={clsx("text-xs font-semibold", phase === "live" ? "text-success" : "text-muted-foreground")}>
            {phase === "live" ? t("live") : phase === "upcoming" ? t("inDays", { days: inDays }) : phase === "past" ? t("ended") : t("unknown")}
        </span>
    );
}

function Teams({ ids, color }: { ids: number[]; color: "Red" | "Blue" }) {
    return (
        <span className={`rounded-[3px] px-1.5 py-0.5 font-mono text-xs font-bold tabular-nums text-white ${color === "Red" ? "bg-alliance-red-fill" : "bg-alliance-blue-fill"}`}>
            {ids.join(" · ") || "—"}
        </span>
    );
}

function NextLine({ m, pct }: { m: MatchLine; pct: (p: number) => string }) {
    return (
        <li className="flex flex-wrap items-center gap-2 py-1 text-sm">
            <span className="w-10 shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground">{m.description}</span>
            <Teams ids={m.red} color="Red" />
            {m.pRed !== null && <span className="font-mono text-xs tabular-nums">{pct(m.pRed)}–{pct(1 - m.pRed)}</span>}
            <Teams ids={m.blue} color="Blue" />
        </li>
    );
}

function EventCard({ e, season, pct }: { e: FollowedEventCard; season: number; pct: (p: number) => string }) {
    const t = useTranslations("Following");
    const live = e.live;
    return (
        <article className="rounded-[4px] border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <Link href={`/event/${e.code}?season=${season}`} className="block truncate font-bold hover:underline">{e.name}</Link>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        <span className="font-mono">{e.code}</span>{e.place && <span>· {e.place}</span>}
                        <PhaseLine phase={e.phase} inDays={e.inDays} />
                    </div>
                </div>
                <FollowStar kind="event" value={e.code} following label={e.name} />
            </div>
            {live && (
                <div className="mt-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                        {t("progress", { q: live.qualsPlayed, qt: live.qualsTotal })}
                        {live.playoffsTotal > 0 && ` · ${t("playoffs", { p: live.playoffsPlayed, pt: live.playoffsTotal })}`}
                    </p>
                    {live.lastMatch && (
                        <p className="text-sm">
                            <span className="text-xs text-muted-foreground">{t("last")} {live.lastMatch.description}: </span>
                            <span className="font-mono font-bold tabular-nums">
                                <span style={{ color: "var(--color-alliance-red)" }}>{live.lastMatch.redScore}</span>
                                {"–"}
                                <span style={{ color: "var(--color-alliance-blue)" }}>{live.lastMatch.blueScore}</span>
                            </span>
                        </p>
                    )}
                    {live.nextMatches.length > 0 && (
                        <div>
                            <h3 className="text-xs font-semibold text-muted-foreground">{t("next")}</h3>
                            <ul>{live.nextMatches.map(m => <NextLine key={`${m.level}-${m.matchNumber}-${m.description}`} m={m} pct={pct} />)}</ul>
                        </div>
                    )}
                    {live.top.length > 0 && (
                        <ol className="grid grid-cols-2 gap-x-3 text-xs">
                            {live.top.map(r => (
                                <li key={r.teamNumber} className="truncate"><span className="font-mono font-bold">#{r.rank} {r.teamNumber}</span> <span className="text-muted-foreground">{r.wins}-{r.losses}-{r.ties}</span></li>
                            ))}
                        </ol>
                    )}
                </div>
            )}
        </article>
    );
}

function TeamCard({ c, season, pct }: { c: FollowedTeamCard; season: number; pct: (p: number) => string }) {
    const t = useTranslations("Following");
    const label = `${c.teamNumber}${c.name ? ` ${c.name}` : ""}`;
    return (
        <article className="rounded-[4px] border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <Link href={`/team/${c.teamNumber}`} className="block truncate font-bold hover:underline">
                        <span className="font-mono">{c.teamNumber}</span>{c.name && <span className="text-muted-foreground"> {c.name}</span>}
                    </Link>
                    {c.event ? (
                        <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                            <Link href={`/event/${c.event.code}?season=${season}`} className="truncate hover:underline">{c.event.name}</Link>
                            <PhaseLine phase={c.event.phase} inDays={c.event.inDays} />
                        </div>
                    ) : <p className="text-xs text-muted-foreground">{t("noEvent")}</p>}
                </div>
                <FollowStar kind="team" value={c.teamNumber} following label={label} />
            </div>
            <div className="mt-3 space-y-1 text-sm">
                {c.rank && <p><span className="font-mono font-bold">#{c.rank.rank}</span> <span className="text-xs text-muted-foreground">{t("ofTeams", { n: c.rank.of })} · {c.rank.wins}-{c.rank.losses}-{c.rank.ties}</span></p>}
                {c.nextMatch && (
                    <p className="flex flex-wrap items-center gap-2">
                        <span className="text-xs text-muted-foreground">{t("nextOf")} {c.nextMatch.description}</span>
                        <Teams ids={[c.teamNumber, ...c.nextMatch.partners.map(p => p.teamNumber)]} color={c.nextMatch.alliance} />
                        <span className="text-xs">vs</span>
                        <Teams ids={c.nextMatch.opponents.map(p => p.teamNumber)} color={c.nextMatch.alliance === "Red" ? "Blue" : "Red"} />
                        {c.nextMatch.winProbability !== null && <span className="font-mono text-xs font-bold tabular-nums">{pct(c.nextMatch.winProbability)}</span>}
                    </p>
                )}
                {c.lastMatch && (
                    <p className="text-xs text-muted-foreground">
                        {t("last")} {c.lastMatch.description}: {c.lastMatch.won === null ? t("tie") : c.lastMatch.won ? t("won") : t("lost")}{" "}
                        <span className="font-mono tabular-nums">{c.lastMatch.red.includes(c.teamNumber)
                            ? `${c.lastMatch.redScore}–${c.lastMatch.blueScore}`
                            : `${c.lastMatch.blueScore}–${c.lastMatch.redScore}`}</span>
                    </p>
                )}
            </div>
        </article>
    );
}
