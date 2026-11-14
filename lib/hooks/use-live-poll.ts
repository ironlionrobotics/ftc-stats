"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Re-runs `load` every `intervalMs` while the tab is visible (decision #110).
 * Hidden tabs don't poll; coming back refreshes at once. Returns the last
 * GOOD polled value (null until the first one) — callers pick between it and
 * fresher server-rendered props, since a router.refresh() can be newer than
 * the last poll. A failed poll never blanks the screen.
 */
export function useLivePoll<T>(load: () => Promise<T | null>, intervalMs: number, enabled = true): { value: T | null; updatedAt: number | null } {
    const [state, setState] = useState<{ value: T | null; updatedAt: number | null }>({ value: null, updatedAt: null });
    const loadRef = useRef(load);
    useEffect(() => { loadRef.current = load; }, [load]);

    useEffect(() => {
        if (!enabled) return;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let cancelled = false;
        const tick = async () => {
            if (document.visibilityState !== "visible") return;
            const next = await loadRef.current().catch(() => null);
            if (!cancelled && next !== null) setState({ value: next, updatedAt: Date.now() });
        };
        const schedule = () => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(async () => { await tick(); if (!cancelled) schedule(); }, intervalMs);
        };
        const onVisible = () => { if (document.visibilityState === "visible") { void tick(); schedule(); } };
        schedule();
        document.addEventListener("visibilitychange", onVisible);
        return () => {
            cancelled = true;
            if (timer) clearTimeout(timer);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, [intervalMs, enabled]);

    return state;
}
