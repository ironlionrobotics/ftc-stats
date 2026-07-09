import Dexie, { type Table } from "dexie";
import { get as idbGet, del as idbDel, keys as idbKeys } from "idb-keyval";
import type { MatchScouting } from "@/types/scouting";
import { DEFAULT_ORG_ID } from "@/lib/orgs";

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

class LocalDatabase extends Dexie {
    pendingMatches!: Table<PendingMatchRow, string>;

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

/** Test/dev helper: tears down the Dexie instance so a fresh schema can be
 *  used in the next test. Not exported for production callers. */
export async function __resetLocalDbForTests(): Promise<void> {
    if (_db) {
        await _db.delete();
        _db = null;
    }
    migrationStarted = false;
}
