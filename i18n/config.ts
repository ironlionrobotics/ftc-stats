/**
 * i18n configuration. Cookie-based locale, NO URL routing (decision: URLs stay
 * `/event/MXTOL`, locale lives in a cookie). English is the default; Spanish is
 * the second locale. See docs/architecture/i18n.md.
 *
 * Plain module (no "use server") so the constants/types can be imported by
 * both server and client code — the server actions live in ./locale.ts.
 */
export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isLocale(value: unknown): value is Locale {
    return typeof value === "string" && (locales as readonly string[]).includes(value);
}
