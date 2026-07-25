"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { getCurrentSeason } from "@/lib/constants";

export type ProgramType = "FTC" | "FRC";

// The `ftc_season` cookie is the single source of truth for the active season:
// Server Components read it via cookies() and this store mirrors it on the
// client. (Historically the store wrote a different cookie, `active_season`,
// with a hardcoded 2024 default — so scouting captures and event pages could
// silently disagree on the season.)
function readSeasonCookie(): number | null {
    if (typeof document === "undefined") return null;
    const match = document.cookie.match(/(?:^|;\s*)ftc_season=(\d+)/);
    return match ? Number(match[1]) : null;
}

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
            season: getCurrentSeason(),
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
                    document.cookie = `ftc_season=${season}; path=/; max-age=31536000`;
                    window.location.reload();
                }
            },
        }),
        {
            name: "ftc-program-storage",
            // v0 persisted `season` with a hardcoded 2024 default that desynced
            // from the `ftc_season` cookie. Discard it on upgrade; the cookie
            // reconciliation below repopulates it.
            version: 1,
            migrate: (persisted) => {
                const old = persisted as { program?: ProgramType } | undefined;
                return { program: old?.program ?? "FTC" } as ProgramState;
            },
            // Don't persist setters — only the data.
            partialize: (state) => ({ program: state.program, season: state.season }),
            onRehydrateStorage: () => (state) => {
                if (typeof document === "undefined") return;
                const cookieSeason = readSeasonCookie();
                if (cookieSeason && cookieSeason !== state?.season) {
                    // Server pages already rendered with the cookie value — align.
                    useProgramStore.setState({ season: cookieSeason });
                } else if (!cookieSeason && state?.season) {
                    document.cookie = `ftc_season=${state.season}; path=/; max-age=31536000`;
                }
            },
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
