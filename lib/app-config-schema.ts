/**
 * App-level runtime configuration — schema, defaults, and pure validation.
 *
 * Design (superadmin console):
 *  - SECRETS (API keys) are NOT part of this config. They stay in env /
 *    Secret Manager; the admin console only surfaces their *status* (present
 *    or missing), never values. Moving secrets to a UI-editable store would
 *    weaken the security posture, not improve it.
 *  - This module is pure (no server-only imports) so sanitization and the
 *    superadmin allow-list parsing are unit-testable.
 *  - The stored document may be a partial: readers always merge over
 *    DEFAULT_APP_CONFIG so new fields ship with safe defaults and an empty /
 *    missing doc means "all defaults".
 *
 * Root of trust: SUPERADMIN_EMAILS env var (comma-separated). Deliberately an
 * env var — the bootstrap credential must not be editable from the app itself.
 */

import { MODELS, type ModelTier } from "@/lib/ai-guards";

export interface AppConfig {
    features: {
        /** Master switch for the AI assistant (chat FAB + server action). */
        aiAssistant: boolean;
    };
    ai: {
        /** Requests per user per rate window (overrides AI_LIMITS default). */
        rateMaxPerWindow: number;
        /** Default model tier — must be a key of the ai-guards allow-list. */
        modelTier: ModelTier;
    };
}

export const DEFAULT_APP_CONFIG: AppConfig = {
    features: {
        aiAssistant: true,
    },
    ai: {
        rateMaxPerWindow: 15,
        modelTier: "pro",
    },
};

/** Deep-merges a stored partial over the defaults. Unknown keys are dropped. */
export function mergeAppConfig(stored: unknown): AppConfig {
    const s = (stored ?? {}) as Partial<Record<keyof AppConfig, Record<string, unknown>>>;
    return {
        features: {
            aiAssistant:
                typeof s.features?.aiAssistant === "boolean"
                    ? s.features.aiAssistant
                    : DEFAULT_APP_CONFIG.features.aiAssistant,
        },
        ai: {
            rateMaxPerWindow: clampInt(
                s.ai?.rateMaxPerWindow,
                1,
                120,
                DEFAULT_APP_CONFIG.ai.rateMaxPerWindow,
            ),
            modelTier:
                typeof s.ai?.modelTier === "string" && s.ai.modelTier in MODELS
                    ? (s.ai.modelTier as ModelTier)
                    : DEFAULT_APP_CONFIG.ai.modelTier,
        },
    };
}

/**
 * Validates a client-submitted patch. Same shape rules as mergeAppConfig but
 * over the CURRENT config (so a patch may change one field only). Returns the
 * full sanitized config to store. Throws on a structurally hostile payload.
 */
export function sanitizeConfigPatch(current: AppConfig, patch: unknown): AppConfig {
    if (patch === null || typeof patch !== "object" || Array.isArray(patch)) {
        throw new Error("Config patch must be an object");
    }
    const p = patch as Partial<Record<keyof AppConfig, Record<string, unknown>>>;
    return {
        features: {
            aiAssistant:
                typeof p.features?.aiAssistant === "boolean"
                    ? p.features.aiAssistant
                    : current.features.aiAssistant,
        },
        ai: {
            rateMaxPerWindow: clampInt(p.ai?.rateMaxPerWindow, 1, 120, current.ai.rateMaxPerWindow),
            modelTier:
                typeof p.ai?.modelTier === "string" && p.ai.modelTier in MODELS
                    ? (p.ai.modelTier as ModelTier)
                    : current.ai.modelTier,
        },
    };
}

/** Parses the SUPERADMIN_EMAILS env value into a normalized set. */
export function parseSuperadminEmails(raw: string | undefined): Set<string> {
    return new Set(
        (raw ?? "")
            .split(",")
            .map((e) => e.trim().toLowerCase())
            .filter((e) => e.length > 3 && e.includes("@")),
    );
}

export function isSuperadminEmail(email: string | undefined, raw: string | undefined): boolean {
    if (!email) return false;
    return parseSuperadminEmails(raw).has(email.trim().toLowerCase());
}

function clampInt(v: unknown, min: number, max: number, fallback: number): number {
    const n = typeof v === "number" && Number.isFinite(v) ? Math.round(v) : NaN;
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}
