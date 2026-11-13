"use server";

import { cookies } from "next/headers";
import { isValidTeamNumber } from "@/lib/input-guards";
import { FOLLOW_TEAM_COOKIE } from "@/lib/follow-team";

/**
 * "Follow a team" without an account (plan §1): the visitor's team number is
 * kept in a cookie so server pages ("Hoy", event views) can personalize from
 * public FIRST data. Only a team number — no personal data.
 */
export async function setFollowedTeamAction(teamNumber: number | null): Promise<{ ok: boolean }> {
    const store = await cookies();
    if (teamNumber === null) {
        store.delete(FOLLOW_TEAM_COOKIE);
        return { ok: true };
    }
    if (!isValidTeamNumber(teamNumber)) return { ok: false };
    store.set(FOLLOW_TEAM_COOKIE, String(teamNumber), {
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
        sameSite: "lax",
        httpOnly: true,
    });
    return { ok: true };
}
