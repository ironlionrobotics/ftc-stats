import "server-only";

import { cache } from "react";
import { getAdminDb } from "@/lib/firebase-admin";
import { TieredCache } from "@/lib/tiered-cache";
import { AppConfig, DEFAULT_APP_CONFIG, mergeAppConfig } from "@/lib/app-config-schema";

/**
 * Server-side reader for the app-level runtime config (superadmin console).
 *
 * Storage: Firestore `app_config/global` (written ONLY via the superadmin
 * server action using the Admin SDK — client rules deny all access to the
 * collection). Read path: 60 s per-instance memory → Firestore → code defaults,
 * wrapped in React.cache so one request reads it at most once. Any failure
 * (no admin credentials, offline emulator, etc.) degrades to defaults so the
 * app never breaks because of the config system.
 */

const CACHE_KEY = "appconfig:global";
const CACHE_TTL_SECONDS = 60;

// Memory-only on purpose: the source is already a single Firestore doc, so a
// shared L2 would trade one read for another and add a write on every miss.
const memo = new TieredCache({ remote: null });

export const getAppConfig = cache(async (): Promise<AppConfig> => {
    const cached = await memo.get<AppConfig>(CACHE_KEY);
    if (cached) return mergeAppConfig(cached);

    try {
        const snap = await getAdminDb().collection("app_config").doc("global").get();
        const config = mergeAppConfig(snap.exists ? snap.data() : undefined);
        await memo.set(CACHE_KEY, config, CACHE_TTL_SECONDS);
        return config;
    } catch {
        return DEFAULT_APP_CONFIG;
    }
});

/**
 * Persists a sanitized config and busts the cache. Admin-action only. Other
 * instances may serve their in-memory copy for up to CACHE_TTL_SECONDS.
 */
export async function writeAppConfig(config: AppConfig): Promise<void> {
    await getAdminDb().collection("app_config").doc("global").set(config);
    memo.forgetLocal(CACHE_KEY);
}
