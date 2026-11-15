"use client";

import { useTranslations, useFormatter } from "next-intl";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { totalsSeries } from "@/lib/practice-stats";
import type { PracticeRun } from "@/types/practice";

/** Trend of full-match practice totals and phases over time (#105). Lazy-loaded. */
export default function ProgressChart({ runs }: { runs: PracticeRun[] }) {
    const t = useTranslations("Workshop");
    const format = useFormatter();
    const data = totalsSeries(runs).map((p, i) => ({ ...p, n: i + 1 }));
    if (data.length < 2) return <p className="text-sm text-muted-foreground">{t("chartNeedsTwo")}</p>;
    return (
        <div className="h-72 w-full rounded-2xl border border-border bg-card p-2">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                    <XAxis dataKey="n" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                    <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" width={36} />
                    <Tooltip
                        labelFormatter={(_, payload) => {
                            const at = payload?.[0]?.payload?.at as number | undefined;
                            return at ? format.dateTime(new Date(at), { dateStyle: "medium", timeStyle: "short" }) : "";
                        }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Line type="monotone" dataKey="total" name={t("total")} stroke="var(--color-primary)" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="auto" name={t("phaseShort.auto")} stroke="var(--color-brand-ink)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="teleop" name={t("phaseShort.teleop")} stroke="var(--color-warning)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="endgame" name={t("phaseShort.endgame")} stroke="var(--color-muted-foreground)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
