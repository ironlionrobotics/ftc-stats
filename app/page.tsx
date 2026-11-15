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
import { shortMatchLabel } from "@/lib/following-summary";
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
import PWAInstallCard from "@/components/PWAInstallPrompt";
import { AllianceSides, ProbabilityBar } from "@/components/ui/Alliance";
import { Notice, Stat } from "@/components/ui/Status";
import { resolveActiveEvent } from "@/lib/active-event-server";
import type { FTCEvent } from "@/types/scouting";

/**
 * Hoy (decisions #98, #116): the home of the team the visitor follows
 * (pride_team cookie), from public FIRST data, no account needed. The first
 * thing on the screen is what matters now: the next match (who plays, the
 * chance to win, a one-tap "scout it"), else the next event, else the app's
 * active event. Without a followed team it asks for one.
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
            <div className="container mx-auto max-w-3xl px-4 py-10 md:px-8 md:py-16">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{kicker}</p>
                <h1 className="mt-2 text-4xl font-black md:text-5xl">{t("welcomeTitle")}</h1>
                <p className="mt-3 max-w-prose text-muted-foreground">{t("welcomeBody")}</p>
                <div className="mt-6"><FollowTeamForm /></div>
                <p className="mt-8 text-sm text-muted-foreground">
                    {t.rich("orBrowse", { events: chunks => <Link href="/events" className="underline hover:text-foreground">{chunks}</Link> })}
                </p>
                {followSections}
            </div>
        );
    }

    const { info, pick, atEvent, seasonResults, now } = await loadToday(team, season);
    // No event of the followed team yet (FIRST publishes rosters late): show
    // the app's active event instead of an empty page.
    const fallback = pick ? null : (await resolveActiveEvent(current)).selected;

    const pct = (p: number) => format.number(p, { style: "percent", maximumFractionDigits: 0 });
    const tA = await getTranslations("Alliance");
    const allianceLabels = { red: tA("red"), blue: tA("blue") };

    return (
        <div className="container mx-auto max-w-3xl space-y-4 px-4 py-5 md:px-8 md:py-8">
            <OpenLoansNotice />
            <header>
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{kicker}</p>
                <h1 className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[28px] font-extrabold leading-tight">
                    <span className="font-mono tabular-nums">{team}</span>
                    {info?.nameShort && <span className="text-xl font-bold text-muted-foreground">{info.nameShort}</span>}
                </h1>
                {pick?.phase === "live" && (
                    <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />
                        <Link href={`/event/${pick.event.code}?season=${season}`} className="font-semibold text-foreground underline-offset-4 hover:underline">{pick.event.name}</Link>
                        <span>· {t("phase.live")}</span>
                    </p>
                )}
            </header>

            {atEvent && pick && <LiveSection team={team} event={pick.event} season={season} s={atEvent} t={t} pct={pct} format={format} labels={allianceLabels} />}

            {pick && pick.phase !== "live" && (
                <EventCard title={pick.phase === "upcoming" ? t("nextEvent") : t(`phase.past`)} event={pick.event} season={season}
                    note={pick.phase === "upcoming" ? t("phase.upcoming", { days: daysUntil(pick.event, now) }) : undefined} cta={t("viewEvent")} format={format} />
            )}

            {!pick && (
                <>
                    {fallback && <EventCard title={t("activeEvent")} event={fallback} season={current} cta={t("viewEvent")} format={format} />}
                    <Notice>{fallback ? t("notRegistered", { team }) : t("noEventsShort", { season })}</Notice>
                </>
            )}

            {pick && pick.phase !== "live" && seasonResults.length > 0 && (
                <section>
                    <h2 className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("seasonResults")}</h2>
                    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
                        {[...seasonResults].reverse().map(r => (
                            <li key={r.eventCode}>
                                <Link href={`/event/${r.eventCode}?season=${season}`} className="flex min-h-[48px] items-center justify-between gap-4 px-3 py-2">
                                    <span className="min-w-0 truncate font-semibold">{r.eventName}</span>
                                    <span className="shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                                        {t("resultLine", { rank: r.rank, w: r.wins, l: r.losses, t: r.ties })}
                                    </span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {followSections}

            <p className="pt-4 text-xs text-muted-foreground">{t("footnote")}</p>
        </div>
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
            <div className="mt-4"><PWAInstallCard /></div>
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

function EventCard({ title, event, season, note, cta, format }: { title: string; event: FTCEvent; season: number; note?: string; cta: string; format: F }) {
    const d = (iso: string) => format.dateTime(new Date(iso), { day: "numeric", month: "short", timeZone: "UTC" });
    const dates = event.dateEnd && event.dateEnd.slice(0, 10) !== event.dateStart.slice(0, 10) ? `${d(event.dateStart)} – ${d(event.dateEnd)}` : d(event.dateStart);
    return (
        <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{title}</h2>
            <p className="mt-1 text-xl font-bold leading-snug">{event.name}</p>
            <p className="mt-0.5 text-sm text-muted-foreground"><span className="font-mono">{event.code}</span> · {dates}{note ? ` · ${note}` : ""}</p>
            <Link href={`/event/${event.code}?season=${season}`} className="mt-3 flex min-h-[44px] items-center justify-center rounded-xl border border-border text-sm font-bold hover:bg-muted">
                {cta}
            </Link>
        </section>
    );
}

function LiveSection({ team, event, season, s, t, pct, format, labels }: {
    team: number; event: FTCEvent; season: number; s: TodayAtEvent; t: T; pct: (p: number) => string; format: F; labels: { red: string; blue: string };
}) {
    const next = s.nextMatch;
    const startTime = next?.startTime && Number.isFinite(Date.parse(next.startTime))
        ? format.dateTime(new Date(next.startTime), { hour: "numeric", minute: "2-digit" })
        : null;
    const mine = next ? [team, ...next.partners.map(p => p.teamNumber)] : [];
    const theirs = next ? next.opponents.map(p => p.teamNumber) : [];
    const red = next?.alliance === "Red" ? mine : theirs;
    const blue = next?.alliance === "Red" ? theirs : mine;
    const pRed = next && next.winProbability !== null ? (next.alliance === "Red" ? next.winProbability : 1 - next.winProbability) : null;
    return (
        <>
            <section aria-labelledby="next-heading" className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-baseline justify-between gap-2">
                    <h2 id="next-heading" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("nextMatch")}</h2>
                    <span className="text-xs text-muted-foreground">{t("qualsProgress", { played: s.qualsPlayed, total: s.qualsTotal })}</span>
                </div>
                {next ? (
                    <>
                        <div className="mt-1 flex items-baseline justify-between gap-3">
                            <span className="font-mono text-[28px] font-extrabold leading-tight">{shortMatchLabel(next.description, next.tournamentLevel, next.matchNumber)}</span>
                            {startTime && <span className="text-sm text-muted-foreground">{startTime}</span>}
                        </div>
                        <AllianceSides red={red} blue={blue} me={team} event={event.code} labels={labels} className="mt-3" />
                        {pRed !== null && next.winProbability !== null && (
                            <div className="mt-3">
                                <p className="mb-1.5 text-sm">
                                    {t("yourChance")}: <b className="font-mono text-lg tabular-nums">{pct(next.winProbability)}</b>
                                </p>
                                <ProbabilityBar pRed={pRed} labels={labels} format={pct} />
                            </div>
                        )}
                        <div className="mt-4 grid grid-cols-2 gap-2">
                            {/^QUAL/i.test(next.tournamentLevel) ? (
                                <Link href={`/scouting?match=${next.matchNumber}&event=${event.code}`} className="flex min-h-[48px] items-center justify-center rounded-xl bg-brand px-3 text-sm font-bold text-brand-foreground">
                                    {t("scoutMatch", { match: shortMatchLabel(next.description, next.tournamentLevel, next.matchNumber) })}
                                </Link>
                            ) : <span aria-hidden />}
                            <Link href={`/event/${event.code}?season=${season}`} className="flex min-h-[48px] items-center justify-center rounded-xl border border-border px-3 text-sm font-bold hover:bg-muted">
                                {t("viewMatch")}
                            </Link>
                        </div>
                    </>
                ) : (
                    <p className="mt-2 text-muted-foreground">{s.qualsTotal === 0 ? t("noSchedule") : t("noNextMatch")}</p>
                )}
            </section>

            {s.ranking && (
                <section aria-label={t("yourDay")} className="grid grid-cols-2 gap-2 md:grid-cols-4">
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
        </>
    );
}
