"use server";

import { getAdminAuth } from "@/lib/firebase-admin";
import { appConfigReadable, getAppConfig, getEffectiveFlags, readAuditLog, writeAppConfig, type AuditEntry, type EffectiveFlags } from "@/lib/app-config";
import {
    AppConfig,
    BOOLEAN_FLAGS,
    isSuperadminEmail,
    resolveFlag,
    parseSuperadminEmails,
    sanitizeConfigPatch,
} from "@/lib/app-config-schema";
import { integrationStatuses, pingIntegration, type IntegrationKey, type IntegrationStatus, type PingResult } from "@/lib/admin-integrations";
import { allowUser } from "@/lib/server-caller";
import { getCurrentSeason } from "@/lib/constants";

/**
 * Superadmin console actions.
 *
 * Authorization: the caller's verified Firebase ID token email must be listed
 * in the SUPERADMIN_EMAILS env var (comma-separated). This is app-level trust,
 * deliberately separate from the org-level admin/lead roles, and deliberately
 * env-rooted: the bootstrap credential must not be editable from the app.
 *
 * SECRETS POLICY (decision #119): integration secrets are surfaced as status,
 * a SHA-256 fingerprint prefix and a live test result — never values, and
 * never editable here. They live in Secret Manager / env by design; the
 * console shows the commands to rotate them.
 */

export type { IntegrationStatus, PingResult, AuditEntry, EffectiveFlags };

export interface AdminOverview {
    ok: true;
    config: AppConfig;
    flags: EffectiveFlags;
    integrations: IntegrationStatus[];
    superadmins: string[];
}
export type AdminResult = AdminOverview | { ok: false; error: string };

async function requireSuperadmin(idToken: string): Promise<{ email: string; uid: string } | { error: string }> {
    if (!idToken || typeof idToken !== "string") return { error: "Sesión requerida." };
    try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        const email = decoded.email;
        if (!decoded.email_verified || !isSuperadminEmail(email, process.env.SUPERADMIN_EMAILS)) {
            return { error: "No tienes permisos de superadmin." };
        }
        return { email: email!, uid: decoded.uid };
    } catch {
        return { error: "Sesión inválida. Vuelve a iniciar sesión." };
    }
}

/**
 * `saved` = the config just written. Reads in this request are React-cached
 * (pre-write), so after a save the flags are resolved from what was stored.
 */
async function overview(saved?: AppConfig): Promise<AdminOverview> {
    const flags = saved
        ? Object.fromEntries(BOOLEAN_FLAGS.map(f => [f, resolveFlag(f, saved, saved, process.env)])) as EffectiveFlags
        : await getEffectiveFlags();
    return {
        ok: true,
        config: saved ?? await getAppConfig(),
        flags,
        integrations: integrationStatuses(process.env),
        superadmins: [...parseSuperadminEmails(process.env.SUPERADMIN_EMAILS)],
    };
}

export async function getAdminOverview(idToken: string): Promise<AdminResult> {
    const auth = await requireSuperadmin(idToken);
    if ("error" in auth) return { ok: false, error: auth.error };
    if (!(await appConfigReadable())) return { ok: false, error: "No se pudo leer la configuración (Firestore). Reintenta en 30 s." };
    return overview();
}

export async function updateAppConfig(idToken: string, patch: unknown): Promise<AdminResult> {
    const auth = await requireSuperadmin(idToken);
    if ("error" in auth) return { ok: false, error: auth.error };

    try {
        // Never save over a config we couldn't read: defaults would silently replace it.
        if (!(await appConfigReadable())) return { ok: false, error: "No se pudo leer la configuración (Firestore). Reintenta en 30 s." };
        const current = await getAppConfig();
        const next = sanitizeConfigPatch(current, patch);
        await writeAppConfig(next, auth.email);
        console.info(`[admin-config] updated by ${auth.email}`);
        return overview(next);
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : "Error al guardar la configuración." };
    }
}

const TESTABLE: readonly IntegrationKey[] = ["ftc", "frc", "gemini", "vapid"];

/** Live check of one integration: { ok, status, ms } only, never the credential or the body. */
export async function testIntegration(idToken: string, key: unknown): Promise<{ ok: true; result: PingResult } | { ok: false; error: string }> {
    const auth = await requireSuperadmin(idToken);
    if ("error" in auth) return { ok: false, error: auth.error };
    if (typeof key !== "string" || !TESTABLE.includes(key as IntegrationKey)) return { ok: false, error: "Integración no válida." };
    if (!(await allowUser("admin-ping", auth.uid, 10))) return { ok: false, error: "Demasiadas pruebas; espera un minuto." };
    const result = await pingIntegration(key as IntegrationKey, process.env, { ftc: getCurrentSeason("FTC"), frc: getCurrentSeason("FRC") });
    return { ok: true, result };
}

/** Last config changes, newest first. */
export async function getAuditLog(idToken: string): Promise<{ ok: true; entries: AuditEntry[] } | { ok: false; error: string }> {
    const auth = await requireSuperadmin(idToken);
    if ("error" in auth) return { ok: false, error: auth.error };
    try {
        return { ok: true, entries: await readAuditLog(20) };
    } catch {
        return { ok: false, error: "No se pudo leer la bitácora." };
    }
}
