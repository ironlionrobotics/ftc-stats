"use client";

import { TeamRanking } from "@/types/scouting";
import { Users, Search, Building2, MapPin } from "lucide-react";
import { useState, useMemo } from "react";

interface ParticipantListProps {
    rankings: TeamRanking[];
    onTeamClick?: (teamNumber: number) => void;
}

export default function ParticipantList({ rankings, onTeamClick }: ParticipantListProps) {
    const [searchTerm, setSearchTerm] = useState("");

    const filteredTeams = useMemo(() => {
        return rankings.filter(team =>
            team.teamNumber.toString().includes(searchTerm) ||
            team.teamName.toLowerCase().includes(searchTerm.toLowerCase())
        ).sort((a, b) => a.teamNumber - b.teamNumber);
    }, [rankings, searchTerm]);

    return (
        <div className="space-y-6">
            {/* Search and Stats Bar */}
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-sm">
                <div className="relative w-full md:w-96">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                        type="text"
                        placeholder="Search by team # or name..."
                        className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex items-center gap-4 text-sm font-bold text-slate-500">
                    <span className="flex items-center gap-2">
                        <Users size={18} className="text-primary" />
                        {rankings.length} Total Teams
                    </span>
                </div>
            </div>

            {/* Teams Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTeams.map((team) => (
                    <button
                        key={team.teamNumber}
                        onClick={() => onTeamClick?.(team.teamNumber)}
                        className="group bg-white border border-slate-200 rounded-2xl p-5 text-left hover:border-primary hover:shadow-xl hover:shadow-primary/5 transition-all duration-300 relative overflow-hidden"
                    >
                        {/* Decorative Background Element */}
                        <div className="absolute -right-4 -bottom-4 text-slate-50 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                            <Building2 size={120} />
                        </div>

                        <div className="relative z-10">
                            <div className="flex items-start justify-between mb-3">
                                <div className="bg-orange-600 text-white px-4 py-1.5 rounded-xl font-black text-xl shadow-lg shadow-orange-100 group-hover:bg-orange-500 group-hover:scale-110 transition-all">
                                    {team.teamNumber}
                                </div>
                                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                                    Participant
                                </div>
                            </div>

                            <h3 className="font-bold text-slate-900 line-clamp-2 group-hover:text-primary transition-colors min-h-[40px]">
                                {team.teamName}
                            </h3>

                            <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-1.5 text-slate-400">
                                    <MapPin size={12} />
                                    <span className="text-[10px] font-bold uppercase tracking-tight">Mexico</span>
                                </div>
                                <div className="text-[10px] font-bold text-primary opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                                    View Matches
                                    <span className="text-lg leading-none">→</span>
                                </div>
                            </div>
                        </div>
                    </button>
                ))}
            </div>

            {filteredTeams.length === 0 && (
                <div className="text-center py-20 bg-slate-50 rounded-3xl border-2 border-dashed border-slate-200">
                    <div className="text-slate-400 mb-2">
                        <Search size={48} className="mx-auto opacity-20" />
                    </div>
                    <p className="text-slate-500 font-medium">No teams found matching &quot;{searchTerm}&quot;</p>
                </div>
            )}
        </div>
    );
}
