/**
 * Input hardening for the analytics server action (app/actions/analytics.ts).
 * Kept in a plain module (not the "use server" file) so it's unit-testable.
 *
 * The concern (M5): analyzeMultipleEvents fans out to the FTC API per event.
 * A caller passing a huge or junk eventCodes array could amplify that fan-out.
 * Bounding + de-duping the codes caps the per-request work; combined with the
 * removal of the client-controllable forceRefresh (which let callers bypass the
 * cache entirely), repeated identical requests are served from cache.
 */

/** Max events one analysis request may span. No real multi-event comparison
 *  needs more than this; it caps the per-request API fan-out. */
export const MAX_ANALYSIS_EVENTS = 30;

/**
 * De-dupes, trims, drops non-string/empty entries, and caps the list length.
 * Order is preserved (first occurrence wins).
 */
export function sanitizeEventCodes(eventCodes: unknown): string[] {
    if (!Array.isArray(eventCodes)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of eventCodes) {
        if (typeof c !== "string") continue;
        const code = c.trim();
        if (!code || seen.has(code)) continue;
        seen.add(code);
        out.push(code);
        if (out.length >= MAX_ANALYSIS_EVENTS) break;
    }
    return out;
}
