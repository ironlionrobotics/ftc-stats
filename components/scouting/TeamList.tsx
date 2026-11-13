"use client";

import { useState } from "react";
import { AggregatedTeamStats, ScoutingData } from "@/types/scouting";
import { Search } from "lucide-react";
import clsx from "clsx";

interface TeamListProps {
    teams: AggregatedTeamStats[];
    selectedTeamId: number | null;
    onSelectTeam: (teamNumber: number) => void;
    scoutingDataMap: Record<number, ScoutingData>;
}

export default function TeamList({ teams, selectedTeamId, onSelectTeam }: TeamListProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [showAdvancedOnly, setShowAdvancedOnly] = useState(false);

    const filteredTeams = teams
        .filter((team) => {
            const matchesSearch = team.teamNumber.toString().includes(searchTerm) ||
                team.teamName.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesAdvanced = showAdvancedOnly ? team.hasAdvanced : true;
            return matchesSearch && matchesAdvanced;
        })
        .sort((a, b) => a.teamNumber - b.teamNumber);

    return (
        <div className="w-full md:w-64 h-full bg-muted border border-border rounded-xl flex flex-col">
            <div className="p-4 border-b border-border">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-foreground">Equipos</h2>
                    <button
                        onClick={() => setShowAdvancedOnly(!showAdvancedOnly)}
                        className={clsx(
                            "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tighter transition-all border",
                            showAdvancedOnly
                                ? "bg-secondary text-secondary-foreground border-secondary"
                                : "bg-muted border-border text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Clasificados
                    </button>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Buscar..."
                        className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {filteredTeams.map((team) => {
                    const isAdvanced = team.hasAdvanced;

                    return (
                        <button
                            key={team.teamNumber}
                            onClick={() => onSelectTeam(team.teamNumber)}
                            className={clsx(
                                "w-full text-left px-4 py-3 rounded-lg flex items-center justify-between group transition-all",
                                selectedTeamId === team.teamNumber
                                    ? "bg-primary text-primary-foreground shadow-lg"
                                    : isAdvanced
                                        ? "bg-secondary/20 text-foreground hover:bg-secondary/30 hover:text-foreground"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            )}
                        >
                            <div>
                                <span className="block font-bold font-display">{team.teamNumber}</span>
                                <span className={clsx("text-xs truncate block max-w-[170px]", selectedTeamId === team.teamNumber ? "text-primary-foreground/80" : "text-muted-foreground group-hover:text-foreground")}>
                                    {team.teamName}
                                </span>
                            </div>

                            {selectedTeamId === team.teamNumber && (
                                <div className="w-2 h-2 rounded-full bg-success" />
                            )}
                        </button>
                    )
                })}
                {filteredTeams.length === 0 && (
                    <div className="p-4 text-center text-muted-foreground text-sm">
                        No se encontraron equipos
                    </div>
                )}
            </div>
            <div className="p-4 mt-auto border-t border-border">
                <button
                    disabled
                    className="w-full px-4 py-2 bg-muted border border-border rounded-lg text-muted-foreground text-sm font-medium opacity-50 cursor-not-allowed hover:bg-border transition-colors"
                >
                    Regresar
                </button>
            </div>
        </div>
    );
}
