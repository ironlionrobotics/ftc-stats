import type { FTCEvent } from "@/types/scouting";
import { eventWindow } from "@/lib/today-summary";

/**
 * Events happening now and soon, for the "Hoy" list (decision #110). Pure:
 * the page fetches the season's events (24 h cache), this filters.
 * "Live" uses the same window as "Hoy" (whole last day in every timezone).
 */

/** Events nobody competes at: kickoffs, workshops, demos, volunteer sign-ups. */
export const NON_COMPETITIVE = /kickoff|workshop|demo|volunteer|exhibition/i;

export type EventRegion = "MX" | "all";

export function isMexicanEvent(e: Pick<FTCEvent, "code" | "country" | "countryCode">): boolean {
    return e.country === "Mexico" || e.countryCode === "MX" || e.code.startsWith("MX");
}

export interface EventListItem {
    code: string;
    name: string;
    place: string;
    typeName: string | null;
    dateStart: string;
    dateEnd: string;
    phase: "live" | "upcoming";
    /** Whole days until it starts (0 when live or starting today). */
    inDays: number;
}

const DAY = 86_400_000;

function place(e: FTCEvent & { stateprov?: string }): string {
    return [e.city, e.stateProv ?? e.stateprov, e.country].filter(Boolean).join(", ");
}

function matchesQuery(e: FTCEvent, q: string): boolean {
    const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const hay = norm(`${e.code} ${e.name} ${e.city ?? ""} ${e.country ?? ""}`);
    return norm(q).split(/\s+/).filter(Boolean).every(w => hay.includes(w));
}

export function liveAndUpcoming(
    events: FTCEvent[],
    nowMs: number,
    opts: { region: EventRegion; query?: string; horizonDays?: number; limit?: number; always?: string[] },
): EventListItem[] {
    const horizon = nowMs + (opts.horizonDays ?? 7) * DAY;
    const q = opts.query?.trim() ?? "";
    const always = new Set(opts.always ?? []);
    const out: EventListItem[] = [];
    for (const e of events) {
        const start = Date.parse(e.dateStart);
        if (!Number.isFinite(start)) continue;
        if (!always.has(e.code)) {
            if (NON_COMPETITIVE.test(`${e.typeName ?? ""} ${e.name}`)) continue;
            if (opts.region === "MX" && !isMexicanEvent(e)) continue;
            if (q && !matchesQuery(e, q)) continue;
        }
        const w = eventWindow(e);
        const live = nowMs >= w.start && nowMs <= w.end;
        if (!live && (w.start <= nowMs || start > horizon)) continue;
        out.push({
            code: e.code,
            name: e.name,
            place: place(e),
            typeName: e.typeName ?? null,
            dateStart: e.dateStart,
            dateEnd: e.dateEnd ?? e.dateStart,
            phase: live ? "live" : "upcoming",
            inDays: live ? 0 : Math.max(0, Math.ceil((start - nowMs) / DAY)),
        });
    }
    out.sort((a, b) =>
        (a.phase === b.phase ? 0 : a.phase === "live" ? -1 : 1)
        || Date.parse(a.dateStart) - Date.parse(b.dateStart)
        || a.code.localeCompare(b.code));
    return out.slice(0, opts.limit ?? 60);
}
