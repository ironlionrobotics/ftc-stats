import { describe, it, expect } from "vitest";
import { summarizeEvent } from "./following-summary";
import type { FTCHybridScheduleMatch, FTCMatch, TeamRanking } from "@/types/scouting";

const sched = (n: number, red: number[], blue: number[], score?: [number, number], level = "QUALIFICATION"): FTCHybridScheduleMatch => ({
    description: `${level === "QUALIFICATION" ? "Qualification" : "Semifinal"} ${n}`, matchNumber: n, tournamentLevel: level,
    startTime: `2026-11-14T${String(9 + n).padStart(2, "0")}:00:00`,
    scoreRedFinal: score ? score[0] : null, scoreBlueFinal: score ? score[1] : null,
    teams: [...red.map((t, i) => ({ teamNumber: t, station: `Red${i + 1}` })), ...blue.map((t, i) => ({ teamNumber: t, station: `Blue${i + 1}` }))],
});
const match = (s: FTCHybridScheduleMatch): FTCMatch => ({
    matchNumber: s.matchNumber, tournamentLevel: s.tournamentLevel, description: s.description,
    scoreRedFinal: s.scoreRedFinal ?? 0, scoreBlueFinal: s.scoreBlueFinal ?? 0, scoreRedFoul: 0, scoreBlueFoul: 0,
    postResultTime: "2026-11-14T10:00:00", teams: s.teams.map(t => ({ ...t, onField: true })),
} as unknown as FTCMatch);

describe("summarizeEvent (#110)", () => {
    const schedule = [
        sched(1, [1, 2], [3, 4], [80, 40]),
        sched(2, [1, 3], [2, 4], [70, 50]),
        sched(3, [1, 4], [2, 3], [75, 45]),
        sched(4, [2, 3], [1, 4]),
        sched(5, [3, 4], [1, 2]),
        sched(1, [1, 2], [3, 4], undefined, "PLAYOFF"),
    ];
    const rankings = [1, 2, 3, 4].map((t, i) => ({ rank: i + 1, teamNumber: t, teamName: `T${t}`, sortOrder1: 2 - i * 0.5, wins: 3 - i, losses: i, ties: 0 }) as unknown as TeamRanking);
    const s = summarizeEvent(rankings, schedule.filter(m => m.scoreRedFinal != null).map(match), schedule);

    it("counts progress by level", () => {
        expect(s).toMatchObject({ qualsPlayed: 3, qualsTotal: 5, playoffsPlayed: 0, playoffsTotal: 1 });
        expect(s.lastMatch).toMatchObject({ description: "Q3", redScore: 75, blueScore: 45 });
    });

    it("shortens FIRST match names for cards", async () => {
        const { shortMatchLabel } = await import("./following-summary");
        expect(shortMatchLabel("Qualification 35", "QUALIFICATION", 35)).toBe("Q35");
        expect(shortMatchLabel("Semifinal 2", "PLAYOFF", 2)).toBe("SF2");
        expect(shortMatchLabel("Final 1", "PLAYOFF", 1)).toBe("F1");
        expect(shortMatchLabel("Match 7", "PLAYOFF", 7)).toBe("M7");
    });

    it("lists the next matches in play order with odds that favor team 1", () => {
        expect(s.nextMatches.map(m => m.description)).toEqual(["Q4", "Q5", "SF1"]);
        expect(s.nextMatches[0].pRed!).toBeLessThan(0.5);   // team 1 is blue in Q4
        expect(s.nextMatches[1].pRed!).toBeLessThan(0.5);   // and in Q5
        expect(s.nextMatches[2].pRed!).toBeGreaterThan(0.5); // red in SF1
    });

    it("returns the top of the ranking", () => {
        expect(s.top.map(r => r.teamNumber)).toEqual([1, 2, 3, 4]);
    });
});
