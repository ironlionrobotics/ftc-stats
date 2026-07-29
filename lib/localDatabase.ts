import Dexie, { type Table } from "dexie";
import { get as idbGet, del as idbDel, keys as idbKeys } from "idb-keyval";
import type { MatchScouting, PitScouting } from "@/types/scouting";
import { DEFAULT_ORG_ID, pitRecordId } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

/**
 * Pending-match-scouting row. The full MatchScouting payload is stored in
 * `data`, with key fields denormalized into top-level columns so Dexie can
 * index them — this is what enables fast "give me everything by scout X" or
 * "give me all entries for match #14 of team 30311" without scanning.
 *
 * `syncedAt = 0` is the sentinel for "pending"; once the entry is written to
 * Firestore the value becomes the epoch ms of the sync. Dexie can't index
 * `null` cleanly, hence the numeric sentinel.
 */
export interface PendingMatchRow {
    id: string;
    scoutId: string;
    orgId: string;
    teamNumber: number;
    matchNumber: number;
    eventCode: string;
    season: number;
    program: "FTC" | "FRC";
    data: MatchScouting;
    createdAt: number;
    syncedAt: number;       // 0 = pending, ms epoch = synced
    syncAttempts: number;
    lastError?: string;
}

/**
 * Pending-pit-scouting row. Unlike match scouting there is exactly ONE pit
 * record per (season, teamNumber, orgId) — a pit interview isn't repeated
 * per-match — so `id` is the SAME deterministic id Firestore uses for the
 * doc, built by the shared `pitRecordId()` in lib/constants (which is
 * dependency-free, so this module stays clear of the firebase/firestore
 * graph). Re-capturing the same team's pit data while offline `put()`s over
 * the existing queued row
 * instead of enqueuing a duplicate — which is the correct semantic, and
 * means (unlike `pendingMatches`) the drain needs no stable-local-id trick:
 * the id IS the eventual Firestore doc id from the moment it's queued.
 */
export interface PendingPitRow {
    id: string;
    season: number;
    teamNumber: number;
    orgId: string;
    data: PitScouting;
    createdAt: number;
    syncedAt: number;       // 0 = pending, ms epoch = synced
    syncAttempts: number;
    lastError?: string;
}

class LocalDatabase extends Dexie {
    pendingMatches!: Table<PendingMatchRow, string>;
    pendingPits!: Table<PendingPitRow, string>;

    constructor() {
        super("FTCStatsLocal");
        // v1 schema. Composite indices use bracket notation.
        // - `id` is the primary key (string)
        // - Indices: scoutId, orgId, eventCode, season, syncedAt, createdAt
        // - Composite indices for common query patterns
        this.version(1).stores({
            pendingMatches:
                "id, scoutId, orgId, eventCode, season, syncedAt, createdAt, " +
                "[teamNumber+matchNumber], [scoutId+syncedAt], [eventCode+syncedAt]",
        });
        // v2: adds `pendingPits` for the offline pit-scouting queue (item #15).
        // `pendingMatches` is deliberately NOT redeclared here — Dexie only
        // needs a version's `.stores()` to describe what CHANGED relative to
        // the previous version; any store omitted from a later version keeps
        // its existing schema (and rows) untouched. This is what makes the
        // v1 -> v2 upgrade safe for real users with rows already queued in
        // `pendingMatches`: Dexie runs no migration function against that
        // table at all, it's simply carried forward as-is. Verified by a
        // dedicated test in localDatabase.test.ts.
        this.version(2).stores({
            pendingPits: "id, season, teamNumber, orgId, syncedAt, createdAt, [orgId+syncedAt]",
        });
    }
}

// Lazy singleton — Dexie instances are cheap but we want exactly one per page.
let _db: LocalDatabase | null = null;
function db(): LocalDatabase {
    if (!_db) _db = new LocalDatabase();
    return _db;
}

// ---------------------------------------------------------------------------
// Legacy migration (idb-keyval → Dexie)
// ---------------------------------------------------------------------------

const LEGACY_PREFIX = "scouting_pending_";
let migrationStarted = false;

/**
 * Reads any leftover `scouting_pending_*` keys from the old idb-keyval store
 * and copies them into the Dexie table on first access. Idempotent — entries
 * already in Dexie are not duplicated because of the primary-key `put` semantics.
 *
 * Runs at most once per page session.
 */
async function migrateLegacyKeysOnce(): Promise<void> {
    if (migrationStarted) return;
    migrationStarted = true;
    if (typeof window === "undefined") return;

    try {
        const keys = await idbKeys();
        const legacyKeys = keys.filter(
            k => typeof k === "string" && k.startsWith(LEGACY_PREFIX),
        ) as string[];
        if (legacyKeys.length === 0) return;

        console.info(`[localDatabase] migrating ${legacyKeys.length} legacy entries to Dexie`);
        for (const k of legacyKeys) {
            const item = (await idbGet(k)) as MatchScouting | undefined;
            if (!item) continue;
            const id = item.id || k.slice(LEGACY_PREFIX.length);
            const row = rowFromMatchScouting({ ...item, id });
            await db().pendingMatches.put(row);
            await idbDel(k);
        }
    } catch (e) {
        console.warn("[localDatabase] legacy migration failed:", e);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rowFromMatchScouting(data: MatchScouting): PendingMatchRow {
    const scoutId = data.scoutId ?? data.scouterId ?? "unknown";
    return {
        id: data.id ?? `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        scoutId,
        orgId: data.orgId ?? DEFAULT_ORG_ID,
        teamNumber: data.teamNumber,
        matchNumber: data.matchNumber,
        eventCode: data.eventCode,
        season: data.season,
        program: data.program,
        data,
        createdAt: Date.now(),
        syncedAt: 0,
        syncAttempts: 0,
    };
}

// ---------------------------------------------------------------------------
// Public API — preserved from the idb-keyval version so call sites don't change
// ---------------------------------------------------------------------------

export async function saveToLocal(
    data: Omit<MatchScouting, "id"> & { id?: string },
): Promise<string> {
    await migrateLegacyKeysOnce();
    const filled = { ...data, id: data.id ?? `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}` } as MatchScouting;
    const row = rowFromMatchScouting(filled);
    await db().pendingMatches.put(row);
    return row.id;
}

export async function getPendingScouting(): Promise<MatchScouting[]> {
    await migrateLegacyKeysOnce();
    const rows = await db().pendingMatches.where("syncedAt").equals(0).toArray();
    return rows.map(r => r.data);
}

export async function markAsSynced(id: string): Promise<void> {
    await migrateLegacyKeysOnce();
    await db().pendingMatches.update(id, { syncedAt: Date.now() });
}

/**
 * Clears ALL local entries — both pending and synced. Preserved for backward
 * compat with the original idb-keyval implementation (which also wiped
 * everything under the legacy prefix on `clearPending`).
 */
export async function clearPending(): Promise<void> {
    await migrateLegacyKeysOnce();
    await db().pendingMatches.clear();
}

// ---------------------------------------------------------------------------
// New queries enabled by Dexie's secondary indices
// ---------------------------------------------------------------------------

/** All pending entries this specific scout has captured. */
export async function getPendingByScout(scoutId: string): Promise<MatchScouting[]> {
    await migrateLegacyKeysOnce();
    const rows = await db().pendingMatches
        .where("[scoutId+syncedAt]")
        .equals([scoutId, 0])
        .toArray();
    return rows.map(r => r.data);
}

/** All entries (pending and synced) for a specific (team, match). Useful for
 *  duplicate detection in the form UI before save. */
export async function getEntriesForTeamMatch(
    teamNumber: number,
    matchNumber: number,
): Promise<MatchScouting[]> {
    await migrateLegacyKeysOnce();
    const rows = await db().pendingMatches
        .where("[teamNumber+matchNumber]")
        .equals([teamNumber, matchNumber])
        .toArray();
    return rows.map(r => r.data);
}

/** Pending entries for a given event. */
export async function getPendingForEvent(eventCode: string): Promise<MatchScouting[]> {
    await migrateLegacyKeysOnce();
    const rows = await db().pendingMatches
        .where("[eventCode+syncedAt]")
        .equals([eventCode, 0])
        .toArray();
    return rows.map(r => r.data);
}

/**
 * Above this many failed attempts, OnlineSync stops retrying an entry (it's
 * likely a poison pill — malformed payload, permission error, etc. — and
 * would otherwise block every other pending entry behind it forever).
 */
export const MAX_SYNC_ATTEMPTS = 5;

/**
 * Pending rows including sync metadata (syncAttempts, lastError) that
 * `getPendingScouting` strips out. OnlineSync's drain loop needs this to
 * skip entries that have exhausted their retry budget.
 */
export async function getPendingScoutingRows(): Promise<PendingMatchRow[]> {
    await migrateLegacyKeysOnce();
    return db().pendingMatches.where("syncedAt").equals(0).toArray();
}

/** Records a sync failure so we can implement backoff later. */
export async function recordSyncFailure(id: string, error: string): Promise<void> {
    await migrateLegacyKeysOnce();
    const row = await db().pendingMatches.get(id);
    if (!row) return;
    await db().pendingMatches.update(id, {
        syncAttempts: row.syncAttempts + 1,
        lastError: error,
    });
}

/**
 * Rows the drain loop has given up on (syncAttempts >= MAX_SYNC_ATTEMPTS).
 * These are NOT counted by `getPendingScouting`'s callers-facing "pending"
 * concept — they're dead-lettered until a human retries or exports them, so
 * showing them as ordinary "pending" would make the badge look permanently
 * stuck. Returns full rows (not just the payload) because the UI needs
 * `lastError`/`createdAt`/etc. to explain what's wrong.
 */
export async function getStuckScoutingRows(): Promise<PendingMatchRow[]> {
    await migrateLegacyKeysOnce();
    return db().pendingMatches
        .where("syncedAt")
        .equals(0)
        .and(r => r.syncAttempts >= MAX_SYNC_ATTEMPTS)
        .toArray();
}

/**
 * Pending rows still within their retry budget — this is the count that
 * should drive the "N pend." badge (stuck rows are surfaced separately, see
 * `getStuckScoutingRows`).
 */
export async function getLivePendingScoutingRows(): Promise<PendingMatchRow[]> {
    await migrateLegacyKeysOnce();
    return db().pendingMatches
        .where("syncedAt")
        .equals(0)
        .and(r => r.syncAttempts < MAX_SYNC_ATTEMPTS)
        .toArray();
}

/**
 * Clears the dead-letter state for one row so the next `drain()` treats it
 * as a fresh attempt. Does not re-send anything itself — the actual retry
 * happens the next time OnlineSync drains the queue.
 */
export async function retryStuckRow(id: string): Promise<void> {
    await migrateLegacyKeysOnce();
    await db().pendingMatches.update(id, { syncAttempts: 0, lastError: undefined });
}

/**
 * Same as `retryStuckRow` but for every currently-stuck row at once (the
 * "Reintentar todas" bulk action). Returns how many rows were reset.
 */
export async function retryAllStuckRows(): Promise<number> {
    await migrateLegacyKeysOnce();
    const stuck = await getStuckScoutingRows();
    await Promise.all(
        stuck.map(r => db().pendingMatches.update(r.id, { syncAttempts: 0, lastError: undefined })),
    );
    return stuck.length;
}

/** Removes synced rows older than `maxAgeMs` (default 30 days) to keep the
 *  local DB small. Safe to call any time. */
export async function pruneSyncedOlderThan(maxAgeMs: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    await migrateLegacyKeysOnce();
    const cutoff = Date.now() - maxAgeMs;
    const rows = await db().pendingMatches
        .where("syncedAt")
        .above(0)
        .and(r => r.syncedAt < cutoff)
        .toArray();
    const ids = rows.map(r => r.id);
    if (ids.length === 0) return 0;
    await db().pendingMatches.bulkDelete(ids);
    return ids.length;
}

// ---------------------------------------------------------------------------
// Pit scouting queue (item #15 — pit scouting had no offline fallback)
// ---------------------------------------------------------------------------

/**
 * The Dexie row's primary key IS the eventual Firestore document id, so a
 * queued row and its synced counterpart are provably the same record. Both
 * sides build it from the same shared function — they cannot drift.
 */
const pitPendingId = pitRecordId;

function rowFromPitScouting(data: PitScouting): PendingPitRow {
    const orgId = data.orgId ?? DEFAULT_ORG_ID;
    return {
        id: pitPendingId(data.season, data.teamNumber, orgId),
        season: data.season,
        teamNumber: data.teamNumber,
        orgId,
        data,
        createdAt: Date.now(),
        syncedAt: 0,
        syncAttempts: 0,
    };
}

/**
 * Queues a pit-scouting record locally. Because the primary key is
 * deterministic (season+team+org), capturing the same team's pit data twice
 * while offline REPLACES the queued row rather than enqueuing a duplicate —
 * there is exactly one pit record per team per org per season, so this is
 * the correct semantic, not a bug.
 */
export async function savePitToLocal(data: PitScouting): Promise<string> {
    await migrateLegacyKeysOnce();
    const row = rowFromPitScouting(data);
    await db().pendingPits.put(row);
    return row.id;
}

/** Pending pit records (payload only), analogous to getPendingScouting. */
export async function getPendingPitScouting(): Promise<PitScouting[]> {
    await migrateLegacyKeysOnce();
    const rows = await db().pendingPits.where("syncedAt").equals(0).toArray();
    return rows.map(r => r.data);
}

export async function markPitAsSynced(id: string): Promise<void> {
    await migrateLegacyKeysOnce();
    await db().pendingPits.update(id, { syncedAt: Date.now() });
}

/**
 * Pending pit rows including sync metadata (syncAttempts, lastError) that
 * `getPendingPitScouting` strips out. OnlineSync's drain loop needs this to
 * skip entries that have exhausted their retry budget — analogous to
 * `getPendingScoutingRows` for matches.
 */
export async function getPendingPitRows(): Promise<PendingPitRow[]> {
    await migrateLegacyKeysOnce();
    return db().pendingPits.where("syncedAt").equals(0).toArray();
}

/** Records a pit sync failure so the drain loop's retry budget can track it. */
export async function recordPitSyncFailure(id: string, error: string): Promise<void> {
    await migrateLegacyKeysOnce();
    const row = await db().pendingPits.get(id);
    if (!row) return;
    await db().pendingPits.update(id, {
        syncAttempts: row.syncAttempts + 1,
        lastError: error,
    });
}

/**
 * Pit rows the drain loop has given up on (syncAttempts >= MAX_SYNC_ATTEMPTS).
 * Reuses the SAME threshold as match scouting — no second knob — so the
 * dead-letter semantics stay identical between the two queues.
 */
export async function getStuckPitRows(): Promise<PendingPitRow[]> {
    await migrateLegacyKeysOnce();
    return db().pendingPits
        .where("syncedAt")
        .equals(0)
        .and(r => r.syncAttempts >= MAX_SYNC_ATTEMPTS)
        .toArray();
}

/** Pit rows still within their retry budget — mirrors getLivePendingScoutingRows. */
export async function getLivePendingPitRows(): Promise<PendingPitRow[]> {
    await migrateLegacyKeysOnce();
    return db().pendingPits
        .where("syncedAt")
        .equals(0)
        .and(r => r.syncAttempts < MAX_SYNC_ATTEMPTS)
        .toArray();
}

/** Clears the dead-letter state for one pit row; the actual retry happens on
 *  the next drain(). Mirrors retryStuckRow. */
export async function retryStuckPitRow(id: string): Promise<void> {
    await migrateLegacyKeysOnce();
    await db().pendingPits.update(id, { syncAttempts: 0, lastError: undefined });
}

/** Same as retryStuckPitRow but for every currently-stuck pit row at once. */
export async function retryAllStuckPitRows(): Promise<number> {
    await migrateLegacyKeysOnce();
    const stuck = await getStuckPitRows();
    await Promise.all(
        stuck.map(r => db().pendingPits.update(r.id, { syncAttempts: 0, lastError: undefined })),
    );
    return stuck.length;
}

/** Test/dev helper: tears down the Dexie instance so a fresh schema can be
 *  used in the next test. Deleting the database drops BOTH `pendingMatches`
 *  and `pendingPits` — there is no per-table reset needed since they live in
 *  the same underlying IndexedDB database. Not exported for production
 *  callers. */
export async function __resetLocalDbForTests(): Promise<void> {
    if (_db) {
        await _db.delete();
        _db = null;
    }
    migrationStarted = false;
}
