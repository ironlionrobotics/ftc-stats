"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import clsx from "clsx";
import { Check, ChevronDown, CalendarDays } from "lucide-react";
import { Sheet } from "@/components/ui/Sheet";
import { SCOUTING_EVENT_COOKIE } from "@/lib/scouting-event";
import type { EventSummary } from "@/lib/active-event-context";

/** Writes the app-wide active event (decision #116; same cookie as #100). */
export function setActiveEventCookie(code: string) {
    document.cookie = `${SCOUTING_EVENT_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 120}; samesite=lax`;
}

const noop = () => () => {};

function dateRange(e: EventSummary, locale: string): string {
    const fmt = (s: string) => new Date(s).toLocaleDateString(locale, { day: "numeric", month: "short", timeZone: "UTC" });
    const a = fmt(e.dateStart), b = fmt(e.dateEnd);
    return a === b ? a : `${a} – ${b}`;
}

/**
 * The event chip of the shell: shows the active event and opens a sheet to
 * change it. Changing it re-renders every page that works on "the event I'm
 * at" (Evento, Capturar, Estrategia, Préstamos). A page opened with
 * `?event=X` (shared link) works on X, so the chip shows X too and remembers it.
 */
export default function EventSwitcher({ active, options, wide }: { active: EventSummary | null; options: EventSummary[]; wide?: boolean }) {
    const t = useTranslations("Shell");
    const locale = useLocale();
    const router = useRouter();
    const pathname = usePathname();
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    // location.search read directly (re-read on every pathname change): avoids
    // useSearchParams' Suspense requirement in the root layout. Server: none.
    const query = useSyncExternalStore(noop, () => window.location.search, () => "");
    const search = new URLSearchParams(query);
    const linked = search.get("event")?.toUpperCase() ?? null;
    const shown = (linked && options.find(o => o.code === linked)) || active;

    // A shared link's event becomes the remembered one (chip and page agree next time).
    useEffect(() => {
        if (linked && options.some(o => o.code === linked) && linked !== active?.code) setActiveEventCookie(linked);
    }, [linked, options, active?.code]);

    const choose = (code: string) => {
        setActiveEventCookie(code);
        setOpen(false);
        startTransition(() => {
            if (pathname.startsWith("/event/")) {
                router.push(`/event/${code}`);
                router.refresh();
            } else if (linked) {
                const rest = new URLSearchParams(search.toString());
                rest.delete("event");
                router.replace(rest.size ? `${pathname}?${rest}` : pathname);
                router.refresh();
            } else {
                router.refresh();
            }
        });
    };

    const live = options.filter(e => e.phase === "live");
    const upcoming = options.filter(e => e.phase === "upcoming");
    const past = options.filter(e => e.phase === "past").reverse().slice(0, 6);
    const groups: Array<[string, EventSummary[]]> = [["live", live], ["upcoming", upcoming], ["past", past]];

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                aria-haspopup="dialog"
                aria-label={shown ? `${t("eventSwitch.title")}: ${shown.code} ${shown.name}` : t("eventSwitch.choose")}
                className={clsx(
                    "flex min-w-0 items-center gap-2 overflow-hidden border border-border bg-card text-left text-foreground hover:bg-muted",
                    wide ? "min-h-[44px] w-full rounded-lg px-3" : "min-h-[40px] w-full max-w-full rounded-full px-3",
                    pending && "opacity-60",
                )}
            >
                {shown?.live
                    ? <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />
                    : <CalendarDays className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
                <span className="min-w-0 flex-1 truncate text-sm">
                    {shown ? <><b className="font-bold">{shown.code}</b> <span className="text-muted-foreground">{shown.name}</span></> : t("eventSwitch.choose")}
                </span>
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            </button>
            <Sheet open={open} onClose={() => setOpen(false)} title={t("eventSwitch.title")} closeLabel={t("account.close")}>
                <p className="mb-3 text-sm text-muted-foreground">{t("eventSwitch.help")}</p>
                {groups.map(([key, list]) => list.length > 0 && (
                    <section key={key} className="mb-3">
                        <h3 className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{t(`eventSwitch.${key}`)}</h3>
                        <ul className="divide-y divide-border rounded-lg border border-border">
                            {list.map(e => {
                                const isActive = e.code === shown?.code;
                                return (
                                    <li key={e.code}>
                                        <button
                                            type="button"
                                            onClick={() => choose(e.code)}
                                            aria-current={isActive ? "true" : undefined}
                                            className={clsx("flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted", isActive && "shadow-[inset_4px_0_0_var(--color-brand)]")}
                                        >
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate text-sm font-semibold text-foreground">{e.name}</span>
                                                <span className="block text-xs text-muted-foreground"><span className="font-mono">{e.code}</span> · {dateRange(e, locale)}</span>
                                            </span>
                                            {isActive && <Check className="h-5 w-5 shrink-0 text-brand-ink" aria-hidden />}
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                ))}
                <Link href="/events" onClick={() => setOpen(false)} className="flex min-h-[44px] items-center justify-center rounded-lg border border-border text-sm font-semibold text-foreground hover:bg-muted">
                    {t("eventSwitch.all")}
                </Link>
            </Sheet>
        </>
    );
}
