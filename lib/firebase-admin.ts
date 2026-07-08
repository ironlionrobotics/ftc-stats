import "server-only";
import { getApps, initializeApp, cert, applicationDefault, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getAuth, Auth } from "firebase-admin/auth";

// Server-only firebase-admin client. Use this for Firestore reads/writes from
// Server Components, Server Actions, and Route Handlers — it is 10-100x faster
// than the Web SDK in Node.js (no experimentalForceLongPolling latency penalty).
//
// Credentials resolution order:
//   1. FIREBASE_SERVICE_ACCOUNT_KEY env var (JSON string) — recommended for
//      local dev and serverless platforms (Vercel, etc.)
//   2. GOOGLE_APPLICATION_CREDENTIALS env var (path to JSON file)
//   3. Application Default Credentials — automatic on Firebase App Hosting,
//      Cloud Run, GCE, etc.

function initAdminApp(): App {
    const existing = getApps();
    if (existing.length > 0) return existing[0]!;

    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    if (serviceAccountJson) {
        try {
            const serviceAccount = JSON.parse(serviceAccountJson);
            return initializeApp({ credential: cert(serviceAccount) });
        } catch (e) {
            console.error(
                "[firebase-admin] FIREBASE_SERVICE_ACCOUNT_KEY is set but not valid JSON",
                e,
            );
            throw e;
        }
    }

    // Falls back to ADC (Firebase App Hosting, GCP) or
    // GOOGLE_APPLICATION_CREDENTIALS file path.
    return initializeApp({ credential: applicationDefault() });
}

let _app: App | undefined;
let _db: Firestore | undefined;
let _auth: Auth | undefined;

export function getAdminApp(): App {
    if (!_app) _app = initAdminApp();
    return _app;
}

export function getAdminDb(): Firestore {
    if (!_db) _db = getFirestore(getAdminApp());
    return _db;
}

export function getAdminAuth(): Auth {
    if (!_auth) _auth = getAuth(getAdminApp());
    return _auth;
}
