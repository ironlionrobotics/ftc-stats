import { isValidTeamNumber, normalizeEventCode } from "@/lib/input-guards";

/**
 * What a visitor follows besides "my team" (decision #110): events and teams
 * whose live state "Hoy" shows and whose changes can be pushed. Works without
 * an account (cookie, like pride_team); signed-in users mirror it in
 * users/{uid}.follows so it travels between devices. Only event codes and
 * team numbers — public FIRST identifiers, never personal data.
 */

export const FOLLOWS_COOKIE = "pride_follows";
export const MAX_FOLLOWS = 10;

export interface Follows {
    events: string[];
    teams: number[];
}

export const EMPTY_FOLLOWS: Follows = { events: [], teams: [] };

function cleanEvents(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const r of raw) {
        const code = normalizeEventCode(r);
        if (code && !out.includes(code)) out.push(code);
        if (out.length === MAX_FOLLOWS) break;
    }
    return out;
}

function cleanTeams(raw: unknown): number[] {
    if (!Array.isArray(raw)) return [];
    const out: number[] = [];
    for (const r of raw) {
        const n = typeof r === "string" ? Number(r) : r;
        if (isValidTeamNumber(n) && !out.includes(n)) out.push(n);
        if (out.length === MAX_FOLLOWS) break;
    }
    return out;
}

/** Validated follows from any untrusted shape (cookie JSON, user doc, action input). */
export function normalizeFollows(raw: unknown): Follows {
    const o = (raw && typeof raw === "object" ? raw : {}) as { events?: unknown; teams?: unknown; e?: unknown; t?: unknown };
    return { events: cleanEvents(o.events ?? o.e), teams: cleanTeams(o.teams ?? o.t) };
}

/** Cookie value → follows; garbage or absent → empty. */
export function parseFollows(raw: string | undefined): Follows {
    if (!raw) return EMPTY_FOLLOWS;
    try {
        return normalizeFollows(JSON.parse(raw));
    } catch {
        return EMPTY_FOLLOWS;
    }
}

/** Compact cookie value ({"e":[...],"t":[...]}): ≤ ~250 bytes at the caps. */
export function serializeFollows(f: Follows): string {
    return JSON.stringify({ e: f.events, t: f.teams });
}

export function isFollowing(f: Follows, kind: "event" | "team", value: string | number): boolean {
    return kind === "event" ? f.events.includes(String(value)) : f.teams.includes(Number(value));
}

/** Adds or removes one item. `capped` = it wasn't added because the list is full. */
export function toggleFollow(f: Follows, kind: "event" | "team", value: string | number): { follows: Follows; capped: boolean } {
    if (kind === "event") {
        const code = normalizeEventCode(value);
        if (!code) return { follows: f, capped: false };
        if (f.events.includes(code)) return { follows: { ...f, events: f.events.filter(e => e !== code) }, capped: false };
        if (f.events.length >= MAX_FOLLOWS) return { follows: f, capped: true };
        return { follows: { ...f, events: [...f.events, code] }, capped: false };
    }
    const n = Number(value);
    if (!isValidTeamNumber(n)) return { follows: f, capped: false };
    if (f.teams.includes(n)) return { follows: { ...f, teams: f.teams.filter(t => t !== n) }, capped: false };
    if (f.teams.length >= MAX_FOLLOWS) return { follows: f, capped: true };
    return { follows: { ...f, teams: [...f.teams, n] }, capped: false };
}

/** Union (a first), capped — used when a device's cookie meets the account's list. */
export function mergeFollows(a: Follows, b: Follows): Follows {
    return normalizeFollows({ events: [...a.events, ...b.events], teams: [...a.teams, ...b.teams] });
}

export function sameFollows(a: Follows, b: Follows): boolean {
    return a.events.length === b.events.length && a.teams.length === b.teams.length
        && a.events.every(e => b.events.includes(e)) && a.teams.every(t => b.teams.includes(t));
}
