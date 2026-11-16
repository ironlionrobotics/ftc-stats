import { notFound } from "next/navigation";
import { fetchMatches, fetchRankings, fetchEvents, fetchAdvancement, fetchEventAwards, fetchAdvancementPoints, fetchHybridSchedule, fetchAlliances, fetchMatchScores } from "@/lib/ftc-api";
import { analyzeMultipleEvents } from "@/app/actions/analytics";
import { allianceRpObs } from "@/lib/rp-inference";
import { parseSeason } from "@/lib/input-guards";
import type { EventTeamRp } from "@/components/event/EventViewManager";
import { getCurrentSeason, CHAMPIONSHIP_EVENTS_2025, PREMIER_EVENTS_2025 } from "@/lib/constants";
import Link from "next/link";
import EventViewManager from "@/components/event/EventViewManager";
import { CacheWriter, OfflineFallback } from "@/components/HydrateAndCache";
import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import AutoRefresh from "@/components/AutoRefresh";
import { eventWindow } from "@/lib/today-summary";
import { eventTeamNumbers } from "@/lib/starting-points";
import { getStartingPoints } from "@/lib/starting-points-server";

interface EventPageProps {
    params: Promise<{ eventCode: string }>;
    searchParams: Promise<{ season?: string }>;
}

export default async function EventPage(props: EventPageProps) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const { eventCode } = params;

    const t = await getTranslations("EventPage");
    const cookieStore = await cookies();
    // Resolution order: ?season= URL param (explicit from a link), then the
    // user's cookie, then getCurrentSeason() (which knows about the FTC
    // Sept-Aug calendar). Hardcoded 2024 was the previous fallback and caused
    // "Event Not Found" once getCurrentSeason rolled to 2025.
    const explicitSeason = parseSeason(searchParams?.season, getCurrentSeason());
    const cookieSeason = parseSeason(cookieStore.get("ftc_season")?.value, getCurrentSeason());
    const primarySeason = explicitSeason ?? cookieSeason ?? getCurrentSeason();

    // Try the primary season first; if the event isn't there, fall back to
    // the adjacent seasons (last + next) so users following old links / cookies
    // still find their event instead of hitting a 404.
    const candidateSeasons = Array.from(
        new Set([primarySeason, getCurrentSeason(), primarySeason - 1, primarySeason + 1]),
    );

    let season = primarySeason;
    let allEvents = await fetchEvents(season);
    let event = allEvents.find(
        (e) => e.code.toLowerCase() === (eventCode || "").toLowerCase()
    );
    // Distinguishes "the FIRST API is unreachable" from "that code doesn't
    // exist": fetchEvents returns [] on failure, so if EVERY season we tried
    // came back empty the API is down, not the code wrong.
    let sawAnyEvents = allEvents.length > 0;

    if (!event) {
        for (const candidate of candidateSeasons) {
            if (candidate === primarySeason) continue;
            const events = await fetchEvents(candidate);
            if (events.length > 0) sawAnyEvents = true;
            const found = events.find(
                (e) => e.code.toLowerCase() === (eventCode || "").toLowerCase()
            );
            if (found) {
                event = found;
                season = candidate;
                allEvents = events;
                break;
            }
        }
    }

    // Keyed by event code alone, not code+season: offline we don't know which
    // season the visitor last viewed, and "show me what I had for FPEMX" is
    // the behavior they expect. The season travels inside the payload.
    const cacheKey = `event:${(eventCode || "").toUpperCase()}`;

    // API unreachable — fall back to whatever this device cached last time.
    // Deliberately NOT triggered when the event was found but has no matches
    // yet: that is a legitimate state for an upcoming event, and serving stale
    // cache there would be worse than showing the empty schedule.
    if (!event && !sawAnyEvents) {
        return (
            <div className="container mx-auto px-4 md:px-8 py-8 md:py-12">
                <OfflineFallback cacheKey={cacheKey} render="event-stats" />
            </div>
        );
    }

    if (!event) notFound();


    const [matches, rankings, advancement, awards, advancementPoints, schedule, alliances, scores] = await Promise.all([
        fetchMatches(season, event.code),
        fetchRankings(season, event.code),
        fetchAdvancement(season, event.code),
        fetchEventAwards(season, event.code),
        fetchAdvancementPoints(season, event.code),
        fetchHybridSchedule(season, event.code),
        fetchAlliances(season, event.code),
        fetchMatchScores(season, event.code),
    ]);

    // Official bonus RPs per qual alliance ("<match>-Red" → count), so the
    // round-history slider rebuilds past rankings with the real RP rules.
    const matchBonusRp: Record<string, number> = {};
    const qualByNumber = new Map(matches.filter(m => m.tournamentLevel === "QUALIFICATION").map(m => [m.matchNumber, m]));
    for (const s of scores) {
        if (!/qual/i.test(s.matchLevel)) continue;
        const m = qualByNumber.get(s.matchNumber);
        if (!m) continue;
        const obs = allianceRpObs(season, s.scoreBreakdown, m, s.alliance === "Red" ? "Red" : "Blue");
        if (obs) matchBonusRp[`${s.matchNumber}-${s.alliance}`] = Object.values(obs.rp).filter(Boolean).length;
    }

    // BIOBUZZ RP probabilities per team (count models, decision #88) — the
    // same analysis Data Lab runs, cached server-side. In parallel: each
    // robot's starting point for the forecasts (#117; null = as before).
    let teamRp: Record<number, EventTeamRp> | undefined;
    const [, startingPoints] = await Promise.all([
        season >= 2026
            ? analyzeMultipleEvents(season, [event.code])
                .then(analysis => { teamRp = Object.fromEntries(analysis.teamEvolution.map(t => [t.teamNumber, { rp: t.rp, rpInputs: t.rpInputs }])); })
                .catch(e => console.warn("[event] RP analysis unavailable:", e instanceof Error ? e.message : e))
            : Promise.resolve(),
        getStartingPoints(season, event.dateStart, eventTeamNumbers(matches, schedule, rankings)).catch(() => null),
    ]);

    return (
        <div className="container mx-auto px-4 md:px-8 py-8 md:py-12">
            {/* Live event: refresh results/upcoming every minute while visible (#112). */}
            {isLiveNow(event) && <AutoRefresh everyMs={60_000} />}
            <header className="mb-8 border-b border-border pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-muted-foreground font-mono tracking-[0.2em] text-xs uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        {t("season", { season })}
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold font-display text-foreground">
                        {event.name}
                    </h1>
                    <div className="flex items-center gap-3 text-muted-foreground">
                        <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded border border-border">{event.code}</span>
                        {event.venue && <span className="text-sm">• {event.venue}</span>}
                        {event.city && <span className="text-sm">• {event.city}, {event.stateProv}</span>}
                    </div>
                </div>
            </header>

            {/* Sibling navigation: on a Championship division or Premier event,
                offer one-click jumps to the rest of the group (§15.3 events all
                render natively; nobody memorizes codes like FTCCMP1FRAN). */}
            {(() => {
                const upper = event.code.toUpperCase();
                const group = CHAMPIONSHIP_EVENTS_2025.some(e => e.code === upper)
                    ? { label: t("divisions"), items: CHAMPIONSHIP_EVENTS_2025 }
                    : PREMIER_EVENTS_2025.some(e => e.code === upper)
                        ? { label: t("premier"), items: PREMIER_EVENTS_2025 }
                        : null;
                if (!group) return null;
                return (
                    <div className="mb-6 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground mr-1">{group.label}</span>
                        {group.items.map(d => (
                            <Link
                                key={d.code}
                                href={`/event/${d.code}?season=${season}`}
                                className={
                                    d.code === upper
                                        ? "px-2.5 py-1 rounded-lg bg-primary text-primary-foreground text-xs font-bold"
                                        : "px-2.5 py-1 rounded-lg bg-muted border border-border text-muted-foreground hover:text-foreground text-xs font-bold transition-colors"
                                }
                            >
                                {d.name}
                            </Link>
                        ))}
                    </div>
                );
            })()}

            {/* Persist this render to IndexedDB so the same event is browsable
                offline later — the venue-wifi case the whole offline contract
                exists for. Side-effect only; renders nothing. */}
            <CacheWriter
                cacheKey={cacheKey}
                payload={{
                    event: {
                        name: event.name, code: event.code, venue: event.venue,
                        city: event.city, stateProv: event.stateProv,
                    },
                    matches, rankings, advancement, awards, advancementPoints,
                    schedule, alliances, season, startingPoints,
                }}
            />

            <EventViewManager
                matches={matches}
                rankings={rankings}
                advancement={advancement}
                awards={awards}
                advancementPoints={advancementPoints}
                schedule={schedule}
                selectedAlliances={alliances}
                eventCode={event.code}
                season={season}
                matchBonusRp={matchBonusRp}
                teamRp={teamRp}
                startingPoints={startingPoints}
            />
        </div>
    );
}

/** Module scope: Date.now() is impure (React Compiler purity) — same live window as "Hoy". */
function isLiveNow(e: { dateStart: string; dateEnd?: string }): boolean {
    const w = eventWindow(e);
    const now = Date.now();
    return now >= w.start && now <= w.end;
}
