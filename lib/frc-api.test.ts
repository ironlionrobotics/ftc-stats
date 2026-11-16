import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getCurrentSeason } from "./constants";
import { seasonRulesFor } from "./games/season-rules";

vi.mock("@/lib/ftc-api", () => {
    const m = new Map<string, unknown>();
    return { getCachedData: async (k: string) => m.get(k) ?? null, setCachedData: async (k: string, v: unknown) => { m.set(k, v); } };
});

const routes: Record<string, unknown> = {
    "/2026/events": { Events: [{ code: "MXMO", name: "Monterrey", type: "Regional", districtCode: null, divisionCode: null, dateStart: "2026-03-11T00:00:00", dateEnd: "2026-03-14T23:59:59" }] },
    "/2026/matches/MXMO?tournamentLevel=Qualification": { Matches: [{ description: "Qualification 1", tournamentLevel: "Qualification", matchNumber: 1, postResultTime: "2026-03-12T09:05:00", scoreRedFinal: 120, scoreRedFoul: 15, scoreRedAuto: 30, scoreBlueFinal: 90, scoreBlueFoul: 5, scoreBlueAuto: 20, teams: [{ teamNumber: 4977, station: "Red1", dq: false }, { teamNumber: 1, station: "Red2" }, { teamNumber: 2, station: "Red3" }, { teamNumber: 3, station: "Blue1" }, { teamNumber: 4, station: "Blue2" }, { teamNumber: 5, station: "Blue3" }] }] },
    "/2026/matches/MXMO?tournamentLevel=Playoff": { Matches: [{ description: "Match 14", tournamentLevel: "Playoff", matchNumber: 14, postResultTime: "x", scoreRedFinal: 200, scoreRedFoul: 0, scoreRedAuto: 0, scoreBlueFinal: 180, scoreBlueFoul: 0, scoreBlueAuto: 0, teams: [] }] },
    "/2026/schedule/MXMO?tournamentLevel=Qualification": { Schedule: [{ description: "Qualification 1", tournamentLevel: "Qualification", matchNumber: 1, teams: [] }, { description: "Qualification 2", tournamentLevel: "Qualification", matchNumber: 2, teams: [{ teamNumber: 4977, station: "Blue2", surrogate: false }] }] },
    "/2026/schedule/MXMO?tournamentLevel=Playoff": { Schedule: [] },
    "/2026/alliances/MXMO": { Alliances: [{ number: 1, name: "Alliance 1", captain: 4977, round1: 1, round2: 2, round3: null, backup: null, backupReplaced: null }] },
};

describe("FRC Events API v3 client (#118)", () => {
    beforeEach(() => {
        vi.resetModules();
        process.env.FRC_API_USERNAME = "u"; process.env.FRC_API_KEY = "k";
        vi.stubGlobal("fetch", vi.fn(async (url: string) => {
            const path = url.replace("https://frc-api.firstinspires.org/v3.0", "");
            return path in routes ? new Response(JSON.stringify(routes[path])) : new Response("{}", { status: 404 });
        }));
    });
    afterEach(() => { vi.unstubAllGlobals(); delete process.env.FRC_API_USERNAME; delete process.env.FRC_API_KEY; });

    it("normalizes matches to the FTC shape: levels, 3 stations, playoff series, fouls RECEIVED", async () => {
        const { fetchFrcMatches } = await import("./frc-api");
        const [q, p] = await fetchFrcMatches(2026, "MXMO");
        expect(q.tournamentLevel).toBe("QUALIFICATION");
        expect(q.teams.map(t => t.station)).toEqual(["Red1", "Red2", "Red3", "Blue1", "Blue2", "Blue3"]);
        // FRC: scoreRedFoul = points awarded TO red. PRIDE (#48): red's fouls received sit on BLUE's field.
        expect(q.scoreBlueFoul).toBe(15);
        expect(q.scoreRedFoul).toBe(5);
        expect(p).toMatchObject({ tournamentLevel: "PLAYOFF", series: 14 });
    });

    it("hybrid schedule: results inlined only for played matches", async () => {
        const { fetchFrcHybridSchedule } = await import("./frc-api");
        const h = await fetchFrcHybridSchedule(2026, "MXMO");
        expect(h[0].scoreRedFinal).toBe(120);
        expect(h[1].scoreRedFinal).toBeNull();
    });

    it("alliances: plain team numbers become {teamNumber}", async () => {
        const { fetchFrcAlliances } = await import("./frc-api");
        const [a] = await fetchFrcAlliances(2026, "MXMO");
        expect(a.captain).toEqual({ teamNumber: 4977 });
        expect(a.round2).toEqual({ teamNumber: 2 });
        expect(a.round3).toBeNull();
    });

    it("no credentials ⇒ empty data, no network", async () => {
        delete process.env.FRC_API_USERNAME;
        const { fetchFrcEvents } = await import("./frc-api");
        expect(await fetchFrcEvents(2025)).toEqual([]);
        expect(fetch).not.toHaveBeenCalled();
    });
});

describe("program-aware season and rules (#118)", () => {
    it("FRC seasons are calendar years; FTC switch in September", () => {
        expect(getCurrentSeason("FRC", new Date("2026-11-16"))).toBe(2026);
        expect(getCurrentSeason("FRC", new Date("2027-01-10"))).toBe(2027);
        expect(getCurrentSeason("FTC", new Date("2027-01-10"))).toBe(2026);
    });
    it("FRC 2026 rules are REBUILT; FTC 2026 stays BIOBUZZ", () => {
        expect(seasonRulesFor(2026, "FRC").gameName).toBe("REBUILT");
        expect(seasonRulesFor(2026).gameName).toBe("BIOBUZZ");
        expect(seasonRulesFor(2026, "FRC").rpTargets.map(r => r.id)).toEqual(["energized", "supercharged", "traversal"]);
    });
});
