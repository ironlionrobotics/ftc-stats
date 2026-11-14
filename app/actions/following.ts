"use server";

import { cookies } from "next/headers";
import { allowRequest } from "@/lib/request-guard";
import { getCurrentSeason } from "@/lib/constants";
import { FOLLOWS_COOKIE, parseFollows, serializeFollows, toggleFollow, normalizeFollows, type Follows } from "@/lib/follows";
import { loadFollowingSnapshot, type FollowingSnapshot } from "@/lib/following-snapshot";

/**
 * Follow events and teams without an account (decision #110). Same cookie
 * pattern as pride_team (setFollowedTeamAction): httpOnly, a year, only
 * event codes and team numbers. The server re-reads the cookie on every call,
 * so a client can't make the poller fetch arbitrary lists.
 */

const COOKIE_OPTS = { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" as const, httpOnly: true };

async function readFollows(): Promise<Follows> {
    return parseFollows((await cookies()).get(FOLLOWS_COOKIE)?.value);
}

async function writeFollows(f: Follows): Promise<void> {
    const store = await cookies();
    if (f.events.length === 0 && f.teams.length === 0) store.delete(FOLLOWS_COOKIE);
    else store.set(FOLLOWS_COOKIE, serializeFollows(f), COOKIE_OPTS);
}

export async function toggleFollowAction(kind: "event" | "team", value: string | number): Promise<{ ok: boolean; follows: Follows; capped: boolean }> {
    if (kind !== "event" && kind !== "team") return { ok: false, follows: await readFollows(), capped: false };
    const { follows, capped } = toggleFollow(await readFollows(), kind, value);
    await writeFollows(follows);
    return { ok: true, follows, capped };
}

/** Replaces the device list (signing in merges the account's list into it). */
export async function replaceFollowsAction(raw: unknown): Promise<{ ok: boolean; follows: Follows }> {
    const follows = normalizeFollows(raw);
    await writeFollows(follows);
    return { ok: true, follows };
}

/** Polled every 60 s by the "Siguiendo" panel while visible. Never throws (#64). */
export async function fetchFollowingSnapshotAction(): Promise<{ ok: true; snapshot: FollowingSnapshot } | { ok: false; error: string }> {
    try {
        if (!(await allowRequest("light"))) return { ok: false, error: "rateLimited" };
        return { ok: true, snapshot: await loadFollowingSnapshot(await readFollows(), getCurrentSeason()) };
    } catch (e) {
        console.error("[following] snapshot failed:", e);
        return { ok: false, error: "unavailable" };
    }
}
