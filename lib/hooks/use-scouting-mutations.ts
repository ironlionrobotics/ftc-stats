"use client";

import { useMutation } from "@tanstack/react-query";
import { saveMatchScouting, savePitScouting } from "@/lib/scouting-service";
import { saveToLocal } from "@/lib/localDatabase";
import type { MatchScouting, PitScouting } from "@/types/scouting";

/**
 * Mutation hook for saving a match-scouting entry to Firestore. Wraps
 * `saveMatchScouting` with TanStack Query so callers get retry-with-backoff
 * (Firestore is occasionally flaky on venue Wi-Fi) and a typed loading state
 * without rolling their own try/finally.
 *
 * Note: we don't expose optimistic UI here because the listener
 * (listenToMatchScouting) will already surface the new entry within a few
 * hundred ms once it lands in Firestore.
 */
export function useSaveMatchScouting() {
    return useMutation({
        mutationFn: async (entry: MatchScouting) => {
            await saveMatchScouting(entry);
        },
    });
}

/**
 * Mutation hook for FRC offline-first scouting. Writes to Dexie immediately
 * (so the scout sees their entry without waiting for network) and returns the
 * generated id.
 */
export function useSaveLocalScouting() {
    return useMutation({
        mutationFn: async (entry: Omit<MatchScouting, "id"> & { id?: string }) => {
            return await saveToLocal(entry);
        },
    });
}

/** Mutation hook for pit scouting writes. */
export function useSavePitScouting() {
    return useMutation({
        mutationFn: async (data: PitScouting) => {
            await savePitScouting(data);
        },
    });
}
