/**
 * Chart helpers for robot logs (#120): bounded point counts and run dates
 * recovered from logger file names.
 */
import type { RobotLog } from "@/types/robot-log";

export const MAX_CHART_POINTS = 1500;

/**
 * Rows `{ t, [channelKey]: value }` for the given channels, keeping every
 * k-th sample so a chart never draws more than `maxPoints` points. Keeps the
 * per-bucket extreme of the FIRST channel so short spikes (brownouts, current
 * peaks) don't vanish from the plot.
 */
export function chartRows(log: RobotLog, keys: string[], maxPoints = MAX_CHART_POINTS): Record<string, number | null>[] {
    const chans = keys.map(k => log.channels.find(c => c.key === k)).filter(c => c !== undefined);
    const n = log.t.length;
    const k = Math.max(1, Math.ceil(n / maxPoints));
    const rows: Record<string, number | null>[] = [];
    for (let start = 0; start < n; start += k) {
        let pick = start;
        const lead = chans[0];
        if (lead && k > 1) {
            const mid = (lead.values.slice(start, start + k).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)) / k;
            let best = -1;
            for (let i = start; i < Math.min(n, start + k); i++) {
                const dev = Math.abs(lead.values[i] - mid);
                if (Number.isFinite(dev) && dev > best) { best = dev; pick = i; }
            }
        }
        if (!Number.isFinite(log.t[pick])) continue;
        const row: Record<string, number | null> = { t: Math.round(log.t[pick] * 100) / 100 };
        for (const c of chans) row[c.key] = Number.isFinite(c.values[pick]) ? c.values[pick] : null;
        rows.push(row);
    }
    return rows;
}

/**
 * Run start from the logger's file or folder name, local time:
 * `motor_diag_20261116_101503.csv` (MotorDiagnosticsLogger) or
 * `20260721-101503_teleop` (CsvLogStore run folder). null when absent.
 */
export function recordedAtFromName(name: string): number | null {
    const m = /(20\d{2})(\d{2})(\d{2})[_-](\d{2})(\d{2})(\d{2})/.exec(name);
    if (!m) return null;
    const [, y, mo, d, h, mi, s] = m.map(Number);
    const date = new Date(y, mo - 1, d, h, mi, s);
    return Number.isNaN(date.getTime()) || date.getMonth() !== mo - 1 ? null : date.getTime();
}
