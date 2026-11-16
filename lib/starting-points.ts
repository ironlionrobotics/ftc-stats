/**
 * Per-robot starting points for the live strength model (decision #117).
 *
 * Problem: every event used to start from zero — before a robot's first
 * quals PRIDE knew nothing about it, so the first rounds were coin flips
 * (first third of quals: 48 % right in 2025, 43 % in 2026).
 *
 * Each robot now starts from what we already know, and the event's own
 * quals take over as they're played (ridge shrink toward the prior,
 * weight STARTING_LAMBDA matches):
 *  1. In-season (#114): its non-penalty ridge OPR at this season's earlier
 *     events (official FIRST data, lib/starting-points-server.ts), relative
 *     to the other robots here that have one, in points.
 *  2. Otherwise its history (cross-season): a regression on the last three
 *     seasons — level (within-event OPR z), achievements (Worlds, state
 *     championship, Premier, Inspire, event wins), rookie / returning after a
 *     gap — predicting its z at its first event. Relative to the robots here,
 *     scaled to points with the typical spread of robot strength in an event.
 *
 * Backtest (held-out events, scripts/starting-points-backtest.ts on the
 * official FIRST archive): log loss 2025 0.564 → 0.519 (history only 0.543),
 * 2024 → 0.494, 2026 → 0.514.
 *
 * Pure (no I/O, client-safe): the server (lib/starting-points-server.ts)
 * builds a StartingPoints per event and passes it, serialized, to every
 * screen that forecasts.
 */

/** Serializable per-event starting points. Keys are team numbers. */
export interface StartingPoints {
    v: 1;
    /** Earlier-this-season OPR − mean of the robots here that have one (points). */
    inSeason: Record<number, number>;
    /** History ẑ − mean ẑ of the robots here (event standard deviations). */
    history: Record<number, number>;
    /** Expected average robot (points) before the first qual is played. */
    mu0Hint: number;
}

/** Prior weight, in matches (fitted 2025: λ = 2). */
export const STARTING_LAMBDA = 2;
/** Scale of the history prior (fitted 2025: ρ = 1). */
export const HISTORY_RHO = 1;
/** Typical SD / mean of robot strength within an event (median, 2026 events). */
export const STRENGTH_CV = 0.48;

export const hasStartingPoints = (s?: StartingPoints | null): s is StartingPoints =>
    !!s && s.mu0Hint > 0 && (Object.keys(s.inSeason).length > 0 || Object.keys(s.history).length > 0);

/** Prior strength of a robot given the current average robot μ0. */
export function priorOf(s: StartingPoints, mu0: number): (team: number) => number {
    return team => {
        const inS = s.inSeason[team];
        if (inS !== undefined) return mu0 + inS;
        const h = s.history[team];
        if (h !== undefined) return mu0 + HISTORY_RHO * STRENGTH_CV * mu0 * h;
        return mu0;
    };
}

// ---------------------------------------------------------------------------
// History: team-season profiles from FTCScout's eventsSearch shape.

/** Event types that count (scrimmages, off-season and kickoffs don't). */
const OFFICIAL = new Set(["Qualifier", "LeagueMeet", "LeagueTournament", "Championship", "SuperQualifier", "Premier", "FIRSTChampionship", "Regional"]);
const BIG = new Set(["Championship", "SuperQualifier", "Premier", "FIRSTChampionship", "Regional"]);

export interface ScoutEvent {
    code: string;
    type: string;
    start: string;
    awards?: { type: string; placement?: number; teamNumber: number }[] | null;
    teams: { teamNumber: number; stats: { rank?: number; qualMatchesPlayed?: number; opr?: { totalPointsNp?: number } | null } | null }[];
}

export interface TeamSeason {
    /** Matches-weighted mean of within-event OPR z (null: no official event with stats). */
    zMean: number | null;
    won: boolean;
    wonBig: boolean;
    worlds: boolean;
    premier: boolean;
    champ: boolean;
    inspire: boolean;
    finalist: boolean;
    top4: boolean;
}

/** Within-event z of non-penalty OPR (≥ 6 robots with ≥ 3 quals), plus achievements. */
export function teamSeasonProfiles(events: ScoutEvent[]): Map<number, TeamSeason> {
    const out = new Map<number, TeamSeason & { zSum: number; n: number }>();
    const get = (t: number) => {
        let p = out.get(t);
        if (!p) {
            p = { zMean: null, won: false, wonBig: false, worlds: false, premier: false, champ: false, inspire: false, finalist: false, top4: false, zSum: 0, n: 0 };
            out.set(t, p);
        }
        return p;
    };
    for (const e of events) {
        if (!OFFICIAL.has(e.type)) continue;
        const rows = e.teams.filter(t => (t.stats?.qualMatchesPlayed ?? 0) >= 3 && Number.isFinite(t.stats?.opr?.totalPointsNp));
        if (rows.length >= 6) {
            const xs = rows.map(r => r.stats!.opr!.totalPointsNp!);
            const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
            const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) || 1;
            for (const r of rows) {
                const p = get(r.teamNumber), n = r.stats!.qualMatchesPlayed!;
                p.zSum += ((r.stats!.opr!.totalPointsNp! - mean) / sd) * n;
                p.n += n;
                if ((r.stats!.rank ?? 99) <= 4) p.top4 = true;
            }
        }
        for (const t of e.teams) {
            const p = get(t.teamNumber);
            if (e.type === "Championship") p.champ = true;
            if (e.type === "Premier" || e.type === "SuperQualifier") p.premier = true;
            if (e.type === "FIRSTChampionship") p.worlds = true;
        }
        for (const a of e.awards ?? []) {
            const p = get(a.teamNumber);
            if (a.type === "Winner") { p.won = true; if (BIG.has(e.type)) p.wonBig = true; }
            if (a.type === "Finalist") p.finalist = true;
            if (a.type === "Inspire" && (a.placement ?? 1) === 1) p.inspire = true;
        }
    }
    const res = new Map<number, TeamSeason>();
    for (const [t, p] of out) {
        const { zSum, n, ...rest } = p;
        res.set(t, { ...rest, zMean: n > 0 ? zSum / n : null });
    }
    return res;
}

/** Highest real team number with an official event (placeholder numbers ≥ 90000 ignored). */
export function maxTeamWithEvents(...seasons: Map<number, TeamSeason>[]): number {
    let m = 0;
    for (const s of seasons) for (const [t, p] of s) if (p.zMean !== null && t < 90000) m = Math.max(m, t);
    return m;
}

/**
 * Regression of first-event z on history (OLS, trained on 2024 + 2025 first
 * events, 15,558 team-seasons; held-out R² 0.20–0.24). Order matches
 * historyFeatures(). Notable: two seasons ago still carries 0.16 next to last
 * season's 0.37 — a strong team's bad year is mostly a dip (they bounce back
 * +0.30 SD vs last year alone), and a weak team's breakout partly luck.
 */
export const HISTORY_COEFS = [
    -0.137, // intercept
    -0.149, // rookie
    -0.098, // returning after a season without official events
    0.371, // z, last season
    0.006, // has two seasons ago
    0.164, // z, two seasons ago
    -0.039, // has three seasons ago
    0.040, // z, three seasons ago
    0.050, // won an event last season
    0.100, // won a championship-level event
    0.383, // went to Worlds
    0.134, // played a Premier / Super Qualifier
    0.152, // played a (state/regional) championship
    0.095, // Inspire
    0.057, // finalist
    0.056, // top 4 seed somewhere
] as const;

export function historyFeatures(t: number, s1?: TeamSeason, s2?: TeamSeason, s3?: TeamSeason, rookieAbove = Infinity): number[] {
    const e1 = s1?.zMean != null, e2 = s2?.zMean != null, e3 = s3?.zMean != null;
    const rookie = !e1 && !e2 && !e3 && t > rookieAbove;
    const b = (x?: boolean) => (x ? 1 : 0);
    return [1, b(rookie), b(!rookie && !e1),
        e1 ? s1!.zMean! : 0, b(e2), e2 ? s2!.zMean! : 0, b(e3), e3 ? s3!.zMean! : 0,
        b(s1?.won), b(s1?.wonBig), b(s1?.worlds), b(s1?.premier), b(s1?.champ), b(s1?.inspire), b(s1?.finalist), b(s1?.top4)];
}

/** Predicted first-event z of a team from the three previous seasons. */
export function historyZ(team: number, s1?: TeamSeason, s2?: TeamSeason, s3?: TeamSeason, rookieAbove = Infinity): number {
    return historyFeatures(team, s1, s2, s3, rookieAbove).reduce((s, x, i) => s + x * HISTORY_COEFS[i], 0);
}

// ---------------------------------------------------------------------------
// In-season: earlier events of this season.

export interface SeasonEventOpr { start: string; opr: number; n: number }

/** Matches-weighted mean OPR of a team's events that STARTED before `before` (ISO date). */
export function inSeasonOpr(events: SeasonEventOpr[] | undefined, before: string): number | null {
    const prev = (events ?? []).filter(e => e.start.slice(0, 10) < before.slice(0, 10) && e.n > 0);
    const n = prev.reduce((s, e) => s + e.n, 0);
    return n > 0 ? prev.reduce((s, e) => s + e.opr * e.n, 0) / n : null;
}

/** Centers both kinds of prior on the robots of THIS event. */
export function buildStartingPoints(args: {
    teams: number[];
    inSeason: (t: number) => number | null;
    history: (t: number) => number | null;
    /** Average robot of the season so far, used when no robot here has played this season. */
    seasonMeanRobot: number;
}): StartingPoints | null {
    const teams = [...new Set(args.teams)];
    const inS = new Map<number, number>(), hist = new Map<number, number>();
    for (const t of teams) {
        const a = args.inSeason(t);
        if (a !== null && Number.isFinite(a)) inS.set(t, a);
        const h = args.history(t);
        if (h !== null && Number.isFinite(h)) hist.set(t, h);
    }
    const mean = (m: Map<number, number>) => (m.size ? [...m.values()].reduce((a, b) => a + b, 0) / m.size : 0);
    const inMean = mean(inS), hMean = mean(hist);
    const mu0Hint = inS.size ? inMean : args.seasonMeanRobot;
    const out: StartingPoints = { v: 1, inSeason: {}, history: {}, mu0Hint: Number.isFinite(mu0Hint) ? mu0Hint : 0 };
    for (const [t, x] of inS) out.inSeason[t] = round(x - inMean);
    for (const [t, z] of hist) out.history[t] = round(z - hMean);
    return hasStartingPoints(out) ? out : null;
}

/** Every robot an event's data mentions (matches, schedule, rankings). */
export function eventTeamNumbers(...lists: ({ teams?: { teamNumber: number }[] }[] | { teamNumber: number }[] | null | undefined)[]): number[] {
    const out = new Set<number>();
    for (const list of lists) for (const x of list ?? []) {
        if ("teams" in x && Array.isArray(x.teams)) for (const t of x.teams) out.add(t.teamNumber);
        else if ("teamNumber" in x && typeof x.teamNumber === "number") out.add(x.teamNumber);
    }
    out.delete(0);
    return [...out];
}

const round = (x: number) => Math.round(x * 1000) / 1000;
