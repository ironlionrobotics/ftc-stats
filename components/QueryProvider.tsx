"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

/**
 * TanStack Query provider. Wraps the app so mutations (saveMatchScouting,
 * savePitScouting) can use useMutation with optimistic UI, retry, and dedup.
 *
 * Sensible defaults for an offline-first scouting context:
 *   - retry: 2 attempts (with exponential backoff) — Firestore writes can
 *     blip briefly during venue Wi-Fi flakiness.
 *   - staleTime: 30s — most scouting data isn't stale within seconds.
 *   - refetchOnWindowFocus: false — scouts switch tabs constantly; we don't
 *     want to re-pull every event.
 */
export default function QueryProvider({ children }: { children: ReactNode }) {
    // Lazy-init the client so each remount (e.g. React strict mode) doesn't
    // create a fresh QueryClient and lose in-flight queries.
    const [client] = useState(
        () =>
            new QueryClient({
                defaultOptions: {
                    queries: {
                        retry: 2,
                        retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
                        staleTime: 30_000,
                        refetchOnWindowFocus: false,
                    },
                    mutations: {
                        retry: 2,
                        retryDelay: attempt => Math.min(1000 * 2 ** attempt, 8000),
                    },
                },
            }),
    );
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
