import Link from "next/link";
import { FTCEvent } from "@/types/scouting";
import { Calendar, MapPin, ChevronRight, Filter } from "lucide-react";

interface EventListProps {
    events: (FTCEvent & { abbr?: string })[];
    /**
     * Season the events belong to. Used to disambiguate event-detail links
     * so they don't depend on the user's session cookie matching the season
     * the home page is showing. Optional for backward compat.
     */
    season?: number;
}

export default function EventList({ events, season }: EventListProps) {
    if (!events || events.length === 0) {
        return null; // Don't show anything if no events match
    }

    const sortedEvents = [...events].sort((a, b) =>
        new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime()
    );

    return (
        <div className="bg-card p-6 rounded-xl shadow-sm mb-8 border border-border/50 backdrop-blur-sm">
            <div className="flex items-center gap-2 mb-4">
                <Filter className="w-5 h-5 text-primary" />
                <h3 className="text-lg font-semibold text-foreground">
                    Events in this View ({sortedEvents.length})
                </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sortedEvents.map((event) => (
                    <Link
                        key={event.code}
                        href={season ? `/event/${event.code}?season=${season}` : `/event/${event.code}`}
                        className="group relative flex flex-col p-4 rounded-xl border border-border bg-background hover:bg-muted/50 transition-all hover:shadow-md hover:border-primary/30"
                    >
                        <div className="flex justify-between items-start mb-2">
                            <span className="bg-primary/10 text-primary text-xs font-bold px-2 py-1 rounded-md mb-2 inline-block">
                                {event.abbr || event.code}
                            </span>
                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" />
                        </div>

                        <h4 className="font-bold text-foreground line-clamp-1 mb-1" title={event.name}>
                            {event.name}
                        </h4>

                        <div className="mt-auto flex flex-col gap-1 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5" />
                                <span>{new Date(event.dateStart).toLocaleDateString(undefined, { dateStyle: 'medium' })}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <MapPin className="w-3.5 h-3.5" />
                                <span className="truncate">{event.city ? `${event.city}, ` : ''}{event.stateProv || event.country}</span>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
