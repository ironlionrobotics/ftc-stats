import { describe, it, expect, vi, beforeEach } from "vitest";
import type { FTCMatchScouting, MatchScouting } from "@/types/scouting";

// C4 regression: runGroundTruthValidation must be scoped to a single org so an
// admin/lead of one org can't overwrite the reliability of scouts in another.
// We drive it with a fake Firestore + fetchMatches so we can assert exactly
// which user docs get written.

const { fetchMatchesMock, getAdminDbMock } = vi.hoisted(() => ({
    fetchMatchesMock: vi.fn(),
    getAdminDbMock: vi.fn(),
}));
vi.mock("@/lib/ftc-api", () => ({ fetchMatches: fetchMatchesMock }));
vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: getAdminDbMock }));

import { runGroundTruthValidation } from "./ground-truth-validation";

function entry(overrides: Partial<FTCMatchScouting> & Pick<FTCMatchScouting, "teamNumber" | "scoutId" | "orgId">): MatchScouting {
    return {
        eventCode: "MXTOL",
        season: 2025,
        matchNumber: 1,
        program: "FTC",
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

// One played match: red = teams 101 (5 purple = 10) + 102 (4 purple = 8) = 18.
// Blue has no score so it's skipped.
function playedMatch() {
    return {
        matchNumber: 1,
        tournamentLevel: "QUALIFICATION",
        postResultTime: "2025-01-01T00:00:00Z",
        scoreRedFinal: 18,
        scoreBlueFinal: 0,
        teams: [
            { teamNumber: 101, station: "Red1" },
            { teamNumber: 102, station: "Red2" },
            { teamNumber: 201, station: "Blue1" },
            { teamNumber: 202, station: "Blue2" },
        ],
    };
}

/** Minimal in-memory Firestore that actually applies the recorded equality filters. */
function fakeDb(scoutingDocs: MatchScouting[], users: Record<string, Record<string, unknown> | undefined>) {
    const updates: Array<{ uid: string; data: Record<string, unknown> }> = [];
    const capturedFilters: Array<[string, string, unknown]> = [];

    const db = {
        collection(name: string) {
            if (name === "match_scouting") {
                const filters: Array<[string, string, unknown]> = [];
                const builder = {
                    where(field: string, op: string, value: unknown) {
                        filters.push([field, op, value]);
                        capturedFilters.push([field, op, value]);
                        return builder;
                    },
                    async get() {
                        const docs = scoutingDocs
                            .filter(d => filters.every(([f, , v]) => (d as unknown as Record<string, unknown>)[f] === v))
                            .map((d, i) => ({ id: `doc${i}`, data: () => d }));
                        return { docs };
                    },
                };
                return builder;
            }
            if (name === "users") {
                return {
                    doc(uid: string) {
                        return {
                            async get() {
                                const data = users[uid];
                                return { exists: data !== undefined, data: () => data };
                            },
                            async update(data: Record<string, unknown>) {
                                updates.push({ uid, data });
                            },
                        };
                    },
                };
            }
            throw new Error("unexpected collection: " + name);
        },
    };

    return { db, updates, capturedFilters };
}

beforeEach(() => {
    fetchMatchesMock.mockReset();
    getAdminDbMock.mockReset();
    fetchMatchesMock.mockResolvedValue([playedMatch()]);
});

describe("runGroundTruthValidation — org scoping (C4)", () => {
    it("only updates the caller org's scouts, never another org's", async () => {
        // Scout A (org 30311) and scout B (org 9999) both perfectly scout the
        // same red alliance. Validation is run for org 30311.
        const scoutingDocs = [
            entry({ teamNumber: 101, scoutId: "A", orgId: "30311", teleopPurpleArtifacts: 5 }),
            entry({ teamNumber: 102, scoutId: "A", orgId: "30311", teleopPurpleArtifacts: 4 }),
            entry({ teamNumber: 101, scoutId: "B", orgId: "9999", teleopPurpleArtifacts: 5 }),
            entry({ teamNumber: 102, scoutId: "B", orgId: "9999", teleopPurpleArtifacts: 4 }),
        ];
        const users = {
            A: { orgId: "30311", reliability: 0.5 },
            B: { orgId: "9999", reliability: 0.5 },
        };
        const { db, updates, capturedFilters } = fakeDb(scoutingDocs, users);
        getAdminDbMock.mockReturnValue(db);

        const report = await runGroundTruthValidation(2025, "MXTOL", "30311");

        // The query is scoped by orgId.
        expect(capturedFilters).toContainEqual(["orgId", "==", "30311"]);
        // Only scout A (org 30311) was written — B's doc is untouched.
        expect(updates.map(u => u.uid)).toEqual(["A"]);
        expect(report.scoutsUpdated).toBe(1);
        // A scouted perfectly → signal 1 → EWMA 0.8·0.5 + 0.2·1 = 0.6.
        expect(updates[0].data.reliability).toBeCloseTo(0.6, 10);
    });

    it("skips a scout who has since moved to another org (defensive guard)", async () => {
        // Entry is attributed to org 30311 (so it passes the query), but scout
        // C's CURRENT user doc says org 9999 — writing it would be a cross-org
        // write. It must be skipped.
        const scoutingDocs = [
            entry({ teamNumber: 101, scoutId: "C", orgId: "30311", teleopPurpleArtifacts: 5 }),
            entry({ teamNumber: 102, scoutId: "C", orgId: "30311", teleopPurpleArtifacts: 4 }),
        ];
        const users = { C: { orgId: "9999", reliability: 0.5 } };
        const { db, updates } = fakeDb(scoutingDocs, users);
        getAdminDbMock.mockReturnValue(db);

        const report = await runGroundTruthValidation(2025, "MXTOL", "30311");

        expect(updates).toHaveLength(0);
        expect(report.scoutsUpdated).toBe(0);
    });
});
