import { cookies } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Timer } from "lucide-react";
import { getCurrentSeason } from "@/lib/constants";
import { parseSeason } from "@/lib/input-guards";
import WorkshopClient from "@/components/workshop/WorkshopClient";

/** Workshop (#105): private practice with a match clock, scoring and progress. */
export default async function WorkshopPage() {
    const t = await getTranslations("Workshop");
    const store = await cookies();
    const current = getCurrentSeason();
    const season = parseSeason(store.get("ftc_season")?.value, current) ?? current;
    return (
        <div className="container mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-10">
            <header className="mb-6">
                <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight"><Timer className="text-primary" /> {t("title")}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{t("subtitle")}</p>
            </header>
            <WorkshopClient season={season} />
        </div>
    );
}
