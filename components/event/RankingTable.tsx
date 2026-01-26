"use client";

import { TeamRanking, FTCMatch } from "@/types/ftc";
import clsx from "clsx";
import Link from "next/link";
import { Trophy, Users, Hash, Star, Zap } from "lucide-react";

interface RankingTableProps {
    rankings: TeamRanking[];
    matches?: FTCMatch[];
}

export default function RankingTable({ rankings, matches = [] }: RankingTableProps) {
    if (!rankings || rankings.length === 0) {
        return (
            <div className="text-gray-500 italic text-center py-8 bg-white/5 rounded-2xl border border-white/5">
                No ranking data available for this event yet.
            </div>
        );
    }

    // Accurate stats from matches: High Score only (NP is already in sortOrder2)
    const extraStats = new Map<number, { highScore: number }>();
    matches.forEach(m => {
        if (m.tournamentLevel === "PRACTICE") return;

        m.teams.forEach(t => {
            if (!extraStats.has(t.teamNumber)) extraStats.set(t.teamNumber, { highScore: 0 });
            const s = extraStats.get(t.teamNumber)!;
            const isRed = t.station.startsWith("Red");
            s.highScore = Math.max(s.highScore, isRed ? m.scoreRedFinal : m.scoreBlueFinal);
        });
    });

    return (
        <div className="bg-[#0a0a0b] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-gray-400 border-b border-white/10 text-[10px] uppercase tracking-widest bg-white/[0.02]">
                            <th className="p-4 font-bold flex items-center gap-2">
                                <Hash size={12} className="text-primary" /> Rank
                            </th>
                            <th className="p-4 font-bold">
                                <Users size={12} className="inline mr-2 text-secondary" /> Team
                            </th>
                            <th className="p-4 font-bold text-center">RS</th>
                            <th className="p-4 font-bold text-center text-primary" title="Avg Match Points excluding Penalties">NP Points (Avg)</th>
                            <th className="p-4 font-bold text-center" title="Average Base Points">Base Pts (Avg)</th>
                            <th className="p-4 font-bold text-center" title="Average Auto Points">Auto Pts (Avg)</th>
                            <th className="p-4 font-bold text-center">High Score</th>
                            <th className="p-4 font-bold text-center">W-L-T</th>
                            <th className="p-4 font-bold text-center">Plays</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {rankings.map((rank) => {
                            const stats = extraStats.get(rank.teamNumber);
                            const realHigh = stats ? stats.highScore : 0;

                            return (
                                <tr key={rank.teamNumber} className="hover:bg-white/[0.03] transition-colors group">
                                    <td className="p-4">
                                        <div className={clsx(
                                            "w-8 h-8 rounded-lg flex items-center justify-center font-bold font-display text-sm",
                                            rank.rank === 1 ? "bg-yellow-500/20 text-yellow-500 border border-yellow-500/20 shadow-[0_0_10px_rgba(234,179,8,0.2)]" :
                                                rank.rank === 2 ? "bg-gray-400/20 text-gray-300 border border-gray-400/20" :
                                                    rank.rank === 3 ? "bg-amber-700/20 text-amber-600 border border-amber-700/20" :
                                                        "bg-white/5 text-gray-400"
                                        )}>
                                            {rank.rank}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <Link
                                            href={`/team/${rank.teamNumber}`}
                                            className="group-hover:text-primary transition-colors block"
                                        >
                                            <div className="flex items-center gap-2">
                                                <div className="font-bold text-white text-lg">{rank.teamNumber}</div>
                                                {rank.dq > 0 && (
                                                    <span className="bg-red-500/10 text-red-500 text-[10px] px-1.5 py-0.5 rounded border border-red-500/20 font-bold">
                                                        DQ: {rank.dq}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-gray-500 font-medium truncate max-w-[150px]">
                                                {rank.teamName}
                                            </div>
                                        </Link>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="text-secondary font-bold font-display">
                                            {rank.sortOrder1.toFixed(2)}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="text-primary font-bold">
                                            {rank.sortOrder2.toFixed(2)}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="text-gray-500 text-sm">
                                            {rank.sortOrder3.toFixed(2)}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="text-gray-500 text-sm">
                                            {rank.sortOrder4.toFixed(2)}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="text-white font-bold">
                                            {realHigh || 0}
                                        </span>
                                    </td>
                                    <td className="p-4 text-center">
                                        <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 font-mono text-[10px]">
                                            <span className="text-green-500">{rank.wins}</span>
                                            <span className="text-gray-600">-</span>
                                            <span className="text-red-500">{rank.losses}</span>
                                            <span className="text-gray-600">-</span>
                                            <span className="text-blue-500">{rank.ties}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="text-gray-500 text-sm">
                                            {rank.matchesPlayed}
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
