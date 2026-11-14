import Link from "next/link";
import { cookies } from "next/headers";
import { getFormatter, getTranslations } from "next-intl/server";
import { fetchTeam, fetchTeamEvents, fetchRankings, fetchMatches, fetchHybridSchedule, fetchTeamRankingsInSeason } from "@/lib/ftc-api";
import { getCurrentSeason } from "@/lib/constants";
import { parseSeason } from "@/lib/input-guards";
import { FOLLOW_TEAM_COOKIE, parseFollowedTeam } from "@/lib/follow-team";
import { seasonRulesFor } from "@/lib/games/season-rules";
import { seasonGameName } from "@/lib/games/season-names";
import { pickRelevantEvent, summarizeAtEvent, daysUntil, type TodayAtEvent } from "@/lib/today-summary";
import FollowTeamForm from "@/components/today/FollowTeamForm";
import OpenLoansNotice from "@/components/today/OpenLoansNotice";
import { Suspense } from "react";
import { fetchEvents } from "@/lib/ftc-api";
import { FOLLOWS_COOKIE, parseFollows, serializeFollows, type Follows } from "@/lib/follows";
import { liveAndUpcoming, type EventRegion } from "@/lib/event-windows";
import { loadFollowingSnapshot } from "@/lib/following-snapshot";
import FollowingPanel from "@/components/home/FollowingPanel";
import EventsToday from "@/components/home/EventsToday";
import FollowTeamInline from "@/components/home/FollowTeamInline";
import NotifySettings from "@/components/notifications/NotifySettings";

/**
 * Hoy (plan "PRIDE abierta al público", Etapa 2, decision #98): the home of
 * the team the visitor follows (pride_team cookie) — next match with odds,
 * ranking and projection, alliance-selection odds — from public FIRST data,
 * no account needed. Without a followed team it asks for one.
 */
export default async function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const t = await getTranslations("TodayPage");
    const format = await getFormatter();
    const store = await cookies();
    const params = await searchParams;
    const current = getCurrentSeason();
    const season = parseSeason(params?.season, current) ?? parseSeason(store.get("ftc_season")?.value, current) ?? current;
    const team = parseFollowedTeam(store.get(FOLLOW_TEAM_COOKIE)?.value);
    const kicker = t("kicker", { season, game: seasonGameName(season) ?? "" });
    // Followed events/teams + today's events (decision #110): always the CURRENT season.
    const follows = parseFollows(store.get(FOLLOWS_COOKIE)?.value);
    const region: EventRegion = params?.region === "all" ? "all" : "MX";
    const query = typeof params?.q === "string" ? params.q.slice(0, 40) : "";
    const followSections = (
        <Suspense fallback={null}>
            <FollowSections follows={follows} region={region} query={query} season={current} hasTeam={team !== null} />
        </Suspense>
    );

    if (team === null) {
        return (
            <main className="container mx-auto max-w-3xl px-4 py-10 md:px-8 md:py-16">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{kicker}</p>
                <h1 className="mt-2 text-4xl font-black md:text-5xl">{t("welcomeTitle")}</h1>
                <p className="mt-3 max-w-prose text-muted-foreground">{t("welcomeBody")}</p>
                <div className="mt-6"><FollowTeamForm /></div>
                <p className="mt-8 text-sm text-muted-foreground">
                    {t.rich("orBrowse", { events: chunks => <Link href="/events" className="underline hover:text-foreground">{chunks}</Link> })}
                </p>
                {followSections}
            </main>
        );
    }

    const { info, pick, atEvent, seasonResults, now } = await loadToday(team, season);

    const pct = (p: number) => format.number(p, { style: "percent", maximumFractionDigits: 0 });

    return (
        <main className="container mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
            <OpenLoansNotice />
            <header className="mb-6 border-b border-border pb-5">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{kicker}</p>
                <h1 className="mt-1 flex flex-wrap items-baseline gap-x-3 text-4xl font-black md:text-5xl">
                    <span className="font-mono tabular-nums">{team}</span>
                    {info?.nameShort && <span className="text-2xl font-bold text-muted-foreground md:text-3xl">{info.nameShort}</span>}
                </h1>
                {pick && (
                    <p className="mt-2 text-sm text-muted-foreground">
                        <Link href={`/event/${pick.event.code}?season=${season}`} className="font-semibold text-foreground underline-offset-4 hover:underline">{pick.event.name}</Link>
                        {" · "}
                        {t(`phase.${pick.phase}`, { days: daysUntil(pick.event, now) })}
                    </p>
                )}
            </header>

            {!pick && <p className="text-muted-foreground">{t("noEvents", { season })}</p>}

            {atEvent && <LiveSection team={team} s={atEvent} t={t} pct={pct} format={format} />}

            {pick && pick.phase !== "live" && (
                <section>
                    <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("seasonResults")}</h2>
                    {seasonResults.length === 0 ? (
                        <p className="text-muted-foreground">{t("noResultsYet")}</p>
                    ) : (
                        <ul className="divide-y divide-border border-y border-border">
                            {[...seasonResults].reverse().map(r => (
                                <li key={r.eventCode} className="flex items-center justify-between gap-4 py-3">
                                    <Link href={`/event/${r.eventCode}?season=${season}`} className="min-w-0 truncate font-semibold hover:underline">{r.eventName}</Link>
                                    <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                                        {t("resultLine", { rank: r.rank, w: r.wins, l: r.losses, t: r.ties })}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>
            )}

            {followSections}

            <p className="mt-10 text-xs text-muted-foreground">{t("footnote")}</p>
        </main>
    );
}

/** "Siguiendo" + today's events (decision #110), streamed after the main card. */
async function FollowSections({ follows, region, query, season, hasTeam }: { follows: Follows; region: EventRegion; query: string; season: number; hasTeam: boolean }) {
    const [events, snapshot] = await Promise.all([fetchEvents(season), loadFollowingSnapshot(follows, season)]);
    const items = listEvents(events, region, query, follows.events);
    const hasFollows = snapshot.events.length + snapshot.teams.length > 0;
    return (
        <>
            {/* Remount when the list changes: a followed/unfollowed item must show at once. */}
            {hasFollows && <FollowingPanel key={serializeFollows(follows)} initial={snapshot} season={season} />}
            <div className="mt-4"><FollowTeamInline /></div>
            {(hasFollows || hasTeam) && <NotifySettings />}
            <EventsToday items={items} followed={follows.events} region={region} query={query} season={season} />
        </>
    );
}

function listEvents(events: Awaited<ReturnType<typeof fetchEvents>>, region: EventRegion, query: string, always: string[]) {
    return liveAndUpcoming(events, Date.now(), { region, query, always, limit: region === "all" ? 60 : 30 });
}

/** Fetches and assembles everything "Hoy" shows for `team` (server-side). */
async function loadToday(team: number, season: number) {
    const [info, events] = await Promise.all([fetchTeam(season, team), fetchTeamEvents(season, team)]);
    const now = Date.now();
    const pick = pickRelevantEvent(events, now);

    let atEvent: TodayAtEvent | null = null;
    if (pick?.phase === "live") {
        const [rankings, matches, schedule] = await Promise.all([
            fetchRankings(season, pick.event.code),
            fetchMatches(season, pick.event.code),
            fetchHybridSchedule(season, pick.event.code),
        ]);
        const rules = seasonRulesFor(season);
        atEvent = summarizeAtEvent(team, rankings, matches, schedule, pick.event.code, { winRp: rules.winRp, tieRp: rules.tieRp });
    }
    // Season results for the "upcoming" and "between events" states.
    const seasonResults = pick && pick.phase !== "live" ? await fetchTeamRankingsInSeason(season, team) : [];
    return { info, pick, atEvent, seasonResults, now };
}

type T = Awaited<ReturnType<typeof getTranslations<"TodayPage">>>;
type F = Awaited<ReturnType<typeof getFormatter>>;

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <div className="rounded-[4px] border border-border bg-card p-4">
            <div className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</div>
            <div className="mt-1 font-mono text-3xl font-black tabular-nums">{value}</div>
            {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
        </div>
    );
}

function LiveSection({ team, s, t, pct, format }: { team: number; s: TodayAtEvent; t: T; pct: (p: number) => string; format: F }) {
    const next = s.nextMatch;
    const startTime = next?.startTime && Number.isFinite(Date.parse(next.startTime))
        ? format.dateTime(new Date(next.startTime), { hour: "numeric", minute: "2-digit" })
        : null;
    return (
        <div className="space-y-6">
            <section aria-labelledby="next-heading" className="rounded-[4px] border border-border bg-card p-4 md:p-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 id="next-heading" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("nextMatch")}</h2>
                    <span className="text-xs text-muted-foreground">{t("qualsProgress", { played: s.qualsPlayed, total: s.qualsTotal })}</span>
                </div>
                {next ? (
                    <>
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-3">
                            <span className="font-mono text-3xl font-black">{next.description}</span>
                            {startTime && <span className="text-sm text-muted-foreground">{startTime}</span>}
                        </div>
                        <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-stretch gap-2">
                            <AllianceBox color={next.alliance} teams={[team, ...next.partners.map(p => p.teamNumber)]} label={t("yourAlliance")} />
                            <span className="self-center text-xs text-muted-foreground">vs</span>
                            <AllianceBox color={next.alliance === "Red" ? "Blue" : "Red"} teams={next.opponents.map(p => p.teamNumber)} label={t("opponents")} />
                        </div>
                        {next.winProbability !== null && (
                            <p className="mt-3 text-sm">
                                <span className="font-mono text-xl font-black tabular-nums">{pct(next.winProbability)}</span>{" "}
                                <span className="text-muted-foreground">{t("winChance")}</span>
                            </p>
                        )}
                    </>
                ) : (
                    <p className="mt-2 text-muted-foreground">{s.qualsTotal === 0 ? t("noSchedule") : t("noNextMatch")}</p>
                )}
            </section>

            {s.ranking && (
                <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Stat label={t("rank")} value={`#${s.ranking.currentRank}`} note={t("ofTeams", { n: s.ranking.teamCount })} />
                    <Stat label={t("rs")} value={s.ranking.rs.toFixed(2)} note={`${s.ranking.record.wins}–${s.ranking.record.losses}–${s.ranking.record.ties}`} />
                    {s.ranking.projected
                        ? <Stat label={t("projected")} value={`#${s.ranking.projected.rank}`} note={t("range", { lo: s.ranking.projected.range[0], hi: s.ranking.projected.range[1] })} />
                        : <Stat label={t("projected")} value="—" note={t("qualsDone")} />}
                    {s.allianceOdds
                        ? <Stat label={t("allianceOdds")} value={pct(s.allianceOdds.probability)} note={s.allianceOdds.wouldCaptain ? t("wouldCaptain") : t("pickOdds", { alliances: s.allianceOdds.alliances })} />
                        : <Stat label={t("allianceOdds")} value="—" />}
                </section>
            )}
        </div>
    );
}

function AllianceBox({ color, teams, label }: { color: "Red" | "Blue"; teams: number[]; label: string }) {
    return (
        <div
            className="rounded-[3px] px-3 py-2 text-white"
            style={{ background: color === "Red" ? "var(--color-alliance-red)" : "var(--color-alliance-blue)" }}
        >
            <div className="text-[11px] font-semibold uppercase tracking-[0.06em] opacity-80">{label}</div>
            <div className="font-mono text-lg font-black tabular-nums">{teams.join(" · ") || "—"}</div>
        </div>
    );
}
