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
 * How many hops App Hosting's infrastructure appends to X-Forwarded-For after
 * the visitor's IP. Observed in production on 2026-11-13: a client that sends
 * no header arrives as 3 hops (`<client>, <infra>, <infra>`). We trust exactly
 * that many trailing hops — never "anything that looks like Google", because
 * Google Cloud addresses are rentable by anyone and prefix-stripping would let
 * a caller on a cloud VM pick its own rate-limit key. Override with
 * TRUSTED_PROXY_HOPS if the hosting layout changes (watch the shape log).
 */
export const DEFAULT_TRUSTED_PROXY_HOPS = 2;

const PRIVATE = /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|fe80:|::1$)/i;

function hopKind(h: string): "private" | "v6" | "v4" {
    if (PRIVATE.test(h)) return "private";
    return h.includes(":") ? "v6" : "v4";
}

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
    const tags = hops.map(hopKind);
    return `${hops.length} hops [${tags.join(", ")}]`;
}

/**
 * The visitor's IP: the hop just left of the `trustedHops` the infrastructure
 * appends. Anything further left was supplied by the caller and is ignored.
 * With fewer hops than expected (local dev, layout change) it falls back to
 * the leftmost hop, which is still a stable per-client key in those settings.
 */
export function clientIpFromForwardedFor(
    xff: string | null | undefined,
    trustedHops: number = DEFAULT_TRUSTED_PROXY_HOPS,
): string | null {
    if (!xff) return null;
    const hops = xff.split(",").map(s => s.trim()).filter(Boolean);
    if (!hops.length) return null;
    const i = hops.length - 1 - Math.max(0, trustedHops);
    const ip = hops[i >= 0 ? i : 0];
    return ip.length <= 64 ? ip : null;
}
