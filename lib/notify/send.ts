import "server-only";
import { createHash } from "node:crypto";
import webpush from "web-push";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase-admin";
import type { PushPayload } from "@/lib/notify/compose";
import type { PushSubscriptionInput } from "@/lib/notify/push-endpoint";

/**
 * Web Push delivery (decision #110): VAPID-signed, encrypted payloads sent
 * straight to the browser's push service — no FCM SDK in the client.
 * A 404/410 means the browser dropped the subscription: its doc is deleted.
 */

export const PUSH_COLLECTION = "push_subscriptions";

/** Doc id: the endpoint is a bearer secret, so it's hashed, never used raw as a key. */
export function subscriptionId(endpoint: string): string {
    return createHash("sha256").update(endpoint).digest("hex").slice(0, 40);
}

let configured: boolean | null = null;
function configure(): boolean {
    if (configured !== null) return configured;
    const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || "https://ftc-stats--ironlion-scouting.us-central1.hosted.app";
    if (!pub || !priv) {
        console.error("[push] VAPID keys missing — push disabled");
        configured = false;
        return false;
    }
    webpush.setVapidDetails(subject, pub, priv);
    configured = true;
    return true;
}

export function pushConfigured(): boolean {
    return configure();
}

export type SendResult = "ok" | "gone" | "error";

export async function sendPush(sub: PushSubscriptionInput, payload: PushPayload, ttlSeconds = 900): Promise<SendResult> {
    if (!configure()) return "error";
    try {
        await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: ttlSeconds, urgency: "high", timeout: 8000 });
        return "ok";
    } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) return "gone";
        console.warn("[push] send failed:", status ?? (e as Error).message);
        return "error";
    }
}

export interface Outgoing {
    id: string;
    sub: PushSubscriptionInput;
    payload: PushPayload;
    ttl?: number;
}

/** Sends with bounded concurrency; prunes gone subscriptions. */
export async function sendMany(items: Outgoing[], concurrency = 8): Promise<{ sent: number; gone: number; failed: number }> {
    let sent = 0, gone = 0, failed = 0;
    const goneIds = new Set<string>();
    let i = 0;
    const worker = async () => {
        while (i < items.length) {
            const it = items[i++];
            if (goneIds.has(it.id)) continue;
            const r = await sendPush(it.sub, it.payload, it.ttl);
            if (r === "ok") sent++;
            else if (r === "gone") { gone++; goneIds.add(it.id); }
            else failed++;
        }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
    if (goneIds.size) {
        const db = getAdminDb();
        await Promise.all([...goneIds].map(id => db.collection(PUSH_COLLECTION).doc(id).delete().catch(() => undefined)));
    }
    if (sent) {
        const db = getAdminDb();
        const okIds = [...new Set(items.map(x => x.id))].filter(id => !goneIds.has(id));
        await Promise.all(okIds.map(id => db.collection(PUSH_COLLECTION).doc(id).update({ lastOkAt: FieldValue.serverTimestamp() }).catch(() => undefined)));
    }
    return { sent, gone, failed };
}
