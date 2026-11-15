"use client";

import { useState, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import type { ScoutTeam, PitScouting, MatchScouting } from "@/types/scouting";
import TeamList from "@/components/scouting/TeamList";
import ScoutingForm from "@/components/scouting/ScoutingForm";
import PitQuestionnaire from "@/components/scouting/PitQuestionnaire";
import { gameDefinitionFor } from "@/lib/games/registry";
import { selfReportDefinition } from "@/types/game-definition";
import MatchScoutingForm from "@/components/scouting/MatchScoutingForm";
import SuperScoutingForm from "@/components/scouting/SuperScoutingForm";
import PoolPanel from "@/components/scouting/PoolPanel";
import ScoutBoard from "@/components/scouting/ScoutBoard";
import CaptureQueue from "@/components/scouting/CaptureQueue";
import type { ScheduledMatch } from "@/lib/scout-claims";
import { getPitScouting, listenToMatchScouting } from "@/lib/scouting-service";
import { useSavePitScouting } from "@/lib/hooks/use-scouting-mutations";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { DEFAULT_ORG_ID, scoutNameFromUser } from "@/lib/orgs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import Tip from "@/components/ui/Tip";
import { ClipboardList, Trophy, Eye, ChevronLeft, Users, LayoutGrid, ListOrdered } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";


interface ScoutingClientProps {
    initialTeams: ScoutTeam[];
    /** Event every match/super entry is filed under; null = no event to scout. */
    eventCode: string | null;
    /** Where the team list came from: the event's FIRST roster, season results, or nothing yet. */
    rosterSource: "event" | "season" | "none";
    /** Upcoming qualification matches (FIRST schedule) for the queue and the scout board. */
    schedule: ScheduledMatch[];
    /** Deep link (?match=): start the queue / the form at this match. */
    initialMatch?: number | null;
    /** Deep link (?team=): open this team's capture directly. */
    initialTeam?: number | null;
    /** The followed team, marked in the queue. */
    followedTeam?: number | null;
}

export default function ScoutingClient({ initialTeams, eventCode, rosterSource, schedule, initialMatch = null, initialTeam = null, followedTeam = null }: ScoutingClientProps) {
    const t = useTranslations("ScoutingClient");
    const { user, orgId } = useAuth();
    const { season, program } = useProgram();
    // Pit form by season (#108): seasons with self-report questions get the
    // card-aligned interview; older ones (DECODE history) keep the legacy form.
    const seasonDef = useMemo(() => gameDefinitionFor("FTC", season), [season]);
    const pitQuestions = useMemo(() => selfReportDefinition(seasonDef), [seasonDef]);
    const tEvent = useTranslations("ScoutingEvent");
    // Teams typed in by number when FIRST hasn't published the event roster.
    const [addedTeams, setAddedTeams] = useState<ScoutTeam[]>(() =>
        initialTeam !== null && !initialTeams.some(tm => tm.teamNumber === initialTeam)
            ? [{ teamNumber: initialTeam, teamName: tEvent("teamByNumber", { n: initialTeam }) }]
            : []);
    const teams = useMemo(() => {
        const known = new Set(initialTeams.map(tm => tm.teamNumber));
        return [...initialTeams, ...addedTeams.filter(tm => !known.has(tm.teamNumber))];
    }, [initialTeams, addedTeams]);
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
        initialTeam ?? (initialTeams.length > 0 ? initialTeams[0].teamNumber : null)
    );
    // Match number the capture form starts at (picked in the queue or ?match=).
    const [pickedMatch, setPickedMatch] = useState<number | null>(initialTeam ? initialMatch : null);
    const [pitData, setPitData] = useState<PitScouting | null>(null);
    const savePitMutation = useSavePitScouting();
    const [matchScoutingEntries, setMatchScoutingEntries] = useState<MatchScouting[]>([]);
    // Mobile master-detail: below md the list and the form are alternate
    // screens (picking a team slides to the form; ChevronLeft goes back).
    // Desktop always shows both — md: classes override this flag.
    // "queue" = upcoming matches, tap a robot to capture (#116, the default
    // when FIRST has a schedule); "board" = assignment board (#103);
    // "robot" = one team's forms.
    const startView: "queue" | "robot" = initialTeam === null && eventCode !== null && schedule.length > 0 ? "queue" : "robot";
    const [mobileShowForm, setMobileShowForm] = useState(startView === "queue" || initialTeam !== null);
    const [view, setView] = useState<"queue" | "robot" | "board">(startView);
    // Remounting Tabs with a new default opens a specific tab (the board's
    // "scout now" jumps straight to Match).
    const [tabState, setTabState] = useState<{ key: number; tab: string | null }>({ key: 0, tab: null });

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

    const addTeam = (teamNumber: number) => {
        setAddedTeams(prev => prev.some(tm => tm.teamNumber === teamNumber)
            ? prev
            : [...prev, { teamNumber, teamName: tEvent("teamByNumber", { n: teamNumber }) }]);
        setSelectedTeamId(teamNumber);
        setPickedMatch(null);
        setView("robot");
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

            <div className="container mx-auto px-4 md:px-8 py-8 flex flex-col md:flex-row gap-6 h-screen relative z-10">
                {/* Sidebar List */}
                <div className={clsx(
                    "md:w-72 lg:w-80 flex-col h-full bg-muted border border-border rounded-xl overflow-hidden shadow-sm",
                    mobileShowForm ? "hidden md:flex" : "flex"
                )}>
                    <div className="border-b border-border p-4 space-y-2">
                        {!eventCode && <p className="text-sm text-muted-foreground">{tEvent("noEvents")}</p>}
                        {eventCode && schedule.length > 0 && (
                            <button
                                type="button"
                                onClick={() => { setView("queue"); setMobileShowForm(true); }}
                                className={clsx(
                                    "flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold",
                                    view === "queue" ? "border-brand bg-brand/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <ListOrdered size={16} /> {tEvent("openQueue")}
                            </button>
                        )}
                        {eventCode && program === "FTC" && (
                            <button
                                type="button"
                                onClick={() => { setView("board"); setMobileShowForm(true); }}
                                className={clsx(
                                    "flex min-h-[40px] w-full items-center justify-center gap-2 rounded-lg border px-3 text-sm font-semibold",
                                    view === "board" ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                                )}
                            >
                                <LayoutGrid size={16} /> {tEvent("openBoard")}
                            </button>
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
                        onSelectTeam={(id) => { setSelectedTeamId(id); setPickedMatch(null); setView("robot"); setMobileShowForm(true); }}
                        scoutingDataMap={{}} // Not used anymore for local storage
                    />
                </div>

                {/* Main Content Area */}
                <div className={clsx(
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
                    {view === "queue" && eventCode ? (
                        <div className="flex-1 overflow-y-auto custom-scrollbar pb-4">
                            <CaptureQueue
                                matches={schedule}
                                focusMatch={initialMatch}
                                followedTeam={followedTeam}
                                onPick={(n, match) => {
                                    if (!teams.some(tm => tm.teamNumber === n)) addTeam(n);
                                    setSelectedTeamId(n);
                                    setPickedMatch(match);
                                    setView("robot");
                                    setTabState(prev => ({ key: prev.key + 1, tab: "match" }));
                                }}
                            />
                        </div>
                    ) : view === "board" && eventCode ? (
                        <div className="flex-1 overflow-y-auto custom-scrollbar">
                            <ScoutBoard
                                season={season}
                                eventCode={eventCode}
                                matches={schedule}
                                onScoutTeam={(n) => {
                                    if (!teams.some(tm => tm.teamNumber === n)) addTeam(n);
                                    setSelectedTeamId(n);
                                    setPickedMatch(null);
                                    setView("robot");
                                    setTabState(prev => ({ key: prev.key + 1, tab: "match" }));
                                }}
                            />
                        </div>
                    ) : selectedTeam ? (
                        <Tabs key={tabState.key} defaultValue={tabState.tab ?? "match"} className="flex-1 flex flex-col">
                            <Tip
                                id="scouting-modes-v1"
                                title={t("tipTitle")}
                                className="mb-3"
                            >
                                {t.rich("tipBody", { b: (chunks) => <strong>{chunks}</strong> })}
                            </Tip>
                            <TabsList className="mb-4 bg-muted border border-border p-1 w-full md:w-fit">
                                <TabsTrigger value="match" className="flex items-center gap-2">
                                    <Trophy size={16} /> {t("tabMatch")}
                                </TabsTrigger>
                                {program === 'FTC' && (
                                    <TabsTrigger value="pit" className="flex items-center gap-2">
                                        <ClipboardList size={16} /> {t("tabPit")}
                                    </TabsTrigger>
                                )}
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
                                        {seasonDef && pitQuestions ? (
                                            <PitQuestionnaire
                                                key={`pit-${selectedTeam.teamNumber}`}
                                                team={selectedTeam}
                                                season={season}
                                                seasonDef={seasonDef}
                                                selfReport={pitQuestions}
                                                initialData={pitData || undefined}
                                                onSave={handleSavePitData}
                                            />
                                        ) : (
                                            <ScoutingForm
                                                key={`pit-${selectedTeam.teamNumber}`}
                                                team={selectedTeam}
                                                initialData={pitData || undefined}
                                                onSave={handleSavePitData}
                                            />
                                        )}
                                    </TabsContent>
                                )}
                                <TabsContent value="match" className="m-0 h-full">
                                    {eventCode ? (
                                        <MatchScoutingForm
                                            team={selectedTeam}
                                            eventCode={eventCode}
                                            initialMatchNumber={pickedMatch}
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
                                            <PoolPanel key={selectedTeam.teamNumber} season={season} eventCode={eventCode} teamNumber={selectedTeam.teamNumber} />
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
                </div>
            </div>
        </div>
    );
}
