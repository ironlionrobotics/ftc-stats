import "server-only";
import history2026 from "@/lib/data/starting-history-2026.json";
import { buildStartingPoints, historyZ, type StartingPoints } from "@/lib/starting-points";

/**
 * Server side of the starting points (decision #117).
 *
 * History (cross-season) comes from a table built OFFLINE from FTCScout by
 * scripts/build-history-table.ts and shipped with the server code: FTCScout's
 * bulk query takes 12–70 s (measured 15-nov-2026) and per-team queries got
 * rate-limited, so querying it per request would never fit a page budget.
 * No network here: it can't fail or slow a page.
 *
 * In-season (earlier events of this season, #114) is NOT wired yet: the
 * planned FTCScout source is too slow at request time, and the alternative
 * (own ridge OPR from FIRST /matches of each robot's earlier events) needs
 * Héctor's OK. Until then only the history prior is used.
 *
 * Kill switch: STARTING_POINTS=off.
 */

interface HistoryTable { season: number; rookieAbove: number; seasonMeanRobot: number; z: Record<string, number> }

const TABLES: Record<number, HistoryTable> = { 2026: history2026 as HistoryTable };

/**
 * Starting points for the robots of one event, or null (forecast as before).
 * Uses only previous seasons, so replays of past forecasts stay honest.
 * `eventStart` is kept for the in-season prior (needs data before the event).
 */
export async function getStartingPoints(season: number, eventStart: string | null | undefined, teams: number[]): Promise<StartingPoints | null> {
    if (process.env.STARTING_POINTS === "off" || teams.length === 0) return null;
    void eventStart; // reserved for the in-season prior (data before the event)
    const table = TABLES[season];
    if (!table) return null;
    return buildStartingPoints({
        teams,
        inSeason: () => null,
        history: t => table.z[t] ?? historyZ(t, undefined, undefined, undefined, table.rookieAbove),
        seasonMeanRobot: table.seasonMeanRobot,
    });
}
