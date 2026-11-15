"use client";

import clsx from "clsx";
import { useLocale, useTranslations } from "next-intl";
import type { ScheduledMatch } from "@/lib/scout-claims";

/**
 * Capture queue (decision #116): the next qualification matches with their
 * four robots. One tap on a robot opens the match form with the team and the
 * match number already filled in — no typing the match number, no hunting
 * for the team. Red always left, with the word, never color alone.
 */
export default function CaptureQueue({ matches, focusMatch, followedTeam, onPick }: {
    matches: ScheduledMatch[];
    /** Match to start from (e.g. "Scoutear Q14" on Hoy). */
    focusMatch: number | null;
    followedTeam: number | null;
    onPick: (team: number, match: number) => void;
}) {
    const t = useTranslations("ScoutingEvent");
    const tA = useTranslations("Alliance");
    const locale = useLocale();
    const from = focusMatch && matches.some(m => m.matchNumber === focusMatch) ? focusMatch : null;
    const list = (from ? matches.filter(m => m.matchNumber >= from) : matches).slice(0, 20);
    if (list.length === 0) {
        return <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{t("queueEmpty")}</p>;
    }
    return (
        <section aria-labelledby="queue-title" className="space-y-2">
            <div>
                <h2 id="queue-title" className="text-base font-bold text-foreground">{t("queueTitle")}</h2>
                <p className="text-sm text-muted-foreground">{t("queueHelp")}</p>
            </div>
            <ol className="space-y-2">
                {list.map(m => {
                    const mine = followedTeam !== null && (m.red.includes(followedTeam) || m.blue.includes(followedTeam));
                    return (
                        <li key={m.matchNumber}
                            className={clsx("rounded-xl border border-border bg-card p-2", mine && "shadow-[inset_4px_0_0_var(--color-brand)]", m.matchNumber === from && "border-brand")}>
                            <div className="mb-1.5 flex items-baseline justify-between px-1">
                                <span className="font-mono text-sm font-extrabold text-foreground">Q{m.matchNumber}</span>
                                {m.startTime && Number.isFinite(Date.parse(m.startTime)) && (
                                    <span className="text-xs text-muted-foreground" suppressHydrationWarning>
                                        {new Date(m.startTime).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" })}
                                    </span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                {(["red", "blue"] as const).map(side => (
                                    <div key={side} className={clsx("grid gap-1 rounded-lg p-1", side === "red" ? "bg-alliance-red-tint" : "bg-alliance-blue-tint")}>
                                        <span className={clsx("px-1 text-xs font-extrabold tracking-[0.08em]", side === "red" ? "text-alliance-red" : "text-alliance-blue text-right")}>
                                            {side === "red" ? tA("red") : tA("blue")}
                                        </span>
                                        {m[side].map(team => (
                                            <button key={team} type="button" onClick={() => onPick(team, m.matchNumber)}
                                                aria-label={t("scoutRobot", { team, match: `Q${m.matchNumber}` })}
                                                className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-md bg-card font-mono text-base font-bold text-foreground hover:bg-muted">
                                                {team === followedTeam && <span className="h-2 w-2 rounded-full bg-brand" aria-hidden />}
                                                {team}
                                            </button>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </section>
    );
}
