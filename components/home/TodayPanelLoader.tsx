"use client";

import dynamic from "next/dynamic";
import { useMemo, useSyncExternalStore } from "react";

import { useAuth } from "@/context/AuthContext";
import { guessActiveEvent } from "@/lib/active-event";
import type { AggregatedTeamStats } from "@/types/scouting";

/**
 * Gate for the home "Today" panel — and the reason `/` keeps its bundle.
 *
 * The panel itself renders for a narrow audience: signed in, attached to an
 * org, and that org's team is competing at an event whose date window contains
 * today. Everyone else — every anonymous visitor, every signed-in user between
 * events — gets `null`. Shipping the panel's code to all of them to discover
 * that would be backwards, so the decision is made *here*, in a module small
 * enough to sit on the critical path, and the panel is a `next/dynamic` chunk
 * that is never even requested unless the gate opens.
 *
 * That ordering matters more than plain lazy-loading: rendering the dynamic
 * component unconditionally would still keep it out of the initial bundle, but
 * every visitor would fetch it moments later for nothing.
 *
 * `ssr: false` needs a Client Component to live in (`app/page.tsx` is a Server
 * Component) — same reason `DeferredGlobals` exists. It also suits the panel,
 * which depends on auth state that is only known after hydration.
 *
 * Everything imported here is already on the page or negligible: `useAuth`
 * (root layout, lazy Firebase SDK), `guessActiveEvent` (pure, no deps), and
 * `teams`, which is the same array `StatsTable` already receives.
 */
const TodayPanel = dynamic(() => import("./TodayPanel"), { ssr: false });

const emptySubscribe = () => () => { };
/** False during SSR and the hydrating render, true after. Same idiom as Sidebar. */
function useHydrated(): boolean {
    return useSyncExternalStore(emptySubscribe, () => true, () => false);
}

export default function TodayPanelLoader({
    season,
    teams,
}: {
    season: number;
    teams: AggregatedTeamStats[];
}) {
    const hydrated = useHydrated();
    const { orgId } = useAuth();

    const teamNumber = orgId ? Number(orgId) : Number.NaN;
    const hasTeam = Number.isInteger(teamNumber) && teamNumber > 0;

    // `live: false` means the guess fell back to "most recent" or "most
    // frequent" — a finished or arbitrary event. This panel is about *now*.
    const guess = useMemo(() => guessActiveEvent(teams), [teams]);
    const eventCode = guess?.live ? guess.code : null;

    const competing = useMemo(
        () =>
            !!eventCode &&
            hasTeam &&
            teams.some(
                team =>
                    team.teamNumber === teamNumber &&
                    team.events.some(e => e.eventCode === eventCode),
            ),
        [teams, eventCode, hasTeam, teamNumber],
    );

    if (!hydrated || !eventCode || !orgId || !competing) return null;

    return <TodayPanel season={season} teams={teams} eventCode={eventCode} teamNumber={teamNumber} orgId={orgId} />;
}
