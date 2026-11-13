/**
 * Live season analysis for ANY team — the un-hardcoded counterpart of the
 * curated 30311 retrospective (lib/reports/team-30311-decode.ts).
 *
 * The curated report feeds ConsistencyTracker from hand-verified FTCScout OPRs.
 * This module builds the same shape (FormPoint[]) straight from what the FIRST
 * API already gives us per event, so every team page can show the growth-vs-
 * volatility decomposition without anyone curating anything.
 *
 * WHY avgNP AND NOT A REAL OPR. A true OPR is a least-squares fit over the whole
 * event's alliance results; we do compute one in lib/aggregation.ts, but only
 * per event, and it is expensive. The app's own convention already equates the
 * two for display purposes — lib/aggregation.ts sets `stats.opr = stats.averageNP`
 * — so the series here is average net points (score minus fouls) per
 * qualification match. It is a proxy: it credits the whole alliance's output to
 * the team, so it runs high relative to FTCScout's OPR. That is fine for a
 * WITHIN-team, within-season trend (the bias is roughly constant across the
 * team's own events) and is exactly why the UI must not compare it across teams
 * as if it were an OPR. Callers surface this as a methodology note.
 *
 * ORDER. `points` inherits the order of `rankings`, and
 * fetchTeamRankingsInSeason returns them sorted by event start date. The slope
 * that analyzeSeries computes is therefore "net points gained per event over
 * the season", which is only meaningful chronologically.
 */

import type { TeamSeasonRanking } from "@/lib/ftc-api";
import type { FormPoint } from "@/lib/consistency";

export interface SeasonFormSeries {
    /** Chronological series, ready for buildConsistencyProfile. */
    points: FormPoint[];
    /**
     * The season-level number a captain would judge this team by: the mean of
     * its per-event averages. Plays the same role the published season OPR
     * plays in the curated report — a blended figure that lags current form.
     */
    publicNumber: number;
}

/**
 * A season's per-event rankings turned into a form series.
 *
 * Returns null when fewer than two events carry a usable average, because a
 * trend needs at least two observations (and diagnoseForm will honestly report
 * "insuficiente" below three).
 */
export function buildSeasonFormPoints(rankings: TeamSeasonRanking[]): SeasonFormSeries | null {
    const points: FormPoint[] = [];

    for (const r of rankings) {
        // fetchTeamRankingsInSeason emits avgNP = 0 when the team played no
        // QUALIFICATION matches at that event, so 0 means "not measured here",
        // not "scored nothing". Including it would drag the trend toward a
        // value the team never actually posted.
        if (!Number.isFinite(r.avgNP) || r.avgNP <= 0) continue;

        const hasAuto = Number.isFinite(r.avgAuto);
        points.push({
            label: r.eventCode,
            opr: r.avgNP,
            // Phase split: auto is measured directly; everything else (teleop +
            // endgame) is what is left of the net total. Clamped because the
            // two averages come from the same matches but are reported
            // independently, so rounding can make the difference slightly
            // negative on a very auto-heavy event.
            ...(hasAuto ? { auto: r.avgAuto, dc: Math.max(0, r.avgNP - r.avgAuto) } : {}),
        });
    }

    if (points.length < 2) return null;

    const publicNumber = points.reduce((s, p) => s + p.opr, 0) / points.length;
    return { points, publicNumber };
}
