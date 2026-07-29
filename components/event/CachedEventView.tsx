"use client";

import EventStats from "@/components/event/EventStats";
import EventViewManager from "@/components/event/EventViewManager";
import type {
    FTCEvent, FTCMatch, TeamRanking, AdvancementResponse, FTCAward,
    AdvancementPoints, FTCHybridScheduleMatch, FTCAllianceSelection,
} from "@/types/scouting";

/**
 * Renders a whole event page from a cached payload, for when the server
 * couldn't reach the FIRST API (venue wifi down, API outage).
 *
 * It repeats the live page's header rather than reusing it because the live
 * header lives in a Server Component that reads `event` from a fetch which,
 * in exactly this situation, returned nothing. The payload carries the event
 * metadata instead.
 *
 * Loaded through next/dynamic from HydrateAndCache so that EventViewManager's
 * sizeable chunk isn't pulled into every page that merely imports the cache
 * helpers — the home page does (decisions.md #65).
 */
export interface CachedEventPayload {
    event: Pick<FTCEvent, "name" | "code" | "venue" | "city" | "stateProv">;
    matches: FTCMatch[];
    rankings: TeamRanking[];
    advancement: AdvancementResponse | null;
    awards: FTCAward[];
    advancementPoints: AdvancementPoints[];
    schedule: FTCHybridScheduleMatch[];
    alliances: FTCAllianceSelection[];
    season: number;
}

export default function CachedEventView({ payload }: { payload: CachedEventPayload }) {
    const { event, season } = payload;

    return (
        <>
            <header className="mb-8 border-b border-border pb-6">
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

            <EventStats matches={payload.matches} rankings={payload.rankings} />

            <EventViewManager
                matches={payload.matches}
                rankings={payload.rankings}
                advancement={payload.advancement}
                awards={payload.awards}
                advancementPoints={payload.advancementPoints}
                schedule={payload.schedule}
                selectedAlliances={payload.alliances}
                eventCode={event.code}
                season={season}
            />
        </>
    );
}
