import { fetchMatches, fetchRankings, fetchEvents, fetchAdvancement, fetchEventAwards, fetchAdvancementPoints, fetchHybridSchedule, fetchAlliances } from "@/lib/ftc-api";
import { getCurrentSeason, CHAMPIONSHIP_EVENTS_2025, PREMIER_EVENTS_2025 } from "@/lib/constants";
import Link from "next/link";
import EventViewManager from "@/components/event/EventViewManager";
import EventStats from "@/components/event/EventStats";
import { CacheWriter, OfflineFallback } from "@/components/HydrateAndCache";
import { cookies } from "next/headers";

interface EventPageProps {
    params: Promise<{ eventCode: string }>;
    searchParams: Promise<{ season?: string }>;
}

export default async function EventPage(props: EventPageProps) {
    const params = await props.params;
    const searchParams = await props.searchParams;
    const { eventCode } = params;

    const cookieStore = await cookies();
    // Resolution order: ?season= URL param (explicit from a link), then the
    // user's cookie, then getCurrentSeason() (which knows about the FTC
    // Sept-Aug calendar). Hardcoded 2024 was the previous fallback and caused
    // "Event Not Found" once getCurrentSeason rolled to 2025.
    const explicitSeason = searchParams?.season ? Number(searchParams.season) : undefined;
    const cookieSeason = Number(cookieStore.get("ftc_season")?.value);
    const primarySeason = explicitSeason || cookieSeason || getCurrentSeason();

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

    if (!event) {
        return (
            <div className="p-8 text-foreground min-h-[50vh] flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                    <span className="text-2xl">⚠️</span>
                </div>
                <h1 className="text-3xl font-bold mb-2">Event Not Found</h1>
                <p className="text-muted-foreground max-w-md">
                    No encontramos el evento <span className="text-primary font-mono">{eventCode}</span> en las temporadas{" "}
                    <span className="text-foreground font-bold">{candidateSeasons.join(", ")}</span>.
                </p>
                <p className="text-muted-foreground text-xs mt-2 max-w-md">
                    Si sabes a qué temporada pertenece, prueba la URL{" "}
                    <code className="text-primary">/event/{eventCode}?season=AÑO</code>.
                </p>
            </div>
        );
    }

    const [matches, rankings, advancement, awards, advancementPoints, schedule, alliances] = await Promise.all([
        fetchMatches(season, event.code),
        fetchRankings(season, event.code),
        fetchAdvancement(season, event.code),
        fetchEventAwards(season, event.code),
        fetchAdvancementPoints(season, event.code),
        fetchHybridSchedule(season, event.code),
        fetchAlliances(season, event.code)
    ]);

    return (
        <div className="container mx-auto px-4 md:px-8 py-8 md:py-12">
            <header className="mb-8 border-b border-border pb-6 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-muted-foreground font-mono tracking-[0.2em] text-[11px] uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Season {season}
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
                    ? { label: "Divisiones · Houston", items: CHAMPIONSHIP_EVENTS_2025 }
                    : PREMIER_EVENTS_2025.some(e => e.code === upper)
                        ? { label: "Premier Events", items: PREMIER_EVENTS_2025 }
                        : null;
                if (!group) return null;
                return (
                    <div className="mb-6 flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground mr-1">{group.label}</span>
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
                    schedule, alliances, season,
                }}
            />

            <EventStats matches={matches} rankings={rankings} />

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
            />
        </div>
    );
}
