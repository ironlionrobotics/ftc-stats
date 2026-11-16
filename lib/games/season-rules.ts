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
 *  - "count-threshold": an alliance total (FRC REBUILT: FUEL in an active HUB,
 *    TOWER points) >= threshold; `countKey` names the breakdown total.
 */
export type RpModelKind = "leave-park-sum" | "tip-count" | "logistic" | "count-threshold";

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
    /** "count-threshold": path of the alliance total in the /scores breakdown. */
    countKey?: string;
}

export type Tiebreaker = "rs" | "npAvg" | "tipsAvg" | "autoAvg" | "autoFuelAvg" | "towerAvg" | "random";

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
    /** Match periods and audio cues, for the workshop match clock (#105). */
    matchTiming: MatchTiming;
}

/**
 * Official match periods. `cues` are moments of TELEOP, by seconds LEFT in
 * the match, when the field plays a sound (names only — PRIDE generates its
 * own tones, it never copies FIRST's audio).
 */
export interface MatchTiming {
    autoS: number;
    transitionS: number;
    teleopS: number;
    cues: Array<{ id: string; secondsLeft: number }>;
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
    // Standard FTC periods; DECODE-specific cues were never verified here.
    matchTiming: { autoS: 30, transitionS: 8, teleopS: 120, cues: [] },
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
    // Competition Manual TU09 §10.4 (AUTO 0:30, 8 s transition, TELEOP 2:00)
    // and §9.11 Table 9-1 cues: FLOWER Ownership Unlocked at 1:00, final 20 s.
    matchTiming: {
        autoS: 30,
        transitionS: 8,
        teleopS: 120,
        cues: [
            { id: "flowerUnlocked", secondsLeft: 60 },
            { id: "final20", secondsLeft: 20 },
        ],
    },
};

const RULES_BY_SEASON: SeasonRules[] = [BIOBUZZ_2026, DECODE_2025];

/**
 * FRC 2026 REBUILT (Game Manual TU22, 21-apr-2026; research in
 * docs/plan-first-api-y-frc.md): FUEL in an active HUB 1 pt, TOWER L1 15 (auto)
 * / 10, L2 20, L3 30. Fouls minor 5 / major 15. Bonus RP thresholds for
 * Regional/District events (Table 6-5); District Championship and FIRST
 * Championship values in FRC_RP_THRESHOLDS_BY_LEVEL. Tiebreakers §10.5.3
 * Table 10-1. Breakdown keys from the FRC API 2026 /scores model.
 */
const REBUILT_2026: SeasonRules = {
    season: 2026,
    gameName: "REBUILT",
    fouls: { minor: 5, major: 15 },
    rpTargets: [
        { id: "energized", labelKey: "rp.energized", breakdownKey: "energizedAchieved", kind: "count-threshold", defaultThreshold: 100, countKey: "hubScore.totalCount" },
        { id: "supercharged", labelKey: "rp.supercharged", breakdownKey: "superchargedAchieved", kind: "count-threshold", defaultThreshold: 360, countKey: "hubScore.totalCount" },
        { id: "traversal", labelKey: "rp.traversal", breakdownKey: "traversalAchieved", kind: "count-threshold", defaultThreshold: 50, countKey: "totalTowerPoints" },
    ],
    winRp: 3,
    tieRp: 1,
    tiebreakers: ["rs", "npAvg", "autoFuelAvg", "towerAvg", "random"],
    // §6.4 Table 6-2: AUTO 0:20, TELEOP 2:20 (transition shift 10 s, 4 shifts of 25 s, END GAME 30 s).
    matchTiming: {
        autoS: 20,
        transitionS: 0,
        teleopS: 140,
        cues: [
            { id: "shift1", secondsLeft: 130 },
            { id: "shift2", secondsLeft: 105 },
            { id: "shift3", secondsLeft: 80 },
            { id: "shift4", secondsLeft: 55 },
            { id: "endGame", secondsLeft: 30 },
        ],
    },
};

const FRC_RULES_BY_SEASON: SeasonRules[] = [REBUILT_2026];

/** FRC 2026 bonus-RP thresholds by event level (Table 6-5, TU22). */
export const FRC_RP_THRESHOLDS_BY_LEVEL: Record<"event" | "districtChampionship" | "championship", Record<string, number>> = {
    event: { energized: 100, supercharged: 360, traversal: 50 },
    districtChampionship: { energized: 240, supercharged: 360, traversal: 50 },
    championship: { energized: 360, supercharged: 500, traversal: 50 },
};

/** Rules for `season`; seasons older than the oldest modeled fall back to it. */
export function seasonRulesFor(season: number, program: "FTC" | "FRC" = "FTC"): SeasonRules {
    const list = program === "FRC" ? FRC_RULES_BY_SEASON : RULES_BY_SEASON;
    return list.find(r => season >= r.season) ?? list[list.length - 1];
}

/**
 * Per-event RP threshold overrides. Premier Events may set their own
 * thresholds (Table 10-3 note); Regional Championship and FIRST
 * Championship thresholds are TBA in TU09. Add entries here as they're
 * published: `"2026:EVENTCODE": { swarm: 18, pollinator1: 5 }` (FRC: `"FRC:2026:CODE"`).
 */
export const RP_THRESHOLD_OVERRIDES: Record<string, Record<string, number>> = {};

/** FRC event type (FIRST `type`, e.g. "Regional", "DistrictChampionshipDivision", "ChampionshipSubdivision") → its bonus-RP threshold level. */
export function frcThresholdLevel(eventType: string | undefined): keyof typeof FRC_RP_THRESHOLDS_BY_LEVEL {
    const t = eventType ?? "";
    if (t.startsWith("DistrictChampionship")) return "districtChampionship";
    if (t.startsWith("Championship")) return "championship";
    return "event";
}

/**
 * Effective thresholds (target id → threshold) for one event. FRC thresholds
 * depend on the event level (Table 6-5): pass the FIRST event type.
 */
export function rpThresholdsFor(season: number, eventCode?: string, program: "FTC" | "FRC" = "FTC", eventType?: string): Record<string, number> {
    const out: Record<string, number> = {};
    for (const t of seasonRulesFor(season, program).rpTargets) {
        if (t.defaultThreshold != null) out[t.id] = t.defaultThreshold;
    }
    if (program === "FRC") Object.assign(out, FRC_RP_THRESHOLDS_BY_LEVEL[frcThresholdLevel(eventType)]);
    const key = `${program === "FRC" ? "FRC:" : ""}${season}:${eventCode?.toUpperCase()}`;
    const override = eventCode ? RP_THRESHOLD_OVERRIDES[key] : undefined;
    return { ...out, ...(override ?? {}) };
}
