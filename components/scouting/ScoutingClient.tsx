"use client";

import { useState, useEffect } from "react";
import { AggregatedTeamStats, PitScouting, MatchScouting } from "@/types/scouting";
import TeamList from "@/components/scouting/TeamList";
import ScoutingForm from "@/components/scouting/ScoutingForm";
import MatchScoutingForm from "@/components/scouting/MatchScoutingForm";
import SuperScoutingForm from "@/components/scouting/SuperScoutingForm";
import { getPitScouting, savePitScouting, listenToMatchScouting } from "@/lib/scouting-service";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { DEFAULT_ORG_ID } from "@/lib/orgs";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import Tip from "@/components/ui/Tip";
import { ClipboardList, Trophy, Eye } from "lucide-react";
import { toast } from "sonner";

interface ScoutingClientProps {
    initialTeams: AggregatedTeamStats[];
}

export default function ScoutingClient({ initialTeams }: ScoutingClientProps) {
    const { user, orgId } = useAuth();
    const { season, program } = useProgram();
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
        initialTeams.length > 0 ? initialTeams[0].teamNumber : null
    );
    const [pitData, setPitData] = useState<PitScouting | null>(null);
    const [matchScoutingEntries, setMatchScoutingEntries] = useState<MatchScouting[]>([]);
    const [, setLoading] = useState(false);

    // Load this org's pit scouting record for the selected team. Other orgs'
    // public summaries (if any) are surfaced inside ScoutingForm via the
    // getPublicPitSummaries helper.
    useEffect(() => {
        if (selectedTeamId) {
            setLoading(true);
            const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;
            getPitScouting(season, selectedTeamId, effectiveOrgId).then(data => {
                setPitData(data);
                setLoading(false);
            });
        }
    }, [selectedTeamId, season, orgId]);

    // Listen to all match scouting for this event/season to show live updates
    // (In a real scenario, we might want to filter by eventCode properly)
    useEffect(() => {
        // For now, we assume a default event code or use the one from the teams' first event
        const eventCode = initialTeams[0]?.events[0]?.eventCode || "MXTOL";
        const unsubscribe = listenToMatchScouting(season, eventCode, (entries) => {
            setMatchScoutingEntries(entries);
        });
        return () => unsubscribe();
    }, [season, initialTeams]);

    const handleSavePitData = async (data: PitScouting) => {
        if (!user) {
            toast.error("Debes iniciar sesión para guardar");
            return;
        }
        const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;
        const enriched: PitScouting = {
            ...data,
            orgId: effectiveOrgId,
            scoutedBy: user.uid,
            lastUpdatedBy: user.displayName || user.email || "Anonymous",
            season,
        };
        try {
            await savePitScouting(enriched);
            setPitData(enriched);
            toast.success("Pit scouting guardado");
        } catch (e) {
            toast.error("Error al guardar pit scouting", {
                description: e instanceof Error ? e.message : undefined,
            });
        }
    };

    const selectedTeam = initialTeams.find((t) => t.teamNumber === selectedTeamId);

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-96 bg-primary/10 blur-[100px] rounded-full -translate-y-1/2 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-full h-96 bg-secondary/10 blur-[100px] rounded-full translate-y-1/2 pointer-events-none" />

            <div className="container mx-auto px-4 md:px-8 py-8 flex flex-col md:flex-row gap-6 h-screen relative z-10">
                {/* Sidebar List */}
                <div className="md:w-72 lg:w-80 flex flex-col h-full bg-white/5 border border-white/10 rounded-xl overflow-hidden shadow-2xl backdrop-blur-md">
                    <TeamList
                        teams={initialTeams}
                        selectedTeamId={selectedTeamId}
                        onSelectTeam={setSelectedTeamId}
                        scoutingDataMap={{}} // Not used anymore for local storage
                    />
                </div>

                {/* Main Content Area */}
                <main className="flex-1 flex flex-col h-full overflow-hidden">
                    {selectedTeam ? (
                        <Tabs defaultValue={program === 'FTC' ? "pit" : "match"} className="flex-1 flex flex-col">
                            <Tip
                                id="scouting-modes-v1"
                                title="Tres modos de scouting"
                                className="mb-3"
                            >
                                <strong>Pit:</strong> specs del robot (1×). <strong>Match:</strong> counters por match jugado. <strong>Super:</strong> impresiones cualitativas (driver, defense, would-pick) — alimenta el picklist.
                            </Tip>
                            <TabsList className="mb-4 bg-white/5 border border-white/10 p-1 w-full md:w-fit">
                                {program === 'FTC' && (
                                    <TabsTrigger value="pit" className="flex items-center gap-2">
                                        <ClipboardList size={16} /> Pit Scouting
                                    </TabsTrigger>
                                )}
                                <TabsTrigger value="match" className="flex items-center gap-2">
                                    <Trophy size={16} /> Match Scouting
                                </TabsTrigger>
                                <TabsTrigger value="super" className="flex items-center gap-2">
                                    <Eye size={16} /> Super Scouting
                                </TabsTrigger>
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
                                    <MatchScoutingForm
                                        team={selectedTeam}
                                        entries={matchScoutingEntries.filter(e => e.teamNumber === selectedTeam.teamNumber)}
                                    />
                                </TabsContent>
                                <TabsContent value="super" className="m-0 h-full">
                                    <SuperScoutingForm
                                        team={selectedTeam}
                                        entries={matchScoutingEntries.filter(e => e.teamNumber === selectedTeam.teamNumber)}
                                    />
                                </TabsContent>
                            </div>
                        </Tabs>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-400 bg-white/5 border border-white/10 rounded-xl">
                            Selecciona un equipo de la lista
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
