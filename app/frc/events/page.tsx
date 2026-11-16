// FRC events of a season (decision #118). Same idioms as /events: server
// component, season from ?season=, links to the event view.
import Link from "next/link";
import { Calendar, MapPin, ChevronRight } from "lucide-react";
import { getTranslations, getLocale } from "next-intl/server";
import { fetchFrcEvents, hasFrcCredentials } from "@/lib/frc-api";
import { getCurrentSeason } from "@/lib/constants";
import { parseSeason } from "@/lib/input-guards";
import { Notice } from "@/components/ui/Status";

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function FrcEventsPage({ searchParams }: PageProps) {
    const t = await getTranslations("FrcPages");
    const locale = await getLocale();
    const resolved = await searchParams;
    const current = getCurrentSeason("FRC");
    const season = parseSeason(resolved?.season, current) ?? current;

    const configured = hasFrcCredentials();
    const events = configured ? await fetchFrcEvents(season) : [];

    // Group by month of the start date, chronological.
    const sorted = [...events].sort((a, b) => new Date(a.dateStart).getTime() - new Date(b.dateStart).getTime());
    const groups = new Map<string, { label: string; items: typeof sorted }>();
    for (const e of sorted) {
        const d = new Date(e.dateStart);
        const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
        if (!groups.has(key)) {
            groups.set(key, { label: d.toLocaleDateString(locale, { month: "long", year: "numeric", timeZone: "UTC" }), items: [] });
        }
        groups.get(key)!.items.push(e);
    }

    return (
        <div className="container mx-auto px-4 md:px-8 py-8 md:py-12">
            <header className="mb-8 border-b border-border pb-6">
                <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground mb-3">
                    <span className="text-primary">●</span> {t("season", { season })}
                </p>
                <h1 className="text-4xl md:text-5xl font-bold font-display tracking-tight text-foreground">{t("eventsTitle")}</h1>
                <p className="text-base md:text-lg text-muted-foreground mt-2">{t("eventsSubtitle")}</p>
            </header>

            {!configured ? (
                <Notice tone="warn">{t("notConfigured")}</Notice>
            ) : events.length === 0 ? (
                <Notice tone="info">{t("noEvents")}</Notice>
            ) : (
                <div className="space-y-8">
                    {[...groups.entries()].map(([key, g]) => (
                        <section key={key}>
                            <h2 className="mb-3 font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">{g.label}</h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {g.items.map(event => (
                                    <Link
                                        key={event.code}
                                        href={`/frc/event/${event.code}?season=${season}`}
                                        className="group relative flex flex-col p-4 rounded-xl border border-border bg-card hover:bg-muted/50 transition-all hover:border-primary/30"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <span className="bg-primary/10 text-primary font-mono text-xs font-bold px-2 py-1 rounded-md inline-block">{event.code}</span>
                                            <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100" aria-hidden />
                                        </div>
                                        <h3 className="font-bold text-foreground line-clamp-1 mb-1" title={event.name}>{event.name}</h3>
                                        <div className="mt-auto flex flex-col gap-1 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1.5">
                                                <Calendar className="w-3.5 h-3.5" aria-hidden />
                                                <span>{new Date(event.dateStart).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "UTC" })}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <MapPin className="w-3.5 h-3.5" aria-hidden />
                                                <span className="truncate">{event.city ? `${event.city}, ` : ""}{event.stateProv || event.country}</span>
                                            </div>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            )}
        </div>
    );
}
