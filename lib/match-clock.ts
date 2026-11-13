import type { MatchTiming } from "@/lib/games/season-rules";

/**
 * Workshop match clock (decision #105) — pure: time in, phase and sounds out,
 * so the React timer only measures elapsed time (performance.now) and never
 * accumulates drift. Display follows the field timer (Manual §9.11): AUTO
 * shows 2:30→2:00, the transition 0:08→0:01, TELEOP 2:00→0:00.
 */

export type ClockMode = "full" | "auto" | "teleop";
export type ClockPhase = "auto" | "transition" | "teleop" | "done";

/** Sound/visual events: built-ins plus the season's cues (e.g. "flowerUnlocked"). */
export type ClockEvent = "start" | "autoEnd" | "countdown" | "teleopStart" | "end" | string;

interface Segment { phase: Exclude<ClockPhase, "done">; startMs: number; endMs: number }

function segments(t: MatchTiming, mode: ClockMode): Segment[] {
    const auto = t.autoS * 1000, trans = t.transitionS * 1000, tele = t.teleopS * 1000;
    if (mode === "auto") return [{ phase: "auto", startMs: 0, endMs: auto }];
    if (mode === "teleop") return [{ phase: "teleop", startMs: 0, endMs: tele }];
    return [
        { phase: "auto", startMs: 0, endMs: auto },
        { phase: "transition", startMs: auto, endMs: auto + trans },
        { phase: "teleop", startMs: auto + trans, endMs: auto + trans + tele },
    ];
}

export function totalMs(t: MatchTiming, mode: ClockMode): number {
    const s = segments(t, mode);
    return s[s.length - 1].endMs;
}

export interface ClockState {
    phase: ClockPhase;
    /** Seconds shown on the clock (field convention, rounded up). */
    display: number;
    /** 0–1 progress through the current phase. */
    phaseProgress: number;
}

export function clockAt(t: MatchTiming, mode: ClockMode, elapsedMs: number): ClockState {
    const seg = segments(t, mode).find(s => elapsedMs < s.endMs);
    if (!seg) return { phase: "done", display: 0, phaseProgress: 1 };
    const left = (seg.endMs - Math.max(elapsedMs, seg.startMs)) / 1000;
    // During full-match AUTO the field shows the whole match clock (2:30→2:00).
    const display = seg.phase === "auto" && mode === "full" ? Math.ceil(left) + t.teleopS : Math.ceil(left);
    return { phase: seg.phase, display, phaseProgress: (elapsedMs - seg.startMs) / (seg.endMs - seg.startMs) };
}

/** Events whose moment falls in (prevMs, nowMs] — call once per animation frame. */
export function eventsBetween(t: MatchTiming, mode: ClockMode, prevMs: number, nowMs: number): ClockEvent[] {
    const out: ClockEvent[] = [];
    const crossed = (at: number) => prevMs < at && at <= nowMs;
    if (prevMs < 0 && nowMs >= 0) out.push("start");
    const segs = segments(t, mode);
    for (const s of segs) {
        if (s.phase === "auto" && crossed(s.endMs) && mode === "full") out.push("autoEnd");
        if (s.phase === "transition") {
            // One tick per second of the transition countdown (0:08 … 0:01).
            for (let k = 1; k < t.transitionS; k++) if (crossed(s.startMs + k * 1000)) out.push("countdown");
        }
        if (s.phase === "teleop") {
            if (mode === "full" && crossed(s.startMs)) out.push("teleopStart");
            for (const cue of t.cues) if (crossed(s.endMs - cue.secondsLeft * 1000)) out.push(cue.id);
        }
    }
    if (crossed(segs[segs.length - 1].endMs)) out.push("end");
    return out;
}

/** m:ss */
export function formatClock(seconds: number): string {
    const s = Math.max(0, seconds);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
