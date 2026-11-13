import { getAggregatedStats } from "@/lib/aggregation";
import { fetchEvents, fetchEventTeams } from "@/lib/ftc-api";
import { getCurrentSeason } from "@/lib/constants";
import { normalizeEventCode, parseSeason } from "@/lib/input-guards";
import { scoutingEventOptions, pickScoutingEvent, SCOUTING_EVENT_COOKIE } from "@/lib/scouting-event";
import ScoutingClient from "@/components/scouting/ScoutingClient";
import { cookies } from "next/headers";
import type { ScoutTeam } from "@/types/scouting";

/**
 * Scouting is per EVENT: the page picks one (`?event=`, else the scout's last
 * choice in a cookie, else live → next → latest) and lists the teams FIRST has
 * registered for it, which exist before any match is played. When FIRST hasn't
 * published the roster yet, it falls back to the season's teams with results,
 * and the scout can always add a team by number.
 */
export default async function ScoutingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const cookieStore = await cookies();
    const params = await searchParams;
    const current = getCurrentSeason();
    const season = parseSeason(cookieStore.get("ftc_season")?.value, current) ?? current;
    const program = cookieStore.get("active_program")?.value || "FTC";

    if (program !== "FTC") {
        // FRC: no real data source wired yet (TBA pending) — never show fabricated numbers
        return <ScoutingClient initialTeams={[]} events={[]} eventCode={null} rosterSource="none" />;
    }

    const requested = normalizeEventCode(params?.event) ?? normalizeEventCode(cookieStore.get(SCOUTING_EVENT_COOKIE)?.value);
    const { options, selected, teams, rosterSource } = await loadScoutingRoster(season, requested);

    return (
        <ScoutingClient
            // Remount per event: added teams, selection and live entries belong to one event.
            key={selected?.code ?? "none"}
            initialTeams={teams}
            events={options.map(e => ({ code: e.code, name: e.name, dateStart: e.dateStart }))}
            eventCode={selected?.code ?? null}
            rosterSource={rosterSource}
        />
    );
}

/** Event options, the chosen event and its roster (server-side; see module comment). */
async function loadScoutingRoster(season: number, requested: string | null) {
    const [allEvents, { teamStats }] = await Promise.all([fetchEvents(season), getAggregatedStats(season)]);
    const options = scoutingEventOptions(allEvents, "MX", requested);
    const selected = pickScoutingEvent(options, requested, Date.now());

    const registered = selected ? await fetchEventTeams(season, selected.code) : [];
    const advanced = new Set(teamStats.filter(t => t.hasAdvanced).map(t => t.teamNumber));
    let teams: ScoutTeam[];
    let rosterSource: "event" | "season" | "none";
    if (registered.length > 0) {
        teams = registered.map(t => ({ ...t, hasAdvanced: advanced.has(t.teamNumber) }));
        rosterSource = "event";
    } else {
        teams = teamStats.map(t => ({ teamNumber: t.teamNumber, teamName: t.teamName, hasAdvanced: t.hasAdvanced }));
        rosterSource = teams.length > 0 ? "season" : "none";
    }
    return { options, selected, teams, rosterSource };
}
