"use client";

import { useMutation } from "@tanstack/react-query";
import { saveMatchScouting, savePitScouting } from "@/lib/scouting-service";
import { saveToLocal, savePitToLocal } from "@/lib/localDatabase";
import type { MatchScouting, PitScouting } from "@/types/scouting";

/** Where a match-scouting entry ended up when the mutation resolved. */
export type MatchScoutingSaveResult =
    | { savedTo: "remote" }
    | { savedTo: "local"; id: string };

/** Where a pit-scouting record ended up when the mutation resolved. */
export type PitScoutingSaveResult =
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

/**
 * Mutation hook for saving a pit-scouting record. Same remote-first /
 * local-fallback shape as useSaveMatchScouting: pit interviews happen once
 * per team per event, often in the noisiest-wifi corner of the venue, so a
 * transient Firestore failure must queue the record (keyed by the same
 * deterministic id Firestore would have used — see pitRecordId in
 * lib/constants) rather than lose the interview outright.
 */
export function useSavePitScouting() {
    return useMutation({
        mutationFn: async (data: PitScouting): Promise<PitScoutingSaveResult> => {
            try {
                await savePitScouting(data);
                return { savedTo: "remote" };
            } catch (err) {
                console.warn("[scouting] pit remote save failed, queueing locally:", err);
                const id = await savePitToLocal(data);
                return { savedTo: "local", id };
            }
        },
        // Same rationale as useSaveMatchScouting: the remote→local fallback
        // already handles transient failures; only a Dexie failure rejects,
        // and retrying that won't fix it.
        retry: false,
    });
}
