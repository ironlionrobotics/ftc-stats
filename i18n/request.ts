import { getRequestConfig } from "next-intl/server";
import { getUserLocale } from "./locale";

/**
 * next-intl request config (no i18n routing). Runs per request: resolves the
 * locale from the cookie/Accept-Language and loads that locale's messages.
 * Wired via createNextIntlPlugin in next.config.ts.
 */
export default getRequestConfig(async () => {
    const locale = await getUserLocale();
    return {
        locale,
        messages: (await import(`../messages/${locale}.json`)).default,
    };
});
