"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/** "system" follows the OS (prefers-color-scheme) — the default (#116). */
export type Theme = "light" | "dark" | "system";

interface ThemeState {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    /** Cycles system → light → dark → system. */
    toggleTheme: () => void;
}

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };

function prefersDark(): boolean {
    return typeof window !== "undefined" && typeof window.matchMedia === "function"
        && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Whether `theme` renders dark right now. */
export function resolvesDark(theme: Theme, osDark: boolean): boolean {
    return theme === "dark" || (theme === "system" && osDark);
}

function apply(theme: Theme) {
    if (typeof document === "undefined") return;
    document.documentElement.classList.toggle("dark", resolvesDark(theme, prefersDark()));
}

/**
 * Theme state. The store keeps `<html class="dark">` in sync so Tailwind's
 * `dark:` variant (bound to the class in app/globals.css) works. The anti-FOUC
 * script in app/layout.tsx applies the class before paint; useThemeSync keeps
 * it right after hydration and when the OS scheme changes under "system".
 */
export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            theme: "system",
            setTheme: (theme) => {
                set({ theme });
                apply(theme);
            },
            toggleTheme: () => get().setTheme(NEXT[get().theme] ?? "system"),
        }),
        {
            name: "ftc-theme",
            partialize: (state) => ({ theme: state.theme }),
            storage: createJSONStorage(() => {
                if (typeof window === "undefined") {
                    return { getItem: () => null, setItem: () => { }, removeItem: () => { } };
                }
                return localStorage;
            }),
        },
    ),
);

/**
 * Mount once at the root. Syncs the persisted theme to the <html> class after
 * hydration and follows OS changes while the theme is "system".
 */
export function useThemeSync() {
    const theme = useThemeStore(s => s.theme);
    useEffect(() => {
        apply(theme);
        if (theme !== "system" || typeof window === "undefined" || typeof window.matchMedia !== "function") return;
        const mq = window.matchMedia("(prefers-color-scheme: dark)");
        const onChange = () => apply("system");
        mq.addEventListener("change", onChange);
        return () => mq.removeEventListener("change", onChange);
    }, [theme]);
}

// Drop-in shim for the old useTheme() hook.
export function useTheme() {
    const theme = useThemeStore(s => s.theme);
    const toggleTheme = useThemeStore(s => s.toggleTheme);
    return { theme, toggleTheme };
}
