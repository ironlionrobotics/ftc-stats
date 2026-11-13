/**
 * Pure input-hardening helpers for the AI assistant server action
 * (app/actions/ai.ts). Kept in a plain module (not the "use server" file,
 * which may only export async functions) so the security-relevant validation
 * is unit-testable without mocking firebase-admin or fetch.
 */

export type ChatTurn = { role: "user" | "assistant"; content: string };

export const AI_LIMITS = {
    maxMessageChars: 4000,
    maxHistoryTurns: 20,
    maxHistoryTotalChars: 20000,
    maxContextChars: 8000,
    rateWindowSeconds: 60,
    rateMaxPerWindow: 15,
} as const;

// Model allow-list. Concrete ids resolved here, never taken from client input,
// so a caller can't inject an arbitrary path into the Gemini endpoint URL.
export const MODELS = {
    pro: "gemini-3-pro-preview",
} as const;
export type ModelTier = keyof typeof MODELS;
export const DEFAULT_TIER: ModelTier = "pro";

/** Resolves a client-supplied tier key to a concrete model id via the allow-list. */
export function resolveModel(tier: string | undefined): string {
    return MODELS[(tier as ModelTier)] ?? MODELS[DEFAULT_TIER];
}

export type MessageValidation =
    | { ok: true; value: string }
    | { ok: false; reason: "empty" | "too-long" };

/** Trims and bounds a user message. */
export function validateMessage(message: unknown): MessageValidation {
    const trimmed = typeof message === "string" ? message.trim() : "";
    if (!trimmed) return { ok: false, reason: "empty" };
    if (trimmed.length > AI_LIMITS.maxMessageChars) return { ok: false, reason: "too-long" };
    return { ok: true, value: trimmed };
}

/**
 * Sanitizes client-supplied history: keeps only well-formed {role, content}
 * turns, drops anything else, caps to the most recent maxHistoryTurns, then
 * trims from the front until under maxHistoryTotalChars.
 */
export function sanitizeHistory(history: unknown): ChatTurn[] {
    if (!Array.isArray(history)) return [];
    const clean: ChatTurn[] = [];
    for (const item of history) {
        if (!item || typeof item !== "object") continue;
        const role = (item as { role?: unknown }).role;
        const content = (item as { content?: unknown }).content;
        if ((role !== "user" && role !== "assistant") || typeof content !== "string") continue;
        clean.push({ role, content });
    }
    let recent = clean.slice(-AI_LIMITS.maxHistoryTurns);
    let total = recent.reduce((n, t) => n + t.content.length, 0);
    while (recent.length > 0 && total > AI_LIMITS.maxHistoryTotalChars) {
        total -= recent[0].content.length;
        recent = recent.slice(1);
    }
    return recent;
}

/** Serializes and length-caps the context object injected into the prompt. */
export function capContext(contextData: unknown): string {
    let json: string;
    try {
        json = JSON.stringify(contextData ?? {});
    } catch {
        json = "{}";
    }
    if (json.length > AI_LIMITS.maxContextChars) {
        json = json.slice(0, AI_LIMITS.maxContextChars) + "…(truncado)";
    }
    return json;
}
