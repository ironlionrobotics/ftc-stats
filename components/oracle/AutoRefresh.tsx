"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-renders the server page every `everyMs` while the tab is visible (live scoreboard, #111). */
export default function AutoRefresh({ everyMs }: { everyMs: number }) {
    const router = useRouter();
    useEffect(() => {
        const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, everyMs);
        return () => clearInterval(id);
    }, [router, everyMs]);
    return null;
}
