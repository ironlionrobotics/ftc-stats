import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";

const getFirebaseConfig = () => {
    if (process.env.NEXT_PUBLIC_FIREBASE_API_KEY) {
        return {
            apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
            authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
            storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
            messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
            appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
            measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
        };
    }

    // Fallback for Firebase App Hosting
    if (process.env.FIREBASE_WEBAPP_CONFIG) {
        try {
            const config = JSON.parse(process.env.FIREBASE_WEBAPP_CONFIG);
            return config;
        } catch (e) {
            console.error("Error parsing FIREBASE_WEBAPP_CONFIG", e);
        }
    }

    // Loud on purpose: a silent placeholder hid for months that production
    // browsers had no Firebase config (decision #99).
    console.error("[firebase] No web config: set NEXT_PUBLIC_FIREBASE_* at BUILD time (apphosting.yaml / .env.local).");
    return {
        apiKey: "missing-api-key",
        authDomain: "missing-auth-domain",
        projectId: "missing-project-id",
    };
};

const firebaseConfig = getFirebaseConfig();

// Initialize Firebase
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);

// Optimize Firestore for server vs client
let db: ReturnType<typeof getFirestore>;

if (typeof window === "undefined") {
    // SERVER SIDE: Force long-polling to avoid gRPC connection issues in Node/NextJS environments
    db = initializeFirestore(app, {
        experimentalForceLongPolling: true,
    });
} else {
    // CLIENT SIDE
    db = getFirestore(app);
}

// Offline persistence handled by Dexie (lib/localDatabase.ts) for scouting data,
// and by the Firestore-backed server cache (lib/server-cache.ts). We intentionally do NOT
// enable Firestore IndexedDB persistence — it caches the entire api_cache collection
// in the browser (hundreds of MB) and crashes mobile devices.
// Analytics only with explicit consent (decision #92): most users are minors,
// and nothing grants consent until the consent notice ships (plan Etapa 4), so
// today this never loads. Lazy import keeps firebase/analytics out of the bundle.
export const ANALYTICS_CONSENT_KEY = "pride-analytics-consent";
if (typeof window !== "undefined") {
    let consent: string | null = null;
    try { consent = window.localStorage.getItem(ANALYTICS_CONSENT_KEY); } catch { /* storage blocked */ }
    if (consent === "granted") {
        import("firebase/analytics").then(({ getAnalytics, isSupported }) =>
            isSupported().then(yes => { if (yes) getAnalytics(app); }),
        ).catch(() => { /* analytics is optional */ });
    }
}

export { app, auth, db };
