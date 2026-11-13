"use client";

import { useEffect, useState } from "react";
import { CloudOff } from "lucide-react";

// lib/client-cache pulls Dexie (~170 KB). Both components below only touch it
// from inside an effect — CacheWriter renders nothing at all, and
// OfflineFallback shows a loading line first — so importing it dynamically
// keeps IndexedDB off the first-paint critical path of every page that caches.
// Measured: /event went 762 -> 939 KB with a static import, and back down with
// this one.
const clientCache = () => import("@/lib/client-cache");

/**
 * Two thin Client Components that bridge Server-rendered data with the
 * client-side Dexie cache. Why two and not one with a render-prop:
 * Next.js forbids passing functions (predicates, render props) from Server
 * Components to Client Components — they aren't serializable across the
 * RSC boundary. So the API here is serializable-data-only.
 *
 * Usage from a Server Component:
 *
 *   {data.length > 0 ? (
 *       <>
 *           <CacheWriter cacheKey="home:2025" payload={data} />
 *           <ServerRenderedContent data={data} />
 *       </>
 *   ) : (
 *       <OfflineFallback cacheKey="home:2025"
 *           render="home-stats"  // discriminator
 *       />
 *   )}
 *
 * The split keeps the happy-path SSR untouched (zero extra JS to hydrate)
 * and only pays the cost when we actually need to recover from offline.
 */

interface CacheWriterProps<T> {
    cacheKey: string;
    payload: T;
    ttlMs?: number;
}

/**
 * Side-effect-only Client Component. Renders nothing. Persists the
 * server-provided payload to IndexedDB so a future offline visit can recover.
 */
export function CacheWriter<T>({ cacheKey, payload, ttlMs = 24 * 60 * 60 * 1000 }: CacheWriterProps<T>) {
    useEffect(() => {
        clientCache().then(({ cacheSet }) => cacheSet(cacheKey, payload, ttlMs));
    }, [cacheKey, payload, ttlMs]);
    return null;
}

interface OfflineFallbackProps {
    cacheKey: string;
    /**
     * Renderer discriminator. Each known kind has a hard-coded render path
     * below so we don't need to pass a function from the server. Add a new
     * case when introducing a new offline-fallback surface.
     */
    render: "home-stats" | "event-stats";
    /** Extra metadata the renderer might need (e.g. season for links). */
    rendererMeta?: { season?: number };
}

/**
 * Renders cached content when the Server Component couldn't fetch fresh
 * data (origin offline, Firestore down, etc.). Shows an "offline" banner
 * so the user knows what they're looking at isn't live.
 */
export function OfflineFallback({ cacheKey, render, rendererMeta }: OfflineFallbackProps) {
    const [state, setState] = useState<
        | { kind: "loading" }
        | { kind: "found"; payload: unknown; savedAt: number }
        | { kind: "missing" }
    >({ kind: "loading" });

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const { cacheGet } = await clientCache();
            const cached = await cacheGet<unknown>(cacheKey);
            if (cancelled) return;
            if (!cached) {
                setState({ kind: "missing" });
            } else {
                setState({ kind: "found", payload: cached.payload, savedAt: cached.savedAt });
            }
        })();
        return () => { cancelled = true; };
    }, [cacheKey]);

    if (state.kind === "loading") {
        return (
            <div className="p-12 text-center text-muted-foreground text-sm">
                Buscando datos cacheados...
            </div>
        );
    }

    if (state.kind === "missing") {
        return (
            <div className="p-8 bg-danger/10 border border-danger/30 rounded-xl text-danger text-sm">
                Sin conexión al servidor y sin datos cacheados localmente. Conéctate al menos una vez para que la app guarde los datos para uso offline.
            </div>
        );
    }

    return (
        <>
            <OfflineBanner cachedAt={state.savedAt} />
            <RenderCachedPayload kind={render} payload={state.payload} meta={rendererMeta} />
        </>
    );
}

function OfflineBanner({ cachedAt }: { cachedAt: number }) {
    const when = new Date(cachedAt).toLocaleString();
    return (
        <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-warning/10 border border-warning/30 rounded-lg text-warning text-xs">
            <CloudOff size={14} className="flex-shrink-0" />
            <span>Mostrando datos cacheados ({when}) — sin conexión al servidor.</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Renderer registry — each `render` discriminator maps to a hard-coded
// component. This is the trade-off for passing serializable-only props.
// Add a case when a new page needs offline fallback.
// ---------------------------------------------------------------------------

import dynamic from "next/dynamic";
import type { AggregatedTeamStats, FTCEvent } from "@/types/scouting";
import type { CachedEventPayload } from "@/components/event/CachedEventView";

// EVERY renderer is loaded lazily, including the home one. This module is
// imported by both the home page and the event page, so a static import here
// puts one page's renderer into the OTHER page's bundle — measured at +199 KB
// on /event when StatsTable/EventList were static. Each page's happy path
// imports what it actually renders; these are only for the offline fallback,
// which by definition isn't the common case (decisions.md #65).
const CachedEventView = dynamic(() => import("@/components/event/CachedEventView"));
const StatsTable = dynamic(() => import("@/components/StatsTable"));
const EventList = dynamic(() => import("@/components/EventList"));

interface HomeStatsPayload {
    teamStats: AggregatedTeamStats[];
    filteredEvents: (FTCEvent & { abbr?: string })[];
}

function RenderCachedPayload({
    kind,
    payload,
    meta,
}: {
    kind: OfflineFallbackProps["render"];
    payload: unknown;
    meta?: { season?: number };
}) {
    switch (kind) {
        case "home-stats": {
            const p = payload as HomeStatsPayload;
            return (
                <>
                    <section className="mb-8">
                        <EventList events={p.filteredEvents} season={meta?.season} />
                    </section>
                    <section className="mb-12">
                        <StatsTable data={p.teamStats} />
                    </section>
                </>
            );
        }
        case "event-stats":
            return <CachedEventView payload={payload as CachedEventPayload} />;
    }
}
