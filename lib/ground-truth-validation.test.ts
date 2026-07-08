import { describe, it, expect } from "vitest";
import {
    computeTeamPointsFromConsensus,
    reconstructAllianceError,
    computeAllianceSignals,
} from "./ground-truth-validation";
import type { FieldConsensus } from "./scouting-aggregation";
import type { FTCMatchScouting, MatchScouting } from "@/types/scouting";

function ftcEntry(overrides: Partial<FTCMatchScouting> & Pick<FTCMatchScouting, "teamNumber" | "scoutId">): MatchScouting {
    return {
        eventCode: "MXTOL",
        season: 2025,
        matchNumber: 1,
        program: "FTC",
        orgId: "30311",
        scoutName: overrides.scoutId,
        scouterId: overrides.scoutId,
        scouterName: overrides.scoutId,
        confidence: "high",
        notes: "",
        timestamp: null,
        autoPurpleArtifacts: 0,
        autoGreenArtifacts: 0,
        teleopPurpleArtifacts: 0,
        teleopGreenArtifacts: 0,
        patternsCompleted: 0,
        endgameBaseParking: "None",
        dualParking: false,
        ...overrides,
    } as MatchScouting;
}

// Helper: build a minimal numeric consensus for a field.
function num(value: number): FieldConsensus {
    return {
        kind: "numeric",
        value,
        variance: 0,
        stddev: 0,
        coefOfVariation: 0,
        flagged: false,
        contributors: [],
    };
}

// Helper: build a minimal categorical consensus for a field.
function cat<T extends string | boolean>(value: T): FieldConsensus {
    return {
        kind: "categorical",
        value,
        confidence: 1,
        flagged: false,
        contributors: [],
    };
}

describe("computeTeamPointsFromConsensus — FTC", () => {
    it("returns 0 with empty fields", () => {
        expect(computeTeamPointsFromConsensus({}, "FTC")).toBe(0);
    });

    it("scores autonomous artifacts at 3 pts each", () => {
        const fields: Record<string, FieldConsensus> = {
            autoPurpleArtifacts: num(2),
            autoGreenArtifacts: num(1),
        };
        // 2*3 + 1*3 = 9
        expect(computeTeamPointsFromConsensus(fields, "FTC")).toBe(9);
    });

    it("scores teleop artifacts at 2 pts and patterns at 10 pts", () => {
        const fields: Record<string, FieldConsensus> = {
            teleopPurpleArtifacts: num(5),
            teleopGreenArtifacts: num(3),
            patternsCompleted: num(2),
        };
        // 5*2 + 3*2 + 2*10 = 36
        expect(computeTeamPointsFromConsensus(fields, "FTC")).toBe(36);
    });

    it("adds endgame parking bonuses correctly", () => {
        const partial = computeTeamPointsFromConsensus(
            { endgameBaseParking: cat("Partial") },
            "FTC",
        );
        const full = computeTeamPointsFromConsensus(
            { endgameBaseParking: cat("Full") },
            "FTC",
        );
        const fullDual = computeTeamPointsFromConsensus(
            { endgameBaseParking: cat("Full"), dualParking: cat(true) },
            "FTC",
        );
        expect(partial).toBe(5);
        expect(full).toBe(10);
        expect(fullDual).toBe(30); // 10 + 20
    });

    it("aggregates a realistic full-match FTC observation", () => {
        const fields: Record<string, FieldConsensus> = {
            autoPurpleArtifacts: num(2),
            autoGreenArtifacts: num(2),
            autoPoints: num(5), // e.g. launch line / parking bonus included
            teleopPurpleArtifacts: num(10),
            teleopGreenArtifacts: num(8),
            patternsCompleted: num(1),
            endgameBaseParking: cat("Full"),
            dualParking: cat(false),
        };
        // auto: 6 + 6 + 5 = 17
        // tele: 20 + 16 + 10 = 46
        // end: 10
        // total: 73
        expect(computeTeamPointsFromConsensus(fields, "FTC")).toBe(73);
    });

    it("treats missing/wrong-kind fields as 0", () => {
        const fields: Record<string, FieldConsensus> = {
            // Intentionally wrong shape: autoPurpleArtifacts is categorical
            autoPurpleArtifacts: cat("Full"),
        };
        expect(computeTeamPointsFromConsensus(fields, "FTC")).toBe(0);
    });
});

describe("computeTeamPointsFromConsensus — FRC Reefscape", () => {
    it("scores coral by reef level (auto > teleop per level)", () => {
        const auto = computeTeamPointsFromConsensus(
            { autoCoralL4: num(1) },
            "FRC",
        );
        const tele = computeTeamPointsFromConsensus(
            { teleopCoralL4: num(1) },
            "FRC",
        );
        expect(auto).toBe(7);
        expect(tele).toBe(5);
        // Higher tiers are worth more
        expect(computeTeamPointsFromConsensus({ teleopCoralL1: num(1) }, "FRC")).toBe(2);
        expect(computeTeamPointsFromConsensus({ teleopCoralL3: num(1) }, "FRC")).toBe(4);
    });

    it("adds endgame climb bonuses", () => {
        expect(
            computeTeamPointsFromConsensus({ endgameClimbState: cat("Deep") }, "FRC"),
        ).toBe(12);
        expect(
            computeTeamPointsFromConsensus({ endgameClimbState: cat("Shallow") }, "FRC"),
        ).toBe(6);
        expect(
            computeTeamPointsFromConsensus(
                { endgameClimbState: cat("None"), endgameParked: cat(true) },
                "FRC",
            ),
        ).toBe(2);
    });

    it("aggregates a realistic FRC observation", () => {
        const fields: Record<string, FieldConsensus> = {
            autoCoralL2: num(1), // 4
            teleopCoralL3: num(4), // 16
            teleopCoralL4: num(2), // 10
            teleopAlgaeProcessor: num(2), // 12
            endgameClimbState: cat("Shallow"), // 6
        };
        expect(computeTeamPointsFromConsensus(fields, "FRC")).toBe(48);
    });
});

describe("reconstructAllianceError", () => {
    // Two teams in an alliance; one scout per team initially.
    // FTC scoring: teleopPurple=2pts each, teleopGreen=2pts each.
    // Team A: 5 purple = 10 pts. Team B: 4 purple = 8 pts. Alliance total = 18 pts.
    const allianceTeams = [101, 102];

    it("returns null when no entries cover any alliance team", () => {
        const entries: MatchScouting[] = [];
        expect(reconstructAllianceError(entries, allianceTeams, 100)).toBeNull();
    });

    it("returns 0 when reconstruction exactly matches official score", () => {
        const entries = [
            ftcEntry({ teamNumber: 101, scoutId: "A", teleopPurpleArtifacts: 5 }),
            ftcEntry({ teamNumber: 102, scoutId: "B", teleopPurpleArtifacts: 4 }),
        ];
        // Reconstruction = 10 + 8 = 18; official = 18 → error = 0
        expect(reconstructAllianceError(entries, allianceTeams, 18)).toBe(0);
    });

    it("scales by per-team coverage when only some teams are scouted", () => {
        const entries = [
            ftcEntry({ teamNumber: 101, scoutId: "A", teleopPurpleArtifacts: 5 }),
            // Team 102 not scouted
        ];
        // Raw recon = 10, teams covered = 1 of 2, scaled = 10 * 2/1 = 20
        // Official = 18 → error = |20-18|/18 = 0.111
        const err = reconstructAllianceError(entries, allianceTeams, 18);
        expect(err).toBeCloseTo(0.111, 2);
    });

    it("clamps error to 1.0 (massive over-estimate)", () => {
        const entries = [
            ftcEntry({ teamNumber: 101, scoutId: "A", teleopPurpleArtifacts: 100 }),
            ftcEntry({ teamNumber: 102, scoutId: "B", teleopPurpleArtifacts: 100 }),
        ];
        // Recon = 400, official = 20 → raw error = 19, clamped to 1.0
        expect(reconstructAllianceError(entries, allianceTeams, 20)).toBe(1);
    });

    it("returns null when official score is zero (degenerate)", () => {
        const entries = [
            ftcEntry({ teamNumber: 101, scoutId: "A", teleopPurpleArtifacts: 5 }),
        ];
        expect(reconstructAllianceError(entries, allianceTeams, 0)).toBeNull();
    });

    it("responds to entry-subset composition (basis for per-scout attribution)", () => {
        // Team 101: 2 scouts disagree wildly. Scout A says 5 purple (truth),
        // scout B says 50 purple (way off). Team 102: 1 scout, 4 purple (truth).
        // Official = 18 (10 from 101 + 8 from 102).
        const allEntries = [
            ftcEntry({ teamNumber: 101, scoutId: "A", teleopPurpleArtifacts: 5 }),  // truth
            ftcEntry({ teamNumber: 101, scoutId: "B", teleopPurpleArtifacts: 50 }), // noise
            ftcEntry({ teamNumber: 102, scoutId: "C", teleopPurpleArtifacts: 4 }),
        ];
        // With A&B both contributing to team 101: weighted-mean by confidence → (5+50)/2 = 27.5
        // Team 101 recon = 27.5 * 2 = 55. Team 102 recon = 8. Total = 63. Official = 18. error ≈ 1.0 (clamped).
        const baseline = reconstructAllianceError(allEntries, allianceTeams, 18);
        expect(baseline).toBeGreaterThan(0.5);

        // A subset without B (noise): team 101 now only has A (5 → 10pts). Total = 18 → error = 0.
        const withoutB = allEntries.filter(e => (e.scoutId ?? e.scouterId) !== "B");
        const errorWithoutB = reconstructAllianceError(withoutB, allianceTeams, 18);
        expect(errorWithoutB).toBeLessThan(baseline!);

        // A subset without A (truth): team 101 now only has B (50 → 100pts). Total = 108 → error ≈ 1.0.
        const withoutA = allEntries.filter(e => (e.scoutId ?? e.scouterId) !== "A");
        const errorWithoutA = reconstructAllianceError(withoutA, allianceTeams, 18);
        expect(errorWithoutA).toBeGreaterThanOrEqual(baseline!);
    });
});

describe("computeAllianceSignals", () => {
    // Alliance of teams 101 + 102. FTC teleop purple = 2 pts each.
    // "Truth": team 101 scored 10 (5 purple), team 102 scored 8 (4 purple),
    // official alliance score = 18.
    const allianceTeams = [101, 102];
    const OFFICIAL = 18;

    /** Entries for one scout covering BOTH teams with perfect values. */
    const perfectPair = (scoutId: string) => [
        ftcEntry({ teamNumber: 101, scoutId, teleopPurpleArtifacts: 5 }),
        ftcEntry({ teamNumber: 102, scoutId, teleopPurpleArtifacts: 4 }),
    ];

    it("gives a perfect solo scout signal 1.0", () => {
        const signals = computeAllianceSignals(perfectPair("A"), allianceTeams, OFFICIAL);
        expect(signals).not.toBeNull();
        expect(signals).toHaveLength(1);
        expect(signals![0].scoutId).toBe("A");
        expect(signals![0].signal).toBeCloseTo(1.0, 10);
    });

    it("gives redundant perfect scouts the SAME signal as a solo one (M6 regression)", () => {
        // REGRESSION: under the LOO design, two identical perfect scouts each
        // had marginal ≈ 0 → signal 0.5, while the same scout working alone
        // got 1 − error = 1.0. Reliability tracked coverage, not skill.
        // Correct: own-entry accuracy is 1.0 for all three observations.
        const duo = [...perfectPair("A"), ...perfectPair("B")];
        const duoSignals = computeAllianceSignals(duo, allianceTeams, OFFICIAL)!;
        const soloSignals = computeAllianceSignals(perfectPair("A"), allianceTeams, OFFICIAL)!;

        expect(duoSignals).toHaveLength(2);
        for (const s of duoSignals) {
            expect(s.signal).toBeCloseTo(soloSignals[0].signal, 10);
            expect(s.signal).toBeCloseTo(1.0, 10);
        }
    });

    it("punishes bad data even when the pool absorbs it", () => {
        // A is perfect on both teams; B reports 50 purple for team 101 (garbage).
        const entries = [
            ...perfectPair("A"),
            ftcEntry({ teamNumber: 101, scoutId: "B", teleopPurpleArtifacts: 50 }),
        ];
        const signals = computeAllianceSignals(entries, allianceTeams, OFFICIAL)!;
        const byId = Object.fromEntries(signals.map(s => [s.scoutId, s]));

        // A judged only on their own data → still perfect.
        expect(byId["A"].signal).toBeCloseTo(1.0, 10);
        // B's own reconstruction: 100 pts × (2/1 coverage) = 200 vs 18 → error 1.
        expect(byId["B"].signal).toBeCloseTo(0.0, 10);
        // The report-level consensus error reflects the polluted pool.
        expect(byId["A"].consensusError).toBeGreaterThan(0.5);
    });

    it("applies coverage scaling to partial solo coverage", () => {
        // A only scouted team 101 (perfectly): recon 10 × 2 = 20 vs 18.
        const entries = [ftcEntry({ teamNumber: 101, scoutId: "A", teleopPurpleArtifacts: 5 })];
        const signals = computeAllianceSignals(entries, allianceTeams, OFFICIAL)!;
        expect(signals[0].signal).toBeCloseTo(1 - 2 / 18, 5);
    });

    it("excludes super-scouting entries from attribution entirely", () => {
        // REGRESSION: super entries carry no counters; reconstructing a score
        // from them registered a fake ~100% error (solo super scout → signal 0)
        // or dragged reliability toward 0.5 via null marginals. They must
        // produce no signal at all.
        const entries = [
            ...perfectPair("A"),
            ftcEntry({ teamNumber: 101, scoutId: "S", scoutingMode: "super", driverSkill: 5 }),
        ];
        const signals = computeAllianceSignals(entries, allianceTeams, OFFICIAL)!;
        expect(signals.map(s => s.scoutId)).toEqual(["A"]);
        expect(signals[0].signal).toBeCloseTo(1.0, 10);
    });

    it("returns null when the only entries are super-scouting", () => {
        const entries = [
            ftcEntry({ teamNumber: 101, scoutId: "S", scoutingMode: "super", driverSkill: 4 }),
        ];
        expect(computeAllianceSignals(entries, allianceTeams, OFFICIAL)).toBeNull();
    });

    it("gives anonymous entries no signal but keeps them in the consensus error", () => {
        const entries = [
            ...perfectPair("A"),
            // Anonymous garbage: no scoutId (empty string filtered out).
            ftcEntry({ teamNumber: 101, scoutId: "", teleopPurpleArtifacts: 50 }),
        ];
        const signals = computeAllianceSignals(entries, allianceTeams, OFFICIAL)!;
        expect(signals.map(s => s.scoutId)).toEqual(["A"]);
        // A's own signal is untouched by the anonymous garbage…
        expect(signals[0].signal).toBeCloseTo(1.0, 10);
        // …but the pool-level display error shows the pollution.
        expect(signals[0].consensusError).toBeGreaterThan(0.5);
    });

    it("returns null for zero official score or empty coverage", () => {
        expect(computeAllianceSignals(perfectPair("A"), allianceTeams, 0)).toBeNull();
        expect(computeAllianceSignals([], allianceTeams, OFFICIAL)).toBeNull();
    });
});
