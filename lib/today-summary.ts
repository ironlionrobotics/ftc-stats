import type { FTCEvent, FTCHybridScheduleMatch, FTCMatch, TeamRanking } from "@/types/scouting";
import { pickNextMatch, type NextMatchInfo } from "@/lib/today";
import { eventStrengthModel, projectFinalRankings } from "@/lib/live-projection";
import { draftOdds } from "@/lib/draft-odds";
import { estimateAlliances } from "@/lib/event-selector";

/**
 * "Hoy" (plan "PRIDE abierta al público" §1): what a followed team needs to
 * know right now, assembled from public FIRST data — no account needed.
 * Pure: the page fetches, this decides and computes. Decision #98.
 *
 * States:
 *  - atEvent:   the team is competing now → next match with win odds,
 *               current/projected rank, alliance-selection odds.
 *  - upcoming:  next event hasn't started → date and countdown.
 *  - between:   no upcoming event → last event and its result.
 *  - noEvents:  the team has no events this season.
 */

const DAY = 24 * 60 * 60 * 1000;

/** dateStart/dateEnd are date-only strings parsed as UTC midnight. */
export function eventWindow(e: Pick<FTCEvent, "dateStart" | "dateEnd">): { start: number; end: number } {
    const start = Date.parse(e.dateStart);
    const end = Date.parse(e.dateEnd || e.dateStart);
    // Whole last day in every venue timezone (UTC−12 … UTC+14) counts as live.
    return { start: start - 14 * 60 * 60 * 1000, end: end + DAY + 12 * 60 * 60 * 1000 };
}

export type EventPhase = "live" | "upcoming" | "past";

/** The event that matters now: live first, else the soonest upcoming, else the latest past. */
export function pickRelevantEvent<E extends Pick<FTCEvent, "dateStart" | "dateEnd">>(
    events: E[],
    nowMs: number,
): { event: E; phase: EventPhase } | null {
    const valid = events.filter(e => Number.isFinite(Date.parse(e.dateStart)));
    const live = valid.filter(e => {
        const w = eventWindow(e);
        return nowMs >= w.start && nowMs <= w.end;
    });
    if (live.length) {
        // Two overlapping events (league meet + qualifier): the one that started last.
        live.sort((a, b) => Date.parse(b.dateStart) - Date.parse(a.dateStart));
        return { event: live[0], phase: "live" };
    }
    const upcoming = valid.filter(e => eventWindow(e).start > nowMs)
        .sort((a, b) => Date.parse(a.dateStart) - Date.parse(b.dateStart));
    if (upcoming.length) return { event: upcoming[0], phase: "upcoming" };
    const past = valid.filter(e => eventWindow(e).end < nowMs)
        .sort((a, b) => Date.parse(b.dateStart) - Date.parse(a.dateStart));
    if (past.length) return { event: past[0], phase: "past" };
    return null;
}

export interface TodayRanking {
    currentRank: number;
    teamCount: number;
    rs: number;
    record: { wins: number; losses: number; ties: number };
    /** Present while quals are still running. */
    projected?: { rank: number; range: [number, number]; pCaptain: number; matchesRemaining: number };
}

export interface TodayNextMatch extends NextMatchInfo {
    /** P(our alliance wins), normal model on event OPR; null with < 2 played quals. */
    winProbability: number | null;
}

export interface TodayAllianceOdds {
    probability: number;
    wouldCaptain: boolean;
    alliances: number;
    seed: number;
}

export interface TodayAtEvent {
    ranking: TodayRanking | null;
    nextMatch: TodayNextMatch | null;
    allianceOdds: TodayAllianceOdds | null;
    qualsPlayed: number;
    qualsTotal: number;
}

/**
 * Live-event summary for `team`. `matches` are the event's matches (any
 * level), `schedule` the hybrid schedule, `rankings` the current FIRST
 * rankings.
 */
export function summarizeAtEvent(
    team: number,
    rankings: TeamRanking[],
    matches: FTCMatch[],
    schedule: FTCHybridScheduleMatch[],
    eventCode: string,
    rp: { winRp: number; tieRp: number },
): TodayAtEvent {
    const quals = matches.filter(m => m.tournamentLevel === "QUALIFICATION");
    const playedQuals = quals.filter(m => (m.postResultTime?.length ?? 0) > 0 || (m.scoreRedFinal ?? 0) + (m.scoreBlueFinal ?? 0) > 0);
    const me = rankings.find(r => r.teamNumber === team);

    let ranking: TodayRanking | null = null;
    if (me && (me.matchesPlayed ?? 0) > 0) {
        ranking = {
            currentRank: me.rank,
            teamCount: rankings.length,
            rs: me.sortOrder1 ?? 0,
            record: { wins: me.wins ?? 0, losses: me.losses ?? 0, ties: me.ties ?? 0 },
        };
        const projection = projectFinalRankings(rankings, matches, eventCode, rp);
        const row = projection.teamProjections.find(p => p.teamNumber === team);
        if (row && row.matchesRemaining > 0) {
            ranking.projected = {
                rank: row.projectedFinalRank,
                range: row.rankRange,
                pCaptain: row.pCaptain,
                matchesRemaining: row.matchesRemaining,
            };
        }
    }

    const model = playedQuals.length >= 2 ? eventStrengthModel(playedQuals) : null;
    const next = pickNextMatch(schedule, team);
    let nextMatch: TodayNextMatch | null = null;
    if (next) {
        let winProbability: number | null = null;
        if (model) {
            const mine = [team, ...next.partners.map(p => p.teamNumber)];
            const theirs = next.opponents.map(p => p.teamNumber);
            const pRed = next.alliance === "Red" ? model.pRed(mine, theirs) : model.pRed(theirs, mine);
            winProbability = next.alliance === "Red" ? pRed : 1 - pRed;
        }
        nextMatch = { ...next, winProbability };
    }

    let allianceOdds: TodayAllianceOdds | null = null;
    if (ranking && model && rankings.length >= 4) {
        const field = rankings.map(r => r.teamNumber);
        const mine = model.strength(team);
        const below = field.filter(t => model.strength(t) < mine).length;
        const oprPct = (below / field.length) * 100;
        const alliances = estimateAlliances(field.length);
        const seed = ranking.projected?.rank ?? ranking.currentRank;
        const odds = draftOdds(seed, alliances, oprPct);
        allianceOdds = { probability: odds.probability, wouldCaptain: odds.wouldCaptain, alliances, seed };
    }

    return { ranking, nextMatch, allianceOdds, qualsPlayed: playedQuals.length, qualsTotal: quals.length };
}

/** Whole days from `nowMs` to the event's first day (0 = starts today/tomorrow-ish window). */
export function daysUntil(event: Pick<FTCEvent, "dateStart">, nowMs: number): number {
    return Math.max(0, Math.ceil((Date.parse(event.dateStart) - nowMs) / DAY));
}
