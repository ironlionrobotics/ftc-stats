/**
 * Integration status for the superadmin console (decision #119).
 *
 * SECRETS POLICY: credential VALUES never leave the server and are never
 * editable from the app. They live in Secret Manager (App Hosting) and
 * `.env.local`. The console gets, per integration:
 *  - configured: present or missing;
 *  - fingerprint: first 8 hex of SHA-256 over the value(s) — enough to confirm a
 *    rotation reached the running instance, useless for recovering the value;
 *  - rotate: the exact commands to change it (Secret Manager + new rollout);
 *  - a live test (`pingIntegration`) that reports only { ok, status, ms }.
 *
 * Pure except for `fetch` (injectable for tests); no server-only import so it
 * is unit-testable. Callers pass `process.env`.
 */
import { createHash } from "node:crypto";

export type IntegrationKey = "ftc" | "frc" | "gemini" | "vapid" | "cron" | "firebaseAdmin" | "serverCache" | "sentry" | "superadmin";

export interface IntegrationStatus {
    key: IntegrationKey;
    label: string;
    configured: boolean;
    /** First 8 hex of SHA-256 of the credential(s); null when missing or not a secret. */
    fingerprint: string | null;
    /** Where it's managed (hint text). */
    managedIn: string;
    /** Commands to set / rotate it; empty when not applicable. */
    rotate: string[];
    /** Whether `pingIntegration` can test it live. */
    testable: boolean;
    /** Extra state shown under the label (e.g. "SERVER_CACHE=off"). */
    note?: string;
}

type Env = Record<string, string | undefined>;
const has = (v: string | undefined) => typeof v === "string" && v.length > 0;

export function fingerprint(...values: (string | undefined)[]): string | null {
    if (!values.every(has)) return null;
    return createHash("sha256").update(values.join("\u0000")).digest("hex").slice(0, 8);
}

const secretSteps = (...names: string[]) => [
    ...names.map(n => `firebase apphosting:secrets:set ${n}`),
    "# acepta dar acceso al backend cuando lo pregunte; luego un rollout nuevo toma la versión",
    `# local: edita .env.local (${names.join(", ")}) y reinicia el servidor`,
];

export function integrationStatuses(env: Env): IntegrationStatus[] {
    const adminCreds = has(env.FIREBASE_SERVICE_ACCOUNT_KEY) || has(env.GOOGLE_APPLICATION_CREDENTIALS) || has(env.FIREBASE_WEBAPP_CONFIG);
    return [
        {
            key: "ftc", label: "FIRST FTC Events API",
            configured: has(env.FTC_API_USERNAME) && has(env.FTC_API_KEY),
            fingerprint: fingerprint(env.FTC_API_USERNAME, env.FTC_API_KEY),
            managedIn: "Secret Manager · FTC_API_USERNAME / FTC_API_KEY",
            rotate: secretSteps("FTC_API_USERNAME", "FTC_API_KEY"), testable: true,
        },
        {
            key: "frc", label: "FIRST FRC Events API",
            configured: has(env.FRC_API_USERNAME) && has(env.FRC_API_KEY),
            fingerprint: fingerprint(env.FRC_API_USERNAME, env.FRC_API_KEY),
            managedIn: "Secret Manager · FRC_API_USERNAME / FRC_API_KEY",
            rotate: secretSteps("FRC_API_USERNAME", "FRC_API_KEY"), testable: true,
        },
        {
            key: "gemini", label: "Google Gemini (IA)",
            configured: has(env.GOOGLE_GENERATIVE_AI_API_KEY),
            fingerprint: fingerprint(env.GOOGLE_GENERATIVE_AI_API_KEY),
            managedIn: "Secret Manager · GOOGLE_GENERATIVE_AI_API_KEY",
            rotate: secretSteps("GOOGLE_GENERATIVE_AI_API_KEY"), testable: true,
        },
        {
            key: "vapid", label: "Web Push (VAPID)",
            configured: has(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) && has(env.VAPID_PRIVATE_KEY),
            fingerprint: fingerprint(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY),
            managedIn: "Secret Manager · VAPID_PRIVATE_KEY + NEXT_PUBLIC_VAPID_PUBLIC_KEY (público)",
            rotate: ["npx web-push generate-vapid-keys", ...secretSteps("VAPID_PRIVATE_KEY"), "# cambiar la llave invalida las suscripciones existentes"],
            testable: true,
        },
        {
            key: "cron", label: "Cron de avisos (CRON_SECRET)",
            configured: has(env.CRON_SECRET),
            fingerprint: fingerprint(env.CRON_SECRET),
            managedIn: "Secret Manager · CRON_SECRET (y el header de Cloud Scheduler)",
            rotate: ["openssl rand -hex 32", ...secretSteps("CRON_SECRET"), "# actualiza también el header X-Cron-Secret del job de Cloud Scheduler"],
            testable: false,
        },
        {
            key: "firebaseAdmin", label: "Firebase Admin (servidor)",
            configured: adminCreds, fingerprint: null,
            managedIn: "Application Default Credentials (App Hosting) / FIREBASE_SERVICE_ACCOUNT_KEY local",
            rotate: [], testable: false,
        },
        {
            key: "serverCache", label: "Caché del servidor (Firestore)",
            configured: env.SERVER_CACHE !== "off" && adminCreds, fingerprint: null,
            managedIn: "Firestore server_cache · solo env (SERVER_CACHE=off la apaga)",
            rotate: [], testable: false,
            note: env.SERVER_CACHE === "off" ? "SERVER_CACHE=off" : undefined,
        },
        {
            key: "sentry", label: "Sentry (errores prod)",
            configured: has(env.NEXT_PUBLIC_SENTRY_DSN), fingerprint: null,
            managedIn: "env · NEXT_PUBLIC_SENTRY_DSN + SENTRY_*",
            rotate: [], testable: false,
        },
        {
            key: "superadmin", label: "Superadmins definidos",
            configured: (env.SUPERADMIN_EMAILS ?? "").includes("@"), fingerprint: null,
            managedIn: "apphosting.yaml · SUPERADMIN_EMAILS (raíz de confianza, no editable desde la app)",
            rotate: [], testable: false,
        },
    ];
}

export interface PingResult {
    ok: boolean;
    /** HTTP status, or 0 for a local check / network failure. */
    status: number;
    ms: number;
    /** Short machine-readable reason: "missing" | "unauthorized" | "timeout" | "network" | "http" | "invalidKey". */
    reason?: string;
}

const basic = (u: string, k: string) => "Basic " + Buffer.from(`${u}:${k}`).toString("base64");
const b64urlLen = (s: string) => Buffer.from(s, "base64url").length;

/**
 * One cheap authenticated call per integration. Returns status only — the
 * response body and the credential never leave this function.
 */
export async function pingIntegration(key: IntegrationKey, env: Env, season: { ftc: number; frc: number }, fetchFn: typeof fetch = fetch, timeoutMs = 8000): Promise<PingResult> {
    const t0 = Date.now();
    const done = (r: Omit<PingResult, "ms">): PingResult => ({ ...r, ms: Date.now() - t0 });

    if (key === "vapid") {
        const pub = env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, priv = env.VAPID_PRIVATE_KEY;
        if (!has(pub) || !has(priv)) return done({ ok: false, status: 0, reason: "missing" });
        // P-256: uncompressed public point 65 bytes, private scalar 32 bytes.
        const ok = b64urlLen(pub!) === 65 && b64urlLen(priv!) === 32;
        return done({ ok, status: 0, reason: ok ? undefined : "invalidKey" });
    }

    let url: string, headers: Record<string, string>;
    if (key === "ftc") {
        if (!has(env.FTC_API_USERNAME) || !has(env.FTC_API_KEY)) return done({ ok: false, status: 0, reason: "missing" });
        url = `https://ftc-api.firstinspires.org/v2.0/${season.ftc}`;
        headers = { Authorization: basic(env.FTC_API_USERNAME!, env.FTC_API_KEY!), Accept: "application/json" };
    } else if (key === "frc") {
        if (!has(env.FRC_API_USERNAME) || !has(env.FRC_API_KEY)) return done({ ok: false, status: 0, reason: "missing" });
        url = `https://frc-api.firstinspires.org/v3.0/${season.frc}`;
        headers = { Authorization: basic(env.FRC_API_USERNAME!, env.FRC_API_KEY!), Accept: "application/json" };
    } else if (key === "gemini") {
        if (!has(env.GOOGLE_GENERATIVE_AI_API_KEY)) return done({ ok: false, status: 0, reason: "missing" });
        // Header, not ?key=, so the credential never lands in a URL or log.
        url = "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1";
        headers = { "x-goog-api-key": env.GOOGLE_GENERATIVE_AI_API_KEY! };
    } else {
        return done({ ok: false, status: 0, reason: "notTestable" });
    }

    try {
        const r = await fetchFn(url, { headers, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
        await r.body?.cancel().catch(() => undefined);
        if (r.ok) return done({ ok: true, status: r.status });
        return done({ ok: false, status: r.status, reason: r.status === 401 || r.status === 403 ? "unauthorized" : "http" });
    } catch (e) {
        const name = (e as { name?: string })?.name;
        return done({ ok: false, status: 0, reason: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" });
    }
}
