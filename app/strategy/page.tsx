import { getAggregatedStats } from "@/lib/aggregation";
import StrategyClient from "@/components/strategy/StrategyClient";
import { cookies } from "next/headers";
import { getCurrentSeason } from "@/lib/constants";

export default async function StrategyPage() {
    const cookieStore = await cookies();
    const season = Number(cookieStore.get("ftc_season")?.value) || getCurrentSeason();

    const { teamStats } = await getAggregatedStats(season);

    return (
        <StrategyClient teams={teamStats} />
    );
}
