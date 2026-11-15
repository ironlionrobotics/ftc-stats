"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

/**
 * Whether the floating assistant button is shown (decision #116: off by
 * default, so nothing floats over the content on a phone). Explicit "ask the
 * assistant" buttons still open the panel via the `open-ai-chat` event.
 */
interface AssistantPref {
    showLauncher: boolean;
    setShowLauncher: (v: boolean) => void;
}

export const useAssistantPref = create<AssistantPref>()(
    persist(
        set => ({ showLauncher: false, setShowLauncher: v => set({ showLauncher: v }) }),
        {
            name: "pride-assistant",
            storage: createJSONStorage(() => (typeof window === "undefined"
                ? { getItem: () => null, setItem: () => { }, removeItem: () => { } }
                : localStorage)),
        },
    ),
);
