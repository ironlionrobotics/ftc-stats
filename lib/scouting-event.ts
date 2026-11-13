import type { FTCEvent } from "@/types/scouting";

/**
 * Which event /scouting files entries under. Before this module the forms
 * guessed it from the team's PAST results (rankings) and fell back to a
 * hard-coded "MXTOL" — so before an event's first match (pit interviews,
 * practice day) there was no roster and entries landed under a stale code.
 * Now the event is explicit: chosen in the page (`?event=`), defaulting to
 * the event happening now, else the next one, else the latest past one.
 */

const DAY_MS = 86_400_000;

/** Events nobody scouts: kickoffs, workshops, demos, volunteer sign-ups. */
const NON_COMPETITIVE = /kickoff|workshop|demo|volunteer|exhibition/i;

function isMexican(e: FTCEvent): boolean {
    return e.country === "Mexico" || e.countryCode === "MX" || e.code.startsWith("MX");
}

/** Competitive events of the region, oldest first. The `requested` event is
 *  always kept (a shared link to an event outside the region still works). */
export function scoutingEventOptions(events: FTCEvent[], region: "MX", requested?: string | null): FTCEvent[] {
    void region; // only MX today; regional defaults come with "no single-team assumptions" (Etapa 2)
    return events
        .filter(e => e.code === requested || (isMexican(e) && !NON_COMPETITIVE.test(`${e.typeName ?? ""} ${e.name}`)))
        .sort((a, b) => Date.parse(a.dateStart) - Date.parse(b.dateStart) || a.code.localeCompare(b.code));
}

/** Live window: from the day before it starts to two days after it ends (UTC),
 *  same generosity as lib/active-event.ts so late playoffs still count. */
function isLive(e: FTCEvent, now: number): boolean {
    const start = Date.parse(e.dateStart);
    if (!Number.isFinite(start)) return false;
    const endRaw = Date.parse(e.dateEnd ?? e.dateStart);
    const end = Number.isFinite(endRaw) ? endRaw : start;
    return now >= start - DAY_MS && now <= end + 2 * DAY_MS;
}

/** The requested event if it is an option; else live → next upcoming → latest past. */
export function pickScoutingEvent(options: FTCEvent[], requested: string | null | undefined, now: number): FTCEvent | null {
    if (requested) {
        const hit = options.find(e => e.code === requested);
        if (hit) return hit;
    }
    // Among simultaneous live events, the one that started last (same tie-break as active-event).
    const live = options.filter(e => isLive(e, now));
    if (live.length > 0) return live.reduce((a, b) => (Date.parse(b.dateStart) > Date.parse(a.dateStart) ? b : a));
    const upcoming = options.find(e => Date.parse(e.dateStart) > now);
    if (upcoming) return upcoming;
    return options.length > 0 ? options[options.length - 1] : null;
}

/** Cookie remembering the scout's last chosen event (validated on read). */
export const SCOUTING_EVENT_COOKIE = "scouting_event";
