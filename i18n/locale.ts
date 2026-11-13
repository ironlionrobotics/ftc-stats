"use server";

import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, locales, type Locale } from "./config";

/**
 * Resolves the active locale: the NEXT_LOCALE cookie if set, otherwise the
 * best match from the browser's Accept-Language header, otherwise the default.
 * Called by i18n/request.ts on every request.
 */
export async function getUserLocale(): Promise<Locale> {
    const cookieStore = await cookies();
    const fromCookie = cookieStore.get(LOCALE_COOKIE)?.value;
    if (isLocale(fromCookie)) return fromCookie;

    const accept = (await headers()).get("accept-language") ?? "";
    for (const part of accept.split(",")) {
        const tag = part.split(";")[0].trim().toLowerCase().slice(0, 2);
        if (isLocale(tag)) return tag;
    }
    return defaultLocale;
}

/**
 * Persists the user's locale choice. Called by the LocaleSwitcher server
 * action. A plain cookie write; next-intl re-reads it on the next render.
 */
export async function setUserLocale(locale: Locale): Promise<void> {
    const value: Locale = isLocale(locale) ? locale : defaultLocale;
    const cookieStore = await cookies();
    cookieStore.set(LOCALE_COOKIE, value, {
        path: "/",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        sameSite: "lax",
    });
}

// Re-export the locale list as an async accessor so client components can fetch
// it without importing the plain config through a "use server" boundary.
export async function getLocales(): Promise<readonly Locale[]> {
    return locales;
}
