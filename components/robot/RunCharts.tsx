"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from "recharts";
import { motorDevices, findChannel } from "@/lib/robot-logs/formats";
import { chartRows } from "@/lib/robot-logs/series";
import { BROWNOUT_V, LOW_V } from "@/lib/robot-logs/analysis";
import type { Channel, RobotLog } from "@/types/robot-log";

const MAX_DEFAULT_LINES = 8;
// Theme tokens first; never the alliance red/blue.
const PALETTE = [
    "var(--color-primary)", "var(--color-brand-ink)", "var(--color-warning)", "var(--color-success)",
    "var(--color-error)", "var(--color-muted-foreground)", "#8a6d1f", "#2f8f83", "#7a4fb5", "#b86f2a",
];
const AXIS = { fontSize: 11 } as const;
const GRID = "var(--color-border)";
const MUTED = "var(--color-muted-foreground)";

/** Position channels → velocity by finite differences (units per second). */
function velocityChannels(log: RobotLog, devices: string[]): Channel[] {
    const out: Channel[] = [];
    for (const d of devices) {
        const vel = findChannel(log, d, "velocity");
        if (vel) { out.push({ ...vel, key: `${d}__v`, device: d }); continue; }
        const pos = findChannel(log, d, "position");
        if (!pos) continue;
        const values = pos.values.map((v, i) => {
            if (i === 0) return NaN;
            const dt = log.t[i] - log.t[i - 1];
            return dt > 0 && Number.isFinite(v) && Number.isFinite(pos.values[i - 1]) ? (v - pos.values[i - 1]) / dt : NaN;
        });
        out.push({ key: `${d}__v`, device: d, quantity: "velocity", unit: "ticks/s", values });
    }
    return out;
}

function Toggles({ devices, hidden, onToggle }: { devices: string[]; hidden: Set<string>; onToggle: (d: string) => void }) {
    return (
        <div className="flex flex-wrap gap-1">
            {devices.map((d, i) => {
                const on = !hidden.has(d);
                return (
                    <button key={d} type="button" aria-pressed={on} onClick={() => onToggle(d)}
                        className={clsx("inline-flex min-h-[44px] items-center gap-2 rounded-full border px-3 text-xs font-semibold",
                            on ? "border-primary bg-primary/10" : "border-border text-muted-foreground")}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? PALETTE[i % PALETTE.length] : "transparent", border: `1px solid ${PALETTE[i % PALETTE.length]}` }} />
                        {d}
                    </button>
                );
            })}
        </div>
    );
}

function useHidden(devices: string[]) {
    const [hidden, setHidden] = useState<Set<string>>(() => new Set(devices.slice(MAX_DEFAULT_LINES)));
    const toggle = (d: string) => setHidden(prev => {
        const next = new Set(prev);
        if (next.has(d)) next.delete(d); else next.add(d);
        return next;
    });
    return { hidden, toggle };
}

/** Charts of one run (#120). Lazy-loaded: Recharts stays out of the main bundle. */
export default function RunCharts({ log }: { log: RobotLog }) {
    const t = useTranslations("RobotHealth");
    const motors = useMemo(() => motorDevices(log), [log]);
    const volt = useMemo(() => log.channels.find(c => c.quantity === "voltage"), [log]);
    const total = useMemo(() => findChannel(log, "total", "current"), [log]);
    const vel = useMemo(() => velocityChannels(log, motors), [log, motors]);
    const velLog = useMemo<RobotLog>(() => ({ ...log, channels: vel }), [log, vel]);
    const velDevices = useMemo(() => vel.map(c => c.device), [vel]);

    const battKeys = [volt?.key, total?.key].filter((k): k is string => !!k);
    const battRows = chartRows(log, battKeys);

    const cur = useHidden(motors);
    const curKeys = motors.filter(d => !cur.hidden.has(d)).map(d => findChannel(log, d, "current")!.key);
    const curRows = chartRows(log, curKeys);

    const vh = useHidden(velDevices);
    const velKeys = vel.filter(c => !vh.hidden.has(c.device)).map(c => c.key);
    const velRows = chartRows(velLog, velKeys);

    return (
        <div className="space-y-6">
            {battKeys.length > 0 && (
                <Section title={t("chartBattery")}>
                    <Chart>
                        <LineChart data={battRows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tick={AXIS} stroke={MUTED} unit=" s" />
                            {volt && <YAxis yAxisId="v" tick={AXIS} stroke={MUTED} width={40} domain={[8, "auto"]} />}
                            {total && <YAxis yAxisId="a" orientation="right" tick={AXIS} stroke={MUTED} width={40} />}
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 12 }} />
                            {volt && <ReferenceLine yAxisId="v" y={LOW_V} stroke="var(--color-warning)" strokeDasharray="4 4" label={{ value: t("refLow"), fontSize: 10, fill: "var(--color-warning)", position: "insideTopLeft" }} />}
                            {volt && <ReferenceLine yAxisId="v" y={BROWNOUT_V} stroke="var(--color-error)" strokeDasharray="4 4" label={{ value: t("refBrownout"), fontSize: 10, fill: "var(--color-error)", position: "insideBottomLeft" }} />}
                            {volt && <Line yAxisId="v" dataKey={volt.key} name={`${t("seriesVoltage")} (V)`} stroke="var(--color-primary)" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />}
                            {total && <Line yAxisId="a" dataKey={total.key} name={`${t("seriesTotal")} (A)`} stroke="var(--color-muted-foreground)" strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />}
                        </LineChart>
                    </Chart>
                </Section>
            )}

            {motors.length > 0 && (
                <Section title={t("chartMotors")}>
                    <Toggles devices={motors} hidden={cur.hidden} onToggle={cur.toggle} />
                    <Chart>
                        <LineChart data={curRows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tick={AXIS} stroke={MUTED} unit=" s" />
                            <YAxis tick={AXIS} stroke={MUTED} width={40} unit=" A" />
                            <Tooltip />
                            {motors.map((d, i) => !cur.hidden.has(d) && (
                                <Line key={d} dataKey={findChannel(log, d, "current")!.key} name={d} stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                            ))}
                        </LineChart>
                    </Chart>
                </Section>
            )}

            {vel.length > 0 && (
                <Section title={t("chartVelocity")}>
                    <Toggles devices={velDevices} hidden={vh.hidden} onToggle={vh.toggle} />
                    <Chart>
                        <LineChart data={velRows} margin={{ top: 8, right: 8, bottom: 8, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke={GRID} />
                            <XAxis dataKey="t" type="number" domain={["dataMin", "dataMax"]} tick={AXIS} stroke={MUTED} unit=" s" />
                            <YAxis tick={AXIS} stroke={MUTED} width={48} />
                            <Tooltip />
                            {vel.map((c, i) => !vh.hidden.has(c.device) && (
                                <Line key={c.key} dataKey={c.key} name={`${c.device} (${c.unit})`} stroke={PALETTE[i % PALETTE.length]} strokeWidth={1.5} dot={false} isAnimationActive={false} connectNulls />
                            ))}
                        </LineChart>
                    </Chart>
                </Section>
            )}
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="space-y-2">
            <h3 className="text-sm font-bold uppercase text-muted-foreground">{title}</h3>
            {children}
        </section>
    );
}

function Chart({ children }: { children: React.ReactElement }) {
    return (
        <div className="h-64 w-full rounded-2xl border border-border bg-card p-2">
            <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
        </div>
    );
}
