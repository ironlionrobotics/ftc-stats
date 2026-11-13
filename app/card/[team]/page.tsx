import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { IdCard } from "lucide-react";
import { getCurrentSeason } from "@/lib/constants";
import { parseSeason, isValidTeamNumber } from "@/lib/input-guards";
import CardView from "@/components/card/CardView";

/** Another team's Trading Card (#106/#107) — approved teams only (checked client-side by rules). */
export default async function TeamCardPage({ params }: { params: Promise<{ team: string }> }) {
    const { team } = await params;
    const teamNumber = Number(team);
    if (!isValidTeamNumber(teamNumber)) notFound();
    const t = await getTranslations("CardView");
    const store = await cookies();
    const current = getCurrentSeason();
    const season = parseSeason(store.get("ftc_season")?.value, current) ?? current;
    return (
        <div className="container mx-auto max-w-6xl px-4 py-8">
            <header className="mb-6">
                <h1 className="flex items-center gap-3 text-3xl font-black tracking-tight"><IdCard className="text-primary" /> {t("title", { team: teamNumber })}</h1>
            </header>
            <CardView season={season} teamNumber={teamNumber} />
        </div>
    );
}
