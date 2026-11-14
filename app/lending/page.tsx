import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Wrench } from "lucide-react";
import { fetchEvents } from "@/lib/ftc-api";
import { getCurrentSeason } from "@/lib/constants";
import { normalizeEventCode, parseSeason } from "@/lib/input-guards";
import { scoutingEventOptions, pickScoutingEvent, SCOUTING_EVENT_COOKIE } from "@/lib/scouting-event";
import LendingClient from "@/components/lending/LendingClient";
import PastSeasonBanner from "@/components/shell/PastSeasonBanner";

/**
 * Pit lending (#104): who has the part or tool you need at this event, and
 * whether what was lent came back. Event choice is shared with /scouting
 * (same cookie): it's "the event I'm at".
 */
export default async function LendingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
    const t = await getTranslations("Lending");
    const store = await cookies();
    const params = await searchParams;
    const current = getCurrentSeason();
    const season = parseSeason(store.get("ftc_season")?.value, current) ?? current;
    const requested = normalizeEventCode(params?.event) ?? normalizeEventCode(store.get(SCOUTING_EVENT_COOKIE)?.value);
    const options = scoutingEventOptions(await fetchEvents(season), "MX", requested);
    const selected = pickEvent(options, requested);

    return (
        <div className="container mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
            <header className="mb-6">
                <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight"><Wrench className="text-primary" /> {t("title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
            </header>
            <PastSeasonBanner season={season} current={current} />
            <LendingClient
                key={selected?.code ?? "none"}
                season={season}
                eventCode={selected?.code ?? null}
                events={options.map(e => ({ code: e.code, name: e.name, dateStart: e.dateStart }))}
            />
        </div>
    );
}

function pickEvent(options: Parameters<typeof pickScoutingEvent>[0], requested: string | null) {
    return pickScoutingEvent(options, requested, Date.now());
}
