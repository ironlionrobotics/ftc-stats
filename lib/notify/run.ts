import "server-only";
import { FieldValue, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { createTranslator } from "next-intl";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import { getAdminDb } from "@/lib/firebase-admin";
import { getCurrentSeason } from "@/lib/constants";
import { fetchAlliances, fetchEvents, fetchHybridSchedule, fetchMatches, fetchRankings, fetchTeamEvents } from "@/lib/ftc-api";
import { eventWindow, pickRelevantEvent } from "@/lib/today-summary";
import { diffEvent, type EventNotifyState, type NotifyEvent } from "@/lib/notify/diff";
import { compose, DEFAULT_PREFS, type NotifyPrefs, type PushPayload, type Subscriber, type Translate } from "@/lib/notify/compose";
import { PUSH_COLLECTION, sendMany, type Outgoing } from "@/lib/notify/send";
import { normalizeFollows } from "@/lib/follows";
import { claimDocId, type ClaimDoc } from "@/lib/scout-claims";
import { scoutHash } from "@/lib/scout-hash";

/**
 * One cron tick (decision #110), called every minute by Cloud Scheduler via
 * app/api/cron/live. Finds the followed events that are live now (followed
 * directly, or where a followed team competes), diffs each against its stored
 * state inside a transaction (two overlapping ticks can't double-send), and
 * pushes to the subscriptions that care. Also: scout-board reminders and new
 * pit-lending requests for teams checked in at the event.
 */

const MAX_EVENTS_PER_TICK = 25;
const MAX_TEAMS_RESOLVED = 200;
const INDEX_REBUILD_MS = 24 * 3600_000;

interface SubDoc {
    endpoint: string;
    keys: { p256dh: string; auth: string };
    follows?: unknown;
    myTeam?: number | null;
    prefs?: Partial<NotifyPrefs>;
    locale?: string;
    uid?: string | null;
    orgId?: string | null;
}

interface StateDoc {
    state: EventNotifyState;
    requestsSince?: number;
}

const translators: Record<string, Translate> = {};
function translator(locale: string | undefined): Translate {
    const loc = locale === "es" ? "es" : "en";
    if (!translators[loc]) {
        const t = createTranslator({ locale: loc, messages: loc === "es" ? es : en, namespace: "Notify" });
        translators[loc] = (k, v) => t(k as never, v as never);
    }
    return translators[loc];
}

function subscriber(d: SubDoc): Subscriber {
    return { follows: normalizeFollows(d.follows), myTeam: typeof d.myTeam === "number" ? d.myTeam : null, prefs: { ...DEFAULT_PREFS, ...(d.prefs ?? {}) } };
}

function chunks<T>(xs: T[], n: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
    return out;
}

/** Subscriptions following `code` or any of `teams` (deduped by doc id). */
async function recipientsFor(code: string, teams: number[]): Promise<Map<string, SubDoc>> {
    const col = getAdminDb().collection(PUSH_COLLECTION);
    const out = new Map<string, SubDoc>();
    const add = (docs: QueryDocumentSnapshot<DocumentData>[]) => { for (const d of docs) out.set(d.id, d.data() as SubDoc); };
    add((await col.where("follows.events", "array-contains", code).get()).docs);
    for (const c of chunks([...new Set(teams)], 30)) {
        add((await col.where("follows.teams", "array-contains-any", c).get()).docs);
        add((await col.where("myTeam", "in", c).get()).docs);
    }
    return out;
}

async function subsOfOrgs(orgIds: string[]): Promise<Map<string, SubDoc>> {
    const col = getAdminDb().collection(PUSH_COLLECTION);
    const out = new Map<string, SubDoc>();
    for (const c of chunks([...new Set(orgIds)], 30)) {
        for (const d of (await col.where("orgId", "in", c).get()).docs) out.set(d.id, d.data() as SubDoc);
    }
    return out;
}

const ttlFor = (ev: NotifyEvent) => (ev.kind === "matchSoon" ? 600 : 3600);

export interface TickSummary {
    events: number;
    notices: number;
    sent: number;
    gone: number;
    failed: number;
    skipped?: string;
}

export async function runLiveNotify(deadline: number, now = Date.now()): Promise<TickSummary> {
    const db = getAdminDb();
    const season = getCurrentSeason();
    const indexRef = db.collection("notify_index").doc("main");
    let index = (await indexRef.get()).data() as { events?: string[]; teams?: number[]; rebuiltAt?: number } | undefined;

    // Self-cleaning index: once a day rebuild it from the subscriptions (drops unfollowed items).
    if (!index?.rebuiltAt || now - index.rebuiltAt > INDEX_REBUILD_MS) {
        const events = new Set<string>(), teams = new Set<number>();
        for (const d of (await db.collection(PUSH_COLLECTION).get()).docs) {
            const s = subscriber(d.data() as SubDoc);
            s.follows.events.forEach(e => events.add(e));
            s.follows.teams.forEach(t => teams.add(t));
            if (s.myTeam) teams.add(s.myTeam);
        }
        index = { events: [...events], teams: [...teams], rebuiltAt: now };
        await indexRef.set({ ...index, updatedAt: FieldValue.serverTimestamp() });
    }
    const followedEvents = index.events ?? [], followedTeams = index.teams ?? [];
    if (followedEvents.length === 0 && followedTeams.length === 0) return { events: 0, notices: 0, sent: 0, gone: 0, failed: 0, skipped: "nothing followed" };

    // Which of them are live right now.
    const allEvents = await fetchEvents(season);
    const byCode = new Map(allEvents.map(e => [e.code, e]));
    const live = new Set<string>();
    for (const code of followedEvents) {
        const e = byCode.get(code);
        if (!e) continue;
        const w = eventWindow(e);
        if (now >= w.start && now <= w.end) live.add(code);
    }
    for (const team of followedTeams.slice(0, MAX_TEAMS_RESOLVED)) {
        const pick = pickRelevantEvent(await fetchTeamEvents(season, team), now);
        if (pick?.phase === "live") live.add(pick.event.code);
    }

    const out: Outgoing[] = [];
    let processed = 0, notices = 0;
    for (const code of [...live].slice(0, MAX_EVENTS_PER_TICK)) {
        if (Date.now() > deadline) break;
        processed++;
        const [schedule, matches, rankings, alliances] = await Promise.all([
            fetchHybridSchedule(season, code), fetchMatches(season, code), fetchRankings(season, code), fetchAlliances(season, code),
        ]);
        if (schedule.length === 0) continue;
        const playedMatches = matches.filter(m => (m.postResultTime?.length ?? 0) > 0 || (m.scoreRedFinal ?? 0) + (m.scoreBlueFinal ?? 0) > 0);

        const stateRef = db.collection("notify_state").doc(`${season}_${code}`);
        const { events, requestsSince } = await db.runTransaction(async tx => {
            const snap = await tx.get(stateRef);
            const prev = snap.exists ? (snap.data() as StateDoc) : null;
            const r = diffEvent(prev?.state ?? null, { eventCode: code, schedule, matches: playedMatches, rankings, alliances });
            const since = prev?.requestsSince ?? now; // first sight: only requests from now on
            tx.set(stateRef, { state: r.next, requestsSince: now, updatedAt: FieldValue.serverTimestamp() });
            return { events: r.events, requestsSince: since };
        });

        const eventName = byCode.get(code)?.name ?? code;
        if (events.length) {
            const subs = await recipientsFor(code, events.flatMap(e => e.teams));
            for (const [id, d] of subs) {
                const s = subscriber(d), t = translator(d.locale);
                for (const ev of events) {
                    const payload = compose(ev, s, { eventName, t });
                    if (payload) { out.push({ id, sub: { endpoint: d.endpoint, keys: d.keys }, payload, ttl: ttlFor(ev) }); notices++; }
                }
            }
            notices += await scoutReminders(season, code, eventName, events, out);
        }
        notices += await newLendRequests(season, code, eventName, requestsSince, out);
    }

    const r = out.length ? await sendMany(out) : { sent: 0, gone: 0, failed: 0 };
    return { events: processed, notices, ...r };
}

/** "Your claimed robot plays soon" for scouts whose device is signed in (#103 board). */
async function scoutReminders(season: number, code: string, eventName: string, events: NotifyEvent[], out: Outgoing[]): Promise<number> {
    const soon = events.filter((e): e is Extract<NotifyEvent, { kind: "matchSoon" }> => e.kind === "matchSoon" && e.level === "QUALIFICATION");
    if (soon.length === 0) return 0;
    const db = getAdminDb();
    const claimDocs = await Promise.all(soon.map(e => db.collection("scout_claims").doc(claimDocId(season, code, "QUALIFICATION", Number(e.key.split(":")[2]))).get()));
    const aliasDoc = await db.collection("pool_aliases").doc(`${season}_${code}`).get();
    const orgs = Object.keys((aliasDoc.get("aliases") as Record<string, string> | undefined) ?? {});
    if (orgs.length === 0) return 0;
    const subs = await subsOfOrgs(orgs);
    let n = 0;
    soon.forEach((ev, i) => {
        const claims = (claimDocs[i].data() as ClaimDoc | undefined)?.claims ?? {};
        for (const [id, d] of subs) {
            if (!d.uid || d.prefs?.pride === false) continue;
            const mine = scoutHash(d.uid, season, code);
            const team = Object.entries(claims).find(([, list]) => list.some(c => c.scout === mine))?.[0];
            if (!team) continue;
            const t = translator(d.locale);
            out.push({ id, sub: { endpoint: d.endpoint, keys: d.keys }, ttl: 600, payload: {
                title: t("pride.claimTitle", { ahead: ev.ahead }),
                body: t("pride.claimBody", { team, label: ev.label, event: eventName }),
                url: "/scouting", tag: `${code}:${ev.key}:claim`,
            } });
            n++;
        }
    });
    return n;
}

/** New "anyone have X?" requests → the other teams checked in at the event. */
async function newLendRequests(season: number, code: string, eventName: string, since: number, out: Outgoing[]): Promise<number> {
    const db = getAdminDb();
    const reqs = (await db.collection("lend_requests").where("season", "==", season).where("eventCode", "==", code).where("status", "==", "open").get()).docs
        .map(d => ({ id: d.id, ...(d.data() as { orgId: string; teamNumber: number; pit: string; item: string; createdAt?: { toMillis(): number } }) }))
        .filter(r => (r.createdAt?.toMillis() ?? 0) > since);
    if (reqs.length === 0) return 0;
    const present = (await db.collection("event_presence").where("season", "==", season).where("eventCode", "==", code).get()).docs.map(d => d.get("orgId") as string);
    const subs = await subsOfOrgs(present);
    let n = 0;
    for (const r of reqs) {
        for (const [id, d] of subs) {
            if (d.orgId === r.orgId || d.prefs?.pride === false) continue;
            const t = translator(d.locale);
            const payload: PushPayload = {
                title: t("pride.requestTitle", { team: r.teamNumber, pit: r.pit || "—", item: r.item }),
                body: t("pride.requestBody", { event: eventName }),
                url: `/lending?event=${code}`, tag: `${code}:req:${r.id}`,
            };
            out.push({ id, sub: { endpoint: d.endpoint, keys: d.keys }, payload, ttl: 1800 });
            n++;
        }
    }
    return n;
}

/** Loan notices from the lending actions (#104): to the other party's signed-in devices. */
export async function notifyOrg(orgId: string | null, build: (t: Translate) => PushPayload): Promise<void> {
    if (!orgId) return;
    try {
        const subs = await subsOfOrgs([orgId]);
        const items: Outgoing[] = [];
        for (const [id, d] of subs) {
            if (d.prefs?.pride === false) continue;
            items.push({ id, sub: { endpoint: d.endpoint, keys: d.keys }, payload: build(translator(d.locale)), ttl: 3600 });
        }
        if (items.length) await sendMany(items);
    } catch (e) {
        console.warn("[notify] org notice failed:", e);
    }
}
