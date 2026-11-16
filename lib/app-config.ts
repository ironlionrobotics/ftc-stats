import "server-only";

import { cache } from "react";
import { getAdminDb } from "@/lib/firebase-admin";
import { TieredCache, withTimeout } from "@/lib/tiered-cache";
import {
    AppConfig,
    BOOLEAN_FLAGS,
    BooleanFlag,
    DEFAULT_APP_CONFIG,
    FlagSource,
    mergeAppConfig,
    diffConfig,
    type ConfigChange,
    resolveFlag,
} from "@/lib/app-config-schema";

/**
 * Server-side reader for the app-level runtime config (superadmin console).
 *
 * Storage: Firestore `app_config/global` (written ONLY via the superadmin
 * server action using the Admin SDK — client rules deny all access to the
 * collection). Read path: 60 s per-instance memory → Firestore → code defaults,
 * wrapped in React.cache so one request reads it at most once. Any failure
 * (no admin credentials, offline emulator, etc.) degrades to defaults so the
 * app never breaks because of the config system.
 *
 * Every write also appends to `admin_audit` (same batch): who, when, before,
 * after. That collection has no client rule, so Firestore's default deny
 * keeps it server-only (decision #119).
 */

const CACHE_KEY = "appconfig:global:raw";
const CACHE_TTL_SECONDS = 60;
const AUDIT = "admin_audit";

// Memory-only on purpose: the source is already a single Firestore doc, so a
// shared L2 would trade one read for another and add a write on every miss.
const memo = new TieredCache({ remote: null });

const READ_TIMEOUT_MS = 1500;
const NEGATIVE_TTL_SECONDS = 30;

/** Last document read successfully by this instance: served when Firestore fails, so kill switches don't fail open. */
let lastGood: { doc: Record<string, unknown> | null } | null = null;

interface StoredRead {
    doc: Record<string, unknown> | null;
    /** true = Firestore failed and `doc` is the last good copy (or null if none). */
    degraded: boolean;
}

/**
 * The stored document as-is (null = none). Needed to tell "config" from
 * "default". Bounded by READ_TIMEOUT_MS; on failure serves the last good copy
 * and memoizes the failure for NEGATIVE_TTL_SECONDS so a broken Firestore costs
 * one timeout per 30 s, not one per request.
 */
const readStored = cache(async (): Promise<StoredRead> => {
    const cached = await memo.get<StoredRead>(CACHE_KEY);
    if (cached) return cached;
    try {
        const snap = await withTimeout(getAdminDb().collection("app_config").doc("global").get(), READ_TIMEOUT_MS);
        const doc = snap.exists ? (snap.data() as Record<string, unknown>) : null;
        lastGood = { doc };
        const ok = { doc, degraded: false };
        await memo.set(CACHE_KEY, ok, CACHE_TTL_SECONDS);
        return ok;
    } catch (e) {
        console.warn("[app-config] read failed, serving last good copy:", (e as Error)?.message);
        const bad = { doc: lastGood?.doc ?? null, degraded: true };
        await memo.set(CACHE_KEY, bad, NEGATIVE_TTL_SECONDS);
        return bad;
    }
});

const getStoredConfig = async () => (await readStored()).doc;

/** For the admin console: refuse to show/overwrite config that wasn't actually read. */
export async function appConfigReadable(): Promise<boolean> {
    return !(await readStored()).degraded;
}

export const getAppConfig = cache(async (): Promise<AppConfig> => {
    try {
        return mergeAppConfig(await getStoredConfig());
    } catch {
        return DEFAULT_APP_CONFIG;
    }
});

export type EffectiveFlags = Record<BooleanFlag, { value: boolean; source: FlagSource }>;

/** Every boolean flag with its effective value and where it came from (env > config > default). */
export const getEffectiveFlags = cache(async (): Promise<EffectiveFlags> => {
    const [config, stored] = await Promise.all([getAppConfig(), getStoredConfig()]);
    return Object.fromEntries(BOOLEAN_FLAGS.map(f => [f, resolveFlag(f, config, stored, process.env)])) as EffectiveFlags;
});

/** Shorthand for consumers: is this flag on right now? */
export async function flagOn(flag: BooleanFlag): Promise<boolean> {
    return (await getEffectiveFlags())[flag].value;
}

export interface AuditEntry {
    id: string;
    at: number;
    by: string;
    /** Dotted paths that changed, with before/after values. */
    changes: ConfigChange[];
}

/**
 * Persists a sanitized config plus its audit entry atomically. The diff is
 * taken against the document read INSIDE the transaction (not this instance's
 * possibly stale memo), so no change escapes the audit log. Returns the
 * changes written. Other instances may serve their memo for up to
 * CACHE_TTL_SECONDS.
 */
export async function writeAppConfig(config: AppConfig, by: string): Promise<ConfigChange[]> {
    const db = getAdminDb();
    const ref = db.collection("app_config").doc("global");
    const changes = await db.runTransaction(async tx => {
        const fresh = await tx.get(ref);
        const before = mergeAppConfig(fresh.exists ? fresh.data() : undefined);
        const diff = diffConfig(before, config);
        tx.set(ref, config);
        if (diff.length) tx.set(db.collection(AUDIT).doc(), { at: Date.now(), by, changes: diff });
        return diff;
    });
    memo.forgetLocal(CACHE_KEY);
    lastGood = { doc: config as unknown as Record<string, unknown> };
    return changes;
}

/** Latest audit entries, newest first. */
export async function readAuditLog(limit = 20): Promise<AuditEntry[]> {
    const snap = await getAdminDb().collection(AUDIT).orderBy("at", "desc").limit(limit).get();
    return snap.docs.map(d => {
        const x = d.data() as Omit<AuditEntry, "id">;
        return { id: d.id, at: x.at, by: x.by, changes: x.changes ?? [] };
    });
}
