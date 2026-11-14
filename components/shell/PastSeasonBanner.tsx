"use client";

import { useTranslations } from "next-intl";
import { History } from "lucide-react";
import { useProgramStore } from "@/lib/stores/program-store";

/**
 * Operational pages (scouting, strategy, lending, workshop) follow the
 * browsing season cookie, so someone who looked at last season's stats lands
 * on last season's events without noticing (found in the 14-nov walkthrough:
 * /scouting opened FPEMX instead of MXTLQ). This makes it visible and one tap
 * away from the current season. Renders nothing when already current.
 */
export default function PastSeasonBanner({ season, current }: { season: number; current: number }) {
    const t = useTranslations("Shell.pastSeason");
    if (season === current) return null;
    return (
        <div role="status" className="mx-auto mb-4 flex max-w-5xl flex-wrap items-center gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
            <History size={18} className="shrink-0 text-warning" aria-hidden />
            <span className="flex-1">{t("text", { season, current })}</span>
            <button type="button" onClick={() => useProgramStore.getState().setSeason(current)}
                className="min-h-[40px] rounded-lg bg-primary px-3 font-semibold text-primary-foreground">
                {t("action", { current })}
            </button>
        </div>
    );
}
