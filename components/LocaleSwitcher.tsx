"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Languages } from "lucide-react";
import { setUserLocale } from "@/i18n/locale";
import { locales, type Locale } from "@/i18n/config";

/**
 * Locale toggle for the sidebar footer. Writes the NEXT_LOCALE cookie via the
 * setUserLocale server action, then refreshes so Server Components re-render in
 * the new locale (no URL change — decision: cookie-based, no i18n routing).
 */
export default function LocaleSwitcher() {
    const t = useTranslations("LocaleSwitcher");
    const active = useLocale();
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    function select(next: Locale) {
        if (next === active) return;
        startTransition(async () => {
            await setUserLocale(next);
            router.refresh();
        });
    }

    return (
        <div className="w-full flex items-center justify-between px-4 py-2.5 rounded-xl bg-muted border border-border">
            <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                    <Languages size={16} />
                </div>
                <span className="text-sm font-bold text-muted-foreground">{t("label")}</span>
            </div>
            <div className="flex gap-1" role="group" aria-label={t("label")}>
                {locales.map(loc => (
                    <button
                        key={loc}
                        type="button"
                        onClick={() => select(loc)}
                        disabled={isPending}
                        aria-pressed={loc === active}
                        className={clsx(
                            "min-h-[32px] min-w-[36px] px-2 rounded-lg text-xs font-black uppercase transition-all disabled:opacity-50",
                            loc === active
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted border border-border text-muted-foreground hover:text-foreground",
                        )}
                    >
                        {loc}
                    </button>
                ))}
            </div>
        </div>
    );
}
