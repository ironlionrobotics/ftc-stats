/**
 * Per-season competition rules that are NOT scouting-form concerns: foul
 * values, Ranking Point definitions and ranking tiebreakers. Lives next to
 * the game definitions so a new season is registered in one folder.
 *
 * BIOBUZZ values: Competition Manual TU09 (Tables 10-2, 10-3, 10-4, 13-1).
 * See docs/research/2026-11-13-biobuzz.md.
 */

export interface FoulValues {
    /** Points credited to the OPPONENT per minor foul. */
    minor: number;
    /** Points credited to the OPPONENT per major foul. */
    major: number;
}

/**
 * How an RP's probability is modeled:
 *  - "leave-park-sum": alliance LEAVE + PARK points >= threshold (BIOBUZZ
 *    SWARM). Modeled per robot (lib/rp-counts.ts pSwarm).
 *  - "tip-count": alliance HIVE TIPS >= threshold (BIOBUZZ POLLINATOR).
 *    Modeled as a Negative Binomial count (lib/rp-counts.ts pTipsAtLeast).
 *  - "logistic": legacy logistic regression on (auto, tele, end) averages.
 */
export type RpModelKind = "leave-park-sum" | "tip-count" | "logistic";

export interface RpTargetSpec {
    /** Stable id used as model/cache key and in team RP maps. */
    id: string;
    /** i18n key under the `Games` namespace. */
    labelKey: string;
    /** Boolean field on the official /scores alliance breakdown. */
    breakdownKey: string;
    kind: RpModelKind;
    /** Default threshold for normal events. Premier / Regional / CMP events
     *  may override it (see rpThresholdsFor). */
    defaultThreshold?: number;
}

export type Tiebreaker = "rs" | "npAvg" | "tipsAvg" | "autoAvg" | "random";

export interface SeasonRules {
    season: number;
    gameName: string;
    fouls: FoulValues;
    rpTargets: RpTargetSpec[];
    /** RP for a win / tie. */
    winRp: number;
    tieRp: number;
    /** Ranking sort order after RS, most significant first (P1 consumer). */
    tiebreakers: Tiebreaker[];
}

const DECODE_2025: SeasonRules = {
    season: 2025,
    gameName: "DECODE",
    fouls: { minor: 5, major: 15 },
    rpTargets: [
        { id: "movement", labelKey: "rp.movement", breakdownKey: "movementRP", kind: "logistic" },
        { id: "goal", labelKey: "rp.goal", breakdownKey: "goalRP", kind: "logistic" },
        { id: "pattern", labelKey: "rp.pattern", breakdownKey: "patternRP", kind: "logistic" },
    ],
    winRp: 3,
    tieRp: 1,
    tiebreakers: ["rs", "npAvg", "autoAvg", "random"],
};

const BIOBUZZ_2026: SeasonRules = {
    season: 2026,
    gameName: "BIOBUZZ",
    fouls: { minor: 5, major: 20 },
    rpTargets: [
        { id: "swarm", labelKey: "rp.swarm", breakdownKey: "swarmRP", kind: "leave-park-sum", defaultThreshold: 16 },
        { id: "pollinator1", labelKey: "rp.pollinator1", breakdownKey: "pollinator1RP", kind: "tip-count", defaultThreshold: 4 },
        { id: "pollinator2", labelKey: "rp.pollinator2", breakdownKey: "pollinator2RP", kind: "tip-count", defaultThreshold: 7 },
    ],
    winRp: 3,
    tieRp: 1,
    tiebreakers: ["rs", "npAvg", "tipsAvg", "autoAvg", "random"],
};

const RULES_BY_SEASON: SeasonRules[] = [BIOBUZZ_2026, DECODE_2025];

/** Rules for `season`; seasons older than the oldest modeled fall back to it. */
export function seasonRulesFor(season: number): SeasonRules {
    return RULES_BY_SEASON.find(r => season >= r.season) ?? RULES_BY_SEASON[RULES_BY_SEASON.length - 1];
}

/**
 * Per-event RP threshold overrides. Premier Events may set their own
 * thresholds (Table 10-3 note); Regional Championship and FIRST
 * Championship thresholds are TBA in TU09. Add entries here as they're
 * published: `"2026:EVENTCODE": { swarm: 18, pollinator1: 5 }`.
 */
export const RP_THRESHOLD_OVERRIDES: Record<string, Record<string, number>> = {};

/** Effective thresholds (target id → threshold) for one event. */
export function rpThresholdsFor(season: number, eventCode?: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of seasonRulesFor(season).rpTargets) {
        if (t.defaultThreshold != null) out[t.id] = t.defaultThreshold;
    }
    const override = eventCode ? RP_THRESHOLD_OVERRIDES[`${season}:${eventCode.toUpperCase()}`] : undefined;
    return { ...out, ...(override ?? {}) };
}
