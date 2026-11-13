import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getAggregatedStats } from "@/lib/aggregation";
import { getCurrentSeason } from "@/lib/constants";
import { parseSeason } from "@/lib/input-guards";
import StatsTable from "@/components/StatsTable";
import type { AggregatedTeamStats } from "@/types/scouting";

/**
 * Equipos (plan "PRIDE abierta al público", Etapa 1): season table of teams.
 * Team search lives in the shell; each row links to /team/[n]. Etapa 3 adds
 * region/season context from the header and the followed team.
 */
export default async function TeamsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const t = await getTranslations("TeamsPage");
    const params = await searchParams;
    const current = getCurrentSeason();
    const season = parseSeason(params?.season, current)
        ?? parseSeason((await cookies()).get("ftc_season")?.value, current)
        ?? current;

    let teamStats: AggregatedTeamStats[] = [];
    try {
        teamStats = (await getAggregatedStats(season, {})).teamStats;
    } catch (e) {
        console.warn("[teams] origin fetch failed:", e instanceof Error ? e.message : e);
    }

    return (
        <main className="container mx-auto px-4 md:px-8 py-6 md:py-10">
            <header className="mb-6">
                <h1 className="text-3xl md:text-4xl font-black uppercase tracking-[0.02em]">{t("title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("subtitle", { season })}</p>
            </header>
            <StatsTable data={teamStats} />
        </main>
    );
}
