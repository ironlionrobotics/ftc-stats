import Link from "next/link";
import { getFormatter, getTranslations } from "next-intl/server";
import { Radio, Check, X, Minus } from "lucide-react";
import clsx from "clsx";
import { getCurrentSeason } from "@/lib/constants";
import { loadLiveScoreboard } from "@/lib/live-scorecard";
import type { Scorecard } from "@/lib/prediction-ledger";
import AutoRefresh from "@/components/oracle/AutoRefresh";

/**
 * "Hoy, en vivo" on /oracle (decision #111): PRIDE's pre-match forecasts vs
 * today's results in every event in progress. Server-rendered and streamed;
 * refreshes itself every 2 minutes while visible.
 */
export default async function LiveScoreboard() {
    const t = await getTranslations("LiveScoreboard");
    const format = await getFormatter();
    const board = await loadLiveScoreboard(getCurrentSeason());
    const pct = (x: number | null) => (x === null ? "—" : format.number(x, { style: "percent", maximumFractionDigits: 1 }));
    const o = board.overall;

    return (
        <section aria-labelledby="live-heading" className="mb-12 md:mb-16 rounded-2xl border border-primary/30 bg-card p-4 md:p-6">
            <AutoRefresh everyMs={120_000} />
            <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id="live-heading" className="flex items-center gap-2 font-display text-2xl font-black md:text-3xl">
                    <Radio size={20} className="text-success" aria-hidden /> {t("title")}
                </h2>
                <span className="text-xs text-muted-foreground">{t("updated", { time: format.dateTime(new Date(board.at), { hour: "numeric", minute: "2-digit" }) })}</span>
            </div>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("lead")}</p>

            {board.events.length === 0 ? (
                <p className="mt-4 text-muted-foreground">{t("none")}</p>
            ) : (
                <>
                    <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Big value={pct(o.accuracy)} label={t("accuracy")} sub={t("accuracySub", { hits: o.hits, calls: o.calls })} />
                        <Big value={o.brier?.toFixed(3) ?? "—"} label={t("brier")} sub={t("brierSub")} good={o.brier !== null && o.brier < 0.25} />
                        <Big value={format.number(o.n)} label={t("matches")} sub={t("matchesSub", { tossups: o.n - o.calls })} />
                        <Big value={`${board.events.length}`} label={t("events")} sub={t("eventsSub", { live: board.liveEvents })} />
                    </div>
                    <Calibration card={o} t={t} />
                    <div className="mt-6 overflow-x-auto">
                        <table className="w-full min-w-[640px] text-left text-sm">
                            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                                <tr className="border-b border-border">
                                    <th className="py-2 pr-3 font-medium">{t("colEvent")}</th>
                                    <th className="py-2 pr-3 font-medium text-right">{t("colHits")}</th>
                                    <th className="py-2 pr-3 font-medium text-right">{t("colBrier")}</th>
                                    <th className="py-2 font-medium">{t("colRecent")}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/60">
                                {board.events.map(e => (
                                    <tr key={e.code}>
                                        <td className="py-2 pr-3">
                                            <Link href={`/event/${e.code}`} className="font-semibold hover:underline">{e.name}</Link>
                                            <div className="text-xs text-muted-foreground"><span className="font-mono">{e.code}</span>{e.place && ` · ${e.place}`}</div>
                                        </td>
                                        <td className="py-2 pr-3 text-right font-mono tabular-nums">
                                            <span className="font-bold">{e.card.hits}/{e.card.calls}</span>
                                            <span className="ml-1 text-xs text-muted-foreground">{pct(e.card.accuracy)}</span>
                                        </td>
                                        <td className={clsx("py-2 pr-3 text-right font-mono tabular-nums", e.card.brier !== null && e.card.brier < 0.25 ? "text-success" : "text-warning")}>
                                            {e.card.brier?.toFixed(3) ?? "—"}
                                        </td>
                                        <td className="py-2">
                                            <span className="flex flex-wrap gap-1">
                                                {e.recent.map(r => (
                                                    <span key={r.label} title={r.p === null ? r.label : `${r.label} · ${Math.round(r.p * 100)}%`}
                                                        className={clsx("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 font-mono text-[11px] font-bold",
                                                            r.correct === null ? "bg-muted text-muted-foreground" : r.correct ? "bg-success/15 text-success" : "bg-danger/15 text-danger")}>
                                                        {r.correct === null ? <Minus size={11} aria-hidden /> : r.correct ? <Check size={11} strokeWidth={3} aria-hidden /> : <X size={11} strokeWidth={3} aria-hidden />}
                                                        {r.label}
                                                    </span>
                                                ))}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </section>
    );
}

function Big({ value, label, sub, good }: { value: string; label: string; sub: string; good?: boolean }) {
    return (
        <div className="rounded-xl border border-border bg-background/40 p-3">
            <div className={clsx("font-mono text-2xl font-black tabular-nums md:text-3xl", good && "text-success")}>{value}</div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>
        </div>
    );
}

function Calibration({ card, t }: { card: Scorecard; t: Awaited<ReturnType<typeof getTranslations<"LiveScoreboard">>> }) {
    const bands = card.bands.filter(b => b.n > 0);
    if (bands.length === 0) return null;
    return (
        <div className="mt-5">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{t("calibration")}</h3>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-5">
                {bands.map(b => (
                    <li key={b.lo} className="rounded-lg border border-border p-2 text-xs">
                        <div className="font-semibold">{t("band", { lo: Math.round(b.lo * 100), hi: Math.round(b.hi * 100) })}</div>
                        <div className="font-mono tabular-nums">{t("bandLine", { pred: Math.round(b.predicted * 100), real: Math.round(b.actual * 100) })}</div>
                        <div className="text-muted-foreground">n={b.n}</div>
                    </li>
                ))}
            </ul>
            <p className="mt-1 text-xs text-muted-foreground">{t("calibrationHint")}</p>
        </div>
    );
}
