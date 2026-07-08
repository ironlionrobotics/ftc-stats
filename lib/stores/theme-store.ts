"use client";

import { useEffect } from "react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Theme = "light" | "dark";

interface ThemeState {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    toggleTheme: () => void;
}

/**
 * Theme state. Replaces ThemeContext.
 *
 * The store keeps `theme` in sync with `<html class="dark">` so Tailwind's
 * dark-mode variant works. We do the document-class sync in a one-shot
 * useEffect (see useThemeSync below) — that hook must be mounted once at the
 * top of the app, similar to how the old ThemeProvider mounted an effect.
 */
export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            theme: "light",
            setTheme: (theme) => {
                set({ theme });
                if (typeof document !== "undefined") {
                    document.documentElement.classList.toggle("dark", theme === "dark");
                }
            },
            toggleTheme: () => {
                const next: Theme = get().theme === "light" ? "dark" : "light";
                get().setTheme(next);
            },
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
 * Hook to mount once at the root of the app. Syncs the persisted theme to the
 * <html> classList after hydration. Without this, the store would have the
 * right `theme` value but the <html> class would never get toggled until the
 * user manually triggered setTheme().
 */
export function useThemeSync() {
    const theme = useThemeStore(s => s.theme);
    useEffect(() => {
        if (typeof document === "undefined") return;
        document.documentElement.classList.toggle("dark", theme === "dark");
    }, [theme]);
}

// Drop-in shim for the old useTheme() hook.
export function useTheme() {
    const theme = useThemeStore(s => s.theme);
    const toggleTheme = useThemeStore(s => s.toggleTheme);
    return { theme, toggleTheme };
}
