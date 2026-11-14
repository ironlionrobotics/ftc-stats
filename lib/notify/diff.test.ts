import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { diffEvent, type EventNotifyState, type EventSnapshot, type NotifyEvent } from "./diff";
import { playOrder, matchKey } from "@/lib/following-summary";
import type { FTCAllianceSelection, FTCHybridScheduleMatch, FTCMatch, TeamRanking } from "@/types/scouting";

/** Real event (FPEMX 2025, FIRST API): 44 quals, 6 alliances, 10 double-elimination playoff matches. */
const fx = JSON.parse(readFileSync(join(__dirname, "../../test/fixtures/notify/fpemx-2025.json"), "utf8")) as {
    eventCode: string; schedule: FTCHybridScheduleMatch[]; matches: FTCMatch[]; rankings: TeamRanking[]; alliances: FTCAllianceSelection[];
};
const ORDER = playOrder(fx.schedule);
const QUALS = ORDER.filter(m => m.tournamentLevel === "QUALIFICATION").length;

/** The event as the cron would have seen it after `k` matches had results. */
function at(k: number): EventSnapshot {
    const done = new Set(ORDER.slice(0, k).map(matchKey));
    const schedule = fx.schedule.map(m => done.has(matchKey(m)) ? m : { ...m, scoreRedFinal: null, scoreBlueFinal: null });
    const doneQuals = new Set(ORDER.slice(0, k).filter(m => m.tournamentLevel === "QUALIFICATION").map(m => m.matchNumber));
    return {
        eventCode: fx.eventCode,
        schedule,
        matches: fx.matches.filter(m => doneQuals.has(m.matchNumber)),
        rankings: fx.rankings,
        alliances: k >= QUALS ? fx.alliances : [],
    };
}

function replay(fromK: number) {
    let state: EventNotifyState | null = null;
    const all: NotifyEvent[] = [];
    for (let k = fromK; k <= ORDER.length; k++) {
        const r1 = diffEvent(state, at(k));
        all.push(...r1.events);
        const r2 = diffEvent(r1.next, at(k)); // the cron sees the same data twice
        expect(r2.events).toEqual([]);
        state = r2.next;
    }
    return all;
}

describe("diffEvent on a real event replay (#110)", () => {
    const events = replay(0);
    const of = <K extends NotifyEvent["kind"]>(k: K) => events.filter((e): e is Extract<NotifyEvent, { kind: K }> => e.kind === k);

    it("announces every result exactly once", () => {
        const results = of("matchResult");
        expect(results).toHaveLength(ORDER.length);
        expect(new Set(results.map(r => r.key)).size).toBe(ORDER.length);
        expect(results[0]).toMatchObject({ label: "Q1" });
        expect(results.at(-1)).toMatchObject({ label: "Final", level: "PLAYOFF" });
    });

    it("announces 'soon' once per match, 1–2 matches ahead, with odds once the model exists", () => {
        const soon = of("matchSoon");
        expect(new Set(soon.map(s => s.key)).size).toBe(soon.length);
        expect(soon.every(s => s.ahead >= 1 && s.ahead <= 2)).toBe(true);
        expect(soon.length).toBeGreaterThan(ORDER.length - 6);
        expect(soon.filter(s => s.pRed !== null).length).toBeGreaterThan(soon.length - 6);
    });

    it("announces alliances once after quals and the champion once at the end", () => {
        const al = of("alliances");
        expect(al).toHaveLength(1);
        expect(al[0].alliances).toHaveLength(6);
        expect(al[0].alliances[0]).toMatchObject({ number: 1, teams: [12887, 32753] });
        const ch = of("champion");
        expect(ch).toHaveLength(1);
        expect(ch[0]).toMatchObject({ alliance: 1 });
        expect(ch[0].teams.sort()).toEqual([12887, 32753]);
    });

    it("following mid-event announces nothing already played", () => {
        const mid = replay(20);
        const results = mid.filter(e => e.kind === "matchResult");
        expect(results).toHaveLength(ORDER.length - 20);
        expect(results.some(r => r.kind === "matchResult" && r.label === "Q20")).toBe(false);
    });

    it("never carries personal data: only numbers, labels and scores", () => {
        const json = JSON.stringify(events);
        expect(json).not.toMatch(/@|teamName|displayName|email/);
    });
});
