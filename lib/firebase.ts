import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, initializeFirestore } from "firebase/firestore";
import { getAnalytics, isSupported } from "firebase/analytics";

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
// and by Upstash Redis (server-side) for analytical cache. We intentionally do NOT
// enable Firestore IndexedDB persistence — it caches the entire api_cache collection
// in the browser (hundreds of MB) and crashes mobile devices.
if (typeof window !== "undefined") {
    isSupported().then((yes) => {
        if (yes) {
            getAnalytics(app);
        }
    });
}

export { app, auth, db };
