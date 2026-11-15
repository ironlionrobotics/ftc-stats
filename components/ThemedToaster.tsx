"use client";

import { Toaster } from "sonner";
import { useThemeStore } from "@/lib/stores/theme-store";

/** Toasts follow the app theme (incl. a manual light/dark override), not only the OS. */
export default function ThemedToaster() {
    const theme = useThemeStore(s => s.theme);
    return (
        <Toaster
            theme={theme}
            position="top-right"
            richColors
            closeButton
            toastOptions={{ style: { fontSize: "13px" } }}
        />
    );
}
