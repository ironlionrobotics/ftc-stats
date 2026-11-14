import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Search } from "lucide-react";
import FollowStar from "@/components/home/FollowStar";
import type { EventListItem, EventRegion } from "@/lib/event-windows";

/**
 * "Eventos de hoy y próximos" on Hoy (decision #110). Server-rendered; the
 * region/search form is a plain GET (works without JS, no client bundle).
 */
export default async function EventsToday({ items, followed, region, query, season }: {
    items: EventListItem[];
    followed: string[];
    region: EventRegion;
    query: string;
    season: number;
}) {
    const t = await getTranslations("Following");
    const format = await getFormatter();
    const fmtDate = (s: string) => format.dateTime(new Date(s), { day: "numeric", month: "short", timeZone: "UTC" });
    return (
        <section aria-labelledby="events-today-heading" className="mt-10">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <h2 id="events-today-heading" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("eventsTitle")}</h2>
                <form method="get" className="flex flex-wrap items-center gap-2" role="search">
                    <label className="sr-only" htmlFor="ev-region">{t("region")}</label>
                    <select id="ev-region" name="region" defaultValue={region} className="min-h-[40px] rounded-lg border border-border bg-card px-2 text-sm">
                        <option value="MX">{t("regionMx")}</option>
                        <option value="all">{t("regionAll")}</option>
                    </select>
                    <label className="sr-only" htmlFor="ev-q">{t("search")}</label>
                    <input id="ev-q" name="q" defaultValue={query} placeholder={t("searchPh")} maxLength={40}
                        className="min-h-[40px] w-40 rounded-lg border border-border bg-card px-3 text-sm" />
                    <button type="submit" className="inline-flex min-h-[40px] items-center gap-1 rounded-lg border border-border px-3 text-sm" aria-label={t("search")}>
                        <Search size={16} aria-hidden />
                    </button>
                </form>
            </div>
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">{region === "MX" ? t("noneMx") : t("none")}</p>
            ) : (
                <ul className="divide-y divide-border border-y border-border">
                    {items.map(e => (
                        <li key={e.code} className="flex items-center justify-between gap-3 py-2">
                            <div className="min-w-0">
                                <Link href={`/event/${e.code}?season=${season}`} className="block truncate font-semibold hover:underline">{e.name}</Link>
                                <p className="truncate text-xs text-muted-foreground">
                                    {e.phase === "live"
                                        ? <span className="font-semibold text-success">{t("live")}</span>
                                        : <span>{t("inDays", { days: e.inDays })}</span>}
                                    {" · "}{fmtDate(e.dateStart)}{e.dateEnd !== e.dateStart && `–${fmtDate(e.dateEnd)}`}
                                    {e.place && ` · ${e.place}`}
                                    {" · "}<span className="font-mono">{e.code}</span>
                                </p>
                            </div>
                            <FollowStar kind="event" value={e.code} following={followed.includes(e.code)} label={e.name} />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
