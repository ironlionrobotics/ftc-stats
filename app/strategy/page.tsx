import { getAggregatedStats } from "@/lib/aggregation";
import StrategyClient from "@/components/strategy/StrategyClient";
import { cookies } from "next/headers";

export default async function StrategyPage() {
    const cookieStore = await cookies();
    const season = Number(cookieStore.get("ftc_season")?.value || 2024);

    const teams = await getAggregatedStats(season);

    return (
        <StrategyClient teams={teams} />
    );
}
