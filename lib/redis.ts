import "server-only";
import { Redis } from "@upstash/redis";

// Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from env.
// If either is missing we return a no-op client so that the app keeps working
// without caching (degraded performance, not broken).
function createClient(): Redis | null {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        if (process.env.NODE_ENV !== "test") {
            console.warn(
                "[redis] UPSTASH_REDIS_REST_URL/TOKEN not configured — analytical cache disabled. " +
                "Sign up at https://upstash.com and set the env vars."
            );
        }
        return null;
    }
    return new Redis({ url, token });
}

let _client: Redis | null | undefined;

export function getRedis(): Redis | null {
    if (_client === undefined) _client = createClient();
    return _client;
}

// Returns true if Redis is configured and reachable for analytical cache reads/writes.
export function isRedisEnabled(): boolean {
    return getRedis() !== null;
}
