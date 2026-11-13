import "server-only";

import { cache } from "react";
import { getAdminDb } from "@/lib/firebase-admin";
import { getRedis } from "@/lib/redis";
import { AppConfig, DEFAULT_APP_CONFIG, mergeAppConfig } from "@/lib/app-config-schema";

/**
 * Server-side reader for the app-level runtime config (superadmin console).
 *
 * Storage: Firestore `app_config/global` (written ONLY via the superadmin
 * server action using the Admin SDK — client rules deny all access to the
 * collection). Read path: short-TTL Redis cache → Firestore → code defaults,
 * wrapped in React.cache so one request reads it at most once. Any failure
 * (no admin credentials, offline emulator, etc.) degrades to defaults so the
 * app never breaks because of the config system.
 */

const CACHE_KEY = "appconfig:global";
const CACHE_TTL_SECONDS = 60;

export const getAppConfig = cache(async (): Promise<AppConfig> => {
    const redis = getRedis();
    if (redis) {
        try {
            const cached = await redis.get<AppConfig>(CACHE_KEY);
            if (cached) return mergeAppConfig(cached);
        } catch { /* cache miss path below */ }
    }

    try {
        const snap = await getAdminDb().collection("app_config").doc("global").get();
        const config = mergeAppConfig(snap.exists ? snap.data() : undefined);
        if (redis) {
            try { await redis.set(CACHE_KEY, config, { ex: CACHE_TTL_SECONDS }); } catch { /* best-effort */ }
        }
        return config;
    } catch {
        return DEFAULT_APP_CONFIG;
    }
});

/** Persists a sanitized config and busts the Redis cache. Admin-action only. */
export async function writeAppConfig(config: AppConfig): Promise<void> {
    await getAdminDb().collection("app_config").doc("global").set(config);
    const redis = getRedis();
    if (redis) {
        try { await redis.del(CACHE_KEY); } catch { /* next read repopulates */ }
    }
}
