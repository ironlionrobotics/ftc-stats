"use client";

import { useTranslations } from "next-intl";
import { Check, X, Minus } from "lucide-react";
import clsx from "clsx";
import type { LedgerRow, Scorecard } from "@/lib/prediction-ledger";

/**
 * "Who PRIDE picked vs who won" (decision #111). The pick is the forecast
 * made BEFORE the match (only earlier matches), so a ✓/✗ here is honest.
 */

const pct = (p: number) => `${Math.round(p * 100)}%`;

export default function PredictionCell({ row }: { row?: LedgerRow }) {
    const t = useTranslations("PredictionLedger");
    if (!row || row.pRed === null) {
        return <span className="text-xs text-muted-foreground" title={t("noForecastHint")}>{t("noForecast")}</span>;
    }
    const fav = row.pRed >= 0.5 ? "Red" : "Blue";
    const p = Math.max(row.pRed, 1 - row.pRed);
    if (row.predicted === null) {
        return (
            <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted-foreground" title={t("tossupHint")}>
                <Minus size={14} aria-hidden /> {t("tossup", { pct: pct(p) })}
            </span>
        );
    }
    const label = t(fav === "Red" ? "red" : "blue");
    return (
        <span className="inline-flex items-center gap-1.5">
            <span
                className="rounded-md px-2 py-1 font-mono text-xs font-bold text-white"
                style={{ background: fav === "Red" ? "var(--color-alliance-red)" : "var(--color-alliance-blue)" }}
            >
                {label} {pct(p)}
            </span>
            {row.correct === null ? (
                <span className="text-xs text-muted-foreground">{t("tie")}</span>
            ) : row.correct ? (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-success/15 px-1.5 py-1 text-xs font-bold text-success" aria-label={t("hit")}>
                    <Check size={14} strokeWidth={3} aria-hidden /> {t("hitShort")}
                </span>
            ) : (
                <span className="inline-flex items-center gap-0.5 rounded-md bg-danger/15 px-1.5 py-1 text-xs font-bold text-danger" aria-label={t("miss")}>
                    <X size={14} strokeWidth={3} aria-hidden /> {t("missShort")}
                </span>
            )}
        </span>
    );
}

export function LedgerSummary({ card, team }: { card: Scorecard; team: number | null }) {
    const t = useTranslations("PredictionLedger");
    const tossups = card.n - card.calls;
    return (
        <section aria-labelledby="ledger-heading" className="rounded-xl border border-border bg-card p-4">
            <h3 id="ledger-heading" className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {team ? t("titleTeam", { team }) : t("title")}
            </h3>
            <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <p>
                    <span className="font-mono text-3xl font-black tabular-nums">{card.hits}/{card.calls}</span>{" "}
                    <span className="text-sm text-muted-foreground">{t("hits", { pct: card.accuracy === null ? "—" : pct(card.accuracy) })}</span>
                </p>
                {tossups > 0 && <p className="text-sm text-muted-foreground">{t("tossups", { n: tossups })}</p>}
                {card.brier !== null && (
                    <p className={clsx("text-sm", card.brier < 0.25 ? "text-success" : "text-warning")}>
                        {t("brier", { brier: card.brier.toFixed(3) })}
                    </p>
                )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t("explain")}</p>
        </section>
    );
}
