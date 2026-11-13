/**
 * Scout assignment board (decision #103). Teams at an event split the robots
 * of each match: a scout claims "I'm watching robot X in match N". Claims are
 * pseudonymous like the pool (team alias letter + a scout hash, never names
 * or uids) and written only by the server.
 *
 * Document scout_claims/{season}_{event}_{level}_{match}:
 *   { season, eventCode, level, matchNumber, claims: { [team]: Claim[] } }
 * Two scouts on the same robot is allowed (it is what measures reliability),
 * but a scout holds at most one robot per match.
 */

export type ClaimLevel = "QUALIFICATION" | "PLAYOFF" | "PRACTICE";

export interface Claim {
    /** Team pseudonym at this event ("A", "B"…). */
    alias: string;
    /** Opaque per-event scout id (hash of uid + event), so a scout recognizes its own claims. */
    scout: string;
    /** Epoch ms. */
    at: number;
}

export interface ClaimDoc {
    season: number;
    eventCode: string;
    level: ClaimLevel;
    matchNumber: number;
    claims: Record<string, Claim[]>;
}

export function claimDocId(season: number, eventCode: string, level: ClaimLevel, matchNumber: number): string {
    return `${season}_${eventCode}_${level}_${matchNumber}`;
}

/** Claims after `scout` takes `team`: its previous robot in the match is released. */
export function applyClaim(claims: Record<string, Claim[]>, team: number, claim: Claim): Record<string, Claim[]> {
    const out = releaseScout(claims, claim.scout);
    const key = String(team);
    out[key] = [...(out[key] ?? []), claim];
    return out;
}

/** Claims after `scout` lets go of whatever it held in the match. */
export function releaseScout(claims: Record<string, Claim[]>, scout: string): Record<string, Claim[]> {
    const out: Record<string, Claim[]> = {};
    for (const [team, list] of Object.entries(claims)) {
        const kept = list.filter(c => c.scout !== scout);
        if (kept.length > 0) out[team] = kept;
    }
    return out;
}

export interface ScheduledMatch {
    level: ClaimLevel;
    matchNumber: number;
    description: string;
    startTime?: string;
    red: number[];
    blue: number[];
}

/** Robots of a match with at least one claim, out of those on the field. */
export function matchCoverage(match: ScheduledMatch, claims: Record<string, Claim[]> | undefined): { covered: number; total: number } {
    const robots = [...match.red, ...match.blue];
    const covered = robots.filter(t => (claims?.[String(t)]?.length ?? 0) > 0).length;
    return { covered, total: robots.length };
}

/**
 * Next uncovered robots for a scout: upcoming matches in order, skipping
 * matches where the scout already holds a robot, first robot without claims.
 */
export function suggestions(
    matches: ScheduledMatch[],
    docs: Record<string, ClaimDoc>,
    season: number,
    eventCode: string,
    scout: string,
    limit = 3,
): Array<{ match: ScheduledMatch; team: number }> {
    const out: Array<{ match: ScheduledMatch; team: number }> = [];
    for (const m of matches) {
        if (out.length >= limit) break;
        const claims = docs[claimDocId(season, eventCode, m.level, m.matchNumber)]?.claims ?? {};
        const mine = Object.values(claims).some(list => list.some(c => c.scout === scout));
        if (mine) continue;
        const free = [...m.red, ...m.blue].find(t => (claims[String(t)]?.length ?? 0) === 0);
        if (free !== undefined) out.push({ match: m, team: free });
    }
    return out;
}

/** Qualification matches of the FIRST hybrid schedule as board rows (unplayed first by number). */
export function scheduledQuals(
    schedule: Array<{ description: string; matchNumber: number; tournamentLevel: string; startTime?: string | null; scoreRedFinal: number | null; teams: { teamNumber: number; station: string }[] }>,
    includePlayed = false,
): ScheduledMatch[] {
    return schedule
        .filter(m => m.tournamentLevel.toUpperCase().startsWith("QUAL"))
        .filter(m => includePlayed || m.scoreRedFinal == null)
        .sort((a, b) => a.matchNumber - b.matchNumber)
        .map(m => ({
            level: "QUALIFICATION" as const,
            matchNumber: m.matchNumber,
            description: m.description,
            startTime: m.startTime ?? undefined,
            red: m.teams.filter(t => t.station.startsWith("Red")).map(t => t.teamNumber),
            blue: m.teams.filter(t => t.station.startsWith("Blue")).map(t => t.teamNumber),
        }));
}
