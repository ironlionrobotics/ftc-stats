"use server";

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { getRedis } from "@/lib/redis";

/**
 * Discord webhook proxy. The webhook URL lives in `org_secrets/{orgId}.discordWebhookUrl`
 * (separate collection from `orgs/` so Firestore rules can lock it down —
 * the public `orgs/` doc is readable by any authed user). Fetched server-side
 * via admin SDK; clients never see the URL. Posts are rate-limited via Redis
 * (1 message per org per 60s by default) so a stuck retry loop doesn't spam
 * the channel.
 */

type Severity = "info" | "warning" | "error";

const RATE_LIMIT_KEY_PREFIX = "discord:lastsent:";
const DEFAULT_RATE_LIMIT_SECONDS = 60;

const COLOR_BY_SEVERITY: Record<Severity, number> = {
    info: 0x3b82f6,    // blue
    warning: 0xf59e0b, // amber
    error: 0xef4444,   // red
};

const EMOJI_BY_SEVERITY: Record<Severity, string> = {
    info: "ℹ️",
    warning: "⚠️",
    error: "🚨",
};

/**
 * Sends a Discord notification on behalf of the caller's org. Auth + role
 * gate is intentional even though the bot identity is org-scoped — we don't
 * want random users probing for which orgs have webhooks configured.
 */
export async function notifyDiscordAction(input: {
    idToken: string;
    title: string;
    description?: string;
    severity?: Severity;
    /** Override rate limit window (seconds). Defaults to 60. */
    rateLimitSeconds?: number;
}): Promise<{ ok: boolean; reason?: "no-token" | "no-org" | "no-webhook" | "rate-limited" | "send-failed" }> {
    const { idToken, title, description, severity = "info", rateLimitSeconds = DEFAULT_RATE_LIMIT_SECONDS } = input;

    if (!idToken) return { ok: false, reason: "no-token" };
    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false, reason: "no-token" };
    }

    const userSnap = await getAdminDb().collection("users").doc(uid).get();
    if (!userSnap.exists) return { ok: false, reason: "no-org" };
    const orgId = userSnap.data()?.orgId as string | undefined;
    if (!orgId) return { ok: false, reason: "no-org" };

    const secretsSnap = await getAdminDb().collection("org_secrets").doc(orgId).get();
    const webhookUrl = secretsSnap.data()?.discordWebhookUrl as string | undefined;
    if (!webhookUrl) return { ok: false, reason: "no-webhook" };

    // Rate limit: skip if we already pinged this org recently.
    const redis = getRedis();
    if (redis) {
        const key = RATE_LIMIT_KEY_PREFIX + orgId;
        // SET NX EX = only set if not exists, with expiry. Returns null if
        // the key already existed (i.e., we sent something inside the window).
        const acquired = await redis.set(key, Date.now(), { nx: true, ex: rateLimitSeconds });
        if (!acquired) {
            return { ok: false, reason: "rate-limited" };
        }
    }

    const emoji = EMOJI_BY_SEVERITY[severity];
    const color = COLOR_BY_SEVERITY[severity];
    const payload = {
        username: "FTC Stats Bot",
        embeds: [
            {
                title: `${emoji} ${title}`,
                description: description ?? "",
                color,
                footer: { text: `Equipo #${orgId} · FTC Stats México` },
                timestamp: new Date().toISOString(),
            },
        ],
    };

    try {
        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            return { ok: false, reason: "send-failed" };
        }
        return { ok: true };
    } catch {
        return { ok: false, reason: "send-failed" };
    }
}

/**
 * Configures the Discord webhook URL for the caller's org. Admin/lead only.
 * Validates URL format minimally (must start with Discord webhook host).
 *
 * Pass `null` to clear the webhook.
 */
export async function setDiscordWebhookAction(input: {
    idToken: string;
    webhookUrl: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    const { idToken, webhookUrl } = input;
    if (!idToken) return { ok: false, error: "Falta token de autenticación" };
    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false, error: "Token inválido o expirado" };
    }

    const userSnap = await getAdminDb().collection("users").doc(uid).get();
    if (!userSnap.exists) return { ok: false, error: "Usuario no encontrado" };
    const data = userSnap.data() ?? {};
    const orgId = data.orgId as string | undefined;
    const role = data.role;
    if (!orgId) return { ok: false, error: "Sin equipo asignado" };
    if (role !== "admin" && role !== "lead") {
        return { ok: false, error: "Solo admins/leads pueden configurar el webhook" };
    }

    if (webhookUrl !== null) {
        // Discord webhooks live under discord.com/api/webhooks/... and on the
        // legacy discordapp.com domain. Reject other URLs to avoid arbitrary SSRF.
        try {
            const parsed = new URL(webhookUrl);
            const allowedHosts = ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"];
            if (!allowedHosts.includes(parsed.hostname) || !parsed.pathname.startsWith("/api/webhooks/")) {
                return { ok: false, error: "URL inválida — debe ser un webhook de Discord" };
            }
        } catch {
            return { ok: false, error: "URL malformada" };
        }
    }

    // Use set + merge so the doc is created on first save and only the
    // webhook field is touched on subsequent updates.
    await getAdminDb().collection("org_secrets").doc(orgId).set(
        {
            orgId,
            discordWebhookUrl: webhookUrl ?? null,
        },
        { merge: true },
    );
    return { ok: true };
}

/** Returns whether the caller's org has a webhook configured. Doesn't expose the URL. */
export async function hasDiscordWebhookAction(input: {
    idToken: string;
}): Promise<{ ok: true; configured: boolean } | { ok: false; error: string }> {
    if (!input.idToken) return { ok: false, error: "Falta token" };
    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(input.idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false, error: "Token inválido" };
    }
    const userSnap = await getAdminDb().collection("users").doc(uid).get();
    if (!userSnap.exists) return { ok: false, error: "Usuario no encontrado" };
    const orgId = userSnap.data()?.orgId as string | undefined;
    if (!orgId) return { ok: false, error: "Sin equipo asignado" };

    const secretsSnap = await getAdminDb().collection("org_secrets").doc(orgId).get();
    const url = secretsSnap.data()?.discordWebhookUrl as string | undefined;
    return { ok: true, configured: !!url && url.length > 0 };
}
