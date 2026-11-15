import { getAggregatedStats } from "@/lib/aggregation";
import { fetchEventTeams, fetchHybridSchedule } from "@/lib/ftc-api";
import { scheduledQuals } from "@/lib/scout-claims";
import { getCurrentSeason } from "@/lib/constants";
import { isValidTeamNumber, normalizeEventCode, parseSeason } from "@/lib/input-guards";
import AutoRefresh from "@/components/AutoRefresh";
import { isEventLive } from "@/lib/active-event-context";
import { FOLLOW_TEAM_COOKIE, parseFollowedTeam } from "@/lib/follow-team";
import { resolveActiveEvent } from "@/lib/active-event-server";
import ScoutingClient from "@/components/scouting/ScoutingClient";
import { cookies } from "next/headers";
import type { FTCEvent, ScoutTeam } from "@/types/scouting";
import PastSeasonBanner from "@/components/shell/PastSeasonBanner";

/**
 * Scouting is per EVENT: the app-wide active event (#116; `?event=` of a
 * shared link wins, see lib/active-event-context.ts). Lists the teams FIRST has
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
        return <ScoutingClient initialTeams={[]} eventCode={null} rosterSource="none" schedule={[]} />;
    }

    // The app-wide active event (#116); `?event=` overrides for shared links.
    const { selected } = await resolveActiveEvent(season, normalizeEventCode(params?.event));
    const { teams, rosterSource, schedule } = await loadScoutingRoster(season, selected);
    // Deep links from Hoy ("Scoutear Q14") and shared links: ?match=&team=.
    const matchParam = Number(params?.match);
    const initialMatch = Number.isInteger(matchParam) && matchParam >= 1 && matchParam <= 999 ? matchParam : null;
    const live = selected ? liveNow(selected) : false;
    const teamParam = Number(params?.team);
    const initialTeam = isValidTeamNumber(teamParam) ? teamParam : null;
    const followedTeam = parseFollowedTeam(cookieStore.get(FOLLOW_TEAM_COOKIE)?.value);

    return (
        <>
        <PastSeasonBanner season={season} current={current} />
        {/* The queue follows the schedule while the event is on (state survives). */}
        {live && <AutoRefresh everyMs={60_000} />}
        <ScoutingClient
            // Remount per event: added teams, selection and live entries belong to one event.
            key={selected?.code ?? "none"}
            initialTeams={teams}
            eventCode={selected?.code ?? null}
            rosterSource={rosterSource}
            schedule={schedule}
            initialMatch={initialMatch}
            initialTeam={initialTeam}
            followedTeam={followedTeam}
        />
        </>
    );
}

/** The chosen event's roster and schedule (server-side; see module comment). */
async function loadScoutingRoster(season: number, selected: FTCEvent | null) {
    const { teamStats } = await getAggregatedStats(season);

    const [registered, rawSchedule] = selected
        ? await Promise.all([fetchEventTeams(season, selected.code), fetchHybridSchedule(season, selected.code)])
        : [[], []];
    const schedule = scheduledQuals(rawSchedule);
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
    return { teams, rosterSource, schedule };
}

/** Module scope: Date.now() is impure (React Compiler purity). */
function liveNow(e: FTCEvent): boolean {
    return isEventLive(e, Date.now());
}
