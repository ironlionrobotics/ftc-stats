"use client";

import { useMemo, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import clsx from "clsx";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { peakSeries, trendFlags, MIN_HISTORY } from "@/lib/robot-logs/trends";
import { BROWNOUT_V, LOW_V } from "@/lib/robot-logs/analysis";
import type { RobotLogDoc } from "@/types/robot-log";
import { round1 } from "./helpers";

type Filter = "all" | "match" | "practice";
const PALETTE = [
    "var(--color-primary)", "var(--color-brand-ink)", "var(--color-warning)", "var(--color-success)",
    "var(--color-error)", "var(--color-muted-foreground)", "#8a6d1f", "#2f8f83", "#7a4fb5", "#b86f2a",
];
const AXIS = { fontSize: 11 } as const;

/** Trends across runs (#120): peak current per motor, minimum voltage, flags of the latest run. */
export default function TrendsView({ logs }: { logs: RobotLogDoc[] }) {
    const t = useTranslations("RobotHealth");
    const format = useFormatter();
    const [filter, setFilter] = useState<Filter>("all");

    const runs = useMemo(
        () => logs.filter(l => filter === "all" || l.kind === filter).sort((a, b) => a.recordedAt - b.recordedAt),
        [logs, filter],
    );
    const summaries = useMemo(() => runs.map(r => r.summary), [runs]);
    const enough = runs.length >= MIN_HISTORY + 1;
    const peaks = useMemo(() => peakSeries(summaries), [summaries]);
    const peakData = useMemo(
        () => peaks.rows.map((row, i) => ({ ...row, n: i + 1, at: runs[i].recordedAt })),
        [peaks, runs],
    );
    const vData = useMemo(() => runs.map((r, i) => ({ n: i + 1, at: r.recordedAt, vMin: r.summary.vMin })), [runs]);
    const flags = useMemo(() => trendFlags(summaries), [summaries]);

    const tooltipLabel = (_: unknown, payload: readonly { payload?: { at?: number } }[]) => {
        const at = payload?.[0]?.payload?.at;
        return at ? format.dateTime(new Date(at), { dateStyle: "medium", timeStyle: "short" }) : "";
    };

    return (
        <div className="space-y-4">
            <div role="radiogroup" aria-label={t("trendsFilter")} className="flex gap-1 md:w-fit">
                {(["all", "match", "practice"] as const).map(k => (
                    <button key={k} type="button" role="radio" aria-checked={filter === k} onClick={() => setFilter(k)}
                        className={clsx("min-h-[44px] flex-1 rounded-lg border px-4 text-sm font-semibold", filter === k ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                        {k === "all" ? t("filterAll") : t(`kinds.${k}`)}
                    </button>
                ))}
            </div>

            {!enough ? (
                <p className="rounded-xl border border-border bg-muted p-6 text-muted-foreground">{t("trendsNeedFour", { n: runs.length })}</p>
            ) : (
                <>
                    <section className="space-y-2">
                        <h2 className="text-sm font-bold uppercase text-muted-foreground">{t("trendsFlagsTitle")}</h2>
                        {flags.length === 0 ? <p className="rounded-xl bg-success-tint p-3 text-sm text-success">{t("trendsNoFlags")}</p> : (
                            <ul className="space-y-2">
                                {flags.map((f, i) => (
                                    <li key={i} className="rounded-xl bg-warning-tint p-3 text-sm text-warning">
                                        {t(`trendFlags.${f.code}`, {
                                            device: f.device,
                                            value: f.code === "voltageDrop" ? (Math.round(f.value * 100) / 100).toString() : round1(f.value),
                                            baseline: f.code === "voltageDrop" ? (Math.round(f.baseline * 100) / 100).toString() : round1(f.baseline),
                                            pct: Math.round((f.value / f.baseline - 1) * 100),
                                            delta: (Math.round((f.baseline - f.value) * 100) / 100).toString(),
                                        })}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {peaks.devices.length > 0 && (
                        <section className="space-y-2">
                            <h2 className="text-sm font-bold uppercase text-muted-foreground">{t("trendsPeakTitle")}</h2>
                            <div className="h-64 w-full rounded-2xl border border-border bg-card p-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={peakData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                        <XAxis dataKey="n" tick={AXIS} stroke="var(--color-muted-foreground)" />
                                        <YAxis tick={AXIS} stroke="var(--color-muted-foreground)" width={40} unit=" A" />
                                        <Tooltip labelFormatter={tooltipLabel} />
                                        <Legend wrapperStyle={{ fontSize: 12 }} />
                                        {peaks.devices.map((d, i) => (
                                            <Line key={d} dataKey={d} name={d} stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5} dot isAnimationActive={false} connectNulls />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </section>
                    )}

                    <section className="space-y-2">
                        <h2 className="text-sm font-bold uppercase text-muted-foreground">{t("trendsVminTitle")}</h2>
                        <div className="h-56 w-full rounded-2xl border border-border bg-card p-2">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={vData} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                    <XAxis dataKey="n" tick={AXIS} stroke="var(--color-muted-foreground)" />
                                    <YAxis tick={AXIS} stroke="var(--color-muted-foreground)" width={40} domain={[BROWNOUT_V - 0.5, "auto"]} unit=" V" />
                                    <Tooltip labelFormatter={tooltipLabel} />
                                    <Line dataKey="vMin" name={t("tileVmin")} stroke="var(--color-primary)" strokeWidth={2} dot isAnimationActive={false} connectNulls />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                        <p className="text-xs text-muted-foreground">{t("runIndex")} · {LOW_V} V / {BROWNOUT_V} V</p>
                    </section>
                </>
            )}
        </div>
    );
}
