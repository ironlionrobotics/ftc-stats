"use client";

import { useEffect, useState } from "react";

/**
 * First-run tip dismissal tracker. Uses a versioned key in localStorage so
 * updating a tip's content (and bumping the version suffix in the id) makes
 * it re-appear for users who already dismissed v1.
 *
 * Key format: `tip:{id}` where id should encode a version e.g. "picklist-v1".
 *
 * Returns:
 *   - `dismissed`: whether the user has dismissed this tip
 *   - `dismiss()`: persist a dismissal
 *   - `ready`: false during SSR/before hydration so the tip doesn't flash
 *     on/off when the persisted state loads
 */
export function useTipDismissed(id: string): {
    dismissed: boolean;
    dismiss: () => void;
    ready: boolean;
} {
    const [dismissed, setDismissed] = useState(false);
    const [ready, setReady] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const stored = localStorage.getItem(tipKey(id));
            // Intentional effect-body setState: this reads an external system
            // (localStorage) that isn't available during SSR, specifically to
            // avoid a hydration mismatch (`ready` starts false so the tip
            // never flashes on/off). A derived-during-render read isn't SSR-safe
            // here — the correct effect-free fix is useSyncExternalStore, but
            // that changes the dismiss()-update mechanism and needs browser
            // verification before landing; tracked as a follow-up, not blind-fixed.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setDismissed(stored === "1");
        } catch {
            // localStorage may be disabled (incognito on iOS) — treat as not dismissed.
        }
        setReady(true);
    }, [id]);

    const dismiss = () => {
        setDismissed(true);
        try {
            localStorage.setItem(tipKey(id), "1");
        } catch {
            // ignore
        }
    };

    return { dismissed, dismiss, ready };
}

function tipKey(id: string): string {
    return `tip:${id}`;
}

/**
 * Test/dev helper: clears all dismissed-tip flags so they re-appear on next
 * page load. Not used in production code paths; surface from a hidden
 * Settings menu later if useful.
 */
export function resetAllTips(): number {
    if (typeof window === "undefined") return 0;
    let count = 0;
    for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && key.startsWith("tip:")) {
            localStorage.removeItem(key);
            count++;
        }
    }
    return count;
}
