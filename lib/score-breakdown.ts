/**
 * Official per-alliance score breakdown (FIRST FTC Events API v2.0
 * `/scores/{event}/{level}`): parsing, per-season phase split and robot-slot
 * mapping. Pure module (no server-only) so it is unit-testable; the fetching
 * lives in lib/ftc-api.ts.
 *
 * Real response shape (verified 2026-11-13 against 2025/FPEMX and
 * 2026/AUBRQ1 with an authenticated call):
 *   { matchScores: [{ matchLevel, matchSeries, matchNumber, randomization,
 *                     alliances: [{ alliance: "Red"|"Blue", team, ...fields }] }] }
 * Until this module, the app read `.scores[].scoreBreakdown` — which does not
 * exist — so every breakdown consumer silently ran on an empty array.
 */

export type BiobuzzScoringElement = "RED_NECTAR" | "BLUE_NECTAR" | "POLLEN";

/** ScoreDetailAllianceModel_2026 (BIOBUZZ). `team` arrives as 0 — map robots
 *  to teams with robotSlotsFor(). */
export interface BiobuzzAllianceBreakdown {
    autoHiveTips: number;
    autoRobot1Leave: boolean;
    autoRobot2Leave: boolean;
    autoRobot1Park: boolean;
    autoRobot2Park: boolean;
    autoLeavePoints: number;
    autoParkPoints: number;
    autoHivePoints: number;
    teleopHiveTips: number;
    teleopHivePollenNectar: number;
    redAllianceFlower: BiobuzzScoringElement[];
    scoringFlower: BiobuzzScoringElement[];
    blueAllianceFlower: BiobuzzScoringElement[];
    audienceFlower: BiobuzzScoringElement[];
    teleopGardenPollenNectar: number;
    teleopRobot1Park: boolean;
    teleopRobot2Park: boolean;
    teleopHivePoints: number;
    teleopFlowerPoints: number;
    teleopGardenPoints: number;
    teleopParkPoints: number;
    swarmRP: boolean;
    pollinator1RP: boolean;
    pollinator2RP: boolean;
}

/** ScoreDetailAllianceModel_2025 (DECODE) — the fields PRIDE reads. */
export interface DecodeAllianceBreakdown {
    autoLeavePoints: number;
    autoArtifactPoints: number;
    autoPatternPoints: number;
    teleopArtifactPoints: number;
    teleopDepotPoints: number;
    teleopPatternPoints: number;
    teleopBasePoints: number;
    movementRP: boolean;
    goalRP: boolean;
    patternRP: boolean;
}

/** Fields common to every season's alliance breakdown. */
export interface CommonAllianceBreakdown {
    alliance: string;
    team: number;
    autoPoints: number;
    teleopPoints: number;
    foulPointsCommitted: number;
    preFoulTotal: number;
    totalPoints: number;
    majorFouls: number;
    minorFouls: number;
}

/** Older seasons (CenterStage / Into The Deep) naming variants. */
export interface LegacyAllianceBreakdown {
    endgamePoints: number;
    endGamePoints: number;
    parkingPoints: number;
    dronePoints: number;
    stagePoints: number;
    ascentPoints: number;
    hangPoints: number;
    teleOpPoints: number;
    dcPoints: number;
}

/** Any season's alliance breakdown — every field optional; route by season. */
export type AllianceScoreBreakdown = Partial<
    CommonAllianceBreakdown & BiobuzzAllianceBreakdown & DecodeAllianceBreakdown & LegacyAllianceBreakdown
>;

/** One alliance of one match — the flattened unit callers consume. */
export interface MatchScoreEntry {
    matchNumber: number;
    matchLevel: string;
    matchSeries: number;
    alliance: string;
    scoreBreakdown: AllianceScoreBreakdown;
}

interface RawMatchScores {
    matchScores?: Array<{
        matchLevel?: string;
        matchSeries?: number;
        matchNumber?: number;
        alliances?: AllianceScoreBreakdown[];
    }>;
}

/** Flattens a `/scores` response into one entry per alliance. Tolerates a
 *  missing/malformed payload by returning []. */
export function flattenMatchScores(json: unknown): MatchScoreEntry[] {
    const list = (json as RawMatchScores | null)?.matchScores;
    if (!Array.isArray(list)) return [];
    const out: MatchScoreEntry[] = [];
    for (const m of list) {
        if (typeof m?.matchNumber !== "number" || !Array.isArray(m.alliances)) continue;
        for (const a of m.alliances) {
            if (!a || typeof a.alliance !== "string") continue;
            out.push({
                matchNumber: m.matchNumber,
                matchLevel: m.matchLevel ?? "",
                matchSeries: m.matchSeries ?? 0,
                alliance: a.alliance,
                scoreBreakdown: a,
            });
        }
    }
    return out;
}

export interface PhaseSplit {
    auto: number;
    tele: number;
    end: number;
}

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Splits one alliance's pre-foul score into (auto, tele, end) per season.
 * Returns null when there is no breakdown, so callers can fall back to the
 * final − auto − foul estimate instead of reading a fake 0.
 *
 *  - 2026 BIOBUZZ: no formal endgame; "end" = last-minute FLOWER points +
 *    final PARK. teleopPoints includes both (verified: 31 = 20 hive + 1
 *    garden + 10 park on AUBRQ1 Q1 Blue).
 *  - 2025 DECODE: "end" = BASE points; teleopPoints includes them
 *    (verified: 30 = 18 + 0 + 2 + 10 on FPEMX Q1).
 *  - older: the historical field-name variants.
 */
export function phaseSplit(season: number, b: AllianceScoreBreakdown | null | undefined): PhaseSplit | null {
    if (!b || Object.keys(b).length === 0) return null;
    const auto = n(b.autoPoints);
    if (season >= 2026) {
        const end = n(b.teleopFlowerPoints) + n(b.teleopParkPoints);
        return { auto, tele: Math.max(0, n(b.teleopPoints) - end), end };
    }
    if (season === 2025) {
        const end = n(b.teleopBasePoints);
        return { auto, tele: Math.max(0, n(b.teleopPoints) - end), end };
    }
    const end = b.endgamePoints ?? b.endGamePoints ??
        n(b.parkingPoints) + n(b.dronePoints) + n(b.stagePoints) + n(b.ascentPoints) + n(b.hangPoints);
    const tele = b.teleopPoints ?? b.teleOpPoints ?? b.dcPoints ?? 0;
    return { auto, tele, end };
}

/**
 * Robot slot → team for one alliance. The breakdown's robot1/robot2 flags map
 * to stations 1/2 in station order. Evidence (AUBRQ1 2026): all 3 robots
 * listed `onField: false` had every robot-N flag false on exactly their slot.
 */
export function robotSlotsFor(
    teams: Array<{ teamNumber: number; station: string }>,
    alliance: "Red" | "Blue",
): [number | undefined, number | undefined] {
    const sorted = teams
        .filter(t => t.station.toLowerCase().startsWith(alliance.toLowerCase()))
        .sort((a, b) => a.station.localeCompare(b.station));
    return [sorted[0]?.teamNumber, sorted[1]?.teamNumber];
}

/** Per-robot LEAVE/PARK outcomes from a BIOBUZZ breakdown, keyed by slot 1/2. */
export function biobuzzRobotOutcomes(b: AllianceScoreBreakdown, slot: 1 | 2): {
    leave: boolean;
    autoPark: boolean;
    teleopPark: boolean;
} {
    return slot === 1
        ? { leave: b.autoRobot1Leave === true, autoPark: b.autoRobot1Park === true, teleopPark: b.teleopRobot1Park === true }
        : { leave: b.autoRobot2Leave === true, autoPark: b.autoRobot2Park === true, teleopPark: b.teleopRobot2Park === true };
}

/** Alliance TIPS (auto + teleop) from a BIOBUZZ breakdown. */
export function biobuzzTips(b: AllianceScoreBreakdown): number {
    return n(b.autoHiveTips) + n(b.teleopHiveTips);
}
