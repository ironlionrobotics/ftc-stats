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
//     directly with Redis cache).
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
