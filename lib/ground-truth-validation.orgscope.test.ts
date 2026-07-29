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

interface FakeRef {
    __collection: string;
    __id: string;
    get(): Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
}

/**
 * Minimal in-memory Firestore that applies the recorded equality filters and
 * models batched writes: staged operations only land on commit(), so a test
 * can assert that a failed run writes nothing.
 */
function fakeDb(
    scoutingDocs: MatchScouting[],
    users: Record<string, Record<string, unknown> | undefined>,
    priorRun?: Record<string, unknown>,
) {
    const updates: Array<{ uid: string; data: Record<string, unknown> }> = [];
    const runWrites: Array<{ id: string; data: Record<string, unknown> }> = [];
    const capturedFilters: Array<[string, string, unknown]> = [];

    const makeRef = (collection: string, id: string): FakeRef => ({
        __collection: collection,
        __id: id,
        async get() {
            if (collection === "users") {
                const data = users[id];
                return { exists: data !== undefined, data: () => data };
            }
            return { exists: priorRun !== undefined, data: () => priorRun };
        },
    });

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
            if (name === "users" || name === "ground_truth_runs") {
                return { doc: (id: string) => makeRef(name, id) };
            }
            throw new Error("unexpected collection: " + name);
        },
        batch() {
            const staged: Array<{ ref: FakeRef; data: Record<string, unknown> }> = [];
            return {
                update(ref: FakeRef, data: Record<string, unknown>) { staged.push({ ref, data }); },
                set(ref: FakeRef, data: Record<string, unknown>) { staged.push({ ref, data }); },
                async commit() {
                    for (const op of staged) {
                        if (op.ref.__collection === "users") updates.push({ uid: op.ref.__id, data: op.data });
                        else runWrites.push({ id: op.ref.__id, data: op.data });
                    }
                },
            };
        },
    };

    return { db, updates, runWrites, capturedFilters };
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

describe("runGroundTruthValidation — idempotency", () => {
    const perfectScout = () => [
        entry({ teamNumber: 101, scoutId: "A", orgId: "30311", teleopPurpleArtifacts: 5 }),
        entry({ teamNumber: 102, scoutId: "A", orgId: "30311", teleopPurpleArtifacts: 4 }),
    ];
    const users = () => ({ A: { orgId: "30311", reliability: 0.5 } });

    it("records the consumed entry ids alongside the reliability write", async () => {
        const { db, updates, runWrites } = fakeDb(perfectScout(), users());
        getAdminDbMock.mockReturnValue(db);

        const report = await runGroundTruthValidation(2025, "MXTOL", "30311");

        expect(updates).toHaveLength(1);
        expect(runWrites).toHaveLength(1);
        // Marker id is org × season × event, and it claims exactly the entries
        // that were folded in — the invariant that makes re-runs safe.
        expect(runWrites[0].id).toBe("30311__2025__MXTOL");
        expect(runWrites[0].data.processedEntryIds).toEqual(["doc0", "doc1"]);
        expect(report.entriesConsumed).toBe(2);
        expect(report.entriesAlreadyCounted).toBe(0);
        expect(report.previousRunAt).toBeNull();
    });

    it("does not move reliability a second time when re-run on the same entries", async () => {
        // This is the bug: an EWMA applied twice moves the score twice.
        const prior = {
            orgId: "30311", season: 2025, eventCode: "MXTOL",
            ranAt: "2025-01-02T00:00:00Z",
            processedEntryIds: ["doc0", "doc1"],
        };
        const { db, updates, runWrites } = fakeDb(perfectScout(), users(), prior);
        getAdminDbMock.mockReturnValue(db);

        const report = await runGroundTruthValidation(2025, "MXTOL", "30311");

        expect(updates).toHaveLength(0);
        expect(runWrites).toHaveLength(0);
        expect(report.scoutsUpdated).toBe(0);
        expect(report.entriesConsumed).toBe(0);
        expect(report.entriesAlreadyCounted).toBe(2);
        expect(report.previousRunAt).toBe("2025-01-02T00:00:00Z");
    });

    it("counts only the new entries when a re-run finds additional scouting", async () => {
        // Mid-event run, then more scouting arrives: the second run must fold
        // in ONLY the new entry, not re-apply the first one.
        const docs = [
            ...perfectScout(),
            entry({ teamNumber: 101, scoutId: "D", orgId: "30311", teleopPurpleArtifacts: 5 }),
        ];
        const prior = {
            orgId: "30311", season: 2025, eventCode: "MXTOL",
            ranAt: "2025-01-02T00:00:00Z",
            processedEntryIds: ["doc0", "doc1"],
        };
        const { db, updates, runWrites } = fakeDb(docs, { ...users(), D: { orgId: "30311", reliability: 0.5 } }, prior);
        getAdminDbMock.mockReturnValue(db);

        const report = await runGroundTruthValidation(2025, "MXTOL", "30311");

        expect(updates.map(u => u.uid)).toEqual(["D"]);
        expect(report.entriesAlreadyCounted).toBe(2);
        // The marker accumulates: prior ids plus the newly consumed one.
        expect(runWrites[0].data.processedEntryIds).toEqual(["doc0", "doc1", "doc2"]);
    });

    it("leaves entries unconsumed when their match has not been played", async () => {
        // Otherwise a mid-event run would permanently burn entries whose
        // official score didn't exist yet.
        fetchMatchesMock.mockResolvedValue([{ ...playedMatch(), postResultTime: null, scoreRedFinal: 0 }]);
        const { db, updates, runWrites } = fakeDb(perfectScout(), users());
        getAdminDbMock.mockReturnValue(db);

        const report = await runGroundTruthValidation(2025, "MXTOL", "30311");

        expect(updates).toHaveLength(0);
        expect(runWrites).toHaveLength(0);   // nothing claimed
        expect(report.entriesConsumed).toBe(0);
    });
});
