import type { PracticeRun } from "@/types/practice";

/**
 * Progress statistics over workshop practice runs (#105): average, best and
 * consistency (σ) per phase, grouped by driver pair or robot version.
 */

export interface PhaseStats { n: number; avg: number; best: number; sd: number }
export interface RunGroupStats { key: string; total: PhaseStats; auto: PhaseStats; teleop: PhaseStats; endgame: PhaseStats; lastRunAtMs: number }

function stats(values: number[]): PhaseStats {
    const n = values.length;
    if (n === 0) return { n: 0, avg: 0, best: 0, sd: 0 };
    const avg = values.reduce((a, b) => a + b, 0) / n;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - avg) ** 2, 0) / n);
    return { n, avg: Math.round(avg * 10) / 10, best: Math.max(...values), sd: Math.round(sd * 10) / 10 };
}

/** Only full matches are comparable on total; partial modes still count per phase. */
export function groupStats(runs: PracticeRun[], by: "drivers" | "robotVersion" | "all"): RunGroupStats[] {
    const groups = new Map<string, PracticeRun[]>();
    for (const r of runs) {
        const key = by === "all" ? "" : (r[by] || "—");
        groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.entries()].map(([key, list]) => {
        const full = list.filter(r => r.mode === "full");
        const withAuto = list.filter(r => r.mode !== "teleop");
        const withTeleop = list.filter(r => r.mode !== "auto");
        return {
            key,
            total: stats(full.map(r => r.total)),
            auto: stats(withAuto.map(r => r.score.auto)),
            teleop: stats(withTeleop.map(r => r.score.teleop)),
            endgame: stats(withTeleop.map(r => r.score.endgame)),
            lastRunAtMs: Math.max(...list.map(r => r.runAtMs)),
        };
    }).sort((a, b) => b.lastRunAtMs - a.lastRunAtMs);
}

/** Chronological series of full-match totals for the trend chart. */
export function totalsSeries(runs: PracticeRun[]): Array<{ at: number; total: number; auto: number; teleop: number; endgame: number }> {
    return runs
        .filter(r => r.mode === "full")
        .sort((a, b) => a.runAtMs - b.runAtMs)
        .map(r => ({ at: r.runAtMs, total: r.total, auto: r.score.auto, teleop: r.score.teleop, endgame: r.score.endgame }));
}
