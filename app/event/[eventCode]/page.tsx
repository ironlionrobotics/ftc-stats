import { MEXICAN_EVENTS } from "@/lib/constants";
import { fetchMatches, fetchRankings } from "@/lib/ftc-api";
import MatchList from "@/components/event/MatchList";
import { notFound } from "next/navigation";

export default async function EventPage(props: any) {
    // Handle both Next.js 14 (object) and Next.js 15 (promise)
    const params = await props.params;
    const { eventCode } = params;

    // Find the event (case insensitive just in case)
    const event = MEXICAN_EVENTS.find(
        (e) => e.code.toLowerCase() === (eventCode || "").toLowerCase()
    );

    if (!event) {
        return (
            <div className="p-8 text-white">
                <h1 className="text-2xl font-bold mb-4">Event Not Found</h1>
                <p>Code provided: <span className="text-primary">{eventCode}</span></p>
                <p>Available codes: {MEXICAN_EVENTS.map(e => e.code).join(", ")}</p>
            </div>
        );
    }

    const matches = await fetchMatches(event.code);
    const rankings = await fetchRankings(event.code);

    return (
        <div className="container mx-auto px-8 py-12">
            <header className="mb-8 border-b border-white/10 pb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <h1 className="text-4xl font-bold font-display text-white">
                        {event.name}
                    </h1>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-white/10 border border-white/5">
                        <span className="text-sm font-mono text-gray-400">{event.code}</span>
                        {event.abbr && (
                            <>
                                <span className="text-gray-600">|</span>
                                <span className="text-sm font-bold text-accent">{event.abbr}</span>
                            </>
                        )}
                    </div>
                </div>
            </header>

            <MatchList matches={matches} rankings={rankings} />
        </div>
    );
}
