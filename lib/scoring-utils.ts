/**
 * Pure helpers shared by the score-aggregation server actions.
 *
 * These live here rather than in app/actions/* because a "use server" module
 * may only export async functions — Next.js treats every export as a callable
 * server action. Exporting a synchronous helper from one is a build error that
 * typecheck and unit tests do not catch, only `next build` does.
 */

/**
 * Whether an FTC API match-score entry belongs to a given match level.
 *
 * `FTCMatch.tournamentLevel` comes back all-caps ("QUALIFICATION", "PLAYOFF")
 * while `FTCMatchScoreEntry.matchLevel` uses different casing/wording from the
 * /scores endpoint, so a strict === never matches. Comparing a normalized
 * 4-character prefix is tolerant of both, and of plural variants like
 * "Qualifications", while still separating quals from playoffs.
 */
export function levelsMatch(tournamentLevel: string, matchLevel: string): boolean {
    return matchLevel.toUpperCase().startsWith(tournamentLevel.substring(0, 4).toUpperCase());
}

/**
 * Population standard deviation, guarding the empty case.
 *
 * Without the guard this divides by zero and yields NaN, which then gets
 * persisted into the stats cache for a team that has no processed
 * qualification matches yet (all events still upcoming, or a data gap).
 */
export function computeStdDev(scores: number[], mean: number): number {
    if (scores.length === 0) return 0;
    const variance = scores.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / scores.length;
    return Math.sqrt(variance);
}
