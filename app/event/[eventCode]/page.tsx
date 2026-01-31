import { fetchMatches, fetchRankings, fetchEvents } from "@/lib/ftc-api";
import EventViewManager from "@/components/event/EventViewManager";
import { cookies } from "next/headers";

interface EventPageProps {
    params: Promise<{ eventCode: string }>;
}

export default async function EventPage(props: EventPageProps) {
    const params = await props.params;
    const { eventCode } = params;

    const cookieStore = await cookies();
    const season = Number(cookieStore.get("ftc_season")?.value || 2024);

    // Fetch dynamic events for this season to get the correct name
    const allEvents = await fetchEvents(season);
    const event = allEvents.find(
        (e) => e.code.toLowerCase() === (eventCode || "").toLowerCase()
    );

    if (!event) {
        return (
            <div className="p-8 text-white min-h-[50vh] flex flex-col items-center justify-center text-center">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
                    <span className="text-2xl">⚠️</span>
                </div>
                <h1 className="text-3xl font-bold mb-2">Event Not Found</h1>
                <p className="text-gray-400 max-w-md">
                    We couldn&apos;t find event <span className="text-primary font-mono">{eventCode}</span> in the <span className="text-white font-bold">{season}</span> season records.
                </p>
            </div>
        );
    }

    const [matches, rankings] = await Promise.all([
        fetchMatches(season, event.code),
        fetchRankings(season, event.code)
    ]);

    return (
        <div className="container mx-auto px-4 md:px-8 py-12">
            <header className="mb-12 border-b border-white/10 pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-primary font-bold tracking-widest text-xs uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        Season {season}
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold font-display text-white">
                        {event.name}
                    </h1>
                    <div className="flex items-center gap-3 text-gray-500">
                        <span className="font-mono text-sm bg-white/5 px-2 py-0.5 rounded border border-white/5">{event.code}</span>
                        {event.venue && <span className="text-sm">• {event.venue}</span>}
                        {event.city && <span className="text-sm">• {event.city}, {event.stateProv}</span>}
                    </div>
                </div>
            </header>

            <EventViewManager matches={matches} rankings={rankings} />
        </div>
    );
}
