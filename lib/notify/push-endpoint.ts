/**
 * Validation of a browser PushSubscription before the server ever POSTs to it
 * (decision #110). web-push sends an HTTPS request to `endpoint`, so an
 * unchecked endpoint would let anyone make our server call arbitrary URLs
 * (SSRF). Only the browsers' push services are accepted.
 */

const PUSH_HOSTS = [
    /^fcm\.googleapis\.com$/,                 // Chrome, Edge (Chromium), Android
    /^android\.googleapis\.com$/,
    /^updates\.push\.services\.mozilla\.com$/, // Firefox
    /^push\.services\.mozilla\.com$/,
    /^web\.push\.apple\.com$/,                // Safari macOS / iOS (installed PWA)
    /^[a-z0-9-]+\.push\.apple\.com$/,
    /^[a-z0-9-]+\.notify\.windows\.com$/,     // legacy Edge / Windows
];

const B64URL = /^[A-Za-z0-9_-]+={0,2}$/;

export interface PushSubscriptionInput {
    endpoint: string;
    keys: { p256dh: string; auth: string };
}

export function parsePushSubscription(raw: unknown): PushSubscriptionInput | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
    if (typeof r.endpoint !== "string" || r.endpoint.length > 1024) return null;
    let url: URL;
    try {
        url = new URL(r.endpoint);
    } catch {
        return null;
    }
    if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return null;
    if (!PUSH_HOSTS.some(h => h.test(url.hostname))) return null;
    const p256dh = r.keys?.p256dh, auth = r.keys?.auth;
    // p256dh: uncompressed P-256 point (65 bytes ≈ 87 b64url chars); auth: 16 bytes (≈ 22).
    if (typeof p256dh !== "string" || p256dh.length < 80 || p256dh.length > 100 || !B64URL.test(p256dh)) return null;
    if (typeof auth !== "string" || auth.length < 16 || auth.length > 32 || !B64URL.test(auth)) return null;
    return { endpoint: url.href, keys: { p256dh, auth } };
}
