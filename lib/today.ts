import type { FTCHybridScheduleMatch } from "@/types/scouting";

/**
 * Pure helpers behind the home "Today" panel.
 *
 * The panel is assembly, not new math: rankings come from
 * `lib/live-projection.ts`, alliance odds from `lib/draft-odds.ts`. What was
 * missing were the two small reductions below — "which match do we play next"
 * and "how much of this event have we actually scouted" — so they live here,
 * pure and tested, rather than inline in the component.
 */

export interface NextMatchTeam {
    teamNumber: number;
    /** null when the API omits it (it frequently does on the hybrid endpoint). */
    teamName: string | null;
}

export interface NextMatchInfo {
    matchNumber: number;
    description: string;
    tournamentLevel: string;
    /** ISO string as the API gives it, or null when unscheduled. */
    startTime: string | null;
    alliance: "Red" | "Blue";
    /** Alliance mates, excluding the queried team. */
    partners: NextMatchTeam[];
    opponents: NextMatchTeam[];
}

/** Unplayed ⟺ neither final score has been posted. */
function isUnplayed(m: FTCHybridScheduleMatch): boolean {
    return m.scoreRedFinal == null && m.scoreBlueFinal == null;
}

function allianceOf(station: string): "Red" | "Blue" | null {
    if (station.startsWith("Red")) return "Red";
    if (station.startsWith("Blue")) return "Blue";
    return null;
}

/**
 * The next match `teamNumber` plays: the first unplayed match on the schedule
 * that lists them as a non-surrogate participant.
 *
 * Ordering. The hybrid schedule arrives chronologically with qualification
 * matches ahead of playoffs, so the array order IS the answer and re-sorting by
 * `matchNumber` would be actively wrong (playoff match 1 would jump ahead of
 * qual match 40). We only re-sort when every candidate carries a parseable
 * `startTime` — an all-or-nothing rule, because a partial sort against missing
 * timestamps is a comparator that isn't a total order and would shuffle
 * unpredictably. Otherwise the given order is preserved verbatim.
 *
 * Surrogate appearances are skipped: the team is on the field but the match is
 * not theirs in any sense that matters for "what do we play next" — it doesn't
 * count toward their ranking.
 */
export function pickNextMatch(
    matches: FTCHybridScheduleMatch[],
    teamNumber: number,
): NextMatchInfo | null {
    const candidates = matches.filter(
        m => isUnplayed(m) && m.teams.some(t => t.teamNumber === teamNumber && t.surrogate !== true),
    );
    if (candidates.length === 0) return null;

    const allTimed = candidates.every(m => {
        const t = m.startTime;
        return typeof t === "string" && Number.isFinite(Date.parse(t));
    });
    const ordered = allTimed
        ? [...candidates].sort((a, b) => Date.parse(a.startTime!) - Date.parse(b.startTime!))
        : candidates;

    const next = ordered[0];
    const mine = next.teams.find(t => t.teamNumber === teamNumber && t.surrogate !== true)!;
    const alliance = allianceOf(mine.station);
    // A station we can't parse means we can't say who the partners are, and a
    // half-filled card is worse than none.
    if (!alliance) return null;

    const partners: NextMatchTeam[] = [];
    const opponents: NextMatchTeam[] = [];
    for (const t of next.teams) {
        if (t.teamNumber === teamNumber) continue;
        const side = allianceOf(t.station);
        if (!side) continue;
        const entry: NextMatchTeam = { teamNumber: t.teamNumber, teamName: t.teamName ?? null };
        if (side === alliance) partners.push(entry);
        else opponents.push(entry);
    }

    return {
        matchNumber: next.matchNumber,
        description: next.description,
        tournamentLevel: next.tournamentLevel,
        startTime: next.startTime ?? null,
        alliance,
        partners,
        opponents,
    };
}

export interface ScoutingCoverage {
    /** Distinct matches with at least one scouting entry. */
    scouted: number;
    /** Qualification matches the event has actually played. */
    played: number;
    /** scouted / played, clamped to [0,1]. */
    pct: number;
}

/**
 * How much of what has been played is on record.
 *
 * Distinct match numbers, not entry count: six scouts covering the same match
 * is one match covered, and counting entries would report 600% coverage of a
 * single-match event. Clamped because scouting a playoff or a surrogate match
 * can legitimately push the numerator past the qual-only denominator, and a
 * progress bar reading 140% just looks broken.
 *
 * Returns null when nothing has been played — 0/0 is not "0% covered", it's
 * "not a question yet", and the UI says so.
 */
export function computeCoverage(
    scoutedMatchNumbers: number[],
    qualPlayed: number,
): ScoutingCoverage | null {
    if (qualPlayed <= 0) return null;
    const scouted = new Set(scoutedMatchNumbers).size;
    const pct = Math.min(1, Math.max(0, scouted / qualPlayed));
    return { scouted, played: qualPlayed, pct };
}
