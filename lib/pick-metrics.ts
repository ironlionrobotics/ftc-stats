import type { FTCMatch } from "@/types/scouting";
import { hasStartingPoints, type StartingPoints } from "@/lib/starting-points";
import { eventStrengthModel } from "@/lib/live-projection";
import { componentOpr } from "@/lib/component-opr";
import { biobuzzRobotOutcomes, biobuzzTips, robotSlotsFor, type MatchScoreEntry } from "@/lib/score-breakdown";

/**
 * Per-team metrics for choosing a partner at ONE event (decision #115),
 * from that event's played quals.
 *
 * Backtest (scripts/tips-model-backtest.ts + pick-metric check, playoffs
 * predicted from all quals): the sum of the two picks' metric picks the
 * playoff winner —
 *   model OPR 77.3 % (2026) / 75.7 % (2025) / 76.2 % (2024)
 *   average points of its alliances 72.0 / 74.3 / 73.8 %
 *   Ranking Score 69.3 % (2026) · win rate 65.7 / 65.1 / 65.9 %
 * RS and win rate depend on who a team was paired with; OPR separates it.
 * In playoffs RPs don't exist — only winning counts.
 *
 * BIOBUZZ extras (season ≥ 2026): TIPS OPR (≈ the same predictive power as
 * points OPR, shown because TIPS decide matches) and LEAVE/PARK reliability,
 * EXACT per robot from the official breakdown (no estimation). Reliability
 * breaks ties between similar OPRs: when TIPS tie (31 % of quals),
 * LEAVE + PARK decides 72 % of them.
 */
export interface PickMetrics {
    /** Non-penalty strength of the live model (same as ledger/Oracle). */
    opr: number;
    /** BIOBUZZ: TIPS contributed per match (ridge OPR). */
    tipsOpr?: number;
    /** BIOBUZZ: share of LEAVE + final PARK achieved by this robot (0–1). */
    leavePark?: number;
    /** Quals played at this event. */
    matches: number;
}

const played = (m: FTCMatch) => (m.postResultTime?.length ?? 0) > 0 || (m.scoreRedFinal ?? 0) + (m.scoreBlueFinal ?? 0) > 0;

export function eventPickMetrics(season: number, matches: FTCMatch[], scores: MatchScoreEntry[], start?: StartingPoints | null): Record<number, PickMetrics> {
    const quals = matches.filter(m => m.tournamentLevel === "QUALIFICATION" && played(m));
    // Per-robot starting points (#117) allow a model from the first qual.
    if (quals.length < 2 && !hasStartingPoints(start)) return {};
    const model = eventStrengthModel(quals, start);
    const count = new Map<number, number>();
    for (const m of quals) for (const t of m.teams) if (t.onField !== false) count.set(t.teamNumber, (count.get(t.teamNumber) ?? 0) + 1);

    const out: Record<number, PickMetrics> = {};
    for (const [t, n] of count) out[t] = { opr: model.strength(t), matches: n };
    if (season < 2026) return out;

    const breakdown = new Map(scores.filter(s => s.matchLevel === "QUALIFICATION").map(s => [`${s.matchNumber}:${s.alliance}`, s.scoreBreakdown]));
    const tipsRows: { teams: number[]; value: number }[] = [];
    const lp = new Map<number, { got: number; of: number }>();
    for (const m of quals) {
        for (const c of ["Red", "Blue"] as const) {
            const b = breakdown.get(`${m.matchNumber}:${c}`);
            if (!b) continue;
            const side = m.teams.filter(t => t.station.startsWith(c) && t.onField !== false && !t.dq).map(t => t.teamNumber);
            if (side.length) tipsRows.push({ teams: side, value: biobuzzTips(b) });
            const slots = robotSlotsFor(m.teams, c);
            slots.forEach((team, i) => {
                const entry = m.teams.find(t => t.teamNumber === team);
                if (!team || !entry || entry.onField === false) return;
                const o = biobuzzRobotOutcomes(b, (i + 1) as 1 | 2);
                const x = lp.get(team) ?? { got: 0, of: 0 };
                x.got += +o.leave + +o.teleopPark;
                x.of += 2;
                lp.set(team, x);
            });
        }
    }
    const tips = tipsRows.length ? componentOpr(tipsRows, { lambda: 1 }) : new Map<number, number>();
    for (const t of Object.keys(out).map(Number)) {
        if (tips.has(t)) out[t].tipsOpr = tips.get(t);
        const x = lp.get(t);
        if (x && x.of) out[t].leavePark = x.got / x.of;
    }
    return out;
}
