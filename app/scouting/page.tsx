import { getAggregatedStats } from "@/lib/aggregation";
import ScoutingClient from "@/components/scouting/ScoutingClient";

export default async function ScoutingPage() {
    const teams = await getAggregatedStats();

    return (
        <ScoutingClient initialTeams={teams} />
    );
}
