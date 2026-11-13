/**
 * Validation for untrusted inputs reaching public (anonymous) server actions
 * and routes (decision #91). Every one of them fans out to the FIRST API and
 * writes the server cache, so junk inputs must be rejected before any I/O:
 * otherwise each unique junk value costs API quota and a cache write.
 *
 * Pure and isomorphic — unit-tested in lib/input-guards.test.ts.
 */

/** First FTC season the app supports (oldest backtested data). */
export const MIN_SEASON = 2019;

/** A season the FIRST API can serve: MIN_SEASON..current+1 (kickoff overlap). */
export function isValidSeason(season: unknown, currentSeason: number): season is number {
    return typeof season === "number"
        && Number.isInteger(season)
        && season >= MIN_SEASON
        && season <= currentSeason + 1;
}

/** Parses a season from a URL/cookie string; undefined if absent or invalid. */
export function parseSeason(raw: unknown, currentSeason: number): number | undefined {
    if (raw === undefined || raw === null || raw === "") return undefined;
    const n = typeof raw === "number" ? raw : Number(raw);
    return isValidSeason(n, currentSeason) ? n : undefined;
}

/** FIRST event codes are short alphanumerics (e.g. MXTLQ, USCAFRQ1). */
const EVENT_CODE = /^[A-Z0-9]{2,20}$/;

/** Upper-cased event code, or null when it can't be one. */
export function normalizeEventCode(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const code = raw.trim().toUpperCase();
    return EVENT_CODE.test(code) ? code : null;
}

export const MAX_TEAM_NUMBER = 99_999;

export function isValidTeamNumber(n: unknown): n is number {
    return typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= MAX_TEAM_NUMBER;
}

/** Integer clamped to [min, max]; `fallback` when not a finite number. */
export function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
    const n = typeof raw === "number" ? raw : Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, Math.round(n)));
}

/** ISO date (YYYY-MM-DD) or undefined. */
export function parseIsoDate(raw: unknown): string | undefined {
    if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined;
    return Number.isNaN(Date.parse(raw)) ? undefined : raw;
}

/** Region filter values: ISO-ish country/state codes or names, short and plain. */
export function parseRegion(raw: unknown): string | undefined {
    if (typeof raw !== "string") return undefined;
    const r = raw.trim();
    return /^[\p{L}\p{N} .'-]{1,40}$/u.test(r) ? r : undefined;
}

// ---------------------------------------------------------------------------
// Client identity for per-visitor rate limits
// ---------------------------------------------------------------------------

/**
 * Google Front End / Cloud Load Balancing proxy ranges. App Hosting (Cloud
 * Run behind Google's load balancer) appends `<client-ip>, <proxy-ip>` to
 * X-Forwarded-For; anything to the left of the client IP was supplied by the
 * caller and is untrusted. We strip trailing proxy hops and take the
 * rightmost remaining entry.
 */
const TRUSTED_PROXY_PREFIXES = ["35.191.", "130.211.0.", "130.211.1.", "130.211.2.", "130.211.3."];

/**
 * Rate-limit key for an IP: IPv6 grouped by /64 (one subscriber's prefix, so
 * rotating addresses inside it doesn't evade the limit); IPv4 as-is.
 */
export function limiterKeyForIp(ip: string): string {
    if (!ip.includes(":")) return ip;
    const groups = ip.toLowerCase().split("::")[0].split(":").filter(Boolean);
    return groups.slice(0, 4).join(":") + "::/64";
}

/** Shape of an X-Forwarded-For header for diagnostics — never the IPs themselves. */
export function forwardedForShape(xff: string | null | undefined): string {
    if (!xff) return "absent";
    const hops = xff.split(",").map(s => s.trim()).filter(Boolean);
    const tags = hops.map(h => (TRUSTED_PROXY_PREFIXES.some(p => h.startsWith(p)) ? "gproxy" : h.includes(":") ? "v6" : "v4"));
    return `${hops.length} hops [${tags.join(", ")}]`;
}

export function clientIpFromForwardedFor(xff: string | null | undefined): string | null {
    if (!xff) return null;
    const hops = xff.split(",").map(s => s.trim()).filter(Boolean);
    while (hops.length > 1 && TRUSTED_PROXY_PREFIXES.some(p => hops[hops.length - 1].startsWith(p))) hops.pop();
    const ip = hops[hops.length - 1];
    return ip && ip.length <= 64 ? ip : null;
}
