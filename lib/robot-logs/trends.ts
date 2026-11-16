/**
 * Between-run maintenance flags (#120): port of FTC 30311's
 * scripts/build-season-report.py. The latest run is compared with the MEDIAN
 * of the previous ones (robust to one bad match), only when there are at
 * least MIN_HISTORY previous runs.
 *
 *  - currentRise: a motor's peak current > CURRENT_RISE × its previous median
 *    (friction, jam, failing gearbox).
 *  - voltageDrop: Vmin < previous median − VMIN_DROP (battery or wiring aging).
 *  - loopRise: loop max > LOOP_RISE × previous median (software / CPU).
 *  - encoderLost: an encoder that moved in a previous run is silent now —
 *    the precise version of the in-run `encoderSilent` hint.
 */
import type { RunSummary } from "@/types/robot-log";
import { median } from "./analysis";

export const CURRENT_RISE = 1.3;
export const VMIN_DROP = 0.5;
export const LOOP_RISE = 2;
export const MIN_HISTORY = 3;
/** Ignore peaks under this: a 0.3 → 0.5 A idle motor is not a +60 % problem. */
export const MIN_PEAK_A = 1;

export type TrendCode = "currentRise" | "voltageDrop" | "loopRise" | "encoderLost";

export interface TrendFlag {
    code: TrendCode;
    device: string;
    value: number;
    baseline: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/** `runs` in chronological order; the last one is evaluated. */
export function trendFlags(runs: RunSummary[]): TrendFlag[] {
    if (runs.length < MIN_HISTORY + 1) return [];
    const last = runs[runs.length - 1];
    const prev = runs.slice(0, -1);
    const out: TrendFlag[] = [];

    for (const m of last.motors) {
        const hist = prev.map(r => r.motors.find(x => x.device === m.device)?.peakA ?? NaN).filter(Number.isFinite);
        if (hist.length >= MIN_HISTORY) {
            const base = median(hist);
            if (base > 0 && m.peakA >= MIN_PEAK_A && m.peakA > base * CURRENT_RISE) out.push({ code: "currentRise", device: m.device, value: m.peakA, baseline: base });
        }
        if (m.hasEncoder && !m.encoderMoved && prev.some(r => r.motors.find(x => x.device === m.device)?.encoderMoved)) {
            out.push({ code: "encoderLost", device: m.device, value: 0, baseline: 1 });
        }
    }

    const vHist = prev.map(r => r.vMin ?? NaN).filter(Number.isFinite);
    if (last.vMin !== null && vHist.length >= MIN_HISTORY) {
        const base = median(vHist);
        if (last.vMin < base - VMIN_DROP) out.push({ code: "voltageDrop", device: "battery", value: last.vMin, baseline: base });
    }

    const lHist = prev.map(r => r.loopMaxMs ?? NaN).filter(Number.isFinite);
    if (last.loopMaxMs !== null && lHist.length >= MIN_HISTORY) {
        const base = median(lHist);
        if (base > 0 && last.loopMaxMs > base * LOOP_RISE) out.push({ code: "loopRise", device: "robot", value: last.loopMaxMs, baseline: base });
    }
    return out.map(f => ({ ...f, value: r2(f.value), baseline: r2(f.baseline) }));
}

/** Peak current per motor across runs, for the trends chart. */
export function peakSeries(runs: RunSummary[]): { devices: string[]; rows: Record<string, number | null>[] } {
    const devices: string[] = [];
    for (const r of runs) for (const m of r.motors) if (!devices.includes(m.device)) devices.push(m.device);
    const rows = runs.map(r => Object.fromEntries(devices.map(d => [d, r.motors.find(m => m.device === d)?.peakA ?? null])));
    return { devices, rows };
}
