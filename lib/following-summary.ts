import type { FTCHybridScheduleMatch, FTCMatch, TeamRanking } from "@/types/scouting";
import { eventStrengthModel } from "@/lib/live-projection";
import { playoffWinProbability } from "@/lib/win-probability";

/**
 * Live state of a FOLLOWED event for "Hoy" (decision #110). Pure: the server
 * action fetches rankings/matches/schedule (60 s cache while live), this
 * reduces them to the few numbers a card shows — progress, the next matches
 * with win odds (calibrated live model #109; playoff σ inflation #59), the
 * last result and the top of the ranking.
 */

export interface MatchLine {
    description: string;
    level: "QUALIFICATION" | "PLAYOFF" | string;
    matchNumber: number;
    startTime: string | null;
    red: number[];
    blue: number[];
    /** P(red wins); null with < 2 played quals. */
    pRed: number | null;
}

export interface PlayedLine {
    description: string;
    red: number[];
    blue: number[];
    redScore: number;
    blueScore: number;
}

export interface EventLive {
    qualsPlayed: number;
    qualsTotal: number;
    playoffsPlayed: number;
    playoffsTotal: number;
    nextMatches: MatchLine[];
    lastMatch: PlayedLine | null;
    top: Array<{ rank: number; teamNumber: number; teamName: string; rs: number; wins: number; losses: number; ties: number }>;
}

/** Compact match label for cards: "Qualification 35" → "Q35", "Semifinal 2" → "SF2", "Final 1" → "F1". */
export function shortMatchLabel(description: string, level: string, matchNumber: number): string {
    if (level === "QUALIFICATION") return `Q${matchNumber}`;
    const d = description.trim();
    const rules: Array<[RegExp, string]> = [[/^semi-?finals?\s*/i, "SF"], [/^finals?\s*/i, "F"], [/^playoffs?\s*/i, "P"], [/^match\s*/i, "M"], [/^qualification\s*/i, "Q"]];
    for (const [re, abbr] of rules) if (re.test(d)) return abbr + d.replace(re, "").replace(/\s+/g, "");
    return d.length > 8 ? `P${matchNumber}` : d;
}

const played = (m: FTCHybridScheduleMatch) => m.scoreRedFinal != null || m.scoreBlueFinal != null;
const side = (m: FTCHybridScheduleMatch, c: "Red" | "Blue") =>
    m.teams.filter(t => t.station.startsWith(c) && t.surrogate !== true).map(t => t.teamNumber);
const timeOf = (m: FTCHybridScheduleMatch, fallback: number) => {
    const t = Date.parse(m.actualStartTime ?? m.startTime ?? "");
    return Number.isFinite(t) ? t : fallback;
};

/** Schedule in play order: quals before playoffs, then by time, then by number. */
function ordered(schedule: FTCHybridScheduleMatch[]): FTCHybridScheduleMatch[] {
    const lvl = (m: FTCHybridScheduleMatch) => (m.tournamentLevel === "QUALIFICATION" ? 0 : 1);
    return schedule
        .map((m, i) => ({ m, i }))
        .sort((a, b) => lvl(a.m) - lvl(b.m) || timeOf(a.m, a.i) - timeOf(b.m, b.i) || a.m.matchNumber - b.m.matchNumber)
        .map(x => x.m);
}

export function summarizeEvent(
    rankings: TeamRanking[],
    matches: FTCMatch[],
    schedule: FTCHybridScheduleMatch[],
    nextCount = 3,
): EventLive {
    const quals = schedule.filter(m => m.tournamentLevel === "QUALIFICATION");
    const playoffs = schedule.filter(m => m.tournamentLevel !== "QUALIFICATION");
    const playedQuals = matches.filter(m => m.tournamentLevel === "QUALIFICATION"
        && ((m.postResultTime?.length ?? 0) > 0 || (m.scoreRedFinal ?? 0) + (m.scoreBlueFinal ?? 0) > 0));
    const model = playedQuals.length >= 2 ? eventStrengthModel(playedQuals) : null;

    const seq = ordered(schedule);
    const next = seq.filter(m => !played(m)).slice(0, nextCount).map<MatchLine>(m => {
        const red = side(m, "Red"), blue = side(m, "Blue");
        let pRed: number | null = null;
        if (model && red.length && blue.length) {
            const mu = (a: number[]) => a.reduce((s, t) => s + model.strength(t), 0);
            pRed = m.tournamentLevel === "QUALIFICATION"
                ? model.pRed(red, blue)
                : playoffWinProbability(mu(red), mu(blue), model.sigmaDiff);
        }
        return { description: shortMatchLabel(m.description, m.tournamentLevel, m.matchNumber), level: m.tournamentLevel, matchNumber: m.matchNumber, startTime: m.startTime ?? null, red, blue, pRed };
    });

    const last = [...seq].reverse().find(played) ?? null;
    return {
        qualsPlayed: quals.filter(played).length,
        qualsTotal: quals.length,
        playoffsPlayed: playoffs.filter(played).length,
        playoffsTotal: playoffs.length,
        nextMatches: next,
        lastMatch: last ? { description: shortMatchLabel(last.description, last.tournamentLevel, last.matchNumber), red: side(last, "Red"), blue: side(last, "Blue"), redScore: last.scoreRedFinal ?? 0, blueScore: last.scoreBlueFinal ?? 0 } : null,
        top: [...rankings].sort((a, b) => a.rank - b.rank).slice(0, 4).map(r => ({
            rank: r.rank, teamNumber: r.teamNumber, teamName: r.teamName, rs: r.sortOrder1 ?? 0, wins: r.wins ?? 0, losses: r.losses ?? 0, ties: r.ties ?? 0,
        })),
    };
}
