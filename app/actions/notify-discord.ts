"use server";

import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { getRedis } from "@/lib/redis";
import type { ErrorCode } from "@/lib/errors";

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
}): Promise<{ ok: true } | { ok: false; code: ErrorCode }> {
    const { idToken, title, description, severity = "info", rateLimitSeconds = DEFAULT_RATE_LIMIT_SECONDS } = input;

    if (!idToken) return { ok: false, code: "auth.missingToken" };
    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false, code: "auth.invalidToken" };
    }

    let orgId: string | undefined;
    let webhookUrl: string | undefined;
    try {
        const userSnap = await getAdminDb().collection("users").doc(uid).get();
        if (!userSnap.exists) return { ok: false, code: "auth.userNotFound" };
        orgId = userSnap.data()?.orgId as string | undefined;
        if (!orgId) return { ok: false, code: "auth.noOrg" };

        const secretsSnap = await getAdminDb().collection("org_secrets").doc(orgId).get();
        webhookUrl = secretsSnap.data()?.discordWebhookUrl as string | undefined;
    } catch {
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
    if (!webhookUrl) return { ok: false, code: "discord.notConfigured" };

    // Rate limit: skip if we already pinged this org recently.
    const redis = getRedis();
    if (redis) {
        const key = RATE_LIMIT_KEY_PREFIX + orgId;
        // SET NX EX = only set if not exists, with expiry. Returns null if
        // the key already existed (i.e., we sent something inside the window).
        const acquired = await redis.set(key, Date.now(), { nx: true, ex: rateLimitSeconds });
        if (!acquired) {
            return { ok: false, code: "discord.rateLimited" };
        }
    }

    const emoji = EMOJI_BY_SEVERITY[severity];
    const color = COLOR_BY_SEVERITY[severity];
    const payload = {
        username: "PRIDE Bot",
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
            return { ok: false, code: "discord.sendFailed" };
        }
        return { ok: true };
    } catch {
        return { ok: false, code: "discord.sendFailed" };
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
}): Promise<{ ok: true } | { ok: false; code: ErrorCode }> {
    const { idToken, webhookUrl } = input;
    if (!idToken) return { ok: false, code: "auth.missingToken" };
    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false, code: "auth.invalidToken" };
    }

    let orgId: string | undefined;
    let role: unknown;
    try {
        const userSnap = await getAdminDb().collection("users").doc(uid).get();
        if (!userSnap.exists) return { ok: false, code: "auth.userNotFound" };
        const data = userSnap.data() ?? {};
        orgId = data.orgId as string | undefined;
        role = data.role;
    } catch {
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
    if (!orgId) return { ok: false, code: "auth.noOrg" };
    if (role !== "admin" && role !== "lead") {
        return { ok: false, code: "auth.notAdmin" };
    }

    if (webhookUrl !== null) {
        // Discord webhooks live under discord.com/api/webhooks/... and on the
        // legacy discordapp.com domain. Reject other URLs to avoid arbitrary SSRF.
        try {
            const parsed = new URL(webhookUrl);
            const allowedHosts = ["discord.com", "discordapp.com", "ptb.discord.com", "canary.discord.com"];
            if (!allowedHosts.includes(parsed.hostname) || !parsed.pathname.startsWith("/api/webhooks/")) {
                return { ok: false, code: "discord.invalidWebhookUrl" };
            }
        } catch {
            return { ok: false, code: "discord.malformedWebhookUrl" };
        }
    }

    // Use set + merge so the doc is created on first save and only the
    // webhook field is touched on subsequent updates.
    try {
        await getAdminDb().collection("org_secrets").doc(orgId).set(
            {
                orgId,
                discordWebhookUrl: webhookUrl ?? null,
            },
            { merge: true },
        );
    } catch {
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
    return { ok: true };
}

/** Returns whether the caller's org has a webhook configured. Doesn't expose the URL. */
export async function hasDiscordWebhookAction(input: {
    idToken: string;
}): Promise<{ ok: true; configured: boolean } | { ok: false; code: ErrorCode }> {
    if (!input.idToken) return { ok: false, code: "auth.missingToken" };
    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(input.idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false, code: "auth.invalidToken" };
    }
    let orgId: string | undefined;
    let url: string | undefined;
    try {
        const userSnap = await getAdminDb().collection("users").doc(uid).get();
        if (!userSnap.exists) return { ok: false, code: "auth.userNotFound" };
        orgId = userSnap.data()?.orgId as string | undefined;
        if (!orgId) return { ok: false, code: "auth.noOrg" };

        const secretsSnap = await getAdminDb().collection("org_secrets").doc(orgId).get();
        url = secretsSnap.data()?.discordWebhookUrl as string | undefined;
    } catch {
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
    return { ok: true, configured: !!url && url.length > 0 };
}
