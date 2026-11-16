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

export interface MaintenanceBanner {
    enabled: boolean;
    /** Plain text (rendered escaped), ≤ BANNER_MAX chars per locale. */
    es: string;
    en: string;
}

export interface AppConfig {
    features: {
        /** Master switch for the AI assistant (chat FAB + server action). */
        aiAssistant: boolean;
        /** Per-robot starting points of the forecast (#117). Env STARTING_POINTS=off wins. */
        startingPoints: boolean;
        /** FRC section (/frc/*, "More" entry). */
        frc: boolean;
        /** Live push notifications (cron tick). Off = the tick answers "paused" and sends nothing. */
        liveNotifications: boolean;
        /** Site-wide notice (event day, maintenance). */
        maintenanceBanner: MaintenanceBanner;
    };
    ai: {
        /** Requests per user per rate window (overrides AI_LIMITS default). */
        rateMaxPerWindow: number;
        /** Default model tier — must be a key of the ai-guards allow-list. */
        modelTier: ModelTier;
    };
}

/** Boolean feature flags (the banner is configured separately). */
export type BooleanFlag = "aiAssistant" | "startingPoints" | "frc" | "liveNotifications";
export const BOOLEAN_FLAGS: readonly BooleanFlag[] = ["aiAssistant", "startingPoints", "frc", "liveNotifications"];

export const BANNER_MAX = 200;

export const DEFAULT_APP_CONFIG: AppConfig = {
    features: {
        aiAssistant: true,
        startingPoints: true,
        frc: true,
        liveNotifications: true,
        maintenanceBanner: { enabled: false, es: "", en: "" },
    },
    ai: {
        rateMaxPerWindow: 15,
        modelTier: "pro",
    },
};

type Loose = Partial<Record<keyof AppConfig, Record<string, unknown>>>;

/** Field-by-field validation of `input` over `base`; anything invalid keeps the base value. */
function applyOver(base: AppConfig, input: Loose): AppConfig {
    const f = input.features ?? {};
    const bool = (k: BooleanFlag) => (typeof f[k] === "boolean" ? (f[k] as boolean) : base.features[k]);
    const b = (f.maintenanceBanner ?? {}) as Record<string, unknown>;
    const bb = base.features.maintenanceBanner;
    return {
        features: {
            aiAssistant: bool("aiAssistant"),
            startingPoints: bool("startingPoints"),
            frc: bool("frc"),
            liveNotifications: bool("liveNotifications"),
            maintenanceBanner: {
                enabled: typeof b.enabled === "boolean" ? b.enabled : bb.enabled,
                es: typeof b.es === "string" ? cleanText(b.es) : bb.es,
                en: typeof b.en === "string" ? cleanText(b.en) : bb.en,
            },
        },
        ai: {
            rateMaxPerWindow: clampInt(input.ai?.rateMaxPerWindow, 1, 120, base.ai.rateMaxPerWindow),
            modelTier:
                typeof input.ai?.modelTier === "string" && input.ai.modelTier in MODELS
                    ? (input.ai.modelTier as ModelTier)
                    : base.ai.modelTier,
        },
    };
}

/** Deep-merges a stored partial over the defaults. Unknown keys are dropped. */
export function mergeAppConfig(stored: unknown): AppConfig {
    const s = stored !== null && typeof stored === "object" && !Array.isArray(stored) ? (stored as Loose) : {};
    return applyOver(DEFAULT_APP_CONFIG, s);
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
    return applyOver(current, patch as Loose);
}

/** Banner text: no control characters, collapsed whitespace, capped. Rendered escaped, never as HTML. */
export function cleanText(v: string): string {
    return v.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, BANNER_MAX);
}

/** The banner text to show for a locale, or null when off/empty (falls back to the other locale). */
export function bannerText(b: MaintenanceBanner, locale: string): string | null {
    if (!b.enabled) return null;
    const primary = locale.startsWith("en") ? b.en : b.es;
    return primary || b.es || b.en || null;
}

export type FlagSource = "env" | "config" | "default";

/**
 * Effective value of a boolean flag. Precedence: env kill switch (`=off`) >
 * stored config > default. Only flags with an env kill switch list one here.
 */
export const ENV_KILL_SWITCH: Partial<Record<BooleanFlag, string>> = { startingPoints: "STARTING_POINTS" };

export function resolveFlag(
    flag: BooleanFlag,
    config: AppConfig,
    stored: unknown,
    env: Record<string, string | undefined>,
): { value: boolean; source: FlagSource } {
    const envName = ENV_KILL_SWITCH[flag];
    if (envName && env[envName] === "off") return { value: false, source: "env" };
    const s = (stored as Loose | undefined)?.features?.[flag];
    if (typeof s === "boolean") return { value: config.features[flag], source: "config" };
    return { value: config.features[flag], source: "default" };
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

export interface ConfigChange { path: string; before: unknown; after: unknown }

/** Dotted-path diff of two plain configs (leaves only). */
export function diffConfig(before: unknown, after: unknown, prefix = ""): ConfigChange[] {
    const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
    if (!isObj(before) || !isObj(after)) {
        return JSON.stringify(before) === JSON.stringify(after) ? [] : [{ path: prefix || "(root)", before, after }];
    }
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return keys.flatMap(k => diffConfig(before[k], after[k], prefix ? `${prefix}.${k}` : k));
}

