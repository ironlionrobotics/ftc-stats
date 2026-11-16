import "server-only";
import type { FTCHybridScheduleMatch, FTCMatch, TeamRanking } from "@/types/scouting";
import { fetchEvents, fetchMatches, fetchHybridSchedule, fetchRankings, fetchTeam, fetchTeamEvents } from "@/lib/ftc-api";
import { eventWindow, pickRelevantEvent, type EventPhase } from "@/lib/today-summary";
import { summarizeEvent, shortMatchLabel, type EventLive, type PlayedLine } from "@/lib/following-summary";
import { eventStrengthModel } from "@/lib/live-projection";
import { eventTeamNumbers, hasStartingPoints } from "@/lib/starting-points";
import { getStartingPoints } from "@/lib/starting-points-server";
import { pickNextMatch, type NextMatchInfo } from "@/lib/today";
import type { Follows } from "@/lib/follows";

/**
 * Server-side assembly of the "Siguiendo" cards (decision #110): one card per
 * followed event and team, from the cached FIRST fetchers (60 s TTL while an
 * event is live, shared by every visitor). Used for the first render of "Hoy"
 * and by the polling action, so both show exactly the same thing.
 */

export interface FollowedEventCard {
    code: string;
    name: string;
    place: string;
    phase: EventPhase | "unknown";
    dateStart: string | null;
    inDays: number;
    live: EventLive | null;
}

export interface FollowedTeamCard {
    teamNumber: number;
    name: string | null;
    event: { code: string; name: string; phase: EventPhase; inDays: number } | null;
    nextMatch: (NextMatchInfo & { winProbability: number | null }) | null;
    lastMatch: (PlayedLine & { won: boolean | null }) | null;
    rank: { rank: number; of: number; wins: number; losses: number; ties: number } | null;
}

export interface FollowingSnapshot {
    at: number;
    events: FollowedEventCard[];
    teams: FollowedTeamCard[];
}

const DAY = 86_400_000;
const inDays = (start: number, now: number) => Math.max(0, Math.ceil((start - now) / DAY));

type EventData = { rankings: TeamRanking[]; matches: FTCMatch[]; schedule: FTCHybridScheduleMatch[] };

export async function loadFollowingSnapshot(follows: Follows, season: number, now = Date.now()): Promise<FollowingSnapshot> {
    if (follows.events.length === 0 && follows.teams.length === 0) return { at: now, events: [], teams: [] };

    // One fetch per event per request, shared by event and team cards.
    const memo = new Map<string, Promise<EventData>>();
    const eventData = (code: string) => {
        let p = memo.get(code);
        if (!p) {
            p = Promise.all([fetchRankings(season, code), fetchMatches(season, code), fetchHybridSchedule(season, code)])
                .then(([rankings, matches, schedule]) => ({ rankings, matches, schedule }));
            memo.set(code, p);
        }
        return p;
    };

    const allEvents = follows.events.length ? await fetchEvents(season) : [];
    const byCode = new Map(allEvents.map(e => [e.code, e]));

    const events = await Promise.all(follows.events.map(async (code): Promise<FollowedEventCard> => {
        const e = byCode.get(code);
        if (!e) return { code, name: code, place: "", phase: "unknown", dateStart: null, inDays: 0, live: null };
        const w = eventWindow(e);
        const phase: EventPhase = now < w.start ? "upcoming" : now > w.end ? "past" : "live";
        const place = [e.city, e.country].filter(Boolean).join(", ");
        let live: EventLive | null = null;
        if (phase !== "upcoming") {
            const d = await eventData(code);
            if (d.schedule.length || d.rankings.length) {
                // Each robot's starting point (#117; null = as before).
                const start = await getStartingPoints(season, e.dateStart, eventTeamNumbers(d.matches, d.schedule, d.rankings), { eventCode: code }).catch(() => null);
                live = summarizeEvent(d.rankings, d.matches, d.schedule, undefined, start);
            }
        }
        return { code, name: e.name, place, phase, dateStart: e.dateStart, inDays: phase === "upcoming" ? inDays(Date.parse(e.dateStart), now) : 0, live };
    }));

    const teams = await Promise.all(follows.teams.map(async (n): Promise<FollowedTeamCard> => {
        const [info, teamEvents] = await Promise.all([fetchTeam(season, n), fetchTeamEvents(season, n)]);
        const pick = pickRelevantEvent(teamEvents, now);
        const card: FollowedTeamCard = { teamNumber: n, name: info?.nameShort ?? null, event: null, nextMatch: null, lastMatch: null, rank: null };
        if (!pick) return card;
        card.event = { code: pick.event.code, name: pick.event.name, phase: pick.phase, inDays: pick.phase === "upcoming" ? inDays(Date.parse(pick.event.dateStart), now) : 0 };
        if (pick.phase === "upcoming") return card;

        const d = await eventData(pick.event.code);
        const playedQuals = d.matches.filter(m => m.tournamentLevel === "QUALIFICATION"
            && ((m.postResultTime?.length ?? 0) > 0 || (m.scoreRedFinal ?? 0) + (m.scoreBlueFinal ?? 0) > 0));
        const start = await getStartingPoints(season, pick.event.dateStart, eventTeamNumbers(d.matches, d.schedule, d.rankings), { eventCode: pick.event.code }).catch(() => null);
        const model = playedQuals.length >= 2 || hasStartingPoints(start) ? eventStrengthModel(playedQuals, start) : null;
        const next = pick.phase === "live" ? pickNextMatch(d.schedule, n) : null;
        if (next) {
            const mine = [n, ...next.partners.map(p => p.teamNumber)], theirs = next.opponents.map(p => p.teamNumber);
            const pRed = model ? (next.alliance === "Red" ? model.pRed(mine, theirs) : model.pRed(theirs, mine)) : null;
            card.nextMatch = { ...next, description: shortMatchLabel(next.description, next.tournamentLevel, next.matchNumber), winProbability: pRed === null ? null : next.alliance === "Red" ? pRed : 1 - pRed };
        }
        const last = [...d.schedule].reverse().find(m => (m.scoreRedFinal != null || m.scoreBlueFinal != null) && m.teams.some(t => t.teamNumber === n));
        if (last) {
            const red = last.teams.filter(t => t.station.startsWith("Red")).map(t => t.teamNumber);
            const blue = last.teams.filter(t => t.station.startsWith("Blue")).map(t => t.teamNumber);
            const rs = last.scoreRedFinal ?? 0, bs = last.scoreBlueFinal ?? 0;
            const onRed = red.includes(n);
            card.lastMatch = { description: shortMatchLabel(last.description, last.tournamentLevel, last.matchNumber, last.series), red, blue, redScore: rs, blueScore: bs, won: rs === bs ? null : onRed ? rs > bs : bs > rs };
        }
        const r = d.rankings.find(x => x.teamNumber === n);
        if (r) card.rank = { rank: r.rank, of: d.rankings.length, wins: r.wins ?? 0, losses: r.losses ?? 0, ties: r.ties ?? 0 };
        return card;
    }));

    return { at: now, events, teams };
}
