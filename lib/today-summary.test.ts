import { describe, it, expect } from "vitest";
import type { FTCHybridScheduleMatch, FTCMatch, TeamRanking } from "@/types/scouting";
import rankingsFixture from "@/lib/__fixtures__/rankings-2026-AUBRQ1.json";
import matchesFixture from "@/lib/__fixtures__/matches-2026-AUBRQ1-qual-full.json";
import { pickRelevantEvent, summarizeAtEvent, daysUntil } from "./today-summary";

const ev = (code: string, start: string, end?: string) => ({ code, dateStart: start, dateEnd: end ?? start });
const at = (iso: string) => Date.parse(iso);

describe("pickRelevantEvent", () => {
    const events = [ev("PAST", "2026-10-10"), ev("LIVE", "2026-11-07", "2026-11-08"), ev("NEXT", "2026-11-27", "2026-11-28"), ev("LATER", "2026-12-09")];
    it("prefers the live event", () => {
        expect(pickRelevantEvent(events, at("2026-11-08T15:00:00Z"))).toMatchObject({ event: { code: "LIVE" }, phase: "live" });
    });
    it("keeps the last day live in American evenings (UTC next day)", () => {
        expect(pickRelevantEvent(events, at("2026-11-09T03:00:00Z"))?.phase).toBe("live");
    });
    it("otherwise the soonest upcoming", () => {
        expect(pickRelevantEvent(events, at("2026-11-20T12:00:00Z"))).toMatchObject({ event: { code: "NEXT" }, phase: "upcoming" });
    });
    it("otherwise the latest past", () => {
        expect(pickRelevantEvent(events, at("2027-03-01T12:00:00Z"))).toMatchObject({ event: { code: "LATER" }, phase: "past" });
    });
    it("null without events", () => {
        expect(pickRelevantEvent([], Date.now())).toBeNull();
    });
    it("daysUntil counts whole days", () => {
        expect(daysUntil({ dateStart: "2026-11-27" }, at("2026-11-13T12:00:00Z"))).toBe(14);
    });
});

describe("summarizeAtEvent on real AUBRQ1 data, mid-event", () => {
    // Simulate "after Q17": later quals have no scores yet.
    const CUT = 17;
    const matches = (matchesFixture.matches as unknown as FTCMatch[]).map(m => {
        const base = { ...m, tournamentLevel: "QUALIFICATION" } as FTCMatch;
        return m.matchNumber > CUT
            ? ({ ...base, scoreRedFinal: 0, scoreBlueFinal: 0, scoreRedFoul: 0, scoreBlueFoul: 0, postResultTime: undefined } as FTCMatch)
            : base;
    });
    const schedule: FTCHybridScheduleMatch[] = matches.map(m => ({
        description: `Q${m.matchNumber}`,
        matchNumber: m.matchNumber,
        tournamentLevel: "QUALIFICATION",
        startTime: null,
        scoreRedFinal: m.matchNumber > CUT ? null : m.scoreRedFinal,
        scoreBlueFinal: m.matchNumber > CUT ? null : m.scoreBlueFinal,
        teams: m.teams.map(t => ({ teamNumber: t.teamNumber, station: t.station })),
    }));
    const rankings = rankingsFixture.rankings as unknown as TeamRanking[];

    const s = summarizeAtEvent(14579, rankings, matches, schedule, "AUBRQ1", { winRp: 3, tieRp: 1 });

    it("finds the team's next match (Q19, blue with 18439) with real odds", () => {
        expect(s.nextMatch?.matchNumber).toBe(19);
        expect(s.nextMatch?.alliance).toBe("Blue");
        expect(s.nextMatch?.partners.map(p => p.teamNumber)).toEqual([18439]);
        expect(s.nextMatch?.winProbability).toBeGreaterThan(0);
        expect(s.nextMatch?.winProbability).toBeLessThan(1);
    });
    it("reports quals progress", () => {
        expect(s.qualsPlayed).toBe(CUT);
        expect(s.qualsTotal).toBe(26);
    });
    it("has ranking, projection and alliance odds", () => {
        expect(s.ranking?.currentRank).toBe(5);
        expect(s.ranking?.teamCount).toBe(17);
        expect(s.ranking?.projected?.matchesRemaining).toBeGreaterThan(0);
        expect(s.allianceOdds?.alliances).toBe(4);
        expect(s.allianceOdds?.probability).toBeGreaterThan(0);
        expect(s.allianceOdds?.probability).toBeLessThanOrEqual(1);
    });
    it("a team not at the event gets nothing invented", () => {
        const none = summarizeAtEvent(99999, rankings, matches, schedule, "AUBRQ1", { winRp: 3, tieRp: 1 });
        expect(none.ranking).toBeNull();
        expect(none.nextMatch).toBeNull();
        expect(none.allianceOdds).toBeNull();
    });
});
