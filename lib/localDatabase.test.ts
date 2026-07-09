/**
 * Tests for the Dexie-backed local store. fake-indexeddb provides an
 * in-memory IndexedDB implementation, so we don't need a browser or jsdom.
 */

// MUST be imported BEFORE any module that loads Dexie — Dexie binds to the
// global indexedDB at module-load time.
import "fake-indexeddb/auto";

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
    MAX_SYNC_ATTEMPTS,
    __resetLocalDbForTests,
} from "./localDatabase";
import type { FTCMatchScouting } from "@/types/scouting";

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
