"use server";

import { fetchHybridSchedule } from "@/lib/ftc-api";
import { pickNextMatch, type NextMatchInfo } from "@/lib/today";

/**
 * "What do we play next?" for the home Today panel.
 *
 * The hybrid schedule of a large event is a few hundred KB; the answer is one
 * object. So the reduction runs server-side and only `NextMatchInfo` crosses
 * the wire — same reasoning as `fetchLiveProjectionAction`.
 *
 * Never throws (decisions.md #64): the panel is decoration on a page that must
 * render regardless, so failures come back as `{ ok: false }` and the card
 * degrades to an error state instead of taking the route down.
 */
export async function fetchNextMatchAction(input: {
    season: number;
    eventCode: string;
    teamNumber: number;
}): Promise<
    | { ok: true; nextMatch: NextMatchInfo | null }
    | { ok: false; error: string }
> {
    const { season, eventCode, teamNumber } = input;
    if (!eventCode) return { ok: false, error: "Falta eventCode" };
    if (!Number.isInteger(teamNumber) || teamNumber <= 0) {
        return { ok: false, error: "teamNumber inválido" };
    }
    try {
        const schedule = await fetchHybridSchedule(season, eventCode);
        return { ok: true, nextMatch: pickNextMatch(schedule, teamNumber) };
    } catch (e) {
        const message = e instanceof Error ? e.message : "Error desconocido";
        return { ok: false, error: message };
    }
}
