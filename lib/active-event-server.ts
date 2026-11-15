import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { fetchEvents, fetchTeamEvents } from "@/lib/ftc-api";
import { getCurrentSeason } from "@/lib/constants";
import { normalizeEventCode, parseSeason } from "@/lib/input-guards";
import { scoutingEventOptions, SCOUTING_EVENT_COOKIE } from "@/lib/scouting-event";
import { FOLLOW_TEAM_COOKIE, parseFollowedTeam } from "@/lib/follow-team";
import { chooseActiveEvent, summarizeEvent, type EventSummary } from "@/lib/active-event-context";
import type { FTCEvent } from "@/types/scouting";

/** Season the visitor is browsing (ftc_season cookie, else the current one). */
export async function browsingSeason(): Promise<{ season: number; current: number }> {
    const store = await cookies();
    const current = getCurrentSeason();
    return { season: parseSeason(store.get("ftc_season")?.value, current) ?? current, current };
}

const resolveCached = cache(async (season: number, override: string | null): Promise<{ selected: FTCEvent | null; options: FTCEvent[] }> => {
    const store = await cookies();
    const requested = normalizeEventCode(store.get(SCOUTING_EVENT_COOKIE)?.value);
    const team = parseFollowedTeam(store.get(FOLLOW_TEAM_COOKIE)?.value);
    const [all, teamEvents] = await Promise.all([
        fetchEvents(season).catch(() => [] as FTCEvent[]),
        team ? fetchTeamEvents(season, team).catch(() => [] as FTCEvent[]) : Promise.resolve([] as FTCEvent[]),
    ]);
    const options = scoutingEventOptions(all, "MX", override ?? requested);
    // The followed team's events are always choosable, even outside the region.
    for (const e of teamEvents) if (!options.some(o => o.code === e.code)) options.push(e);
    options.sort((a, b) => Date.parse(a.dateStart) - Date.parse(b.dateStart) || a.code.localeCompare(b.code));
    return { selected: chooseActiveEvent({ options, requested, forced: override, teamEvents, now: Date.now() }), options };
});

/**
 * The app-wide active event (decision #116; see lib/active-event-context.ts).
 * `override` is a page's `?event=` param. Deduped per request (arguments are
 * normalized so the layout and the pages share one cache entry).
 */
export function resolveActiveEvent(season: number, override: string | null = null) {
    return resolveCached(season, override ?? null);
}

/** What the shell's event chip needs; never throws (FIRST API down → nothing). */
/** Budget for the shell chip: the layout must never wait on a slow FIRST API. */
const SHELL_BUDGET_MS = 1500;

export async function activeEventForShell(): Promise<{ active: EventSummary | null; options: EventSummary[] }> {
    const empty = { active: null, options: [] as EventSummary[] };
    const work = (async () => {
        const { season } = await browsingSeason();
        const { selected, options } = await resolveActiveEvent(season);
        const now = Date.now();
        return { active: selected ? summarizeEvent(selected, now) : null, options: options.map(e => summarizeEvent(e, now)) };
    })().catch(() => empty);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof empty>(resolve => { timer = setTimeout(() => resolve(empty), SHELL_BUDGET_MS); });
    try {
        return await Promise.race([work, timeout]);
    } finally {
        clearTimeout(timer);
    }
}
