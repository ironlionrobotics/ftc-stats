"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type ProgramType = "FTC" | "FRC";

interface ProgramState {
    program: ProgramType;
    season: number;
    setProgram: (program: ProgramType) => void;
    setSeason: (season: number) => void;
}

/**
 * Program/season state. Replaces ProgramContext from Sprint 0.
 *
 * Why Zustand: components subscribing to only `program` no longer re-render
 * when `season` changes (and vice versa). The old React Context cascaded a
 * re-render through the entire tree on any change.
 *
 * SSR-safety: persist middleware uses a guarded localStorage wrapper that
 * returns null on the server, so the store hydrates from defaults on first
 * server render and re-hydrates from localStorage once mounted on the client.
 *
 * Cookie sync: setters mirror the value into a cookie because Server
 * Components read these through `cookies()` (see `app/page.tsx`, etc.).
 * Setters also trigger `window.location.reload()` because changing program
 * or season invalidates all server-rendered data on the current page.
 */
export const useProgramStore = create<ProgramState>()(
    persist(
        (set) => ({
            program: "FTC",
            season: 2024,
            setProgram: (program) => {
                set({ program });
                if (typeof document !== "undefined") {
                    document.cookie = `active_program=${program}; path=/; max-age=31536000`;
                    window.location.reload();
                }
            },
            setSeason: (season) => {
                set({ season });
                if (typeof document !== "undefined") {
                    document.cookie = `active_season=${season}; path=/; max-age=31536000`;
                    window.location.reload();
                }
            },
        }),
        {
            name: "ftc-program-storage",
            // Don't persist setters — only the data.
            partialize: (state) => ({ program: state.program, season: state.season }),
            storage: createJSONStorage(() => {
                if (typeof window === "undefined") {
                    // No-op storage on the server so SSR doesn't try to touch localStorage.
                    return {
                        getItem: () => null,
                        setItem: () => { },
                        removeItem: () => { },
                    };
                }
                return localStorage;
            }),
        },
    ),
);

// ---------------------------------------------------------------------------
// Backwards-compatibility shim — drop-in replacement for the old useProgram()
// hook. Call sites can either use this OR switch to selectors for finer-grained
// subscriptions: useProgramStore(s => s.season).
// ---------------------------------------------------------------------------
export function useProgram() {
    return useProgramStore();
}
