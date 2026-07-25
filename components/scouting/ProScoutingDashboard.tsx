"use client";

import { useEffect, useState } from "react";
import { fetchEventParticipants, fetchTeamSeasonHistory, TeamSeasonStats } from "@/app/actions/pro-scouting";
import TeamAnalysisCard from "./TeamAnalysisCard";
import ComparisonMatrix from "./ComparisonMatrix";
import { TeamRanking } from "@/types/scouting";
import { Loader2, Search, X } from "lucide-react";

interface ProScoutingDashboardProps {
    eventCode: string;
    season: number;
}

export default function ProScoutingDashboard({ eventCode, season }: ProScoutingDashboardProps) {
    const [participants, setParticipants] = useState<TeamRanking[]>([]);
    const [teamStats, setTeamStats] = useState<Record<number, TeamSeasonStats>>({});
    const [loading, setLoading] = useState(true);
    const [loadingStats, setLoadingStats] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [sortBy, setSortBy] = useState<'rank' | 'opr' | 'max' | 'consistency'>('rank');
    const [selectedOpponent, setSelectedOpponent] = useState<number | null>(null);
    const HERO_TEAM = 30311; // Iron Lion

    useEffect(() => {
        const loadParticipants = async () => {
            try {
                const parts = await fetchEventParticipants(season, eventCode);
                setParticipants(parts);
                setLoading(false);

                // Lazy load detailed stats
                setLoadingStats(true);
                const statsMap: Record<number, TeamSeasonStats> = {};

                // Fetch in chunks to avoid overwhelming client/server
                const chunkSize = 5;
                for (let i = 0; i < parts.length; i += chunkSize) {
                    const chunk = parts.slice(i, i + chunkSize);
                    await Promise.all(chunk.map(async (p) => {
                        const stats = await fetchTeamSeasonHistory(season, p.teamNumber);
                        statsMap[p.teamNumber] = stats;
                        setTeamStats(prev => ({ ...prev, [p.teamNumber]: stats }));
                    }));
                }
                setLoadingStats(false);

            } catch (error) {
                console.error("Failed to load pro scouting data", error);
                setLoading(false);
            }
        };

        loadParticipants();
    }, [eventCode, season]);

    const filteredTeams = participants
        .filter(p =>
            p.teamName.toLowerCase().includes(searchTerm.toLowerCase()) ||
            p.teamNumber.toString().includes(searchTerm)
        )
        .sort((a, b) => {
            const statsA = teamStats[a.teamNumber];
            const statsB = teamStats[b.teamNumber];

            if (!statsA || !statsB) return 0; // Keep original order if stats loading

            switch (sortBy) {
                case 'opr': return statsB.avgOPR - statsA.avgOPR;
                case 'max': return statsB.maxScore - statsA.maxScore;
                case 'consistency': return statsA.consistency - statsB.consistency; // Lower is better
                case 'rank': default: return a.rank - b.rank;
            }
        });

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px]">
                <Loader2 className="animate-spin text-secondary mb-4" size={40} />
                <p className="text-muted-foreground font-medium">Initializing Pro-Scouting Module...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Comparison Overlay */}
            {selectedOpponent && teamStats[HERO_TEAM] && teamStats[selectedOpponent] && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50" onClick={() => setSelectedOpponent(null)}>
                    <div className="bg-card rounded-2xl shadow-sm max-w-2xl w-full p-6 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-black text-foreground">Head-to-Head Analysis</h3>
                            <button onClick={() => setSelectedOpponent(null)} className="p-2 hover:bg-muted rounded-full text-muted-foreground">
                                <X size={20} />
                            </button>
                        </div>

                        <ComparisonMatrix
                            heroStats={teamStats[HERO_TEAM]}
                            opponentStats={teamStats[selectedOpponent]}
                        />

                        <div className="mt-6 flex justify-end">
                            <button
                                onClick={() => setSelectedOpponent(null)}
                                className="px-4 py-2 bg-muted font-bold text-foreground rounded-lg hover:bg-border"
                            >
                                Close Analysis
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Header / Controls */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-card p-4 rounded-xl shadow-sm border border-border">
                <div>
                    <h2 className="text-2xl font-black text-foreground">Pro-Scouting Database</h2>
                    <p className="text-sm text-muted-foreground">
                        Deep analysis for {participants.length} teams
                        {loadingStats && <span className="ml-2 text-secondary animate-pulse text-xs font-bold uppercase">(Loading Season Data...)</span>}
                    </p>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                    <div className="relative flex-1 md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                        <input
                            type="text"
                            placeholder="Search Team..."
                            className="w-full pl-9 pr-4 py-2 bg-muted border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-secondary"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <select
                        className="px-4 py-2 bg-muted border border-border rounded-lg text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-secondary"
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as 'rank' | 'opr' | 'max' | 'consistency')}
                    >
                        <option value="rank">Sort: Rank</option>
                        <option value="opr">Sort: Est. OPR</option>
                        <option value="max">Sort: Max Score</option>
                        <option value="consistency">Sort: High Consistency</option>
                    </select>
                </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredTeams.map((team) => (
                    teamStats[team.teamNumber] ? (
                        <div
                            key={team.teamNumber}
                            onClick={() => setSelectedOpponent(team.teamNumber)}
                            className="cursor-pointer transition-transform hover:scale-[1.02]"
                        >
                            <TeamAnalysisCard
                                stats={teamStats[team.teamNumber]}
                                rank={team.rank}
                            />
                        </div>
                    ) : (
                        // Skeleton Card
                        <div key={team.teamNumber} className="bg-card rounded-xl shadow-sm border border-border p-4 h-[300px] animate-pulse">
                            <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
                            <div className="h-4 bg-muted rounded w-2/3 mb-6"></div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="h-16 bg-muted rounded"></div>
                                <div className="h-16 bg-muted rounded"></div>
                            </div>
                        </div>
                    )
                ))}
            </div>
        </div>
    );
}
