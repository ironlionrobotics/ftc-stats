// FRC event view (decision #118): the same EventViewManager as FTC with
// program="FRC" — no advancement, no BIOBUZZ RP, no starting points yet.
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { fetchFrcEvents, fetchFrcMatches, fetchFrcRankings, fetchFrcHybridSchedule, fetchFrcAlliances, fetchFrcAwards, hasFrcCredentials } from "@/lib/frc-api";
import { getCurrentSeason } from "@/lib/constants";
import { parseSeason } from "@/lib/input-guards";
import EventViewManager from "@/components/event/EventViewManager";
import AutoRefresh from "@/components/AutoRefresh";
import { Notice } from "@/components/ui/Status";
import { eventWindow } from "@/lib/today-summary";
import type { FTCAward } from "@/types/scouting";

interface PageProps {
    params: Promise<{ eventCode: string }>;
    searchParams: Promise<{ season?: string }>;
}

export default async function FrcEventPage(props: PageProps) {
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
    if (!event) {
        // Empty list = the FIRST API is unreachable, not a wrong code.
        if (events.length === 0) {
            return (
                <div className="container mx-auto px-4 md:px-8 py-8 md:py-12">
                    <Notice tone="error">{tFrc("unreachable")}</Notice>
                </div>
            );
        }
        notFound();
    }

    const [matches, rankings, schedule, alliances, frcAwards] = await Promise.all([
        fetchFrcMatches(season, event.code),
        fetchFrcRankings(season, event.code),
        fetchFrcHybridSchedule(season, event.code),
        fetchFrcAlliances(season, event.code),
        fetchFrcAwards(season, event.code),
    ]);

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
                matchBonusRp={{}}
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
