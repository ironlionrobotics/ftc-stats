import { cookies } from "next/headers";
import { getAggregatedStats } from "@/lib/aggregation";
import { fetchEvents } from "@/lib/ftc-api";
import StrategyClient from "@/components/strategy/StrategyClient";
import { getCurrentSeason } from "@/lib/constants";
import { normalizeEventCode, parseSeason } from "@/lib/input-guards";
import { scoutingEventOptions, pickScoutingEvent, SCOUTING_EVENT_COOKIE } from "@/lib/scouting-event";
import PastSeasonBanner from "@/components/shell/PastSeasonBanner";

/** Strategy works on the event chosen on /scouting (shared cookie, #100). */
export default async function StrategyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const cookieStore = await cookies();
    const params = await searchParams;
    const current = getCurrentSeason();
    const season = parseSeason(cookieStore.get("ftc_season")?.value, current) ?? current;
    const requested = normalizeEventCode(params?.event) ?? normalizeEventCode(cookieStore.get(SCOUTING_EVENT_COOKIE)?.value);

    const [{ teamStats }, allEvents] = await Promise.all([getAggregatedStats(season), fetchEvents(season)]);
    const options = scoutingEventOptions(allEvents, "MX", requested);
    const selected = choose(options, requested);

    return (
        <>
        <PastSeasonBanner season={season} current={current} />
        <StrategyClient
            key={selected?.code ?? "none"}
            teams={teamStats}
            season={season}
            eventCode={selected?.code ?? null}
            events={options.map(e => ({ code: e.code, name: e.name, dateStart: e.dateStart }))}
        />
        </>
    );
}

function choose(options: Parameters<typeof pickScoutingEvent>[0], requested: string | null) {
    return pickScoutingEvent(options, requested, Date.now());
}
