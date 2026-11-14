import "server-only";
import { serverCache } from "@/lib/server-cache";
import { fetchEvents, fetchMatches } from "@/lib/ftc-api";
import { eventWindow } from "@/lib/today-summary";
import { NON_COMPETITIVE } from "@/lib/event-windows";
import { predictionLedger, scorecard, type LedgerRow, type Scorecard } from "@/lib/prediction-ledger";

/**
 * Live accountability (decision #111): PRIDE's pre-match forecasts scored
 * against the results of every event happening today, across all regions.
 * Matches are new to the model (out of sample), so this is the honest check
 * of the calibration (#109) while competitions run. Cached 2 min in the
 * server cache — one FIRST fan-out serves every visitor.
 */

export interface LiveEventCard {
    code: string;
    name: string;
    place: string;
    played: number;
    card: Scorecard;
    /** Last 5 calls, newest first, for a glanceable ✓/✗ strip. */
    recent: Array<{ label: string; correct: boolean | null; p: number | null }>;
}

export interface LiveScoreboard {
    at: number;
    events: LiveEventCard[];
    overall: Scorecard;
    liveEvents: number;
}

const TTL_S = 120;
const MIN_QUALS = 3;
const CONCURRENCY = 8;

const label = (r: LedgerRow) => (r.level === "QUALIFICATION" ? `Q${r.matchNumber}` : `M${r.series || r.matchNumber}`);

export async function loadLiveScoreboard(season: number, now = Date.now()): Promise<LiveScoreboard> {
    const key = `live_scoreboard_v1_${season}`;
    const cached = await serverCache.get<LiveScoreboard>(key).catch(() => null);
    if (cached && now - cached.at < TTL_S * 1000) return cached;

    const events = (await fetchEvents(season)).filter(e => {
        const w = eventWindow(e);
        return now >= w.start && now <= w.end && !NON_COMPETITIVE.test(`${e.typeName ?? ""} ${e.name}`);
    });
    const cards: LiveEventCard[] = [];
    const all: LedgerRow[] = [];
    for (let i = 0; i < events.length; i += CONCURRENCY) {
        await Promise.all(events.slice(i, i + CONCURRENCY).map(async e => {
            const matches = await fetchMatches(season, e.code).catch(() => []);
            const rows = predictionLedger(matches);
            if (rows.filter(r => r.level === "QUALIFICATION").length < MIN_QUALS) return;
            all.push(...rows);
            cards.push({
                code: e.code,
                name: e.name,
                place: [e.city, e.country].filter(Boolean).join(", "),
                played: rows.length,
                card: scorecard(rows),
                recent: rows.filter(r => r.pRed !== null).slice(-5).reverse()
                    .map(r => ({ label: label(r), correct: r.correct, p: r.pRed === null ? null : Math.max(r.pRed, 1 - r.pRed) })),
            });
        }));
    }
    cards.sort((a, b) => b.card.n - a.card.n || a.code.localeCompare(b.code));
    const board: LiveScoreboard = { at: now, events: cards, overall: scorecard(all), liveEvents: events.length };
    await serverCache.set(key, board, TTL_S).catch(() => false);
    return board;
}
