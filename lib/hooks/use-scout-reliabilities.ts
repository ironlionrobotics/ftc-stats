"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { fetchOrgReliabilityAction } from "@/app/actions/validate-ground-truth";

/**
 * Loads scout reliabilities for the current user's org once on mount.
 * Returns a `Record<scoutId, number>` ready to pass to
 * `aggregateMatchTeam(entries, scoutReliabilities)`.
 *
 * Why this matters: without reliabilities the aggregator treats every scout
 * as equally trustworthy. After Sprint 1.7 ground-truth validation has run,
 * users/{uid}.reliability holds a real 0-1 score; passing that into the
 * weighted-mean aggregation lets the strategy lead's view automatically
 * down-weight inconsistent observers.
 *
 * Caches in memory per page load — doesn't poll. If you need fresh data
 * after a manual ground-truth validation run, refresh the page or expose
 * a `refetch` callback (not added in v1 to keep the API simple).
 */
export function useScoutReliabilities(): Record<string, number> {
    const { user } = useAuth();
    const [reliabilities, setReliabilities] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!user) {
            setReliabilities({});
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const idToken = await user.getIdToken();
                const result = await fetchOrgReliabilityAction({ idToken });
                if (cancelled || !result.ok) return;
                const map: Record<string, number> = {};
                for (const s of result.scouts) {
                    map[s.scoutId] = s.reliability;
                }
                setReliabilities(map);
            } catch {
                // best-effort; default to empty (all scouts weight 1.0)
            }
        })();
        return () => { cancelled = true; };
    }, [user]);

    return reliabilities;
}
