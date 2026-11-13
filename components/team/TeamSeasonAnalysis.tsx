import { getTranslations } from "next-intl/server";
import { Activity } from "lucide-react";
import { buildSeasonFormPoints } from "@/lib/team-season-analysis";
import { ConsistencyTracker } from "@/components/team/ConsistencyTracker";
import type { TeamSeasonRanking } from "@/lib/ftc-api";

/**
 * Live season analysis for any team — growth arc, consistency and alliance
 * odds, computed from the FIRST API instead of curated data.
 *
 * This is the un-hardcoded half of the team page: TeamSeasonReport stays the
 * exclusive, hand-verified retrospective for 30311, while every other team gets
 * this. It renders nothing when the season has fewer than two measurable events
 * (buildSeasonFormPoints returns null) — a one-point "trend" would be theater.
 *
 * Server component; ConsistencyTracker is the client island. Only serializable
 * props cross the boundary (numbers and plain objects).
 */
export async function TeamSeasonAnalysis({ rankings, season }: { rankings: TeamSeasonRanking[]; season: number }) {
    const series = buildSeasonFormPoints(rankings);
    if (!series) return null;

    const t = await getTranslations("SeasonAnalysis");

    return (
        <section className="mb-16 space-y-5">
            <div className="flex items-start gap-4">
                <div className="shrink-0 mt-1 p-2.5 rounded-xl bg-muted text-primary"><Activity size={20} /></div>
                <div>
                    <div className="flex items-center gap-2.5">
                        <h2 className="font-display text-xl md:text-2xl font-black text-foreground tracking-tight">{t("title")}</h2>
                        <span className="font-mono text-sm text-primary font-semibold">{t("season", { season: String(season) })}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground max-w-3xl leading-relaxed">{t("desc")}</p>
                </div>
            </div>

            <ConsistencyTracker points={series.points} publicNumber={series.publicNumber} />

            <p className="text-[11px] text-muted-foreground/80 leading-snug max-w-3xl">{t("methodology")}</p>
        </section>
    );
}
