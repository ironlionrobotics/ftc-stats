import { getAggregatedStats } from "@/lib/aggregation";
import { fetchEvents } from "@/lib/ftc-api";
import { getCurrentSeason } from "@/lib/constants";
import StatsTable from "@/components/StatsTable";
import { cookies } from "next/headers";
import type { AggregatedTeamStats, FTCEvent } from "@/types/scouting";

import EventFilter from "@/components/EventFilter";
import EventList from "@/components/EventList";
import { CacheWriter, OfflineFallback } from "@/components/HydrateAndCache";

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
    <main className="min-h-screen bg-background relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-0 w-full h-96 bg-primary/10 blur-[100px] rounded-full -translate-y-1/2 pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-full h-96 bg-secondary/10 blur-[100px] rounded-full translate-y-1/2 pointer-events-none" />

      <div className="container mx-auto px-8 py-12 relative z-10">
        <header className="mb-8 text-center md:text-left">
          <div className="flex flex-col md:flex-row justify-between items-end gap-6 border-b border-border/50 pb-6">
            <div>
              <h1 className="text-5xl md:text-6xl font-bold font-display tracking-tight text-foreground mb-2">
                FTC <span className="text-primary">México</span>
              </h1>
              <p className="text-xl text-muted-foreground font-light">
                Estadísticas y Proyecciones <span className="text-accent font-medium">{season} - {gameName}</span>
              </p>
            </div>
            <div className="flex gap-8">
              <div className="text-right hidden md:block">
                <span className="block text-sm text-muted-foreground uppercase tracking-widest">Total de Equipos</span>
                <span className="text-3xl font-bold text-foreground font-display">{teamStats.length}</span>
              </div>
              <div className="text-right hidden md:block border-l border-border/50 pl-8">
                <span className="block text-sm text-secondary uppercase tracking-widest">Avanzaron</span>
                <span className="text-3xl font-bold text-secondary font-display">
                  {teamStats.filter(s => s.hasAdvanced).length}
                </span>
              </div>
            </div>
          </div>
        </header>

        <section className="mb-8">
          <EventFilter
            currentSeason={season}
            allEvents={allSeasonEvents}
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
