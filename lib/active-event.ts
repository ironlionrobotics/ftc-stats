import type { AggregatedTeamStats } from "@/types/scouting";

/**
 * The guess plus WHY it was made. `live` is true only for branch 1 below —
 * an event whose date window contains today. Callers that merely need an
 * eventCode to write under (scouting forms, strategy tabs) don't care and use
 * `guessActiveEventCode`; callers that must not render unless competition is
 * actually happening (the home "Today" panel) need the distinction, because
 * branches 2 and 3 return a finished or arbitrary event.
 */
export interface ActiveEventGuess {
    code: string;
    /** True only when today falls inside the event's date window. */
    live: boolean;
}

// Best guess for "the event we're at right now", used by scouting forms and
// strategy tabs to decide which eventCode to write/listen under when the page
// has no explicit event context. Preference order:
//   1. An event whose date window contains today (±1 day start, +2 days end,
//      all UTC — generous so late playoffs/awards still count as "live").
//   2. The team's most recent event by start date.
//   3. The most frequent eventCode across teams (stale cache without dates).
export function guessActiveEventCode(teams: AggregatedTeamStats[]): string | null {
    return guessActiveEvent(teams)?.code ?? null;
}

/** Same resolution as `guessActiveEventCode`, but reports which branch won. */
export function guessActiveEvent(teams: AggregatedTeamStats[]): ActiveEventGuess | null {
    const seen = new Map<string, { count: number; dateStart?: string; dateEnd?: string }>();
    for (const team of teams) {
        for (const e of team.events) {
            const cur = seen.get(e.eventCode) ?? {
                count: 0,
                dateStart: e.dateStart,
                dateEnd: e.dateEnd,
            };
            cur.count++;
            seen.set(e.eventCode, cur);
        }
    }
    if (seen.size === 0) return null;

    const now = Date.now();
    const DAY_MS = 86_400_000;
    let live: string | null = null;
    let liveStart = -Infinity;
    let latest: string | null = null;
    let latestStart = -Infinity;

    for (const [code, info] of seen) {
        const start = info.dateStart ? Date.parse(info.dateStart) : NaN;
        if (!Number.isFinite(start)) continue;
        const end = info.dateEnd ? Date.parse(info.dateEnd) : start;
        if (now >= start - DAY_MS && now <= end + 2 * DAY_MS && start > liveStart) {
            live = code;
            liveStart = start;
        }
        if (start > latestStart) {
            latest = code;
            latestStart = start;
        }
    }

    if (live) return { code: live, live: true };
    if (latest) return { code: latest, live: false };
    const code = [...seen.entries()].sort((a, b) => b[1].count - a[1].count)[0]![0];
    return { code, live: false };
}
