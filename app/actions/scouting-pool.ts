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
    validateEntry,
    isPlausible,
    poolReadFields,
    POOL_UNLOCK_MIN_ENTRIES,
    type EventFrame,
    type PoolTeamSummary,
} from "@/lib/scouting-pool";
import { fetchEventTeams, fetchHybridSchedule } from "@/lib/ftc-api";
import { scheduledQuals } from "@/lib/scout-claims";
import type { GameDefinition } from "@/types/game-definition";
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
const MAX_ENTRIES = 20000;

/**
 * Validated, sanitized captures + scout reliabilities + aliases of an event,
 * cached 60 s across callers. Only what passes `validateEntry` (well-formed
 * against the season's definition), comes from an existing team, and fits
 * FIRST's roster/schedule (`isPlausible`) is kept — and only shareable
 * fields are read at all (Admin `select`), so notes and names never even
 * reach this cache.
 */
async function eventSnapshot(season: number, eventCode: string, def: GameDefinition): Promise<EventSnapshot> {
    const key = `pool_v2_${season}_${eventCode}`;
    const cached = await serverCache.get<EventSnapshot>(key);
    if (cached) return cached;

    const db = getAdminDb();
    const [snap, roster, schedule] = await Promise.all([
        db.collection("match_scouting")
            .where("season", "==", season)
            .where("eventCode", "==", eventCode)
            .select(...poolReadFields(def))
            .limit(MAX_ENTRIES)
            .get(),
        fetchEventTeams(season, eventCode),
        fetchHybridSchedule(season, eventCode),
    ]);

    const frame: EventFrame = { teams: new Set(roster.map(t => t.teamNumber)), quals: new Map() };
    for (const m of scheduledQuals(schedule, true)) {
        const robots = new Set([...m.red, ...m.blue]);
        frame.quals.set(m.matchNumber, robots);
        for (const t of robots) frame.teams.add(t);
    }

    const valid = snap.docs
        .map(d => validateEntry(d.data(), def, d.id))
        .filter((e): e is BaseMatchScouting => e !== null && isPlausible(e, frame));

    // Only approved teams contribute (an orgId must be a real orgs/{id}).
    const orgIds = [...new Set(valid.map(e => e.orgId as string))];
    const realOrgs = new Set<string>();
    if (orgIds.length > 0) {
        const docs = await db.getAll(...orgIds.map(id => db.collection("orgs").doc(id)));
        for (const d of docs) if (d.exists) realOrgs.add(d.id);
    }
    const entries = valid.filter(e => realOrgs.has(e.orgId as string));

    const scoutIds = [...new Set(entries.map(e => e.scoutId).filter((x): x is string => !!x))];
    const reliabilities: Record<string, number> = {};
    if (scoutIds.length > 0) {
        const docs = await db.getAll(...scoutIds.map(id => db.collection("users").doc(id)));
        for (const d of docs) {
            const r = d.exists ? (d.data() as { reliability?: number }).reliability : undefined;
            if (typeof r === "number" && Number.isFinite(r) && r >= 0) reliabilities[d.id] = r;
        }
    }

    const aliases = await ensureAliases(season, eventCode, [...realOrgs]);
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
        const snap = await eventSnapshot(season, eventCode, def);
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
