/**
 * Per-run health summary (#120). Pure: RobotLog in, RunSummary out.
 *
 * Thresholds come from what FTC 30311 already used on the robot and in its
 * laptop scripts (IronLion30311Biobuzz scripts/plot-match-log.py,
 * MotorDiagnosticsLogger): brownout 9.15 V, caution 10.5 V, sustained load
 * 6 A for 1 s (goBILDA Yellow Jacket stall ≈ 9.2 A).
 *
 * Episode durations: a sample "covers" the time until the next sample, so an
 * episode lasts from its first sample to the first sample after it that no
 * longer meets the condition (or one typical step past the last sample). With
 * a 0.75 s logger, two consecutive samples over 6 A therefore count as ~1.5 s.
 */
import type { Finding, MotorSummary, RobotLog, RunSummary } from "@/types/robot-log";
import { findChannel, motorDevices } from "./formats";

export const BROWNOUT_V = 9.15;
export const LOW_V = 10.5;
/** Minimum time under LOW_V to report it (short dips under load are normal). */
export const LOW_V_MIN_S = 2;
export const STALL_A = 6;
export const STALL_S = 1;
/** Current above which a motor with an encoder must be turning (or stalled). */
export const ENCODER_CHECK_A = 1;
export const ENCODER_CHECK_S = 1;
export const SLOW_LOOP_MS = 50;
/** Bound the findings stored per run (Firestore doc size). */
export const MAX_FINDINGS = 40;
/** Bump when thresholds or rules change: summaries are immutable once stored. */
export const ANALYSIS_VERSION = 1;

/** Kept first when the cap applies: what can lose a match before maintenance hints. */
const SEVERITY: Record<Finding["code"], number> = { brownout: 0, lowVoltage: 1, sustainedCurrent: 2, encoderSilent: 3, slowLoop: 4 };

const finite = (xs: number[]) => xs.filter(Number.isFinite);

export function median(xs: number[]): number {
    const s = finite(xs).sort((a, b) => a - b);
    if (!s.length) return NaN;
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function quantile(xs: number[], q: number): number {
    const s = finite(xs).sort((a, b) => a - b);
    if (!s.length) return NaN;
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Typical sampling step (median of positive steps). */
export function typicalStep(t: number[]): number {
    const steps: number[] = [];
    for (let i = 1; i < t.length; i++) {
        const d = t[i] - t[i - 1];
        if (Number.isFinite(d) && d > 0) steps.push(d);
    }
    return steps.length ? median(steps) : 0;
}

/** Time a sample covers: until the next sample, bounded so gaps/restarts don't inflate it. */
function stepAt(t: number[], i: number, step: number): number {
    if (i + 1 >= t.length) return step;
    const d = t[i + 1] - t[i];
    return Number.isFinite(d) && d > 0 ? Math.min(d, step * 3) : 0;
}

export interface Episode { start: number; end: number; atS: number; durationS: number }

/** Maximal runs of consecutive samples meeting `cond`, at least `minS` long. */
export function episodes(t: number[], cond: (i: number) => boolean, minS: number, step = typicalStep(t)): Episode[] {
    const out: Episode[] = [];
    let i = 0;
    while (i < t.length) {
        if (!cond(i)) { i++; continue; }
        const start = i;
        let dur = 0;
        while (i < t.length && cond(i)) { dur += stepAt(t, i, step); i++; }
        if (dur >= minS) out.push({ start, end: i - 1, atS: t[start], durationS: dur });
    }
    return out;
}

const round = (x: number, d = 2) => (Number.isFinite(x) ? Math.round(x * 10 ** d) / 10 ** d : x);

export function summarizeRun(log: RobotLog): RunSummary {
    const { t } = log;
    const valid = finite(t);
    const durationS = valid.length > 1 ? Math.max(...valid) - Math.min(...valid) : 0;
    const samples = t.length;
    const step = typicalStep(t);
    const findings: Finding[] = [];

    // --- Battery ---
    const vCh = findChannel(log, "battery", "voltage");
    const v = vCh ? vCh.values.map(x => (x > 0 ? x : NaN)) : [];
    const vVals = finite(v);
    let lowVoltageS = 0;
    if (vCh) {
        for (let i = 0; i < t.length; i++) if (v[i] < LOW_V) lowVoltageS += stepAt(t, i, step);
        for (const e of episodes(t, i => v[i] < BROWNOUT_V, 0, step)) {
            findings.push({ code: "brownout", device: "battery", atS: e.atS, durationS: e.durationS, value: Math.min(...finite(v.slice(e.start, e.end + 1))) });
        }
        for (const e of episodes(t, i => v[i] < LOW_V && !(v[i] < BROWNOUT_V), LOW_V_MIN_S, step)) {
            findings.push({ code: "lowVoltage", device: "battery", atS: e.atS, durationS: e.durationS, value: Math.min(...finite(v.slice(e.start, e.end + 1))) });
        }
    }

    // --- Motors ---
    const motors: MotorSummary[] = motorDevices(log).map(device => {
        const cur = findChannel(log, device, "current")!.values;
        const enc = findChannel(log, device, "position") ?? findChannel(log, device, "velocity");
        const curVals = finite(cur);

        for (const e of episodes(t, i => cur[i] >= STALL_A, STALL_S, step)) {
            findings.push({ code: "sustainedCurrent", device, atS: e.atS, durationS: e.durationS, value: Math.max(...finite(cur.slice(e.start, e.end + 1))) });
        }

        let encoderMoved = false;
        // An all-empty encoder column is "no data", not a silent encoder.
        if (enc && enc.values.some(Number.isFinite)) {
            const ev = enc.values;
            const first = ev.find(Number.isFinite);
            encoderMoved = enc.quantity === "position"
                ? ev.some(x => Number.isFinite(x) && x !== first)
                : ev.some(x => Number.isFinite(x) && x !== 0);
            if (!encoderMoved) {
                // Drew real current for a while but the encoder never changed:
                // either no encoder is plugged into this port, or its cable failed.
                let loadedS = 0, at = NaN, peak = 0;
                for (let i = 0; i < t.length; i++) {
                    if (cur[i] > ENCODER_CHECK_A) {
                        loadedS += stepAt(t, i, step);
                        if (!Number.isFinite(at)) at = t[i];
                        peak = Math.max(peak, cur[i]);
                    }
                }
                if (loadedS >= ENCODER_CHECK_S) findings.push({ code: "encoderSilent", device, atS: at, durationS: loadedS, value: peak });
            }
        }

        return {
            device,
            peakA: round(curVals.length ? Math.max(...curVals) : 0),
            meanA: round(curVals.length ? curVals.reduce((a, b) => a + b, 0) / curVals.length : 0),
            p95A: round(quantile(curVals, 0.95) || 0),
            hasEncoder: !!enc && enc.values.some(Number.isFinite),
            encoderMoved,
        };
    });

    // --- Totals / loop ---
    const tot = findChannel(log, "total", "current");
    const totVals = tot ? finite(tot.values) : [];
    const loop = findChannel(log, "loop", "loop");
    const loopVals = loop ? finite(loop.values).filter(x => x > 0) : [];
    if (loop) {
        for (const e of episodes(t, i => loop.values[i] >= SLOW_LOOP_MS, 0, step)) {
            findings.push({ code: "slowLoop", device: "robot", atS: e.atS, durationS: e.durationS, value: Math.max(...finite(loop.values.slice(e.start, e.end + 1))) });
        }
    }

    // Cap by severity (a late brownout must survive a flood of slow loops), then show in time order.
    const kept = findings.sort((a, b) => SEVERITY[a.code] - SEVERITY[b.code] || a.atS - b.atS)
        .slice(0, MAX_FINDINGS).sort((a, b) => a.atS - b.atS);
    return {
        analysisVersion: ANALYSIS_VERSION,
        durationS: round(durationS),
        samples,
        hz: round(durationS > 0 ? (samples - 1) / durationS : 0),
        vMin: vVals.length ? round(Math.min(...vVals)) : null,
        vMax: vVals.length ? round(Math.max(...vVals)) : null,
        lowVoltageS: round(lowVoltageS),
        totalPeakA: totVals.length ? round(Math.max(...totVals)) : null,
        loopAvgMs: loopVals.length ? round(loopVals.reduce((a, b) => a + b, 0) / loopVals.length) : null,
        loopMaxMs: loopVals.length ? round(Math.max(...loopVals)) : null,
        motors,
        findings: kept.map(f => ({ ...f, atS: round(f.atS), durationS: round(f.durationS), value: round(f.value) })),
    };
}
