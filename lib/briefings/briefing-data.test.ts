import { describe, it, expect } from "vitest";
import { buildBriefingData } from "./briefing-data";
import type { AggregatedTeamStats, FTCMatchScouting, MatchScouting } from "@/types/scouting";

function team(overrides: Partial<AggregatedTeamStats> & Pick<AggregatedTeamStats, "teamNumber">): AggregatedTeamStats {
    return {
        teamName: `Team ${overrides.teamNumber}`,
        regionalsAttended: 1,
        totalRS: 10, averageRS: 2.5,
        totalMatchPoints: 200, averageMatchPoints: 50,
        totalBasePoints: 100, averageBasePoints: 25,
        totalAutoPoints: 40, averageAutoPoints: 10,
        totalHighScore: 0, averageHighScore: 0,
        totalWins: 2, totalLosses: 2, totalTies: 0,
        bestRank: 5, averageRank: 5,
        hasAdvanced: false,
        advancementPoints: { total: 0, judging: 0, playoff: 0, selection: 0, qualification: 0 },
        totalNP: 200, averageNP: 50,
        opr: 50,
        events: [{ eventCode: "MXTOL", rank: 5, rs: 10, matchPoints: 200 }],
        ...overrides,
    };
}

function ftcScout(overrides: Partial<FTCMatchScouting> & Pick<FTCMatchScouting, "teamNumber" | "matchNumber">): FTCMatchScouting {
    return {
        eventCode: "MXTOL",
        season: 2025,
        program: "FTC",
        orgId: "30311",
        scoutId: "scout-A", scoutName: "Alice",
        scouterId: "scout-A", scouterName: "Alice",
        confidence: "high",
        notes: "",
        timestamp: { seconds: 1000, nanoseconds: 0 },
        autoPurpleArtifacts: 0, autoGreenArtifacts: 0,
        teleopPurpleArtifacts: 0, teleopGreenArtifacts: 0,
        patternsCompleted: 0,
        driverSkill: 3,
        endgameBaseParking: 'None', dualParking: false,
        ...overrides,
    } as FTCMatchScouting;
}

const teams: AggregatedTeamStats[] = [
    team({ teamNumber: 30311, averageRS: 3.0, averageNP: 80, averageAutoPoints: 20, averageMatchPoints: 100 }),
    team({ teamNumber: 16768, averageRS: 2.5, averageNP: 70, averageAutoPoints: 15, averageMatchPoints: 85 }),
    team({ teamNumber: 8744, averageRS: 2.0, averageNP: 55, averageAutoPoints: 10, averageMatchPoints: 65 }),
    team({ teamNumber: 20471, averageRS: 1.5, averageNP: 45, averageAutoPoints: 8, averageMatchPoints: 55 }),
];

describe("buildBriefingData", () => {
    it("returns a briefing for a valid 2v2 setup", () => {
        const b = buildBriefingData({
            matchNumber: 14,
            eventCode: "MXTOL",
            season: 2025,
            orgId: "30311",
            redTeamNumbers: [30311, 16768],
            blueTeamNumbers: [8744, 20471],
            teams,
            scoutingEntries: [],
        });
        expect(b.matchNumber).toBe(14);
        expect(b.redAlliance.teams).toHaveLength(2);
        expect(b.blueAlliance.teams).toHaveLength(2);
        expect(b.winProbabilityRed).toBeGreaterThan(0.5);
        expect(b.generatedAt).toBeTruthy();
    });

    it("handles a team number with no aggregated stats gracefully", () => {
        const b = buildBriefingData({
            matchNumber: 1,
            eventCode: "MXTOL",
            season: 2025,
            orgId: "30311",
            redTeamNumbers: [30311, 99999], // 99999 doesn't exist
            blueTeamNumbers: [16768, 8744],
            teams,
            scoutingEntries: [],
        });
        const ghost = b.redAlliance.teams.find(t => t.teamNumber === 99999);
        expect(ghost).toBeDefined();
        expect(ghost!.projectedPoints).toBe(0);
        // redFlags is a translation key + params (never prose) — see
        // docs/architecture/i18n.md.
        expect(ghost!.redFlags).toContainEqual({ key: "noData" });
    });

    it("attaches up to 2 most recent scouting notes per team, sorted newest-first", () => {
        const scouting: MatchScouting[] = [
            ftcScout({
                teamNumber: 30311,
                matchNumber: 10,
                notes: "old observation",
                timestamp: { seconds: 100, nanoseconds: 0 },
            }),
            ftcScout({
                teamNumber: 30311,
                matchNumber: 11,
                notes: "newer observation",
                timestamp: { seconds: 500, nanoseconds: 0 },
            }),
            ftcScout({
                teamNumber: 30311,
                matchNumber: 12,
                notes: "newest observation",
                timestamp: { seconds: 900, nanoseconds: 0 },
            }),
            ftcScout({
                teamNumber: 30311,
                matchNumber: 13,
                notes: "", // empty notes ignored
                timestamp: { seconds: 1000, nanoseconds: 0 },
            }),
        ];
        const b = buildBriefingData({
            matchNumber: 14,
            eventCode: "MXTOL",
            season: 2025,
            orgId: "30311",
            redTeamNumbers: [30311, 16768],
            blueTeamNumbers: [8744, 20471],
            teams,
            scoutingEntries: scouting,
        });
        const t = b.redAlliance.teams.find(x => x.teamNumber === 30311)!;
        expect(t.recentNotes).toHaveLength(2);
        expect(t.recentNotes[0]).toBe("newest observation");
        expect(t.recentNotes[1]).toBe("newer observation");
    });

    it("derives a strategic focus bullet for auto advantage", () => {
        // Red has way higher autoPoints than blue → should trigger "AUTO: ventaja roja".
        const redHeavy: AggregatedTeamStats[] = [
            team({ teamNumber: 1, averageAutoPoints: 30, averageMatchPoints: 100 }),
            team({ teamNumber: 2, averageAutoPoints: 30, averageMatchPoints: 100 }),
            team({ teamNumber: 3, averageAutoPoints: 2, averageMatchPoints: 100 }),
            team({ teamNumber: 4, averageAutoPoints: 2, averageMatchPoints: 100 }),
        ];
        const b = buildBriefingData({
            matchNumber: 1,
            eventCode: "MXTOL", season: 2025, orgId: "30311",
            redTeamNumbers: [1, 2],
            blueTeamNumbers: [3, 4],
            teams: redHeavy,
            scoutingEntries: [],
        });
        // strategicFocus is a translation key + params (never prose) — see
        // docs/architecture/i18n.md.
        expect(b.strategicFocus.some(f => f.key === "autoAdvantageRed")).toBe(true);
    });

    it("derives a 'favoritos' bullet when win probability is high", () => {
        // Make red dominant
        const dominant: AggregatedTeamStats[] = [
            team({ teamNumber: 1, averageMatchPoints: 200, averageAutoPoints: 50 }),
            team({ teamNumber: 2, averageMatchPoints: 200, averageAutoPoints: 50 }),
            team({ teamNumber: 3, averageMatchPoints: 10, averageAutoPoints: 1 }),
            team({ teamNumber: 4, averageMatchPoints: 10, averageAutoPoints: 1 }),
        ];
        const b = buildBriefingData({
            matchNumber: 1,
            eventCode: "MXTOL", season: 2025, orgId: "30311",
            redTeamNumbers: [1, 2],
            blueTeamNumbers: [3, 4],
            teams: dominant,
            scoutingEntries: [],
        });
        expect(b.winProbabilityRed).toBeGreaterThan(0.75);
        expect(b.strategicFocus.some(f => f.key === "clearFavorite")).toBe(true);
    });

    it("surfaces the opposing alliance's red flags as structured params, not a joined string", () => {
        // Team 99999 doesn't exist in `teams` → blue gets a "noData" red flag,
        // which must propagate into the "opponentWeaknesses" bullet as a
        // RedFlag[] param (the UI joins/translates it, not this module).
        const b = buildBriefingData({
            matchNumber: 1,
            eventCode: "MXTOL",
            season: 2025,
            orgId: "30311",
            redTeamNumbers: [30311, 16768],
            blueTeamNumbers: [8744, 99999],
            teams,
            scoutingEntries: [],
        });
        const weaknesses = b.strategicFocus.find(f => f.key === "opponentWeaknesses");
        expect(weaknesses).toBeDefined();
        expect(weaknesses).toMatchObject({ key: "opponentWeaknesses" });
        if (weaknesses?.key === "opponentWeaknesses") {
            expect(weaknesses.flags).toContainEqual({ key: "noData" });
        }
    });

    it("always returns at least one strategic focus bullet (fallback for balanced matches)", () => {
        const balanced: AggregatedTeamStats[] = [
            team({ teamNumber: 1, averageMatchPoints: 50, averageAutoPoints: 10 }),
            team({ teamNumber: 2, averageMatchPoints: 50, averageAutoPoints: 10 }),
            team({ teamNumber: 3, averageMatchPoints: 50, averageAutoPoints: 10 }),
            team({ teamNumber: 4, averageMatchPoints: 50, averageAutoPoints: 10 }),
        ];
        const b = buildBriefingData({
            matchNumber: 1,
            eventCode: "MXTOL", season: 2025, orgId: "30311",
            redTeamNumbers: [1, 2],
            blueTeamNumbers: [3, 4],
            teams: balanced,
            scoutingEntries: [],
        });
        expect(b.strategicFocus.length).toBeGreaterThan(0);
    });

    it("scales projected score from per-team projections", () => {
        const b = buildBriefingData({
            matchNumber: 14,
            eventCode: "MXTOL", season: 2025, orgId: "30311",
            redTeamNumbers: [30311, 16768],
            blueTeamNumbers: [8744, 20471],
            teams,
            scoutingEntries: [],
        });
        const sumRed = b.redAlliance.teams.reduce((a, t) => a + t.projectedPoints, 0);
        expect(b.redAlliance.projectedScore).toBe(sumRed);
    });
});
