"use server";

import { cookies } from "next/headers";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { allowRequest } from "@/lib/request-guard";
import { getUserLocale } from "@/i18n/locale";
import { getTranslations } from "next-intl/server";
import { FOLLOWS_COOKIE, parseFollows } from "@/lib/follows";
import { FOLLOW_TEAM_COOKIE, parseFollowedTeam } from "@/lib/follow-team";
import { parsePushSubscription } from "@/lib/notify/push-endpoint";
import { PUSH_COLLECTION, pushConfigured, sendPush, subscriptionId } from "@/lib/notify/send";
import { DEFAULT_PREFS, type NotifyPrefs } from "@/lib/notify/compose";

/**
 * Device push subscriptions (decision #110). Anyone may subscribe to the
 * public-FIRST-data notices (like "Hoy" without an account); the PRIDE notices
 * (lending, scout board) also need a signed-in member, whose uid/org come from
 * the verified token — never from the input. Follows are read from this
 * device's cookies, so a caller can't attach someone else's list. Knowing the
 * endpoint (a bearer secret of that browser) is what authorizes edits.
 */

function indexRef() {
    return getAdminDb().collection("notify_index").doc("main");
}

function cleanPrefs(raw: unknown): NotifyPrefs {
    const p = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof NotifyPrefs, unknown>>;
    const pick = (k: keyof NotifyPrefs) => (typeof p[k] === "boolean" ? (p[k] as boolean) : DEFAULT_PREFS[k]);
    return { soon: pick("soon"), results: pick("results"), playoffs: pick("playoffs"), pride: pick("pride") };
}

async function identity(idToken: unknown): Promise<{ uid: string | null; orgId: string | null }> {
    if (typeof idToken !== "string" || !idToken) return { uid: null, orgId: null };
    try {
        const uid = (await getAdminAuth().verifyIdToken(idToken)).uid;
        const snap = await getAdminDb().collection("users").doc(uid).get();
        const orgId = snap.get("orgId");
        return { uid, orgId: typeof orgId === "string" && orgId ? orgId : null };
    } catch {
        return { uid: null, orgId: null };
    }
}

async function deviceFollows() {
    const store = await cookies();
    return {
        follows: parseFollows(store.get(FOLLOWS_COOKIE)?.value),
        myTeam: parseFollowedTeam(store.get(FOLLOW_TEAM_COOKIE)?.value),
    };
}

/** Creates or refreshes this device's subscription with its current follows. */
export async function subscribePushAction(input: { subscription: unknown; prefs?: unknown; idToken?: string }): Promise<{ ok: boolean; code?: string }> {
    try {
        if (!pushConfigured()) return { ok: false, code: "push.disabled" };
        if (!(await allowRequest("light"))) return { ok: false, code: "rateLimited" };
        const sub = parsePushSubscription(input?.subscription);
        if (!sub) return { ok: false, code: "push.badSubscription" };
        const [{ follows, myTeam }, who, locale] = await Promise.all([deviceFollows(), identity(input.idToken), getUserLocale()]);
        const ref = getAdminDb().collection(PUSH_COLLECTION).doc(subscriptionId(sub.endpoint));
        const existing = await ref.get();
        await ref.set({
            endpoint: sub.endpoint,
            keys: sub.keys,
            follows,
            myTeam,
            prefs: cleanPrefs(input.prefs ?? existing.get("prefs")),
            locale,
            uid: who.uid,
            orgId: who.orgId,
            updatedAt: FieldValue.serverTimestamp(),
            ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        }, { merge: true });
        await indexFollows(follows.events, [...follows.teams, ...(myTeam ? [myTeam] : [])]);
        return { ok: true };
    } catch (e) {
        console.error("[push] subscribe failed:", e);
        return { ok: false, code: "push.unavailable" };
    }
}

/** After following/unfollowing or changing preferences on this device. */
export async function syncPushAction(input: { endpoint: string; prefs?: unknown; idToken?: string }): Promise<{ ok: boolean }> {
    try {
        if (typeof input?.endpoint !== "string") return { ok: false };
        if (!(await allowRequest("light"))) return { ok: false };
        const ref = getAdminDb().collection(PUSH_COLLECTION).doc(subscriptionId(input.endpoint));
        const snap = await ref.get();
        if (!snap.exists || snap.get("endpoint") !== input.endpoint) return { ok: false };
        const { follows, myTeam } = await deviceFollows();
        const update: Record<string, unknown> = { follows, myTeam, locale: await getUserLocale(), updatedAt: FieldValue.serverTimestamp() };
        if (input.prefs !== undefined) update.prefs = cleanPrefs(input.prefs);
        if (input.idToken) Object.assign(update, await identity(input.idToken));
        await ref.update(update);
        await indexFollows(follows.events, [...follows.teams, ...(myTeam ? [myTeam] : [])]);
        return { ok: true };
    } catch (e) {
        console.error("[push] sync failed:", e);
        return { ok: false };
    }
}

export async function unsubscribePushAction(input: { endpoint: string }): Promise<{ ok: boolean }> {
    try {
        if (typeof input?.endpoint !== "string") return { ok: false };
        const ref = getAdminDb().collection(PUSH_COLLECTION).doc(subscriptionId(input.endpoint));
        const snap = await ref.get();
        if (snap.exists && snap.get("endpoint") === input.endpoint) await ref.delete();
        return { ok: true };
    } catch {
        return { ok: false };
    }
}

/** "Send me a test" — proves the whole chain on this device. */
export async function testPushAction(input: { endpoint: string }): Promise<{ ok: boolean; code?: string }> {
    try {
        if (!(await allowRequest("light"))) return { ok: false, code: "rateLimited" };
        if (typeof input?.endpoint !== "string") return { ok: false };
        const snap = await getAdminDb().collection(PUSH_COLLECTION).doc(subscriptionId(input.endpoint)).get();
        if (!snap.exists || snap.get("endpoint") !== input.endpoint) return { ok: false, code: "push.notSubscribed" };
        const t = await getTranslations("Notify");
        const r = await sendPush({ endpoint: snap.get("endpoint"), keys: snap.get("keys") },
            { title: t("test.title"), body: t("test.body"), url: "/", tag: "pride-test" }, 300);
        if (r === "gone") await snap.ref.delete();
        return { ok: r === "ok", code: r === "ok" ? undefined : `push.${r}` };
    } catch (e) {
        console.error("[push] test failed:", e);
        return { ok: false, code: "push.unavailable" };
    }
}

/** The cron reads one doc to know what's followed at all; it prunes entries nobody follows anymore. */
async function indexFollows(events: string[], teams: number[]): Promise<void> {
    if (events.length === 0 && teams.length === 0) return;
    await indexRef().set({
        ...(events.length ? { events: FieldValue.arrayUnion(...events) } : {}),
        ...(teams.length ? { teams: FieldValue.arrayUnion(...teams) } : {}),
        updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
}
