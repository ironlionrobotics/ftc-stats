import { getAggregatedStats } from "@/lib/aggregation";
import { fetchEvents } from "@/lib/ftc-api";
import { getCurrentSeason } from "@/lib/constants";
import StatsTable from "@/components/StatsTable";
import { cookies } from "next/headers";
import type { AggregatedTeamStats, FTCEvent } from "@/types/scouting";

import EventFilter from "@/components/EventFilter";
import EventList from "@/components/EventList";
import { CacheWriter, OfflineFallback } from "@/components/HydrateAndCache";
import TodayPanelLoader from "@/components/home/TodayPanelLoader";

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function Home({ searchParams }: PageProps) {
  const resolvedParams = await searchParams;
  const cookieStore = await cookies();

  const seasonParam = resolvedParams?.season ? Number(resolvedParams.season) : undefined;
  const cookieSeason = Number(cookieStore.get("ftc_season")?.value);
  const season = seasonParam || cookieSeason || getCurrentSeason();

  const eventCodes = typeof resolvedParams?.events === 'string'
    ? resolvedParams.events.split(',')
    : undefined;

  const filters = {
    region: resolvedParams?.region as string,
    eventType: resolvedParams?.eventType as string,
    dateStart: resolvedParams?.dateStart as string,
    dateEnd: resolvedParams?.dateEnd as string,
    eventCodes: eventCodes,
  };

  // Defensive: if origin (Firestore, FTC API, Redis) is unreachable, fall
  // back to empty arrays. HydrateAndCache below will swap in IndexedDB-cached
  // data on the client when available.
  let allSeasonEvents: FTCEvent[] = [];
  let teamStats: AggregatedTeamStats[] = [];
  let filteredEvents: (FTCEvent & { abbr?: string })[] = [];
  try {
    allSeasonEvents = await fetchEvents(season);
    const aggregated = await getAggregatedStats(season, filters);
    teamStats = aggregated.teamStats;
    filteredEvents = aggregated.events;
  } catch (e) {
    console.warn("[home] origin fetch failed, will rely on client cache:", e instanceof Error ? e.message : e);
  }

  const cacheKey = `home:${season}:${JSON.stringify(filters)}`;

  const gameNames: Record<number, string> = {
    2025: "Decode",
    2024: "Into The Deep",
    2023: "CenterStage",
    2022: "PowerPlay",
  };

  const gameName = gameNames[season] || "Season Stats";

  return (
    <main className="min-h-screen bg-background relative">
      {/* Blueprint grid fading from the top — the page's single texture. */}
      <div className="absolute inset-x-0 top-0 h-[420px] bg-grid pointer-events-none opacity-60" aria-hidden />

      <div className="container mx-auto px-4 md:px-8 py-8 md:py-12 relative z-10">
        <header className="mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-border pb-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
                <span className="text-primary">●</span> Temporada {season} · {gameName}
              </p>
              <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight text-foreground">
                FTC <span className="text-primary">México</span>
              </h1>
              <p className="text-base md:text-lg text-muted-foreground mt-2">
                Estadísticas y proyecciones de avance
              </p>
            </div>
            <div className="flex gap-8 w-full md:w-auto">
              <div className="md:text-right">
                <span className="block font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Equipos</span>
                <span className="text-3xl font-bold text-foreground font-display">{teamStats.length}</span>
              </div>
              <div className="md:text-right border-l border-border pl-8">
                <span className="block font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">Avanzaron</span>
                <span className="text-3xl font-bold text-secondary font-display">
                  {teamStats.filter(s => s.hasAdvanced).length}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* "Today" — renders only for a signed-in user whose org is competing
            at an event happening right now. Null in every other case, so the
            public home page is unchanged. The loader is a thin gate; the panel
            itself is a next/dynamic chunk fetched only when the gate opens.
            `teamStats` is the same array StatsTable already gets: no extra
            payload. */}
        <TodayPanelLoader season={season} teams={teamStats} />

        <section className="mb-8">
          <EventFilter
            currentSeason={season}
            allEvents={allSeasonEvents.map((e) => ({
              code: e.code,
              name: e.name,
              dateStart: e.dateStart,
              stateProv: e.stateProv,
              country: e.country,
              typeName: e.typeName,
            }))}
            latestAvailableSeason={getCurrentSeason()}
          />
        </section>

        {teamStats.length > 0 || filteredEvents.length > 0 ? (
          <>
            {/* Fresh from origin — render normally + side-effect cache for next offline visit. */}
            <CacheWriter cacheKey={cacheKey} payload={{ teamStats, filteredEvents }} />
            <section className="mb-8">
              <EventList events={filteredEvents} season={season} />
            </section>
            <section className="mb-12">
              <StatsTable data={teamStats} />
            </section>
          </>
        ) : (
          // Server fetch returned empty (offline / origin error). Client reads from cache.
          <OfflineFallback cacheKey={cacheKey} render="home-stats" rendererMeta={{ season }} />
        )}

        <footer className="text-center text-muted-foreground text-sm py-8">
          <p>© {new Date().getFullYear()} FTC México Stats. No afiliado oficialmente con FIRST.</p>
        </footer>
      </div>
    </main>
  );
}
