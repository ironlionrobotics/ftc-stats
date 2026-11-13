import { describe, it, expect } from "vitest";
import { pickNextMatch, computeCoverage } from "./today";
import type { FTCHybridScheduleMatch } from "@/types/scouting";

type TeamSpec = [teamNumber: number, station: string, surrogate?: boolean];

function match(
    matchNumber: number,
    teams: TeamSpec[],
    opts: {
        played?: boolean;
        level?: string;
        startTime?: string | null;
        description?: string;
    } = {},
): FTCHybridScheduleMatch {
    const played = opts.played ?? false;
    return {
        description: opts.description ?? `Match ${matchNumber}`,
        matchNumber,
        tournamentLevel: opts.level ?? "QUALIFICATION",
        startTime: opts.startTime ?? null,
        scoreRedFinal: played ? 120 : null,
        scoreBlueFinal: played ? 90 : null,
        teams: teams.map(([teamNumber, station, surrogate]) => ({
            teamNumber,
            station,
            teamName: `Team ${teamNumber}`,
            ...(surrogate === undefined ? {} : { surrogate }),
        })),
    };
}

const FOUR: TeamSpec[] = [
    [30311, "Red1"],
    [111, "Red2"],
    [222, "Blue1"],
    [333, "Blue2"],
];

describe("pickNextMatch", () => {
    it("returns the first unplayed match with played and unplayed mixed", () => {
        const schedule = [
            match(1, FOUR, { played: true }),
            match(2, FOUR, { played: true }),
            match(3, FOUR),
            match(4, FOUR),
        ];
        expect(pickNextMatch(schedule, 30311)?.matchNumber).toBe(3);
    });

    it("skips played matches even when they come later in the array", () => {
        const schedule = [
            match(5, FOUR, { played: true }),
            match(6, FOUR),
        ];
        expect(pickNextMatch(schedule, 30311)?.matchNumber).toBe(6);
    });

    it("ignores appearances flagged surrogate", () => {
        const schedule = [
            match(3, [[30311, "Red1", true], [111, "Red2"], [222, "Blue1"], [333, "Blue2"]]),
            match(4, FOUR),
        ];
        const next = pickNextMatch(schedule, 30311);
        expect(next?.matchNumber).toBe(4);
    });

    it("returns null when the team is not on any unplayed match", () => {
        const schedule = [match(1, FOUR, { played: true }), match(2, FOUR, { played: true })];
        expect(pickNextMatch(schedule, 30311)).toBeNull();
    });

    it("returns null when the team is absent from the schedule entirely", () => {
        expect(pickNextMatch([match(1, FOUR), match(2, FOUR)], 99999)).toBeNull();
    });

    it("returns null for an empty schedule", () => {
        expect(pickNextMatch([], 30311)).toBeNull();
    });

    it("splits partners and opponents by station for a red team", () => {
        const next = pickNextMatch([match(7, FOUR)], 30311)!;
        expect(next.alliance).toBe("Red");
        expect(next.partners.map(p => p.teamNumber)).toEqual([111]);
        expect(next.opponents.map(o => o.teamNumber)).toEqual([222, 333]);
        expect(next.partners[0].teamName).toBe("Team 111");
    });

    it("splits partners and opponents by station for a blue team", () => {
        const next = pickNextMatch([match(7, FOUR)], 222)!;
        expect(next.alliance).toBe("Blue");
        expect(next.partners.map(p => p.teamNumber)).toEqual([333]);
        expect(next.opponents.map(o => o.teamNumber)).toEqual([30311, 111]);
    });

    it("carries description, level and startTime through", () => {
        const schedule = [
            match(2, FOUR, {
                level: "PLAYOFF",
                startTime: "2026-07-30T18:00:00Z",
                description: "Semifinal 1",
            }),
        ];
        const next = pickNextMatch(schedule, 30311)!;
        expect(next).toMatchObject({
            matchNumber: 2,
            description: "Semifinal 1",
            tournamentLevel: "PLAYOFF",
            startTime: "2026-07-30T18:00:00Z",
        });
    });

    it("normalizes a missing teamName to null", () => {
        const m = match(1, FOUR);
        m.teams[1].teamName = null;
        expect(pickNextMatch([m], 30311)!.partners[0].teamName).toBeNull();
    });

    it("does not reorder qualification ahead of playoff by matchNumber", () => {
        // Playoff match 1 sits after qual 40 chronologically; sorting by
        // matchNumber would wrongly surface it first.
        const schedule = [
            match(40, FOUR, { level: "QUALIFICATION" }),
            match(1, FOUR, { level: "PLAYOFF" }),
        ];
        const next = pickNextMatch(schedule, 30311)!;
        expect(next.matchNumber).toBe(40);
        expect(next.tournamentLevel).toBe("QUALIFICATION");
    });

    it("sorts by startTime when every candidate has one", () => {
        const schedule = [
            match(10, FOUR, { startTime: "2026-07-30T20:00:00Z" }),
            match(11, FOUR, { startTime: "2026-07-30T18:00:00Z" }),
        ];
        expect(pickNextMatch(schedule, 30311)?.matchNumber).toBe(11);
    });

    it("keeps the given order when any candidate lacks a startTime", () => {
        const schedule = [
            match(10, FOUR, { startTime: null }),
            match(11, FOUR, { startTime: "2026-07-30T18:00:00Z" }),
        ];
        expect(pickNextMatch(schedule, 30311)?.matchNumber).toBe(10);
    });

    it("keeps the given order when a startTime is unparseable", () => {
        const schedule = [
            match(10, FOUR, { startTime: "not-a-date" }),
            match(11, FOUR, { startTime: "2026-07-30T18:00:00Z" }),
        ];
        expect(pickNextMatch(schedule, 30311)?.matchNumber).toBe(10);
    });

    it("returns null when the team's station is unparseable", () => {
        const schedule = [match(1, [[30311, "Green1"], [222, "Blue1"]])];
        expect(pickNextMatch(schedule, 30311)).toBeNull();
    });
});

describe("computeCoverage", () => {
    it("counts distinct match numbers, not entries", () => {
        // Four scouts covering matches 1 and 2 => 2 matches covered.
        expect(computeCoverage([1, 1, 2, 2], 4)).toEqual({ scouted: 2, played: 4, pct: 0.5 });
    });

    it("computes the plain ratio with no duplicates", () => {
        expect(computeCoverage([1, 2, 3], 6)).toEqual({ scouted: 3, played: 6, pct: 0.5 });
    });

    it("returns null when nothing has been played", () => {
        expect(computeCoverage([1, 2], 0)).toBeNull();
    });

    it("returns null for a negative played count", () => {
        expect(computeCoverage([1], -3)).toBeNull();
    });

    it("clamps pct to 1 when more matches are scouted than played", () => {
        const c = computeCoverage([1, 2, 3, 4, 5], 3)!;
        expect(c.pct).toBe(1);
        expect(c.scouted).toBe(5);
        expect(c.played).toBe(3);
    });

    it("reports zero coverage when nothing is scouted", () => {
        expect(computeCoverage([], 10)).toEqual({ scouted: 0, played: 10, pct: 0 });
    });
});
