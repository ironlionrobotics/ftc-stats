/**
 * Reader for the FIRST season archive (scripts/first-archive-pull.ts):
 * data/first-archive/ftc/<season>/<event>.json.gz. Turns each archived event
 * into the shapes the analysis code uses, with OPR computed in-house (ridge
 * λ = 1 on non-penalty score — FIRST publishes no OPR).
 *
 * Award ids (FIRST, stable across seasons; placement = series):
 *   13 Winning Alliance, 12 Finalist Alliance, 11 Inspire, 9 Think, 6 Design,
 *   7 Innovate, 4 Control, 8 Connect, 25 Reach, 26 Sustain, 5 Motivate,
 *   3 Promote, 2 Compass, 1 Judges.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { componentOpr } from "@/lib/component-opr";
import type { ScoutEvent } from "@/lib/starting-points";

export const ARCHIVE = join(process.cwd(), "data", "first-archive", "ftc");

/** FIRST event type code → the type names the analysis code uses. */
export const EVENT_TYPE: Record<string, string> = {
    "0": "NonAdvancement", "1": "LeagueMeet", "2": "Qualifier", "3": "LeagueTournament", "4": "Championship",
    "5": "Other", "6": "FIRSTChampionship", "7": "SuperQualifier", "10": "OffSeason", "12": "Kickoff", "13": "Workshop",
    "14": "Demo", "15": "VolunteerSignup", "16": "PracticeDay", "17": "Premier",
};
const AWARD_TYPE: Record<number, string> = {
    13: "Winner", 12: "Finalist", 11: "Inspire", 9: "Think", 6: "Design", 7: "Innovate", 4: "Control",
    8: "Connect", 25: "Reach", 26: "Sustain", 5: "Motivate", 3: "Promote", 2: "Compass", 1: "JudgesChoice",
};

interface FTeam { teamNumber: number; station: string; dq?: boolean; onField?: boolean }
export interface FMatch {
    tournamentLevel: string; matchNumber: number; series?: number; actualStartTime?: string | null; postResultTime?: string | null;
    scoreRedFinal: number; scoreBlueFinal: number; scoreRedFoul: number; scoreBlueFoul: number; teams: FTeam[];
}
export interface ArchivedEvent {
    event: { code: string; type: string; dateStart: string; dateEnd: string; remote?: boolean; name?: string; regionCode?: string };
    matches: FMatch[]; scores?: unknown[]; rankings?: { teamNumber: number; rank: number; matchesPlayed?: number }[];
    alliances?: unknown[]; awards?: { awardId: number; series?: number; teamNumber: number | null }[];
}

/** Seasons not yet in the archive (2026) live as plain JSON in data/season-pull/<S>/ (same { event, matches, scores } layout). */
const SEASON_PULL = join(process.cwd(), "data", "season-pull");

export function archivedEvents(season: number): ArchivedEvent[] {
    const dir = join(ARCHIVE, String(season));
    if (existsSync(dir)) {
        return readdirSync(dir).filter(f => f.endsWith(".json.gz") && !f.startsWith("_"))
            .map(f => JSON.parse(gunzipSync(readFileSync(join(dir, f))).toString("utf8")) as ArchivedEvent);
    }
    const pull = join(SEASON_PULL, String(season));
    if (!existsSync(pull)) return [];
    return readdirSync(pull).filter(f => f.endsWith(".json") && !f.startsWith("_"))
        .map(f => JSON.parse(readFileSync(join(pull, f), "utf8")) as ArchivedEvent);
}

/** Official team directory (code → rookieYear, homeRegion), merged over the archived seasons (later seasons win). */
export function archivedTeams(seasons: number[]): Map<number, { rookieYear: number | null; region: string | null }> {
    const out = new Map<number, { rookieYear: number | null; region: string | null }>();
    for (const s of [...seasons].sort((a, b) => a - b)) {
        const f = join(ARCHIVE, String(s), "_teams.json.gz");
        if (!existsSync(f)) continue;
        for (const t of JSON.parse(gunzipSync(readFileSync(f)).toString("utf8")) as { teamNumber: number; rookieYear?: number | null; homeRegion?: string | null }[]) {
            out.set(t.teamNumber, { rookieYear: t.rookieYear ?? null, region: t.homeRegion ?? null });
        }
    }
    return out;
}

/**
 * Robots that played for one side. FIRST did not record `onField` in 2019
 * (every team comes back `false`, and only the fielded robots are listed), so a
 * match where nobody is marked on the field counts every listed team.
 */
export const side = (m: FMatch, c: "Red" | "Blue") => {
    const anyOn = m.teams.some(t => t.onField !== false);
    return m.teams.filter(t => t.station.startsWith(c) && (!anyOn || t.onField !== false)).map(t => t.teamNumber);
};
/** Playoff levels: PLAYOFF (2022+ double elimination) or SEMIFINAL/FINAL (the 2019–2021 bracket). */
export const isPlayoffLevel = (level: string) => level === "PLAYOFF" || level === "SEMIFINAL" || level === "FINAL";
const LEVEL_ORDER: Record<string, number> = { PLAYOFF: 0, SEMIFINAL: 1, FINAL: 2 };
/** Remote events (2020/21): each "match" is one robot alone (station "1"), its score on the blue fields. */
const isSolo = (m: FMatch) => m.teams.length === 1 && !/^(Red|Blue)/.test(m.teams[0].station);
const dq = (m: FMatch, c: "Red" | "Blue") => m.teams.some(t => t.station.startsWith(c) && t.dq === true);
/** Final minus the foul points the alliance RECEIVED (reported on the opponent's field, decision #48). */
export const np = (m: FMatch, c: "Red" | "Blue") => (c === "Red" ? m.scoreRedFinal - m.scoreBlueFoul : m.scoreBlueFinal - m.scoreRedFoul);
export const isPlayed = (m: FMatch) => (m.postResultTime?.length ?? 0) > 0 || (m.scoreRedFinal ?? 0) + (m.scoreBlueFinal ?? 0) > 0;

/** One archived event in FTCScout's eventsSearch shape, OPR = our ridge (λ = 1, non-penalty). */
export function toScoutEvent(a: ArchivedEvent): ScoutEvent {
    const quals = a.matches.filter(m => m.tournamentLevel === "QUALIFICATION" && isPlayed(m));
    const rows = quals.filter(m => !isSolo(m)).flatMap(m => (["Red", "Blue"] as const).filter(c => !dq(m, c)).map(c => ({ teams: side(m, c), value: np(m, c) }))).filter(r => r.teams.length > 0);
    const opr = rows.length ? componentOpr(rows, { lambda: 1 }) : new Map<number, number>();
    const played = new Map<number, number>();
    for (const m of quals) for (const t of [...side(m, "Red"), ...side(m, "Blue")]) played.set(t, (played.get(t) ?? 0) + 1);
    // Remote (solo) runs: the robot's value is its mean score, as FTCScout reported for 2020/21.
    const solo = new Map<number, number[]>();
    for (const m of quals) if (isSolo(m)) solo.set(m.teams[0].teamNumber, [...(solo.get(m.teams[0].teamNumber) ?? []), m.scoreBlueFinal]);
    for (const [t, xs] of solo) if (!played.has(t)) { played.set(t, xs.length); opr.set(t, xs.reduce((x, y) => x + y, 0) / xs.length); }
    const rank = new Map((a.rankings ?? []).map(r => [r.teamNumber, r.rank]));
    const teams = new Set<number>([...played.keys(), ...rank.keys()]);
    return {
        code: a.event.code,
        type: EVENT_TYPE[String(a.event.type)] ?? `type${a.event.type}`,
        start: a.event.dateStart,
        awards: (a.awards ?? []).filter(x => x.teamNumber && AWARD_TYPE[x.awardId]).map(x => ({ type: AWARD_TYPE[x.awardId], placement: x.series ?? 1, teamNumber: x.teamNumber! })),
        teams: [...teams].map(t => ({
            teamNumber: t,
            stats: played.has(t) ? { rank: rank.get(t) ?? 99, qualMatchesPlayed: played.get(t)!, opr: { totalPointsNp: opr.get(t) ?? 0 } } : null,
        })),
    };
}

export const scoutSeasonFromArchive = (season: number): ScoutEvent[] => archivedEvents(season).map(toScoutEvent);

/** One match in the shape the backtests replay: t = start time (ms, 0 if unknown), s = in-level order key. */
export interface ArchM { t: number; s: number; red: number[]; blue: number[]; redNp: number; blueNp: number; redTot: number; blueTot: number }
export interface ArchEv { code: string; type: string; start: string; region: string; quals: ArchM[]; playoffs: ArchM[] }

const toM = (m: FMatch, playoff: boolean): ArchM => ({
    t: Date.parse(m.actualStartTime ?? "") || 0,
    s: playoff ? ((LEVEL_ORDER[m.tournamentLevel] ?? 0) * 100 + (m.series ?? 0)) * 1000 + m.matchNumber : m.matchNumber,
    red: side(m, "Red"), blue: side(m, "Blue"),
    redNp: np(m, "Red"), blueNp: np(m, "Blue"), redTot: m.scoreRedFinal, blueTot: m.scoreBlueFinal,
});

/** Every archived event of a season with its played quals (match-number order) and playoffs (time order). */
export function archiveMatchEvents(season: number): ArchEv[] {
    return archivedEvents(season).map(a => ({
        code: a.event.code,
        type: EVENT_TYPE[String(a.event.type)] ?? `type${a.event.type}`,
        start: a.event.dateStart,
        region: a.event.regionCode ?? "",
        quals: a.matches.filter(m => m.tournamentLevel === "QUALIFICATION" && isPlayed(m)).map(m => toM(m, false)).sort((x, y) => x.s - y.s),
        playoffs: a.matches.filter(m => isPlayoffLevel(m.tournamentLevel) && isPlayed(m)).map(m => toM(m, true)).sort((x, y) => (x.t - y.t) || (x.s - y.s)),
    }));
}
