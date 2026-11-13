// Eventos (plan "PRIDE abierta al público", Etapa 2): the season view —
// event filter, event list and season table. Moved here from "/", which is
// now "Hoy" (decision #98).
import { getAggregatedStats } from "@/lib/aggregation";
import { fetchEvents } from "@/lib/ftc-api";
import { getCurrentSeason } from "@/lib/constants";
import { seasonGameName } from "@/lib/games/season-names";
import { parseSeason, parseRegion, parseIsoDate, normalizeEventCode } from "@/lib/input-guards";
import StatsTable from "@/components/StatsTable";
import { cookies } from "next/headers";
import type { AggregatedTeamStats, FTCEvent } from "@/types/scouting";

import EventFilter from "@/components/EventFilter";
import EventList from "@/components/EventList";
import { CacheWriter, OfflineFallback } from "@/components/HydrateAndCache";
import { getTranslations } from "next-intl/server";

// Matches EventFilter's "Select All Visible" ceiling (MAX_VISIBLE_EVENTS).
const MAX_URL_EVENTS = 150;

interface PageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function EventsPage({ searchParams }: PageProps) {
  const t = await getTranslations("EventsPage");
  const resolvedParams = await searchParams;
  const cookieStore = await cookies();

  // URL params are untrusted (decision #91): every distinct value would cost
  // a FIRST API fan-out and a cache entry, so only well-formed values pass.
  const current = getCurrentSeason();
  const season = parseSeason(resolvedParams?.season, current)
    ?? parseSeason(cookieStore.get("ftc_season")?.value, current)
    ?? current;

  const eventCodes = typeof resolvedParams?.events === 'string'
    ? resolvedParams.events.split(',').slice(0, MAX_URL_EVENTS).map(normalizeEventCode).filter((c): c is string => c !== null)
    : undefined;

  // FIRST type names include spaces/hyphens ("Super Qualifier", "Off-season").
  const eventType = parseRegion(resolvedParams?.eventType);

  const filters = {
    region: parseRegion(resolvedParams?.region),
    eventType,
    dateStart: parseIsoDate(resolvedParams?.dateStart),
    dateEnd: parseIsoDate(resolvedParams?.dateEnd),
    eventCodes: eventCodes?.length ? eventCodes : undefined,
  };

  // Defensive: if origin (Firestore, FTC API, server cache) is unreachable, fall
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

  // Same Dexie key namespace as before the move, so offline caches keep working.
  const cacheKey = `home:${season}:${JSON.stringify(filters)}`;

  const gameName = seasonGameName(season) || "Season Stats";

  return (
    <main className="min-h-screen bg-background relative">
      {/* Blueprint grid fading from the top — the page's single texture. */}
      <div className="absolute inset-x-0 top-0 h-[420px] bg-grid pointer-events-none opacity-60" aria-hidden />

      <div className="container mx-auto px-4 md:px-8 py-8 md:py-12 relative z-10">
        <header className="mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-border pb-6">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground mb-3">
                <span className="text-primary">●</span> {t("season", { season, game: gameName })}
              </p>
              <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight text-foreground">
                {t("title")}
              </h1>
              <p className="text-base md:text-lg text-muted-foreground mt-2">
                {t("subtitle")}
              </p>
            </div>
            <div className="flex gap-8 w-full md:w-auto">
              <div className="md:text-right">
                <span className="block font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">{t("teams")}</span>
                <span className="text-3xl font-bold text-foreground font-display">{teamStats.length}</span>
              </div>
              <div className="md:text-right border-l border-border pl-8">
                <span className="block font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground mb-1">{t("advanced")}</span>
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
          <p>{t("footer", { year: new Date().getFullYear() })}</p>
        </footer>
      </div>
    </main>
  );
}
