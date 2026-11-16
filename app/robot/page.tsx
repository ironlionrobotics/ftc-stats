import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Activity } from "lucide-react";
import { getCurrentSeason } from "@/lib/constants";
import { flagOn } from "@/lib/app-config";
import { parseSeason } from "@/lib/input-guards";
import { resolveActiveEvent } from "@/lib/active-event-server";
import { fetchHybridSchedule } from "@/lib/ftc-api";
import RobotHealthClient, { type ScheduleLite } from "@/components/robot/RobotHealthClient";
import PastSeasonBanner from "@/components/shell/PastSeasonBanner";

/** Robot health (#120): private CSV logs of the robot, analyzed in the browser. */
export default async function RobotPage() {
    if (!(await flagOn("robotHealth"))) notFound(); // superadmin switch (#119)
    const t = await getTranslations("RobotHealth");
    const store = await cookies();
    const current = getCurrentSeason();
    const season = parseSeason(store.get("ftc_season")?.value, current) ?? current;

    // The active event only feeds the "which match was this?" picker: never break the page.
    let eventCode: string | null = null;
    let schedule: ScheduleLite[] = [];
    try {
        const { selected } = await resolveActiveEvent(season);
        if (selected) {
            eventCode = selected.code;
            const matches = await fetchHybridSchedule(season, selected.code).catch(() => []);
            schedule = matches.map(m => ({ level: m.tournamentLevel, number: m.matchNumber, teams: m.teams.map(x => x.teamNumber) }));
        }
    } catch { /* FIRST API down */ }

    return (
        <div className="container mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
            <header className="mb-6">
                <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight"><Activity className="text-primary" /> {t("title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
            </header>
            <PastSeasonBanner season={season} current={current} />
            <RobotHealthClient season={season} activeEvent={eventCode} schedule={schedule} />
        </div>
    );
}
