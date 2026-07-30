import { getAggregatedStats } from "@/lib/aggregation";
import { getCurrentSeason } from "@/lib/constants";
import ScoutingClient from "@/components/scouting/ScoutingClient";
import { cookies } from "next/headers";
import { AggregatedTeamStats } from "@/types/scouting";

export default async function ScoutingPage() {
    const cookieStore = await cookies();
    const season = Number(cookieStore.get("ftc_season")?.value) || getCurrentSeason();
    const program = cookieStore.get("active_program")?.value || "FTC";

    let initialTeams: AggregatedTeamStats[] = [];

    if (program === "FTC") {
        const { teamStats } = await getAggregatedStats(season);
        initialTeams = teamStats;
    }
    // FRC: no real data source wired yet (TBA pending) — never show fabricated numbers

    return (
        <ScoutingClient initialTeams={initialTeams} />
    );
}
