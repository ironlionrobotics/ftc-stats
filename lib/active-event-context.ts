import type { FTCEvent } from "@/types/scouting";
import { pickScoutingEvent } from "@/lib/scouting-event";
import { eventWindow, pickRelevantEvent } from "@/lib/today-summary";

/**
 * ONE active event for the whole app (decision #116): the "Evento" tab, the
 * event chip in the shell, Capturar, Estrategia and Préstamos all work on it.
 * Before #116 each page kept its own choice and only three shared the
 * `scouting_event` cookie; the followed team was ignored.
 *
 * Order:
 *  1. `?event=` (a shared link) always; the remembered choice (cookie) unless
 *     it ended more than two days ago while another event is LIVE — a stale
 *     choice from last month should not hide today's event, but choosing a
 *     past event to review it is respected while nothing is live;
 *  2. the followed team's live or next event;
 *  3. the region's live → next → latest event (pickScoutingEvent).
 * Pure: the server wrapper (lib/active-event-server.ts) fetches.
 */

const STALE_MS = 2 * 86_400_000;

export interface ActiveEventInput {
    /** Region event options (scoutingEventOptions), oldest first. */
    options: FTCEvent[];
    /** Remembered choice (scouting_event cookie). */
    requested: string | null;
    /** `?event=` of a shared link: wins whenever it is a known event. */
    forced?: string | null;
    /** Events of the followed team this season (empty when none is followed). */
    teamEvents: FTCEvent[];
    now: number;
}

export function chooseActiveEvent({ options, requested, forced, teamEvents, now }: ActiveEventInput): FTCEvent | null {
    const find = (code: string) => options.find(e => e.code === code) ?? teamEvents.find(e => e.code === code);
    if (forced) {
        const hit = find(forced);
        if (hit) return hit;
    }
    const team = teamEvents.length > 0 ? pickRelevantEvent(teamEvents, now) : null;
    const teamCurrent = team && team.phase !== "past" ? team.event : null;
    const region = pickScoutingEvent(options, null, now);
    const somethingLive = (team?.phase === "live") || options.some(e => isEventLive(e, now));

    if (requested) {
        const hit = find(requested);
        if (hit) {
            const stale = eventWindow(hit).end + STALE_MS < now;
            if (!stale || !somethingLive) return hit;
        }
    }
    if (teamCurrent) return options.find(e => e.code === teamCurrent.code) ?? teamCurrent;
    return region;
}

/** Whether the event is happening now (same window as Hoy). */
export function isEventLive(e: Pick<FTCEvent, "dateStart" | "dateEnd">, now: number): boolean {
    const w = eventWindow(e);
    return Number.isFinite(w.start) && now >= w.start && now <= w.end;
}

/** Compact event shape the client shell needs (chip + switcher list). */
export interface EventSummary {
    code: string;
    name: string;
    dateStart: string;
    dateEnd: string;
    live: boolean;
    phase: "live" | "upcoming" | "past";
}

export function summarizeEvent(e: FTCEvent, now: number): EventSummary {
    const live = isEventLive(e, now);
    const phase = live ? "live" : Date.parse(e.dateStart) > now ? "upcoming" : "past";
    return { code: e.code, name: e.name, dateStart: e.dateStart, dateEnd: e.dateEnd || e.dateStart, live, phase };
}
