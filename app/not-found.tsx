import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** 404 for any unknown route (e.g. a mistyped team or event URL). */
export default async function NotFound() {
    const t = await getTranslations("ErrorPages");
    return (
        <div className="container mx-auto flex min-h-[60vh] flex-col items-start justify-center gap-4 px-4 py-16 md:px-8">
            <p className="font-mono text-sm text-muted-foreground">404</p>
            <h1 className="text-3xl font-black md:text-4xl">{t("notFoundTitle")}</h1>
            <p className="max-w-prose text-muted-foreground">{t("notFoundBody")}</p>
            <div className="flex flex-wrap gap-2">
                <Link href="/" className="flex min-h-[44px] items-center rounded-xl bg-brand px-4 text-sm font-bold text-brand-foreground">
                    {t("home")}
                </Link>
                <Link href="/events" className="flex min-h-[44px] items-center rounded-xl border border-border px-4 text-sm font-bold text-foreground hover:bg-muted">
                    {t("allEvents")}
                </Link>
            </div>
        </div>
    );
}
