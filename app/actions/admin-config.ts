"use server";

import { getAdminAuth } from "@/lib/firebase-admin";
import { getAppConfig, writeAppConfig } from "@/lib/app-config";
import {
    AppConfig,
    isSuperadminEmail,
    parseSuperadminEmails,
    sanitizeConfigPatch,
} from "@/lib/app-config-schema";

/**
 * Superadmin console actions.
 *
 * Authorization: the caller's verified Firebase ID token email must be listed
 * in the SUPERADMIN_EMAILS env var (comma-separated). This is app-level trust,
 * deliberately separate from the org-level admin/lead roles, and deliberately
 * env-rooted: the bootstrap credential must not be editable from the app.
 *
 * SECRETS POLICY: integration secrets (FTC API, Redis, Gemini, service
 * account) are surfaced as PRESENT/MISSING booleans only — never values, and
 * never editable here. They live in Secret Manager / env by design.
 */

export interface IntegrationStatus {
    key: string;
    label: string;
    configured: boolean;
    /** Where it's managed (for the console's hint text). */
    managedIn: string;
}

export interface AdminOverview {
    ok: true;
    config: AppConfig;
    integrations: IntegrationStatus[];
    superadmins: string[];
}
export type AdminResult = AdminOverview | { ok: false; error: string };

async function requireSuperadmin(idToken: string): Promise<{ email: string } | { error: string }> {
    if (!idToken || typeof idToken !== "string") return { error: "Sesión requerida." };
    try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        const email = decoded.email;
        if (!isSuperadminEmail(email, process.env.SUPERADMIN_EMAILS)) {
            return { error: "No tienes permisos de superadmin." };
        }
        return { email: email! };
    } catch {
        return { error: "Sesión inválida. Vuelve a iniciar sesión." };
    }
}

function integrationStatuses(): IntegrationStatus[] {
    const has = (v: string | undefined) => typeof v === "string" && v.length > 0;
    return [
        { key: "ftc", label: "FIRST FTC API", configured: has(process.env.FTC_API_USERNAME) && has(process.env.FTC_API_KEY), managedIn: "Secret Manager (FTC_API_USERNAME / FTC_API_KEY)" },
        { key: "redis", label: "Upstash Redis (caché)", configured: has(process.env.UPSTASH_REDIS_REST_URL) && has(process.env.UPSTASH_REDIS_REST_TOKEN), managedIn: "Secret Manager (UPSTASH_REDIS_REST_*)" },
        { key: "firebase-admin", label: "Firebase Admin (server)", configured: has(process.env.FIREBASE_SERVICE_ACCOUNT_KEY) || has(process.env.GOOGLE_APPLICATION_CREDENTIALS) || has(process.env.FIREBASE_WEBAPP_CONFIG), managedIn: "Secret Manager / ADC" },
        { key: "gemini", label: "Google Gemini (IA)", configured: has(process.env.GOOGLE_GENERATIVE_AI_API_KEY), managedIn: "Secret Manager (GOOGLE_GENERATIVE_AI_API_KEY)" },
        { key: "tba", label: "The Blue Alliance (FRC)", configured: has(process.env.TBA_API_KEY), managedIn: "env (TBA_API_KEY)" },
        { key: "sentry", label: "Sentry (errores prod)", configured: has(process.env.NEXT_PUBLIC_SENTRY_DSN), managedIn: "env (NEXT_PUBLIC_SENTRY_DSN + SENTRY_*)" },
        { key: "superadmin", label: "Superadmins definidos", configured: parseSuperadminEmails(process.env.SUPERADMIN_EMAILS).size > 0, managedIn: "env (SUPERADMIN_EMAILS)" },
    ];
}

export async function getAdminOverview(idToken: string): Promise<AdminResult> {
    const auth = await requireSuperadmin(idToken);
    if ("error" in auth) return { ok: false, error: auth.error };

    return {
        ok: true,
        config: await getAppConfig(),
        integrations: integrationStatuses(),
        superadmins: [...parseSuperadminEmails(process.env.SUPERADMIN_EMAILS)],
    };
}

export async function updateAppConfig(idToken: string, patch: unknown): Promise<AdminResult> {
    const auth = await requireSuperadmin(idToken);
    if ("error" in auth) return { ok: false, error: auth.error };

    try {
        const current = await getAppConfig();
        const next = sanitizeConfigPatch(current, patch);
        await writeAppConfig(next);
        console.info(`[admin-config] updated by ${auth.email}:`, JSON.stringify(next));
        return {
            ok: true,
            config: next,
            integrations: integrationStatuses(),
            superadmins: [...parseSuperadminEmails(process.env.SUPERADMIN_EMAILS)],
        };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Error al guardar la configuración." };
    }
}
