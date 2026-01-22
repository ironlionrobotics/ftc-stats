"use client";

import { useState, useEffect } from "react";
import { AggregatedTeamStats, ScoutingData } from "@/types/ftc";
import TeamList from "@/components/scouting/TeamList";
import ScoutingForm from "@/components/scouting/ScoutingForm";

interface ScoutingClientProps {
    initialTeams: AggregatedTeamStats[];
}

export default function ScoutingClient({ initialTeams }: ScoutingClientProps) {
    const [selectedTeamId, setSelectedTeamId] = useState<number | null>(
        initialTeams.length > 0 ? initialTeams[0].teamNumber : null
    );
    const [scoutingDataMap, setScoutingDataMap] = useState<Record<number, ScoutingData>>({});

    // Load saved scouting forms from LocalStorage on mount
    useEffect(() => {
        const savedData = localStorage.getItem("scoutingData");
        if (savedData) {
            try {
                setScoutingDataMap(JSON.parse(savedData));
            } catch (e) {
                console.error("Error parsing saved scouting data", e);
            }
        }
    }, []);

    const handleSaveScoutingData = (data: ScoutingData) => {
        const newDataMap = {
            ...scoutingDataMap,
            [data.teamNumber]: data,
        };
        setScoutingDataMap(newDataMap);
        localStorage.setItem("scoutingData", JSON.stringify(newDataMap));
    };

    const selectedTeam = initialTeams.find((t) => t.teamNumber === selectedTeamId);
    const selectedTeamData = selectedTeamId ? scoutingDataMap[selectedTeamId] : undefined;

    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute top-0 left-0 w-full h-96 bg-primary/10 blur-[100px] rounded-full -translate-y-1/2 pointer-events-none" />
            <div className="absolute bottom-0 right-0 w-full h-96 bg-secondary/10 blur-[100px] rounded-full translate-y-1/2 pointer-events-none" />

            <div className="container mx-auto px-4 py-8 flex flex-col md:flex-row gap-6 h-screen relative z-10">
                {/* Sidebar List */}
                <TeamList
                    teams={initialTeams}
                    selectedTeamId={selectedTeamId}
                    onSelectTeam={setSelectedTeamId}
                    scoutingDataMap={scoutingDataMap}
                />

                {/* Main Form Area */}
                <main className="flex-1 flex flex-col h-full overflow-hidden">
                    {selectedTeam ? (
                        <ScoutingForm
                            key={selectedTeam.teamNumber}
                            team={selectedTeam}
                            initialData={selectedTeamData}
                            onSave={handleSaveScoutingData}
                        />
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
