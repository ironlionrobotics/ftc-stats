/// <reference lib="webworker" />
/// <reference types="@serwist/next/typings" />

import { defaultCache } from "@serwist/next/worker";
import { Serwist } from "serwist";

// Service worker for the FTC Stats PWA.
//
// What we cache:
//   - precacheEntries: Next.js build artifacts (JS, CSS, fonts, images) so
//     the app shell loads when the venue Wi-Fi dies mid-session.
//   - defaultCache: sensible runtime caching strategies provided by @serwist/next
//     (StaleWhileRevalidate for HTML, CacheFirst for static assets, etc.).
//
// What we DON'T cache here:
//   - Firestore traffic — Firebase SDK manages its own offline persistence
//     and our scouting writes go through it directly, not via fetch.
//   - FTC API calls — those are server-only (Server Components hit the API
//     directly with the server cache).
//
// Background-sync of pending scouting entries is handled at the React layer
// by components/OnlineSync.tsx (Dexie → Firestore via online event listener),
// NOT at this service worker. Doing it here would require routing scouting
// writes through fetch instead of the Firebase SDK, which we don't want.

declare const self: ServiceWorkerGlobalScope & {
    __SW_MANIFEST: (string | { url: string; revision: string | null })[];
};

const serwist = new Serwist({
    precacheEntries: self.__SW_MANIFEST,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// Web Push (decision #110). The server (lib/notify/send.ts) sends a small JSON
// payload {title, body, url, tag}; a repeated tag replaces the previous
// notification for the same match instead of stacking.
interface PushPayload { title?: string; body?: string; url?: string; tag?: string }

self.addEventListener("push", (event: PushEvent) => {
    let data: PushPayload = {};
    try {
        data = event.data?.json() ?? {};
    } catch {
        data = { title: event.data?.text() };
    }
    const title = data.title || "PRIDE";
    event.waitUntil(self.registration.showNotification(title, {
        body: data.body ?? "",
        tag: data.tag,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-96.png",
        data: { url: data.url ?? "/" },
    }));
});

self.addEventListener("notificationclick", (event: NotificationEvent) => {
    event.notification.close();
    const raw = (event.notification.data as { url?: string } | undefined)?.url ?? "/";
    // Same-origin paths only: a payload can never send the user elsewhere.
    const target = new URL(raw.startsWith("/") ? raw : "/", self.location.origin).href;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        const open = windows.find(w => new URL(w.url).origin === self.location.origin);
        if (open) {
            await open.focus();
            await open.navigate(target).catch(() => undefined);
            return;
        }
        await self.clients.openWindow(target);
    })());
});
