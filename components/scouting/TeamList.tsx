"use client";

import { useState } from "react";
import { AggregatedTeamStats, ScoutingData } from "@/types/ftc";
import { Search } from "lucide-react";
import clsx from "clsx";

interface TeamListProps {
    teams: AggregatedTeamStats[];
    selectedTeamId: number | null;
    onSelectTeam: (teamNumber: number) => void;
    scoutingDataMap: Record<number, ScoutingData>;
}

export default function TeamList({ teams, selectedTeamId, onSelectTeam, scoutingDataMap }: TeamListProps) {
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
        <div className="w-full md:w-64 h-full bg-white/5 border border-white/10 rounded-xl flex flex-col">
            <div className="p-4 border-b border-white/10">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="text-lg font-bold text-white">Equipos</h2>
                    <button
                        onClick={() => setShowAdvancedOnly(!showAdvancedOnly)}
                        className={clsx(
                            "px-2 py-1 rounded text-[10px] font-bold uppercase tracking-tighter transition-all border",
                            showAdvancedOnly
                                ? "bg-secondary text-white border-secondary shadow-[0_0_10px_rgba(139,92,246,0.5)]"
                                : "bg-white/5 border-white/10 text-gray-500 hover:text-white"
                        )}
                    >
                        Clasificados
                    </button>
                </div>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <input
                        type="text"
                        placeholder="Buscar..."
                        className="w-full pl-9 pr-4 py-2 bg-black/20 border border-white/10 rounded-lg text-sm text-gray-200 focus:outline-none focus:ring-1 focus:ring-primary"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1 custom-scrollbar">
                {filteredTeams.map((team) => {
                    const hasData = scoutingDataMap[team.teamNumber] !== undefined;
                    const isAdvanced = team.hasAdvanced;

                    return (
                        <button
                            key={team.teamNumber}
                            onClick={() => onSelectTeam(team.teamNumber)}
                            className={clsx(
                                "w-full text-left px-4 py-3 rounded-lg flex items-center justify-between group transition-all",
                                selectedTeamId === team.teamNumber
                                    ? "bg-primary text-white shadow-lg"
                                    : isAdvanced
                                        ? "bg-secondary/20 text-gray-300 hover:bg-secondary/30 hover:text-white"
                                        : "text-gray-400 hover:bg-white/5 hover:text-white"
                            )}
                        >
                            <div>
                                <span className="block font-bold font-display">{team.teamNumber}</span>
                                <span className={clsx("text-xs truncate block max-w-[170px]", selectedTeamId === team.teamNumber ? "text-white/80" : "text-gray-500 group-hover:text-gray-300")}>
                                    {team.teamName}
                                </span>
                            </div>

                            {selectedTeamId === team.teamNumber && (
                                <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_rgba(74,222,128,0.5)]" />
                            )}
                        </button>
                    )
                })}
                {filteredTeams.length === 0 && (
                    <div className="p-4 text-center text-gray-500 text-sm">
                        No se encontraron equipos
                    </div>
                )}
            </div>
            <div className="p-4 mt-auto border-t border-white/10">
                <button
                    disabled
                    className="w-full px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-gray-400 text-sm font-medium opacity-50 cursor-not-allowed hover:bg-white/10 transition-colors"
                >
                    Regresar
                </button>
            </div>
        </div>
    );
}
