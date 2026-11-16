/**
 * FRC bonus ranking points per qualification alliance, from the official
 * `/scores` breakdowns (decision #118). Feeds `matchBonusRp` of the event view,
 * so rebuilding past rankings (round slider) uses the real Ranking Score.
 *
 * Two readings, in order:
 *  1. the alliance's total `rp` minus the result RP (win 3, tie 1) when the
 *     breakdown carries `rp` — the official total, robust to a renamed key;
 *  2. otherwise the bonus booleans of the season's rpTargets (REBUILT:
 *     energized, supercharged, traversal).
 * An alliance with neither is left out (unknown ≠ zero bonus).
 */
import { allianceRpObs } from "@/lib/rp-inference";
import { seasonRulesFor } from "@/lib/games/season-rules";
import type { AllianceScoreBreakdown } from "@/lib/score-breakdown";
import type { FTCMatch } from "@/types/scouting";

export interface FrcScoreLike { matchLevel: string; matchNumber: number; alliances?: ({ alliance: string } & Record<string, unknown>)[] }

export function frcMatchBonusRp(season: number, matches: FTCMatch[], scores: FrcScoreLike[]): Record<string, number> {
    const rules = seasonRulesFor(season, "FRC");
    const quals = new Map(matches.filter(m => m.tournamentLevel === "QUALIFICATION").map(m => [m.matchNumber, m]));
    const out: Record<string, number> = {};
    for (const s of scores) {
        if (!/qual/i.test(s.matchLevel)) continue;
        const m = quals.get(s.matchNumber);
        if (!m) continue;
        for (const a of s.alliances ?? []) {
            const side = /^red/i.test(a.alliance) ? "Red" : /^blue/i.test(a.alliance) ? "Blue" : null;
            if (!side) continue;
            let bonus: number | null = null;
            if (typeof a.rp === "number") {
                const mine = side === "Red" ? m.scoreRedFinal : m.scoreBlueFinal;
                const theirs = side === "Red" ? m.scoreBlueFinal : m.scoreRedFinal;
                const result = mine > theirs ? rules.winRp : mine === theirs ? rules.tieRp : 0;
                bonus = Math.max(0, a.rp - result);
            } else {
                const obs = allianceRpObs(season, a as unknown as AllianceScoreBreakdown, m, side, "FRC");
                if (obs) bonus = Object.values(obs.rp).filter(Boolean).length;
            }
            if (bonus !== null) out[`${s.matchNumber}-${side}`] = bonus;
        }
    }
    return out;
}
