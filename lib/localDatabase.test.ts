/**
 * Tests for the Dexie-backed local store. fake-indexeddb provides an
 * in-memory IndexedDB implementation, so we don't need a browser or jsdom.
 */

// MUST be imported BEFORE any module that loads Dexie — Dexie binds to the
// global indexedDB at module-load time.
import "fake-indexeddb/auto";

import Dexie from "dexie";
import { describe, it, expect, beforeEach } from "vitest";
import {
    saveToLocal,
    getPendingScouting,
    getPendingScoutingRows,
    getPendingByScout,
    getEntriesForTeamMatch,
    getPendingForEvent,
    markAsSynced,
    clearPending,
    recordSyncFailure,
    pruneSyncedOlderThan,
    getStuckScoutingRows,
    getLivePendingScoutingRows,
    retryStuckRow,
    retryAllStuckRows,
    MAX_SYNC_ATTEMPTS,
    savePitToLocal,
    getPendingPitScouting,
    getPendingPitRows,
    markPitAsSynced,
    recordPitSyncFailure,
    getStuckPitRows,
    getLivePendingPitRows,
    retryStuckPitRow,
    retryAllStuckPitRows,
    __resetLocalDbForTests,
} from "./localDatabase";
import type { FTCMatchScouting, PitScouting } from "@/types/scouting";

beforeEach(async () => {
    await __resetLocalDbForTests();
});

function makeFTCEntry(overrides: Partial<FTCMatchScouting> = {}): Omit<FTCMatchScouting, "id"> {
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
        timestamp: null,
        ...overrides,
    } as Omit<FTCMatchScouting, "id">;
}

describe("saveToLocal + getPendingScouting", () => {
    it("round-trips a single entry", async () => {
        const id = await saveToLocal(makeFTCEntry());
        const pending = await getPendingScouting();
        expect(pending).toHaveLength(1);
        expect(pending[0].id).toBe(id);
        expect(pending[0].teamNumber).toBe(30311);
    });

    it("auto-generates an id if none is supplied", async () => {
        const id = await saveToLocal(makeFTCEntry());
        expect(id).toMatch(/^local_/);
    });

    it("preserves a supplied id (e.g. on QR re-import)", async () => {
        const id = await saveToLocal({ ...makeFTCEntry(), id: "from-qr-001" });
        expect(id).toBe("from-qr-001");
    });

    it("excludes synced entries from getPendingScouting", async () => {
        const id1 = await saveToLocal(makeFTCEntry({ matchNumber: 1 }));
        const id2 = await saveToLocal(makeFTCEntry({ matchNumber: 2 }));
        await markAsSynced(id1);

        const pending = await getPendingScouting();
        expect(pending).toHaveLength(1);
        expect(pending[0].matchNumber).toBe(2);
        // id2 is still there
        expect(pending[0].id).toBe(id2);
    });
});

describe("indexed queries", () => {
    beforeEach(async () => {
        // Seed: 3 scouts × 2 matches × 1 team
        await saveToLocal(makeFTCEntry({ scoutId: "A", scouterId: "A", matchNumber: 1 }));
        await saveToLocal(makeFTCEntry({ scoutId: "A", scouterId: "A", matchNumber: 2 }));
        await saveToLocal(makeFTCEntry({ scoutId: "B", scouterId: "B", matchNumber: 1 }));
        await saveToLocal(makeFTCEntry({ scoutId: "C", scouterId: "C", matchNumber: 1, eventCode: "MXMTY" }));
    });

    it("getPendingByScout filters by scoutId AND syncedAt=0", async () => {
        const aOnly = await getPendingByScout("A");
        expect(aOnly).toHaveLength(2);
        expect(aOnly.every(e => e.scoutId === "A")).toBe(true);

        const bOnly = await getPendingByScout("B");
        expect(bOnly).toHaveLength(1);
    });

    it("getPendingByScout excludes synced entries", async () => {
        const aEntries = await getPendingByScout("A");
        await markAsSynced(aEntries[0].id!);
        const remaining = await getPendingByScout("A");
        expect(remaining).toHaveLength(1);
    });

    it("getEntriesForTeamMatch returns all scouts' observations for a (team, match)", async () => {
        const m1 = await getEntriesForTeamMatch(30311, 1);
        // 3 entries for match 1 (A, B, C) — note C is also for team 30311
        expect(m1).toHaveLength(3);
        const scoutIds = m1.map(e => e.scoutId).sort();
        expect(scoutIds).toEqual(["A", "B", "C"]);
    });

    it("getPendingForEvent scopes to an event code AND pending only", async () => {
        const mxtol = await getPendingForEvent("MXTOL");
        expect(mxtol).toHaveLength(3); // A:1, A:2, B:1
        const mxmty = await getPendingForEvent("MXMTY");
        expect(mxmty).toHaveLength(1); // C:1
    });
});

describe("sync failure tracking", () => {
    it("recordSyncFailure bumps the counter and stores the error", async () => {
        const id = await saveToLocal(makeFTCEntry());
        await recordSyncFailure(id, "Firestore offline");
        await recordSyncFailure(id, "Firestore offline");

        const pending = await getPendingScouting();
        // Counter survives because the row is still pending
        expect(pending).toHaveLength(1);
        // The error/counter live on the row itself, not the MatchScouting payload,
        // so we'd need a getter to inspect them — but for v1 we just verify
        // the entry is still pending after failures.
    });
});

describe("getPendingScoutingRows (M2 poison-pill support)", () => {
    it("exposes syncAttempts/lastError so callers can decide whether to keep retrying", async () => {
        const id = await saveToLocal(makeFTCEntry());
        await recordSyncFailure(id, "Firestore offline");
        await recordSyncFailure(id, "Firestore offline");

        const rows = await getPendingScoutingRows();
        expect(rows).toHaveLength(1);
        expect(rows[0].id).toBe(id);
        expect(rows[0].syncAttempts).toBe(2);
        expect(rows[0].lastError).toBe("Firestore offline");
        expect(rows[0].data.teamNumber).toBe(30311);
    });

    it("excludes synced entries, same as getPendingScouting", async () => {
        const id1 = await saveToLocal(makeFTCEntry({ matchNumber: 1 }));
        await saveToLocal(makeFTCEntry({ matchNumber: 2 }));
        await markAsSynced(id1);

        const rows = await getPendingScoutingRows();
        expect(rows).toHaveLength(1);
        expect(rows[0].data.matchNumber).toBe(2);
    });

    it("a poison-pill entry's syncAttempts can reach MAX_SYNC_ATTEMPTS without wiping the row", async () => {
        const id = await saveToLocal(makeFTCEntry());
        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
            await recordSyncFailure(id, `attempt ${i}`);
        }

        const rows = await getPendingScoutingRows();
        // Still present (and still pending) — OnlineSync's drain loop is what
        // decides to stop retrying via the syncAttempts >= MAX_SYNC_ATTEMPTS
        // check, not the data layer silently dropping it.
        expect(rows).toHaveLength(1);
        expect(rows[0].syncAttempts).toBe(MAX_SYNC_ATTEMPTS);
    });
});

describe("stuck vs live pending partitioning (item #12)", () => {
    it("getStuckScoutingRows / getLivePendingScoutingRows split on MAX_SYNC_ATTEMPTS", async () => {
        const stuckId = await saveToLocal(makeFTCEntry({ matchNumber: 1 }));
        const liveId = await saveToLocal(makeFTCEntry({ matchNumber: 2 }));
        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
            await recordSyncFailure(stuckId, "permission-denied");
        }
        await recordSyncFailure(liveId, "transient blip");

        const stuck = await getStuckScoutingRows();
        expect(stuck).toHaveLength(1);
        expect(stuck[0].id).toBe(stuckId);
        expect(stuck[0].lastError).toBe("permission-denied");

        const live = await getLivePendingScoutingRows();
        expect(live).toHaveLength(1);
        expect(live[0].id).toBe(liveId);
    });

    it("synced rows never show up as stuck, even past the attempt threshold", async () => {
        const id = await saveToLocal(makeFTCEntry());
        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
            await recordSyncFailure(id, "attempt");
        }
        await markAsSynced(id);

        expect(await getStuckScoutingRows()).toHaveLength(0);
        expect(await getLivePendingScoutingRows()).toHaveLength(0);
    });

    it("retryStuckRow resets syncAttempts/lastError so the row moves back to live", async () => {
        const id = await saveToLocal(makeFTCEntry());
        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
            await recordSyncFailure(id, "attempt");
        }
        expect(await getStuckScoutingRows()).toHaveLength(1);

        await retryStuckRow(id);

        expect(await getStuckScoutingRows()).toHaveLength(0);
        const live = await getLivePendingScoutingRows();
        expect(live).toHaveLength(1);
        expect(live[0].syncAttempts).toBe(0);
        expect(live[0].lastError).toBeUndefined();
    });

    it("retryAllStuckRows resets every stuck row and reports the count", async () => {
        const id1 = await saveToLocal(makeFTCEntry({ matchNumber: 1 }));
        const id2 = await saveToLocal(makeFTCEntry({ matchNumber: 2 }));
        const liveId = await saveToLocal(makeFTCEntry({ matchNumber: 3 }));
        for (const id of [id1, id2]) {
            for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
                await recordSyncFailure(id, "attempt");
            }
        }
        await recordSyncFailure(liveId, "one transient failure");

        const resetCount = await retryAllStuckRows();
        expect(resetCount).toBe(2);
        expect(await getStuckScoutingRows()).toHaveLength(0);
        expect(await getLivePendingScoutingRows()).toHaveLength(3);
    });
});

describe("pruneSyncedOlderThan", () => {
    it("deletes only synced entries older than the cutoff", async () => {
        const id1 = await saveToLocal(makeFTCEntry({ matchNumber: 1 }));
        const id2 = await saveToLocal(makeFTCEntry({ matchNumber: 2 }));
        const id3 = await saveToLocal(makeFTCEntry({ matchNumber: 3 }));

        await markAsSynced(id1); // recently synced
        await markAsSynced(id2); // recently synced
        // id3 still pending

        // Sleep just enough that Date.now() at prune time is strictly greater
        // than the syncedAt timestamps. Without this, fast machines can have
        // markAsSynced and pruneSyncedOlderThan land on the same ms tick and
        // the strict `<` comparison in pruneSyncedOlderThan filters them out.
        await new Promise(r => setTimeout(r, 5));
        const pruned = await pruneSyncedOlderThan(0);
        // Both id1 and id2 are synced; with maxAge=0, both should be pruned.
        expect(pruned).toBe(2);

        const remaining = await getPendingScouting();
        expect(remaining).toHaveLength(1);
        expect(remaining[0].id).toBe(id3);
    });
});

describe("clearPending wipes everything", () => {
    it("removes pending AND synced rows alike", async () => {
        const id1 = await saveToLocal(makeFTCEntry({ matchNumber: 1 }));
        await saveToLocal(makeFTCEntry({ matchNumber: 2 }));
        await markAsSynced(id1);

        await clearPending();

        expect(await getPendingScouting()).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// Pit scouting offline queue (item #15)
// ---------------------------------------------------------------------------

function makePitEntry(overrides: Partial<PitScouting> = {}): PitScouting {
    return {
        teamNumber: 30311,
        season: 2025,
        orgId: "30311",
        robotName: "Iron Lion Bot",
        driveTrain: "Mecanno",
        notes: "",
        ...overrides,
    };
}

describe("v1 -> v2 schema upgrade preserves pendingMatches (migration safety)", () => {
    it("existing pendingMatches rows survive the upgrade that adds pendingPits", async () => {
        // Start from a clean slate so this test doesn't inherit state from a
        // previous test's Dexie instance.
        await __resetLocalDbForTests();

        // Simulate a real user's browser BEFORE this feature shipped: a raw
        // Dexie connection opened against the v1-only schema (no pendingPits
        // table at all), with a row already queued in pendingMatches.
        const legacyDb = new Dexie("FTCStatsLocal");
        legacyDb.version(1).stores({
            pendingMatches:
                "id, scoutId, orgId, eventCode, season, syncedAt, createdAt, " +
                "[teamNumber+matchNumber], [scoutId+syncedAt], [eventCode+syncedAt]",
        });
        await legacyDb.open();
        await legacyDb.table("pendingMatches").put({
            id: "legacy-1",
            scoutId: "scout-A",
            orgId: "30311",
            teamNumber: 30311,
            matchNumber: 1,
            eventCode: "MXTOL",
            season: 2025,
            program: "FTC",
            data: { ...makeFTCEntry(), id: "legacy-1" },
            createdAt: Date.now(),
            syncedAt: 0,
            syncAttempts: 0,
        });
        legacyDb.close();

        // Now go through the app's real (v1 + v2) LocalDatabase. Dexie opens
        // the same underlying "FTCStatsLocal" database, sees it's at version
        // 1, and runs the v2 upgrade — which only ADDS pendingPits and does
        // not touch pendingMatches at all.
        const pending = await getPendingScouting();
        expect(pending).toHaveLength(1);
        expect(pending[0].id).toBe("legacy-1");
        expect(pending[0].teamNumber).toBe(30311);

        // And the newly-added table is fully usable in the same session.
        const pitId = await savePitToLocal(makePitEntry());
        const pits = await getPendingPitScouting();
        expect(pits).toHaveLength(1);
        expect(pits[0].robotName).toBe("Iron Lion Bot");
        expect(pitId).toBe("2025_30311_30311");
    });
});

describe("savePitToLocal + getPendingPitScouting", () => {
    it("round-trips a single pit record with the deterministic id", async () => {
        const id = await savePitToLocal(makePitEntry());
        expect(id).toBe("2025_30311_30311");

        const pending = await getPendingPitScouting();
        expect(pending).toHaveLength(1);
        expect(pending[0].teamNumber).toBe(30311);
    });

    it("re-queuing the same team/org/season REPLACES the row instead of duplicating it", async () => {
        await savePitToLocal(makePitEntry({ robotName: "First draft" }));
        await savePitToLocal(makePitEntry({ robotName: "Updated after re-interview" }));

        const pending = await getPendingPitScouting();
        // Still exactly one row — the deterministic id collapsed the second
        // capture onto the first instead of enqueuing a duplicate.
        expect(pending).toHaveLength(1);
        expect(pending[0].robotName).toBe("Updated after re-interview");
    });

    it("a different org queues a SEPARATE row for the same team", async () => {
        await savePitToLocal(makePitEntry({ orgId: "30311" }));
        await savePitToLocal(makePitEntry({ orgId: "9999" }));

        const pending = await getPendingPitScouting();
        expect(pending).toHaveLength(2);
    });

    it("excludes synced pit rows from getPendingPitScouting", async () => {
        const id = await savePitToLocal(makePitEntry());
        await markPitAsSynced(id);

        expect(await getPendingPitScouting()).toHaveLength(0);
    });

    it("getPendingPitRows exposes sync metadata for the drain loop", async () => {
        const id = await savePitToLocal(makePitEntry());
        await recordPitSyncFailure(id, "Firestore offline");

        const rows = await getPendingPitRows();
        expect(rows).toHaveLength(1);
        expect(rows[0].syncAttempts).toBe(1);
        expect(rows[0].lastError).toBe("Firestore offline");
        expect(rows[0].data.robotName).toBe("Iron Lion Bot");
    });
});

describe("pit stuck vs live partitioning", () => {
    it("getStuckPitRows / getLivePendingPitRows split on MAX_SYNC_ATTEMPTS", async () => {
        const stuckId = await savePitToLocal(makePitEntry({ orgId: "30311" }));
        const liveId = await savePitToLocal(makePitEntry({ orgId: "9999" }));
        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
            await recordPitSyncFailure(stuckId, "permission-denied");
        }
        await recordPitSyncFailure(liveId, "transient blip");

        const stuck = await getStuckPitRows();
        expect(stuck).toHaveLength(1);
        expect(stuck[0].id).toBe(stuckId);

        const live = await getLivePendingPitRows();
        expect(live).toHaveLength(1);
        expect(live[0].id).toBe(liveId);
    });

    it("retryStuckPitRow resets syncAttempts/lastError so the row moves back to live", async () => {
        const id = await savePitToLocal(makePitEntry());
        for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
            await recordPitSyncFailure(id, "attempt");
        }
        expect(await getStuckPitRows()).toHaveLength(1);

        await retryStuckPitRow(id);

        expect(await getStuckPitRows()).toHaveLength(0);
        const live = await getLivePendingPitRows();
        expect(live).toHaveLength(1);
        expect(live[0].syncAttempts).toBe(0);
        expect(live[0].lastError).toBeUndefined();
    });

    it("retryAllStuckPitRows resets every stuck pit row and reports the count", async () => {
        const id1 = await savePitToLocal(makePitEntry({ orgId: "30311" }));
        const id2 = await savePitToLocal(makePitEntry({ orgId: "9999" }));
        const liveId = await savePitToLocal(makePitEntry({ orgId: "8888" }));
        for (const id of [id1, id2]) {
            for (let i = 0; i < MAX_SYNC_ATTEMPTS; i++) {
                await recordPitSyncFailure(id, "attempt");
            }
        }
        await recordPitSyncFailure(liveId, "one transient failure");

        const resetCount = await retryAllStuckPitRows();
        expect(resetCount).toBe(2);
        expect(await getStuckPitRows()).toHaveLength(0);
        expect(await getLivePendingPitRows()).toHaveLength(3);
    });
});
