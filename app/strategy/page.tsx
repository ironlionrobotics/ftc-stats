import { cookies } from "next/headers";
import { getAggregatedStats } from "@/lib/aggregation";
import { eventTeamNumbers } from "@/lib/starting-points";
import { getStartingPoints } from "@/lib/starting-points-server";
import { fetchMatches, fetchMatchScores } from "@/lib/ftc-api";
import { eventPickMetrics } from "@/lib/pick-metrics";
import StrategyClient from "@/components/strategy/StrategyClient";
import { getCurrentSeason } from "@/lib/constants";
import { normalizeEventCode, parseSeason } from "@/lib/input-guards";
import { resolveActiveEvent } from "@/lib/active-event-server";
import PastSeasonBanner from "@/components/shell/PastSeasonBanner";

/** Strategy works on the app-wide active event (#116); `?event=` overrides. */
export default async function StrategyPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const cookieStore = await cookies();
    const params = await searchParams;
    const current = getCurrentSeason();
    const season = parseSeason(cookieStore.get("ftc_season")?.value, current) ?? current;
    const [{ teamStats }, { selected }] = await Promise.all([
        getAggregatedStats(season),
        resolveActiveEvent(season, normalizeEventCode(params?.event)),
    ]);

    // Partner metrics at the selected event (#115): the model OPR, and for
    // BIOBUZZ the TIPS OPR and exact LEAVE/PARK reliability. Empty before quals.
    let teams = teamStats;
    if (selected) {
        const [matches, scores] = await Promise.all([
            fetchMatches(season, selected.code).catch(() => []),
            season >= 2026 ? fetchMatchScores(season, selected.code).catch(() => []) : Promise.resolve([]),
        ]);
        // Each robot's starting point (#117; null = as before).
        const start = await getStartingPoints(season, selected.dateStart, eventTeamNumbers(matches), { eventCode: selected.code }).catch(() => null);
        const pick = eventPickMetrics(season, matches, scores, start);
        if (Object.keys(pick).length) teams = teamStats.map(t => (pick[t.teamNumber] ? { ...t, pick: pick[t.teamNumber] } : t));
    }

    return (
        <>
        <PastSeasonBanner season={season} current={current} />
        <StrategyClient
            key={selected?.code ?? "none"}
            teams={teams}
            season={season}
            eventCode={selected?.code ?? null}
        />
        </>
    );
}
