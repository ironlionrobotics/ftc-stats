import { describe, it, expect } from "vitest";
import type { FTCMatchScouting } from "@/types/scouting";
import {
    aggregateMatchTeam,
    aggregateNumeric,
    aggregateCategorical,
    aggregateSubjective,
    aggregateNotes,
    aggregateEventEntries,
    CONFIDENCE_WEIGHTS,
} from "./scouting-aggregation";

// Helper: builds a minimal FTC entry with the boilerplate filled in. Callers
// override the fields they care about per test.
function entry(overrides: Partial<FTCMatchScouting>): FTCMatchScouting {
    return {
        teamNumber: 30311,
        eventCode: "MXTOL",
        matchNumber: 1,
        season: 2025,
        program: "FTC",
        orgId: "30311",
        scoutId: "scout-A",
        scoutName: "Alice",
        scouterId: "scout-A",
        scouterName: "Alice",
        confidence: "high",
        notes: "",
        timestamp: { seconds: 1000, nanoseconds: 0 },
        // FTC IntoTheDeep fields with defaults
        autoParked: false,
        autoLaunchLine: false,
        autoPurpleArtifacts: 0,
        autoGreenArtifacts: 0,
        autoMotifStarted: false,
        movementRP: false,
        autoPoints: 0,
        teleopPurpleArtifacts: 0,
        teleopGreenArtifacts: 0,
        patternsCompleted: 0,
        gatesUsed: false,
        driverSkill: 3,
        endgameBaseParking: "None",
        dualParking: false,
        motifCompleted: false,
        goalRP: false,
        patternRP: false,
        ...overrides,
    };
}

describe("aggregateNumeric", () => {
    it("returns 0 with no contributors", () => {
        const out = aggregateNumeric([], "autoPurpleArtifacts", {});
        expect(out.value).toBe(0);
        expect(out.contributors).toHaveLength(0);
        expect(out.flagged).toBe(false);
    });

    it("returns the single value when only one scout contributed", () => {
        const out = aggregateNumeric(
            [entry({ autoPurpleArtifacts: 4 })],
            "autoPurpleArtifacts",
            {},
        );
        expect(out.value).toBe(4);
        expect(out.flagged).toBe(false); // single sample never flagged
    });

    it("weighted-averages numeric agreements (equal weights)", () => {
        const out = aggregateNumeric(
            [
                entry({ scoutId: "A", scouterId: "A", autoPurpleArtifacts: 4 }),
                entry({ scoutId: "B", scouterId: "B", autoPurpleArtifacts: 6 }),
            ],
            "autoPurpleArtifacts",
            {},
        );
        expect(out.value).toBe(5);
        expect(out.flagged).toBe(false); // 20% CoV under threshold
    });

    it("downweights low-confidence entries", () => {
        // High-confidence scout reports 10, low-confidence reports 0.
        // With weights 1.0 vs 0.3 the mean should be biased toward 10.
        const out = aggregateNumeric(
            [
                entry({ scoutId: "A", scouterId: "A", confidence: "high", autoPurpleArtifacts: 10 }),
                entry({ scoutId: "B", scouterId: "B", confidence: "low", autoPurpleArtifacts: 0 }),
            ],
            "autoPurpleArtifacts",
            {},
        );
        // Expected = (10 * 1.0 + 0 * 0.3) / 1.3 ≈ 7.69
        expect(out.value).toBeCloseTo(10 / 1.3, 2);
    });

    it("flags numeric disagreement above the CoV threshold", () => {
        const out = aggregateNumeric(
            [
                entry({ scoutId: "A", scouterId: "A", autoPurpleArtifacts: 1 }),
                entry({ scoutId: "B", scouterId: "B", autoPurpleArtifacts: 10 }),
            ],
            "autoPurpleArtifacts",
            {},
        );
        expect(out.flagged).toBe(true);
    });

    it("incorporates scout reliability from the registry", () => {
        // Unreliable scout A (0.1) vs reliable scout B (1.0).
        const out = aggregateNumeric(
            [
                entry({ scoutId: "A", scouterId: "A", autoPurpleArtifacts: 100 }),
                entry({ scoutId: "B", scouterId: "B", autoPurpleArtifacts: 0 }),
            ],
            "autoPurpleArtifacts",
            { A: 0.1, B: 1.0 },
        );
        // Effective weights: 0.1*1.0=0.1 vs 1.0*1.0=1.0 → mean ≈ 100*0.1/(1.1) ≈ 9.09
        expect(out.value).toBeCloseTo(9.09, 1);
    });

    it("ignores entries with zero effective weight", () => {
        const out = aggregateNumeric(
            [
                entry({ scoutId: "A", scouterId: "A", autoPurpleArtifacts: 4 }),
                entry({ scoutId: "B", scouterId: "B", autoPurpleArtifacts: 999 }),
            ],
            "autoPurpleArtifacts",
            { B: 0 },
        );
        expect(out.value).toBe(4);
        expect(out.contributors).toHaveLength(1);
    });
});

describe("aggregateCategorical", () => {
    it("picks the weighted-majority value without flagging a 2/3 supermajority", () => {
        const out = aggregateCategorical(
            [
                entry({ scoutId: "A", scouterId: "A", endgameBaseParking: "Full" }),
                entry({ scoutId: "B", scouterId: "B", endgameBaseParking: "Full" }),
                entry({ scoutId: "C", scouterId: "C", endgameBaseParking: "Partial" }),
            ],
            "endgameBaseParking",
            {},
        );
        expect(out.value).toBe("Full");
        expect(out.confidence).toBeCloseTo(2 / 3, 2);
        // 2/3 ≈ 0.667 sits above the 0.66 flag threshold — decent consensus, no flag.
        expect(out.flagged).toBe(false);
    });

    it("flags a 50/50 split", () => {
        const out = aggregateCategorical(
            [
                entry({
                    scoutId: "A",
                    scouterId: "A",
                    endgameBaseParking: "Full",
                    timestamp: { seconds: 100, nanoseconds: 0 },
                }),
                entry({
                    scoutId: "B",
                    scouterId: "B",
                    endgameBaseParking: "Partial",
                    timestamp: { seconds: 200, nanoseconds: 0 },
                }),
            ],
            "endgameBaseParking",
            {},
        );
        expect(out.confidence).toBeCloseTo(0.5, 2);
        expect(out.flagged).toBe(true);
    });

    it("breaks ties by latest timestamp", () => {
        const out = aggregateCategorical(
            [
                entry({
                    scoutId: "A",
                    scouterId: "A",
                    endgameBaseParking: "Full",
                    timestamp: { seconds: 100, nanoseconds: 0 },
                }),
                entry({
                    scoutId: "B",
                    scouterId: "B",
                    endgameBaseParking: "Partial",
                    timestamp: { seconds: 200, nanoseconds: 0 },
                }),
            ],
            "endgameBaseParking",
            {},
        );
        expect(out.value).toBe("Partial");
    });

    it("flags low-confidence categorical consensus", () => {
        // 4 different scouts pick 3 different values — confidence is ~0.5 max
        const out = aggregateCategorical(
            [
                entry({ scoutId: "A", scouterId: "A", endgameBaseParking: "Full" }),
                entry({ scoutId: "B", scouterId: "B", endgameBaseParking: "Partial" }),
                entry({ scoutId: "C", scouterId: "C", endgameBaseParking: "None" }),
            ],
            "endgameBaseParking",
            {},
        );
        expect(out.flagged).toBe(true);
    });

    it("does not flag when only a single scout contributed", () => {
        const out = aggregateCategorical(
            [entry({ endgameBaseParking: "Full" })],
            "endgameBaseParking",
            {},
        );
        // confidence is 1.0 because there's only one entry; not flagged
        expect(out.confidence).toBe(1);
        expect(out.flagged).toBe(false);
    });

    it("handles booleans", () => {
        const out = aggregateCategorical(
            [
                entry({ scoutId: "A", scouterId: "A", goalRP: true }),
                entry({ scoutId: "B", scouterId: "B", goalRP: true }),
                entry({ scoutId: "C", scouterId: "C", goalRP: false }),
            ],
            "goalRP",
            {},
        );
        expect(out.value).toBe(true);
    });
});

describe("aggregateSubjective", () => {
    it("keeps per-org buckets separate (no cross-org mixing)", () => {
        const out = aggregateSubjective(
            [
                entry({ orgId: "30311", scoutId: "A", scouterId: "A", driverSkill: 5 }),
                entry({ orgId: "30311", scoutId: "B", scouterId: "B", driverSkill: 4 }),
                entry({ orgId: "16768", scoutId: "C", scouterId: "C", driverSkill: 2 }),
            ],
            "driverSkill",
        );
        expect(out.perOrg["30311"].value).toBe(4.5);
        expect(out.perOrg["30311"].count).toBe(2);
        expect(out.perOrg["16768"].value).toBe(2);
        expect(out.perOrg["16768"].count).toBe(1);
        // Verify no merged "overall" value exists — that's the whole point.
        expect(Object.keys(out.perOrg).sort()).toEqual(["16768", "30311"]);
    });
});

describe("aggregateNotes", () => {
    it("returns notes sorted newest-first with attribution", () => {
        const out = aggregateNotes([
            entry({
                scoutId: "A",
                scouterId: "A",
                scoutName: "Alice",
                scouterName: "Alice",
                notes: "Old note",
                timestamp: { seconds: 100, nanoseconds: 0 },
            }),
            entry({
                scoutId: "B",
                scouterId: "B",
                scoutName: "Bob",
                scouterName: "Bob",
                notes: "New note",
                timestamp: { seconds: 500, nanoseconds: 0 },
            }),
        ]);
        expect(out.entries).toHaveLength(2);
        expect(out.entries[0].text).toBe("New note");
        expect(out.entries[0].scoutName).toBe("Bob");
        expect(out.entries[1].text).toBe("Old note");
    });

    it("skips empty and whitespace-only notes", () => {
        const out = aggregateNotes([
            entry({ notes: "" }),
            entry({ notes: "   " }),
            entry({ notes: "real" }),
        ]);
        expect(out.entries).toHaveLength(1);
        expect(out.entries[0].text).toBe("real");
    });
});

describe("aggregateMatchTeam", () => {
    it("returns null on empty input", () => {
        expect(aggregateMatchTeam([])).toBeNull();
    });

    it("produces fields, notes, and sourceSummary in one pass", () => {
        const result = aggregateMatchTeam([
            entry({
                orgId: "30311",
                scoutId: "A",
                scouterId: "A",
                autoPurpleArtifacts: 4,
                driverSkill: 5,
                goalRP: true,
                notes: "Great auto",
            }),
            entry({
                orgId: "16768",
                scoutId: "B",
                scouterId: "B",
                autoPurpleArtifacts: 6,
                driverSkill: 3,
                goalRP: true,
                notes: "Robot disconnected briefly",
            }),
        ]);
        expect(result).not.toBeNull();
        expect(result!.sourceSummary.entryCount).toBe(2);
        expect(result!.sourceSummary.orgCount).toBe(2);
        expect(result!.sourceSummary.orgIds.sort()).toEqual(["16768", "30311"]);

        // Numeric consensus exists for autoPurpleArtifacts
        const auto = result!.fields["autoPurpleArtifacts"];
        expect(auto.kind).toBe("numeric");
        if (auto.kind === "numeric") expect(auto.value).toBe(5);

        // Subjective driverSkill kept per-org
        const skill = result!.fields["driverSkill"];
        expect(skill.kind).toBe("subjective");
        if (skill.kind === "subjective") {
            expect(skill.perOrg["30311"].value).toBe(5);
            expect(skill.perOrg["16768"].value).toBe(3);
        }

        // Boolean categorical agreement
        const goalRP = result!.fields["goalRP"];
        expect(goalRP.kind).toBe("categorical");
        if (goalRP.kind === "categorical") expect(goalRP.value).toBe(true);

        // Notes attribute
        const notes = result!.fields["notes"];
        expect(notes.kind).toBe("text-list");
        if (notes.kind === "text-list") expect(notes.entries).toHaveLength(2);
    });

    it("treats legacy entries without orgId as 'unknown'", () => {
        const e = entry({ orgId: undefined });
        const result = aggregateMatchTeam([e]);
        expect(result!.sourceSummary.orgIds).toEqual(["unknown"]);
    });

    it("uses confidence weights from CONFIDENCE_WEIGHTS", () => {
        // Sanity check that the exported constant matches the doc's table.
        expect(CONFIDENCE_WEIGHTS.high).toBe(1.0);
        expect(CONFIDENCE_WEIGHTS.medium).toBe(0.6);
        expect(CONFIDENCE_WEIGHTS.low).toBe(0.3);
    });
});

describe("Super-scouting mode integration", () => {
    it("super entries do NOT contribute to numeric objective consensus", () => {
        const result = aggregateMatchTeam([
            entry({
                scoutId: "A",
                scouterId: "A",
                scoutingMode: "match",
                autoPurpleArtifacts: 10,
            }),
            entry({
                scoutId: "B",
                scouterId: "B",
                scoutingMode: "super",
                // super scout left counters undefined; even if the type allows it,
                // the value should be skipped.
                autoPurpleArtifacts: undefined as unknown as number,
                driverSkill: 5,
                wouldPick: true,
            }),
        ]);
        const auto = result!.fields["autoPurpleArtifacts"];
        expect(auto.kind).toBe("numeric");
        if (auto.kind === "numeric") {
            // Only scout A contributed to the numeric consensus.
            expect(auto.value).toBe(10);
            expect(auto.contributors).toHaveLength(1);
        }
    });

    it("super entries DO contribute to subjective consensus", () => {
        const result = aggregateMatchTeam([
            entry({
                orgId: "30311",
                scoutId: "A",
                scouterId: "A",
                scoutingMode: "match",
                driverSkill: 4,
            }),
            entry({
                orgId: "30311",
                scoutId: "B",
                scouterId: "B",
                scoutingMode: "super",
                autoPurpleArtifacts: undefined as unknown as number,
                driverSkill: 5,
            }),
        ]);
        const skill = result!.fields["driverSkill"];
        expect(skill.kind).toBe("subjective");
        if (skill.kind === "subjective") {
            // Both entries (from the same org) average to 4.5.
            expect(skill.perOrg["30311"].value).toBe(4.5);
            expect(skill.perOrg["30311"].count).toBe(2);
        }
    });

    it("wouldPick is aggregated as categorical from both modes", () => {
        const result = aggregateMatchTeam([
            entry({ scoutId: "A", scouterId: "A", scoutingMode: "super", wouldPick: true }),
            entry({ scoutId: "B", scouterId: "B", scoutingMode: "super", wouldPick: true }),
            entry({ scoutId: "C", scouterId: "C", scoutingMode: "super", wouldPick: false }),
        ]);
        const pick = result!.fields["wouldPick"];
        expect(pick.kind).toBe("categorical");
        if (pick.kind === "categorical") {
            expect(pick.value).toBe(true);
            expect(pick.contributors).toHaveLength(3);
        }
    });
});

describe("aggregateEventEntries", () => {
    it("groups by (matchNumber, teamNumber) and aggregates each group", () => {
        const all = [
            entry({ matchNumber: 1, teamNumber: 30311 }),
            entry({ matchNumber: 1, teamNumber: 30311, scoutId: "B", scouterId: "B" }),
            entry({ matchNumber: 1, teamNumber: 16768 }),
            entry({ matchNumber: 2, teamNumber: 30311 }),
        ];
        const out = aggregateEventEntries(all);
        expect(out).toHaveLength(3); // (1,30311), (1,16768), (2,30311)
        const m1_30311 = out.find(a => a.matchNumber === 1 && a.teamNumber === 30311);
        expect(m1_30311!.sourceSummary.entryCount).toBe(2);
    });
});
