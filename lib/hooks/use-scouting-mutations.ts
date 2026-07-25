"use client";

import { useMutation } from "@tanstack/react-query";
import { saveMatchScouting, savePitScouting } from "@/lib/scouting-service";
import { saveToLocal } from "@/lib/localDatabase";
import type { MatchScouting, PitScouting } from "@/types/scouting";

/** Where a match-scouting entry ended up when the mutation resolved. */
export type MatchScoutingSaveResult =
    | { savedTo: "remote" }
    | { savedTo: "local"; id: string };

/**
 * Mutation hook for saving a match-scouting entry. Tries Firestore first;
 * if that fails (venue Wi-Fi down, Firestore hiccup) the entry is queued in
 * Dexie and OnlineSync drains it once connectivity returns — a capture must
 * never be lost silently. Callers can inspect `savedTo` to tell the scout
 * whether the entry is live or queued.
 *
 * Note: we don't expose optimistic UI here because the listener
 * (listenToMatchScouting) will already surface the new entry within a few
 * hundred ms once it lands in Firestore.
 */
export function useSaveMatchScouting() {
    return useMutation({
        mutationFn: async (entry: MatchScouting): Promise<MatchScoutingSaveResult> => {
            try {
                await saveMatchScouting(entry);
                return { savedTo: "remote" };
            } catch (err) {
                console.warn("[scouting] remote save failed, queueing locally:", err);
                const id = await saveToLocal(entry);
                return { savedTo: "local", id };
            }
        },
        // The remote→local fallback already handles transient failures; only a
        // Dexie failure rejects, and retrying won't fix that.
        retry: false,
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
