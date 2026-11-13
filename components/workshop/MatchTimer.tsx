"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Play, Pause, RotateCcw, Maximize, Volume2, VolumeX } from "lucide-react";
import type { MatchTiming } from "@/lib/games/season-rules";
import { clockAt, eventsBetween, formatClock, totalMs, type ClockMode, type ClockEvent } from "@/lib/match-clock";

/**
 * Workshop match clock (#105). Elapsed time comes from performance.now()
 * deltas (no setInterval drift); phases and cues from lib/match-clock. Tones
 * are synthesized with WebAudio — FIRST's own sounds are never copied. The
 * screen stays awake while running (Wake Lock) and can go fullscreen for the
 * drive team.
 */

const TONES: Record<string, Array<[freq: number, ms: number]>> = {
    start: [[880, 450]],
    autoEnd: [[440, 700]],
    countdown: [[660, 90]],
    teleopStart: [[880, 200], [0, 80], [880, 350]],
    end: [[220, 1100]],
    final20: [[784, 180], [0, 70], [784, 180]],
};
const CUE_TONE: Array<[number, number]> = [[523, 160], [0, 60], [659, 160], [0, 60], [784, 240]];

export default function MatchTimer({ timing, onFinished }: { timing: MatchTiming; onFinished: (mode: ClockMode) => void }) {
    const t = useTranslations("Workshop");
    const [mode, setMode] = useState<ClockMode>("full");
    const [elapsed, setElapsed] = useState(0);
    const [running, setRunning] = useState(false);
    const [muted, setMuted] = useState(false);
    const [banner, setBanner] = useState<string | null>(null);
    const startRef = useRef(0);          // performance.now() at (virtual) start
    const prevRef = useRef(-1);          // elapsed at last frame, for event crossing
    const audioRef = useRef<AudioContext | null>(null);
    const wakeRef = useRef<{ release: () => Promise<void> } | null>(null);
    const boxRef = useRef<HTMLDivElement>(null);
    const mutedRef = useRef(muted);
    useEffect(() => { mutedRef.current = muted; }, [muted]);

    const total = totalMs(timing, mode);
    const state = clockAt(timing, mode, elapsed);

    const play = (ev: ClockEvent) => {
        const ctx = audioRef.current;
        if (!ctx || mutedRef.current) return;
        const seq = TONES[ev] ?? CUE_TONE;
        let at = ctx.currentTime;
        for (const [freq, ms] of seq) {
            if (freq > 0) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "square";
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.18, at);
                gain.gain.exponentialRampToValueAtTime(0.001, at + ms / 1000);
                osc.connect(gain).connect(ctx.destination);
                osc.start(at);
                osc.stop(at + ms / 1000);
            }
            at += ms / 1000;
        }
    };

    useEffect(() => {
        if (!running) return;
        let raf = 0;
        const tick = () => {
            const now = performance.now() - startRef.current;
            const evs = eventsBetween(timing, mode, prevRef.current, now);
            prevRef.current = now;
            for (const ev of evs) {
                play(ev);
                if (ev !== "countdown" && ev !== "start") setBanner(ev);
            }
            if (now >= total) {
                setElapsed(total);
                setRunning(false);
                onFinished(mode);
                return;
            }
            setElapsed(now);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
        // play/onFinished are stable enough for a running clock; restarting the loop on their identity would stutter.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [running, timing, mode, total]);

    // Keep the screen awake while the clock runs.
    useEffect(() => {
        if (!running) return;
        const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
        nav.wakeLock?.request("screen").then(l => { wakeRef.current = l; }).catch(() => {});
        return () => { wakeRef.current?.release().catch(() => {}); wakeRef.current = null; };
    }, [running]);

    const start = () => {
        // AudioContext must be created/resumed inside a user gesture.
        if (!audioRef.current) {
            const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (Ctx) audioRef.current = new Ctx();
        }
        audioRef.current?.resume().catch(() => {});
        const base = elapsed >= total ? 0 : elapsed;
        if (base === 0) { setElapsed(0); prevRef.current = -1; }
        startRef.current = performance.now() - base;
        setBanner(null);
        setRunning(true);
    };
    const pause = () => setRunning(false);
    const reset = () => { setRunning(false); setElapsed(0); prevRef.current = -1; setBanner(null); };
    const fullscreen = () => boxRef.current?.requestFullscreen?.().catch(() => {});

    const phaseColor = state.phase === "auto" ? "text-primary" : state.phase === "transition" ? "text-warning" : state.phase === "teleop" ? "text-foreground" : "text-muted-foreground";

    return (
        <div ref={boxRef} className="space-y-4 rounded-2xl border border-border bg-card p-4 md:p-6">
            <div role="radiogroup" aria-label={t("mode")} className="flex gap-1">
                {(["full", "auto", "teleop"] as const).map(m => (
                    <button key={m} type="button" role="radio" aria-checked={mode === m} disabled={running}
                        onClick={() => { setMode(m); reset(); }}
                        className={clsx("min-h-[40px] flex-1 rounded-lg border px-2 text-sm font-semibold disabled:opacity-60",
                            mode === m ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                        {t(`modes.${m}`)}
                    </button>
                ))}
            </div>

            <div className="text-center" aria-live="polite">
                <div className={clsx("text-sm font-semibold uppercase tracking-[0.12em]", phaseColor)}>{t(`phases.${state.phase}`)}</div>
                <div className="font-mono text-7xl font-black tabular-nums md:text-9xl">{formatClock(state.display)}</div>
                <div className="mx-auto mt-2 h-1.5 max-w-md overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary" style={{ width: `${Math.min(100, (elapsed / total) * 100)}%` }} />
                </div>
                <p className="mt-2 min-h-[1.5rem] text-sm font-semibold text-warning">{banner ? t(`cues.${banner}`) : ""}</p>
            </div>

            <div className="flex flex-wrap justify-center gap-2">
                {running ? (
                    <button type="button" onClick={pause} className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-border px-6 font-bold"><Pause size={18} /> {t("pause")}</button>
                ) : (
                    <button type="button" onClick={start} className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-primary px-6 font-bold text-primary-foreground">
                        <Play size={18} /> {elapsed > 0 && elapsed < total ? t("resume") : t("start")}
                    </button>
                )}
                <button type="button" onClick={reset} className="inline-flex min-h-[48px] items-center gap-2 rounded-xl border border-border px-4"><RotateCcw size={18} /> {t("reset")}</button>
                <button type="button" onClick={() => setMuted(m => !m)} aria-label={muted ? t("unmute") : t("mute")} className="inline-flex min-h-[48px] items-center rounded-xl border border-border px-4">
                    {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <button type="button" onClick={fullscreen} aria-label={t("fullscreen")} className="inline-flex min-h-[48px] items-center rounded-xl border border-border px-4"><Maximize size={18} /></button>
            </div>
        </div>
    );
}
