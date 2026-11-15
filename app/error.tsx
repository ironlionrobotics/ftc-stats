"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import * as Sentry from "@sentry/nextjs";

/**
 * Route-level error boundary: a page threw while rendering. The app shell
 * stays usable; the user can retry the segment or go home. Reported to
 * Sentry (no-op outside production).
 */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    const t = useTranslations("ErrorPages");
    useEffect(() => {
        Sentry.captureException(error);
    }, [error]);
    return (
        <div className="container mx-auto flex min-h-[60vh] flex-col items-start justify-center gap-4 px-4 py-16 md:px-8">
            <h1 className="text-3xl font-black md:text-4xl">{t("errorTitle")}</h1>
            <p className="max-w-prose text-muted-foreground">{t("errorBody")}</p>
            {error.digest && <p className="font-mono text-xs text-muted-foreground">{t("errorRef", { ref: error.digest })}</p>}
            <div className="flex gap-3">
                <button onClick={() => reset()} className="rounded-[4px] bg-foreground px-4 py-2 text-sm font-semibold text-background">
                    {t("retry")}
                </button>
                <Link href="/" className="rounded-[4px] border border-border px-4 py-2 text-sm font-semibold text-foreground">
                    {t("home")}
                </Link>
            </div>
        </div>
    );
}
