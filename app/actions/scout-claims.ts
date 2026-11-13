"use server";

import { createHash } from "node:crypto";
import { getAdminDb } from "@/lib/firebase-admin";
import { callerWithTeam, allowUser } from "@/lib/server-caller";
import { ensureAliases } from "@/lib/pool-aliases";
import { fetchEvents, fetchHybridSchedule } from "@/lib/ftc-api";
import { normalizeEventCode, parseSeason, isValidTeamNumber } from "@/lib/input-guards";
import { getCurrentSeason } from "@/lib/constants";
import { applyClaim, releaseScout, claimDocId, scheduledQuals, type ClaimDoc } from "@/lib/scout-claims";
import type { ErrorCode } from "@/lib/errors";

/**
 * Scout assignment board (decision #103). Claims live in scout_claims, which
 * clients of any approved team can READ (onSnapshot) but only these actions
 * write: the caller's team alias and an opaque scout hash are derived here
 * from the verified token, so nobody can claim in another team's name.
 */

type Result<T = object> = ({ ok: true } & T) | { ok: false; code: ErrorCode };

/** Opaque per-event scout id: lets a scout recognize its own claims without exposing its uid. */
function scoutHash(uid: string, season: number, eventCode: string): string {
    return createHash("sha256").update(`${uid}:${season}:${eventCode}`).digest("base64url").slice(0, 16);
}

function parseTarget(input: { season: number; eventCode: string; matchNumber: number }): { season: number; eventCode: string; matchNumber: number } | ErrorCode {
    const season = parseSeason(input.season, getCurrentSeason());
    if (season === undefined) return "validation.season";
    const eventCode = normalizeEventCode(input.eventCode);
    if (!eventCode) return "validation.eventCode";
    if (!Number.isInteger(input.matchNumber) || input.matchNumber < 1 || input.matchNumber > 999) return "validation.matchNumberPositive";
    return { season, eventCode, matchNumber: input.matchNumber };
}

/** The caller's alias and scout hash at an event (to highlight "mine" on the board). */
export async function myScoutIdentityAction(input: { idToken: string; season: number; eventCode: string }): Promise<Result<{ alias: string; scout: string }>> {
    const target = parseTarget({ ...input, matchNumber: 1 });
    if (typeof target === "string") return { ok: false, code: target };
    const who = await callerWithTeam(input.idToken);
    if (!who.ok) return who;
    if (!(await allowUser("claims", who.caller.uid, 60))) return { ok: false, code: "rateLimited" };
    // Only real events get an alias table (no pool_aliases docs for invented codes).
    if (!(await fetchEvents(target.season)).some(e => e.code === target.eventCode)) return { ok: false, code: "validation.eventCode" };
    try {
        const aliases = await ensureAliases(target.season, target.eventCode, [who.caller.orgId]);
        return { ok: true, alias: aliases[who.caller.orgId], scout: scoutHash(who.caller.uid, target.season, target.eventCode) };
    } catch (e) {
        console.error("[claims] identity failed:", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
}

export async function claimRobotAction(input: { idToken: string; season: number; eventCode: string; matchNumber: number; teamNumber: number }): Promise<Result> {
    const target = parseTarget(input);
    if (typeof target === "string") return { ok: false, code: target };
    if (!isValidTeamNumber(input.teamNumber)) return { ok: false, code: "validation.teamNumber" };
    const who = await callerWithTeam(input.idToken);
    if (!who.ok) return who;
    if (!(await allowUser("claims", who.caller.uid, 60))) return { ok: false, code: "rateLimited" };

    // Only robots actually on the field of that qualification match.
    const match = scheduledQuals(await fetchHybridSchedule(target.season, target.eventCode), true)
        .find(m => m.matchNumber === target.matchNumber);
    if (!match || ![...match.red, ...match.blue].includes(input.teamNumber)) {
        return { ok: false, code: "validation.teamNumber" };
    }

    try {
        const aliases = await ensureAliases(target.season, target.eventCode, [who.caller.orgId]);
        const scout = scoutHash(who.caller.uid, target.season, target.eventCode);
        const db = getAdminDb();
        const ref = db.collection("scout_claims").doc(claimDocId(target.season, target.eventCode, "QUALIFICATION", target.matchNumber));
        await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            const doc = snap.exists ? (snap.data() as ClaimDoc) : null;
            const claims = applyClaim(doc?.claims ?? {}, input.teamNumber, { alias: aliases[who.caller.orgId], scout, at: Date.now() });
            tx.set(ref, {
                season: target.season,
                eventCode: target.eventCode,
                level: "QUALIFICATION",
                matchNumber: target.matchNumber,
                claims,
            } satisfies ClaimDoc);
        });
        return { ok: true };
    } catch (e) {
        console.error("[claims] claim failed:", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
}

export async function releaseRobotAction(input: { idToken: string; season: number; eventCode: string; matchNumber: number }): Promise<Result> {
    const target = parseTarget(input);
    if (typeof target === "string") return { ok: false, code: target };
    const who = await callerWithTeam(input.idToken);
    if (!who.ok) return who;
    if (!(await allowUser("claims", who.caller.uid, 60))) return { ok: false, code: "rateLimited" };
    try {
        const scout = scoutHash(who.caller.uid, target.season, target.eventCode);
        const db = getAdminDb();
        const ref = db.collection("scout_claims").doc(claimDocId(target.season, target.eventCode, "QUALIFICATION", target.matchNumber));
        await db.runTransaction(async tx => {
            const snap = await tx.get(ref);
            if (!snap.exists) return;
            const doc = snap.data() as ClaimDoc;
            tx.update(ref, { claims: releaseScout(doc.claims ?? {}, scout) });
        });
        return { ok: true };
    } catch (e) {
        console.error("[claims] release failed:", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
}
