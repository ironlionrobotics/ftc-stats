"use client";

import { syncPushAction } from "@/app/actions/push";

/**
 * Browser side of Web Push (decision #110). The service worker is Serwist's
 * (production builds only — disabled in `next dev`), so every call tolerates
 * its absence instead of hanging on `serviceWorker.ready`.
 */

export type PushSupport = "ok" | "unsupported" | "ios-install" | "no-sw";

export function pushSupport(): PushSupport {
    if (typeof window === "undefined") return "unsupported";
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return ios && !standalone ? "ios-install" : "unsupported";
    }
    return "ok";
}

/** The registration, or null if none shows up quickly (dev, SW blocked). */
export async function swRegistration(timeoutMs = 3000): Promise<ServiceWorkerRegistration | null> {
    if (!("serviceWorker" in navigator)) return null;
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing?.active) return existing;
    return Promise.race([
        navigator.serviceWorker.ready,
        new Promise<null>(r => setTimeout(() => r(null), timeoutMs)),
    ]);
}

export async function currentSubscription(): Promise<PushSubscription | null> {
    const reg = await swRegistration();
    return reg ? reg.pushManager.getSubscription() : null;
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
    const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
    const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(new ArrayBuffer(raw.length));
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
}

export async function subscribeDevice(): Promise<PushSubscription | null> {
    const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const reg = await swRegistration();
    if (!key || !reg) return null;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) });
}

/** Call after any follow change: the server re-reads this device's cookies. Silent if push is off. */
export async function syncPushFollows(idToken?: string): Promise<void> {
    try {
        const sub = await currentSubscription();
        if (sub) await syncPushAction({ endpoint: sub.endpoint, idToken });
    } catch {
        /* push is best effort */
    }
}
