"use client";

import { useTranslations } from "next-intl";

/**
 * Resolves a react-hook-form / Zod error message for display.
 *
 * Two kinds of message reach the UI:
 *   1. Codes we author ourselves in lib/schemas/scouting.ts (e.g.
 *      `validation.wouldPick`) — dot-paths inside the `Errors` namespace.
 *   2. Zod's own built-in messages (English, bounds/type checks) — no catalog
 *      entry exists, so they pass through untouched.
 *
 * `t.has()` (next-intl ≥ 4) distinguishes the two without throwing, so an
 * unknown message degrades to itself instead of blanking the field error.
 * A global Zod errorMap would let case 2 be translated too — not done yet.
 */
export function useZodMessage(): (message?: string) => string | undefined {
    const tErr = useTranslations("Errors");
    return (message?: string) => (message && tErr.has(message) ? tErr(message) : message);
}
