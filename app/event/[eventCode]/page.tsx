import { fetchMatches, fetchRankings, fetchEvents, fetchAdvancement, fetchEventAwards, fetchAdvancementPoints } from "@/lib/ftc-api";
import { getCurrentSeason } from "@/lib/constants";
import EventViewManager from "@/components/event/EventViewManager";
import EventStats from "@/components/event/EventStats";
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

    if (!event) {
        for (const candidate of candidateSeasons) {
            if (candidate === primarySeason) continue;
            const events = await fetchEvents(candidate);
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

    const [matches, rankings, advancement, awards, advancementPoints] = await Promise.all([
        fetchMatches(season, event.code),
        fetchRankings(season, event.code),
        fetchAdvancement(season, event.code),
        fetchEventAwards(season, event.code),
        fetchAdvancementPoints(season, event.code)
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

            <EventStats matches={matches} rankings={rankings} />

            <EventViewManager
                matches={matches}
                rankings={rankings}
                advancement={advancement}
                awards={awards}
                advancementPoints={advancementPoints}
                eventCode={event.code}
                season={season}
            />
        </div>
    );
}
