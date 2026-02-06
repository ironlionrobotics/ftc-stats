import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore, enableIndexedDbPersistence } from "firebase/firestore";
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
const db = getFirestore(app);

// Enable offline persistence for Firestore
// This helps for offline scouting at events
if (typeof window !== "undefined") {
    // initialize persistence only on client side
    // We catch errors because it might fail if multiple tabs are open
    import("firebase/firestore").then(({ enableIndexedDbPersistence }) => {
        enableIndexedDbPersistence(db).catch((err) => {
            if (err.code == 'failed-precondition') {
                console.warn("Multiple tabs open, persistence can only be enabled in one tab at a a time.");
            } else if (err.code == 'unimplemented') {
                console.warn("The current browser does not support all of the features required to enable persistence");
            }
        });
    });

    // Initialize Analytics
    isSupported().then((yes) => {
        if (yes) {
            getAnalytics(app);
        }
    });
}

export { app, auth, db };
