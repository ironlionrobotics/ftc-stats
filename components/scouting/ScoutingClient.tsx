"use client";

import { useState, useEffect } from "react";
import { AggregatedTeamStats, PitScouting, MatchScouting } from "@/types/ftc";
import TeamList from "@/components/scouting/TeamList";
import ScoutingForm from "@/components/scouting/ScoutingForm";
import MatchScoutingForm from "@/components/scouting/MatchScoutingForm";
import { getPitScouting, savePitScouting, listenToMatchScouting } from "@/lib/scouting-service";
import { useAuth } from "@/context/AuthContext";
import { useSeason } from "@/context/SeasonContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { ClipboardList, Trophy } from "lucide-react";

interface ScoutingClientProps {
    initialTeams: AggregatedTeamStats[];
}

export default function ScoutingClient({ initialTeams }: ScoutingClientProps) {
    const { user } = useAuth();
    const { season } = useSeason();
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
        initialTeams.length > 0 ? initialTeams[0].teamNumber : null
    );
    const [pitData, setPitData] = useState<PitScouting | null>(null);
    const [matchScoutingEntries, setMatchScoutingEntries] = useState<MatchScouting[]>([]);
    const [loading, setLoading] = useState(false);

    // Load Pit Scouting data for selected team
    useEffect(() => {
        if (selectedTeamId) {
            setLoading(true);
            getPitScouting(season, selectedTeamId).then(data => {
                setPitData(data);
                setLoading(false);
            });
        }
    }, [selectedTeamId, season]);

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
            alert("No estas autenticado");
            return;
        }
        await savePitScouting({
            ...data,
            lastUpdatedBy: user.displayName || user.email || "Anonymous",
            season
        });
        setPitData(data);
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
                        <Tabs defaultValue="pit" className="flex-1 flex flex-col">
                            <TabsList className="mb-4 bg-white/5 border border-white/10 p-1 w-full md:w-fit">
                                <TabsTrigger value="pit" className="flex items-center gap-2">
                                    <ClipboardList size={16} /> Pit Scouting
                                </TabsTrigger>
                                <TabsTrigger value="match" className="flex items-center gap-2">
                                    <Trophy size={16} /> Match Scouting
                                </TabsTrigger>
                            </TabsList>

                            <div className="flex-1 overflow-y-auto custom-scrollbar">
                                <TabsContent value="pit" className="m-0 h-full">
                                    <ScoutingForm
                                        key={`pit-${selectedTeam.teamNumber}`}
                                        team={selectedTeam}
                                        initialData={pitData || undefined}
                                        onSave={handleSavePitData}
                                    />
                                </TabsContent>
                                <TabsContent value="match" className="m-0 h-full">
                                    <MatchScoutingForm
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
