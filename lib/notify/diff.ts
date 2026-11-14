import type { FTCAllianceSelection, FTCHybridScheduleMatch, FTCMatch, TeamRanking } from "@/types/scouting";
import { eventStrengthModel } from "@/lib/live-projection";
import { playoffWinProbability } from "@/lib/win-probability";
import { matchKey, playOrder, shortMatchLabel } from "@/lib/following-summary";

/**
 * Notification engine (decision #110). Pure: given what the cron saw last
 * time (`prev`) and the event now (`snap`), returns what happened since and
 * the state to store. The FIRST API has no webhooks and no live queue, so
 * "your match is soon" is approximated as "≤ 2 matches after the last one
 * with a result".
 *
 * Guarantees (tested on a real event replay, FPEMX 2025):
 *  - every match result, "soon", alliance selection and champion is emitted
 *    exactly once, however often the same snapshot is seen;
 *  - the first time an event is seen nothing already played is announced
 *    (no burst of stale results when someone follows mid-event).
 * Who receives what is decided later by the recipient policy, from `teams`.
 */

export interface EventSnapshot {
    eventCode: string;
    schedule: FTCHybridScheduleMatch[];
    /** Qualification matches with scores (for the live strength model). */
    matches: FTCMatch[];
    rankings: TeamRanking[];
    alliances: FTCAllianceSelection[];
}

export interface EventNotifyState {
    v: 1;
    soon: string[];
    results: string[];
    alliances: boolean;
    champion: boolean;
}

interface Base {
    eventCode: string;
    /** Robots involved: a follower of any of them may be told. */
    teams: number[];
}

export type NotifyEvent =
    | (Base & { kind: "matchSoon"; key: string; label: string; level: string; red: number[]; blue: number[]; pRed: number | null; ahead: number })
    | (Base & { kind: "matchResult"; key: string; label: string; level: string; red: number[]; blue: number[]; redScore: number; blueScore: number; ranks: Record<number, number> })
    | (Base & { kind: "alliances"; alliances: Array<{ number: number; teams: number[] }> })
    | (Base & { kind: "champion"; alliance: number | null });

const SOON_AHEAD = 2;

const played = (m: FTCHybridScheduleMatch) => m.scoreRedFinal != null || m.scoreBlueFinal != null;
const side = (m: FTCHybridScheduleMatch, c: "Red" | "Blue") =>
    m.teams.filter(t => t.station.startsWith(c) && t.surrogate !== true).map(t => t.teamNumber);

function allianceTeams(a: FTCAllianceSelection): number[] {
    return [a.captain, a.round1, a.round2].filter((x): x is { teamNumber: number } => !!x?.teamNumber).map(x => x.teamNumber);
}

/** Winner of the event: the last Final, once every scheduled playoff match has a result. */
function champion(seq: FTCHybridScheduleMatch[], alliances: FTCAllianceSelection[]): { teams: number[]; alliance: number | null } | null {
    const playoffs = seq.filter(m => m.tournamentLevel !== "QUALIFICATION");
    if (playoffs.length === 0 || playoffs.some(m => !played(m))) return null;
    const finals = playoffs.filter(m => /^final/i.test(m.description.trim()));
    const last = finals.at(-1);
    if (!last || last.scoreRedFinal === last.scoreBlueFinal) return null;
    const teams = side(last, (last.scoreRedFinal ?? 0) > (last.scoreBlueFinal ?? 0) ? "Red" : "Blue");
    const alliance = alliances.find(a => allianceTeams(a).some(t => teams.includes(t)))?.number ?? null;
    return { teams, alliance };
}

export function emptyNotifyState(): EventNotifyState {
    return { v: 1, soon: [], results: [], alliances: false, champion: false };
}

export function diffEvent(prev: EventNotifyState | null, snap: EventSnapshot): { events: NotifyEvent[]; next: EventNotifyState } {
    const first = prev === null;
    const state: EventNotifyState = prev ? { ...prev, soon: [...prev.soon], results: [...prev.results] } : emptyNotifyState();
    const events: NotifyEvent[] = [];
    const seq = playOrder(snap.schedule);
    const code = snap.eventCode;
    const rank = new Map(snap.rankings.map(r => [r.teamNumber, r.rank]));

    // Results.
    for (const m of seq) {
        if (!played(m)) continue;
        const key = matchKey(m);
        if (state.results.includes(key)) continue;
        state.results.push(key);
        if (first) continue;
        const red = side(m, "Red"), blue = side(m, "Blue");
        const ranks: Record<number, number> = {};
        for (const t of [...red, ...blue]) { const r = rank.get(t); if (r) ranks[t] = r; }
        events.push({
            kind: "matchResult", eventCode: code, key, teams: [...red, ...blue],
            label: shortMatchLabel(m.description, m.tournamentLevel, m.matchNumber, m.series), level: m.tournamentLevel,
            red, blue, redScore: m.scoreRedFinal ?? 0, blueScore: m.scoreBlueFinal ?? 0, ranks,
        });
    }

    // "Soon": the next SOON_AHEAD unplayed matches after the last result (none before the first result).
    let lastPlayed = -1;
    seq.forEach((m, i) => { if (played(m)) lastPlayed = i; });
    if (lastPlayed >= 0) {
        const playedQuals = snap.matches.filter(m => m.tournamentLevel === "QUALIFICATION");
        const model = playedQuals.length >= 2 ? eventStrengthModel(playedQuals) : null;
        for (let i = lastPlayed + 1; i < seq.length && i <= lastPlayed + SOON_AHEAD; i++) {
            const m = seq[i];
            const red = side(m, "Red"), blue = side(m, "Blue");
            if (played(m) || red.length === 0 || blue.length === 0) continue;
            const key = matchKey(m);
            if (state.soon.includes(key)) continue;
            state.soon.push(key);
            let pRed: number | null = null;
            if (model) {
                const mu = (a: number[]) => a.reduce((s, t) => s + model.strength(t), 0);
                pRed = m.tournamentLevel === "QUALIFICATION" ? model.pRed(red, blue) : playoffWinProbability(mu(red), mu(blue), model.sigmaDiff);
            }
            events.push({
                kind: "matchSoon", eventCode: code, key, teams: [...red, ...blue],
                label: shortMatchLabel(m.description, m.tournamentLevel, m.matchNumber, m.series), level: m.tournamentLevel,
                red, blue, pRed, ahead: i - lastPlayed,
            });
        }
    }

    // Alliance selection.
    const selected = snap.alliances.filter(a => allianceTeams(a).length > 0);
    if (!state.alliances && selected.length > 0) {
        state.alliances = true;
        if (!first) {
            const list = selected.map(a => ({ number: a.number, teams: allianceTeams(a) })).sort((a, b) => a.number - b.number);
            events.push({ kind: "alliances", eventCode: code, teams: list.flatMap(a => a.teams), alliances: list });
        }
    }

    // Champion.
    if (!state.champion) {
        const c = champion(seq, snap.alliances);
        if (c) {
            state.champion = true;
            if (!first) events.push({ kind: "champion", eventCode: code, teams: c.teams, alliance: c.alliance });
        }
    }

    return { events, next: state };
}
