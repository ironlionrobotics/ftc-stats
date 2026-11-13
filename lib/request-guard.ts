import "server-only";
import { headers } from "next/headers";
import { clientIpFromForwardedFor, forwardedForShape, limiterKeyForIp } from "@/lib/input-guards";
import { FixedWindowLimiter } from "@/lib/rate-limiter";

/**
 * Per-visitor rate limits for anonymous server actions (decision #91).
 *
 * Callers count only cache MISSES (the FIRST API fan-out we protect), so even
 * if the client-IP derivation were wrong and every visitor shared one bucket,
 * normal cached traffic would never hit the limit.
 *
 * In-memory, per server instance (maxInstances = 4, so the effective ceiling
 * is ≤4× the limit). Deliberately NOT in Firestore: a shared counter would add
 * a transaction (latency + cost) to every public call, and 50 concurrent calls
 * from one venue Wi-Fi would contend on the same document. The goal is to stop
 * scripted fan-out against the FIRST API, not to meter people.
 *
 * Limits are generous: a whole team on one venue Wi-Fi shares an IP, and one
 * legitimate page (an event's team list) issues ~50 calls.
 *  - "fanout": actions that fan out to the FIRST API per event/team.
 *  - "light": single-call lookups.
 */
const limiters = {
    fanout: new FixedWindowLimiter(240, 60),
    light: new FixedWindowLimiter(600, 60),
};

export type GuardBucket = keyof typeof limiters;

// Each distinct X-Forwarded-For layout is logged once per instance (capped)
// so it can be confirmed in production logs (decision #91) — hop kinds only,
// never the IPs.
const shapesLogged = new Set<string>();

async function visitorKey(): Promise<string> {
    try {
        const xff = (await headers()).get("x-forwarded-for");
        const shape = forwardedForShape(xff);
        if (!shapesLogged.has(shape) && shapesLogged.size < 20) {
            shapesLogged.add(shape);
            console.info(`[rate-limit] x-forwarded-for shape: ${shape}`);
        }
        const ip = clientIpFromForwardedFor(xff);
        return ip ? limiterKeyForIp(ip) : "unknown";
    } catch {
        return "unknown"; // outside a request scope (scripts/tests)
    }
}

/** True when the visitor is within the bucket's limit (and counts this call). */
export async function allowRequest(bucket: GuardBucket): Promise<boolean> {
    const ok = limiters[bucket].hit(await visitorKey());
    if (!ok) console.warn(`[rate-limit] ${bucket} limit hit`);
    return ok;
}
