"use server";

import { getAdminDb } from "@/lib/firebase-admin";
import { serverCache } from "@/lib/server-cache";
import { ensureAliases } from "@/lib/pool-aliases";
import { callerWithTeam, allowUser } from "@/lib/server-caller";
import { normalizeEventCode, parseSeason, isValidTeamNumber } from "@/lib/input-guards";
import { getCurrentSeason } from "@/lib/constants";
import { gameDefinitionFor } from "@/lib/games/registry";
import {
    buildEventPool,
    contributionCount,
    POOL_UNLOCK_MIN_ENTRIES,
    type PoolTeamSummary,
} from "@/lib/scouting-pool";
import type { ErrorCode } from "@/lib/errors";
import type { BaseMatchScouting } from "@/types/scouting";

/**
 * Shared scouting pool of an event (decision #102). The ONLY path by which one
 * team sees another team's scouting: match_scouting stays own-org in the
 * rules, and this action returns objective consensus with pseudonymous
 * sources — never notes, subjective ratings, scout names or org ids.
 *
 * Reciprocity gate: the caller's team must have contributed
 * POOL_UNLOCK_MIN_ENTRIES objective captures at the event.
 */

export interface PitShare {
    source: string;
    text: string;
}

export type EventPoolResult =
    | { ok: true; locked: true; myCount: number; needed: number }
    | {
        ok: true;
        locked: false;
        myCount: number;
        needed: number;
        myAlias: string;
        sourceCount: number;
        teams: PoolTeamSummary[];
        /** Public pit summaries for the requested team (only with teamNumber). */
        pit: PitShare[];
    }
    | { ok: false; code: ErrorCode };

interface EventSnapshot {
    entries: BaseMatchScouting[];
    reliabilities: Record<string, number>;
    aliases: Record<string, string>;
}

const SNAPSHOT_TTL_S = 60;
const MAX_ENTRIES = 5000;

/** Raw entries + scout reliabilities + aliases of an event, cached 60 s across callers. */
async function eventSnapshot(season: number, eventCode: string): Promise<EventSnapshot> {
    const key = `pool_v1_${season}_${eventCode}`;
    const cached = await serverCache.get<EventSnapshot>(key);
    if (cached) return cached;

    const db = getAdminDb();
    const snap = await db.collection("match_scouting")
        .where("season", "==", season)
        .where("eventCode", "==", eventCode)
        .limit(MAX_ENTRIES)
        .get();
    // Firestore Timestamps are reduced to plain seconds so the snapshot can be cached as JSON.
    const entries = snap.docs.map(d => {
        const data = d.data() as BaseMatchScouting & { timestamp?: { seconds?: number; _seconds?: number } | null };
        const seconds = data.timestamp?.seconds ?? data.timestamp?._seconds ?? 0;
        return { ...data, id: d.id, timestamp: { seconds, nanoseconds: 0 } } as BaseMatchScouting;
    });

    const scoutIds = [...new Set(entries.map(e => e.scoutId ?? e.scouterId).filter(Boolean))];
    const reliabilities: Record<string, number> = {};
    if (scoutIds.length > 0) {
        const docs = await db.getAll(...scoutIds.map(id => db.collection("users").doc(id)));
        for (const d of docs) {
            const r = d.exists ? (d.data() as { reliability?: number }).reliability : undefined;
            if (typeof r === "number" && Number.isFinite(r)) reliabilities[d.id] = r;
        }
    }

    const orgIds = [...new Set(entries.map(e => e.orgId).filter((o): o is string => !!o))];
    const aliases = await ensureAliases(season, eventCode, orgIds);

    const out = { entries, reliabilities, aliases };
    await serverCache.set(key, out, SNAPSHOT_TTL_S);
    return out;
}

export async function getEventPoolAction(input: {
    idToken: string;
    season: number;
    eventCode: string;
    teamNumber?: number;
}): Promise<EventPoolResult> {
    const current = getCurrentSeason();
    const season = parseSeason(input.season, current);
    if (season === undefined) return { ok: false, code: "validation.season" };
    const eventCode = normalizeEventCode(input.eventCode);
    if (!eventCode) return { ok: false, code: "validation.eventCode" };
    if (input.teamNumber !== undefined && !isValidTeamNumber(input.teamNumber)) {
        return { ok: false, code: "validation.teamNumber" };
    }

    const who = await callerWithTeam(input.idToken);
    if (!who.ok) return who;
    const { caller } = who;
    if (!(await allowUser("pool", caller.uid, 60))) return { ok: false, code: "rateLimited" };

    const def = gameDefinitionFor("FTC", season);
    if (!def) return { ok: false, code: "generic" };

    try {
        const snap = await eventSnapshot(season, eventCode);
        const myCount = contributionCount(snap.entries, caller.orgId);
        if (myCount < POOL_UNLOCK_MIN_ENTRIES) {
            return { ok: true, locked: true, myCount, needed: POOL_UNLOCK_MIN_ENTRIES };
        }
        const teams = buildEventPool(snap.entries, def, snap.reliabilities, snap.aliases, input.teamNumber);
        const pit = input.teamNumber !== undefined
            ? await publicPitSummaries(season, input.teamNumber, eventCode, snap.aliases)
            : [];
        return {
            ok: true,
            locked: false,
            myCount,
            needed: POOL_UNLOCK_MIN_ENTRIES,
            myAlias: snap.aliases[caller.orgId] ?? "?",
            sourceCount: Object.keys(snap.aliases).length,
            teams,
            pit,
        };
    } catch (e) {
        console.error("[pool] failed:", e);
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
}

/**
 * Opt-in public pit summaries of one team (the `publicSummary` field only;
 * private notes in the same document never leave the server).
 */
async function publicPitSummaries(
    season: number,
    teamNumber: number,
    eventCode: string,
    aliases: Record<string, string>,
): Promise<PitShare[]> {
    const snap = await getAdminDb().collection("pit_scouting")
        .where("season", "==", season)
        .where("teamNumber", "==", teamNumber)
        .get();
    const out: PitShare[] = [];
    const needAlias: string[] = [];
    for (const d of snap.docs) {
        const data = d.data() as { orgId?: string; publicSummary?: string };
        const text = (data.publicSummary ?? "").trim();
        if (!text || !data.orgId) continue;
        if (!aliases[data.orgId]) needAlias.push(data.orgId);
        out.push({ source: data.orgId, text: text.slice(0, 1000) });
    }
    const all = needAlias.length > 0 ? await ensureAliases(season, eventCode, needAlias) : aliases;
    return out.map(p => ({ source: all[p.source] ?? "?", text: p.text }));
}
