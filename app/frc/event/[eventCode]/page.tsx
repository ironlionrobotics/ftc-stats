// FRC event view (decision #118): the same EventViewManager as FTC with
// program="FRC" — no advancement, no BIOBUZZ RP models, no starting points yet;
// bonus RP from the official breakdowns (lib/frc-rp.ts).
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fetchFrcEvents, fetchFrcMatches, fetchFrcRankings, fetchFrcHybridSchedule, fetchFrcAlliances, fetchFrcAwards, fetchFrcScores, hasFrcCredentials } from "@/lib/frc-api";
import { frcMatchBonusRp } from "@/lib/frc-rp";
import { getCurrentSeason } from "@/lib/constants";
import { flagOn } from "@/lib/app-config";
import { parseSeason } from "@/lib/input-guards";
import EventViewManager from "@/components/event/EventViewManager";
import AutoRefresh from "@/components/AutoRefresh";
import { Notice } from "@/components/ui/Status";
import { CacheWriter, OfflineFallback } from "@/components/HydrateAndCache";
import { eventWindow } from "@/lib/today-summary";
import type { FTCAward } from "@/types/scouting";

interface PageProps {
    params: Promise<{ eventCode: string }>;
    searchParams: Promise<{ season?: string }>;
}

export default async function FrcEventPage(props: PageProps) {
    if (!(await flagOn("frc"))) notFound(); // superadmin switch (#119)
    const { eventCode } = await props.params;
    const searchParams = await props.searchParams;
    const t = await getTranslations("EventPage");
    const tFrc = await getTranslations("FrcPages");

    if (!hasFrcCredentials()) {
        return (
            <div className="container mx-auto px-4 md:px-8 py-8 md:py-12">
                <Notice tone="warn">{tFrc("notConfigured")}</Notice>
            </div>
        );
    }

    const current = getCurrentSeason("FRC");
    const season = parseSeason(searchParams?.season, current) ?? current;
    const events = await fetchFrcEvents(season);
    const event = events.find(e => e.code.toLowerCase() === (eventCode || "").toLowerCase());
    // Own key space: FRC and FTC event codes can collide.
    const cacheKey = `frc-event:${(eventCode || "").toUpperCase()}`;
    if (!event) {
        // Empty list = the FIRST API is unreachable, not a wrong code: show what this device cached last time.
        if (events.length === 0) {
            return (
                <div className="container mx-auto px-4 md:px-8 py-8 md:py-12 space-y-4">
                    <Notice tone="error">{tFrc("unreachable")}</Notice>
                    <OfflineFallback cacheKey={cacheKey} render="event-stats" />
                </div>
            );
        }
        notFound();
    }

    const [matches, rankings, schedule, alliances, frcAwards, scores] = await Promise.all([
        fetchFrcMatches(season, event.code),
        fetchFrcRankings(season, event.code),
        fetchFrcHybridSchedule(season, event.code),
        fetchFrcAlliances(season, event.code),
        fetchFrcAwards(season, event.code),
        fetchFrcScores(season, event.code),
    ]);
    // Official bonus RPs per qual alliance, so the round slider rebuilds past rankings with the real Ranking Score.
    const matchBonusRp = frcMatchBonusRp(season, matches, scores);

    // FRC awards -> the FTC shape AwardList reads; person-only awards (no team) are skipped.
    const awards: FTCAward[] = frcAwards
        .filter(a => a.teamNumber != null)
        .map(a => ({
            awardId: a.awardId, teamNumber: a.teamNumber as number, displayTeamNumber: String(a.teamNumber),
            awardName: a.name, name: a.name, series: a.series, eventCode: event.code,
        }));

    return (
        <div className="container mx-auto px-4 md:px-8 py-8 md:py-12">
            {isLiveNow(event) && <AutoRefresh everyMs={60_000} />}
            <header className="mb-8 border-b border-border pb-6">
                <div className="space-y-2">
                    <div className="flex items-center gap-2 text-muted-foreground font-mono tracking-[0.2em] text-xs uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                        FRC · {t("season", { season })}
                    </div>
                    <h1 className="text-4xl md:text-5xl font-bold font-display text-foreground">{event.name}</h1>
                    <div className="flex items-center gap-3 text-muted-foreground">
                        <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded border border-border">{event.code}</span>
                        {event.venue && <span className="text-sm">• {event.venue}</span>}
                        {event.city && <span className="text-sm">• {event.city}, {event.stateProv}</span>}
                    </div>
                </div>
            </header>

            <CacheWriter
                cacheKey={cacheKey}
                payload={{
                    event: { name: event.name, code: event.code, venue: event.venue, city: event.city, stateProv: event.stateProv },
                    matches, rankings, advancement: null, awards, advancementPoints: [],
                    schedule, alliances, season, startingPoints: null, matchBonusRp, program: "FRC",
                }}
            />

            <EventViewManager
                matches={matches}
                rankings={rankings}
                advancement={null}
                awards={awards}
                advancementPoints={[]}
                schedule={schedule}
                selectedAlliances={alliances}
                eventCode={event.code}
                season={season}
                matchBonusRp={matchBonusRp}
                startingPoints={null}
                program="FRC"
            />
        </div>
    );
}

/** Module scope: Date.now() is impure (React Compiler purity). */
function isLiveNow(e: { dateStart: string; dateEnd?: string }): boolean {
    const w = eventWindow(e);
    const now = Date.now();
    return now >= w.start && now <= w.end;
}
