"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ScoutTeam, PitScouting, MatchScouting } from "@/types/scouting";
import { SCOUTING_EVENT_COOKIE } from "@/lib/scouting-event";
import TeamList from "@/components/scouting/TeamList";
import ScoutingForm from "@/components/scouting/ScoutingForm";
import MatchScoutingForm from "@/components/scouting/MatchScoutingForm";
import SuperScoutingForm from "@/components/scouting/SuperScoutingForm";
import PoolPanel from "@/components/scouting/PoolPanel";
import { getPitScouting, listenToMatchScouting } from "@/lib/scouting-service";
import { useSavePitScouting } from "@/lib/hooks/use-scouting-mutations";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { DEFAULT_ORG_ID, scoutNameFromUser } from "@/lib/orgs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import Tip from "@/components/ui/Tip";
import { ClipboardList, Trophy, Eye, ChevronLeft, Users } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";

export interface ScoutingEventOption {
    code: string;
    name: string;
    dateStart: string;
}

interface ScoutingClientProps {
    initialTeams: ScoutTeam[];
    /** Events the scout can pick (oldest first). */
    events: ScoutingEventOption[];
    /** Event every match/super entry is filed under; null = no event to scout. */
    eventCode: string | null;
    /** Where the team list came from: the event's FIRST roster, season results, or nothing yet. */
    rosterSource: "event" | "season" | "none";
}

export default function ScoutingClient({ initialTeams, events, eventCode, rosterSource }: ScoutingClientProps) {
    const t = useTranslations("ScoutingClient");
    const { user, orgId } = useAuth();
    const { season, program } = useProgram();
    const tEvent = useTranslations("ScoutingEvent");
    const router = useRouter();
    // Teams typed in by number when FIRST hasn't published the event roster.
    const [addedTeams, setAddedTeams] = useState<ScoutTeam[]>([]);
    const teams = useMemo(() => {
        const known = new Set(initialTeams.map(tm => tm.teamNumber));
        return [...initialTeams, ...addedTeams.filter(tm => !known.has(tm.teamNumber))];
    }, [initialTeams, addedTeams]);
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
        initialTeams.length > 0 ? initialTeams[0].teamNumber : null
    );
    const [pitData, setPitData] = useState<PitScouting | null>(null);
    const savePitMutation = useSavePitScouting();
    const [matchScoutingEntries, setMatchScoutingEntries] = useState<MatchScouting[]>([]);
    // Mobile master-detail: below md the list and the form are alternate
    // screens (picking a team slides to the form; ChevronLeft goes back).
    // Desktop always shows both — md: classes override this flag.
    const [mobileShowForm, setMobileShowForm] = useState(false);

    // Load this org's pit scouting record for the selected team. Other orgs'
    // public summaries (if any) are surfaced inside ScoutingForm via the
    // getPublicPitSummaries helper. (No loading flag — nothing rendered off it;
    // pitData going from null to a value is the only observable state here.)
    useEffect(() => {
        if (selectedTeamId) {
            const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;
            getPitScouting(season, selectedTeamId, effectiveOrgId).then(data => {
                setPitData(data);
            });
        }
    }, [selectedTeamId, season, orgId]);

    // Listen to all match scouting for this event/season to show live updates
    // (In a real scenario, we might want to filter by eventCode properly)
    useEffect(() => {
        if (!eventCode) return;
        const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;
        const unsubscribe = listenToMatchScouting(season, eventCode, effectiveOrgId, (entries) => {
            setMatchScoutingEntries(entries);
        });
        return () => unsubscribe();
    }, [season, eventCode, orgId]);

    const changeEvent = (code: string) => {
        // Remembered for next visits (the server validates it against the season's events).
        document.cookie = `${SCOUTING_EVENT_COOKIE}=${code}; path=/; max-age=${60 * 60 * 24 * 120}; samesite=lax`;
        router.push(`/scouting?event=${code}`);
    };

    const addTeam = (teamNumber: number) => {
        setAddedTeams(prev => prev.some(tm => tm.teamNumber === teamNumber)
            ? prev
            : [...prev, { teamNumber, teamName: tEvent("teamByNumber", { n: teamNumber }) }]);
        setSelectedTeamId(teamNumber);
        setMobileShowForm(true);
    };

    const handleSavePitData = async (data: PitScouting) => {
        if (!user) {
            toast.error(t("signInToSave"));
            return;
        }
        const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;
        const enriched: PitScouting = {
            ...data,
            orgId: effectiveOrgId,
            scoutedBy: user.uid,
            lastUpdatedBy: scoutNameFromUser(user), // never the email (#92)
            season,
        };
        // useSavePitScouting tries Firestore first and, on failure (bad venue
        // wifi — pit areas often have the worst signal on-site), queues the
        // record in Dexie instead of losing the interview. `savedTo` tells us
        // which happened so the scout is never left thinking a queued
        // capture is safely on the server (or, worse, lost).
        try {
            const result = await savePitMutation.mutateAsync(enriched);
            setPitData(enriched);
            if (result.savedTo === "local") {
                toast.success(t("pitSavedOffline"));
            } else {
                toast.success(t("pitSaved"));
            }
        } catch (e) {
            toast.error(t("pitSaveFailed"), {
                description: e instanceof Error ? e.message : undefined,
            });
        }
    };

    const selectedTeam = teams.find((tm) => tm.teamNumber === selectedTeamId);

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-96 bg-primary/10 blur-[100px] rounded-full -translate-y-1/2 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-full h-96 bg-secondary/10 blur-[100px] rounded-full translate-y-1/2 pointer-events-none" />

            <div className="container mx-auto px-4 md:px-8 py-8 flex flex-col md:flex-row gap-6 h-screen relative z-10">
                {/* Sidebar List */}
                <div className={clsx(
                    "md:w-72 lg:w-80 flex-col h-full bg-muted border border-border rounded-xl overflow-hidden shadow-sm",
                    mobileShowForm ? "hidden md:flex" : "flex"
                )}>
                    <div className="border-b border-border p-4 space-y-2">
                        <label htmlFor="scouting-event" className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            {tEvent("event")}
                        </label>
                        {events.length > 0 ? (
                            <select
                                id="scouting-event"
                                value={eventCode ?? ""}
                                onChange={(e) => changeEvent(e.target.value)}
                                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
                            >
                                {events.map(ev => (
                                    <option key={ev.code} value={ev.code}>
                                        {ev.dateStart.slice(0, 10)} · {ev.name} ({ev.code})
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <p className="text-sm text-muted-foreground">{tEvent("noEvents")}</p>
                        )}
                        {eventCode && rosterSource !== "event" && (
                            <p className="text-xs text-muted-foreground">
                                {rosterSource === "season" ? tEvent("rosterSeason") : tEvent("rosterNone")}
                            </p>
                        )}
                    </div>
                    <TeamList
                        teams={teams}
                        onAddTeam={eventCode ? addTeam : undefined}
                        selectedTeamId={selectedTeamId}
                        onSelectTeam={(id) => { setSelectedTeamId(id); setMobileShowForm(true); }}
                        scoutingDataMap={{}} // Not used anymore for local storage
                    />
                </div>

                {/* Main Content Area */}
                <main className={clsx(
                    "flex-1 flex-col h-full overflow-hidden",
                    mobileShowForm ? "flex" : "hidden md:flex"
                )}>
                    <button
                        type="button"
                        onClick={() => setMobileShowForm(false)}
                        className="md:hidden flex items-center gap-1 mb-3 text-sm font-medium text-muted-foreground hover:text-foreground min-h-[44px]"
                    >
                        <ChevronLeft size={18} /> {t("teams")}
                    </button>
                    {selectedTeam ? (
                        <Tabs defaultValue={program === 'FTC' ? "pit" : "match"} className="flex-1 flex flex-col">
                            <Tip
                                id="scouting-modes-v1"
                                title={t("tipTitle")}
                                className="mb-3"
                            >
                                {t.rich("tipBody", { b: (chunks) => <strong>{chunks}</strong> })}
                            </Tip>
                            <TabsList className="mb-4 bg-muted border border-border p-1 w-full md:w-fit">
                                {program === 'FTC' && (
                                    <TabsTrigger value="pit" className="flex items-center gap-2">
                                        <ClipboardList size={16} /> {t("tabPit")}
                                    </TabsTrigger>
                                )}
                                <TabsTrigger value="match" className="flex items-center gap-2">
                                    <Trophy size={16} /> {t("tabMatch")}
                                </TabsTrigger>
                                <TabsTrigger value="super" className="flex items-center gap-2">
                                    <Eye size={16} /> {t("tabSuper")}
                                </TabsTrigger>
                                {program === "FTC" && (
                                    <TabsTrigger value="pool" className="flex items-center gap-2">
                                        <Users size={16} /> {tEvent("tabPool")}
                                    </TabsTrigger>
                                )}
                            </TabsList>

                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                {program === 'FTC' && (
                                    <TabsContent value="pit" className="m-0 h-full">
                                        <ScoutingForm
                                            key={`pit-${selectedTeam.teamNumber}`}
                                            team={selectedTeam}
                                            initialData={pitData || undefined}
                                            onSave={handleSavePitData}
                                        />
                                    </TabsContent>
                                )}
                                <TabsContent value="match" className="m-0 h-full">
                                    {eventCode ? (
                                        <MatchScoutingForm
                                            team={selectedTeam}
                                            eventCode={eventCode}
                                            entries={matchScoutingEntries.filter(e => e.teamNumber === selectedTeam.teamNumber)}
                                        />
                                    ) : <p className="p-6 text-muted-foreground">{tEvent("needEvent")}</p>}
                                </TabsContent>
                                <TabsContent value="super" className="m-0 h-full">
                                    {eventCode ? (
                                        <SuperScoutingForm
                                            team={selectedTeam}
                                            eventCode={eventCode}
                                            entries={matchScoutingEntries.filter(e => e.teamNumber === selectedTeam.teamNumber)}
                                        />
                                    ) : <p className="p-6 text-muted-foreground">{tEvent("needEvent")}</p>}
                                </TabsContent>
                                {program === "FTC" && (
                                    <TabsContent value="pool" className="m-0 h-full">
                                        {eventCode ? (
                                            <PoolPanel season={season} eventCode={eventCode} teamNumber={selectedTeam.teamNumber} />
                                        ) : <p className="p-6 text-muted-foreground">{tEvent("needEvent")}</p>}
                                    </TabsContent>
                                )}
                            </div>
                        </Tabs>
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground bg-muted border border-border rounded-xl">
                            {t("selectTeam")}
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
