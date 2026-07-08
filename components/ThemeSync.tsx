"use client";

import { useThemeSync } from "@/lib/stores/theme-store";

/**
 * Mount this once at the root of the app to keep `<html class="dark">` in sync
 * with the Zustand theme store after hydration. Returns null. Lives as its
 * own component so it can be a Client Component without making the whole
 * layout one.
 */
export default function ThemeSync() {
    useThemeSync();
    return null;
}
