"use client";

import { TeamSeasonStats } from "@/app/actions/pro-scouting";
import { generateSpyLinks } from "@/lib/utils";
import { ExternalLink, Youtube, Instagram, Database, BarChart2, TrendingUp, AlertTriangle } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

interface TeamAnalysisCardProps {
    stats: TeamSeasonStats;
    rank?: number;
}

export default function TeamAnalysisCard({ stats, rank }: TeamAnalysisCardProps) {
    const spyLinks = generateSpyLinks((stats as any).teamNumber, (stats as any).teamName);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        {rank && (
                            <span className={clsx(
                                "text-xs font-black px-1.5 py-0.5 rounded",
                                rank <= 3 ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"
                            )}>
                                #{rank}
                            </span>
                        )}
                        <h3 className="text-lg font-black text-slate-800 leading-none">
                            {(stats as any).teamNumber}
                        </h3>
                    </div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wide truncate max-w-[180px]">
                        {(stats as any).teamName}
                    </div>
                </div>

                {/* Consistency Badge */}
                <div className="flex flex-col items-end">
                    <div className={clsx(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                        stats.consistency < 15 ? "bg-green-100 text-green-700" :
                            stats.consistency < 30 ? "bg-blue-100 text-blue-700" :
                                "bg-red-100 text-red-700"
                    )}>
                        {stats.consistency < 15 ? "Consistent" : stats.consistency < 30 ? "Volatile" : "Wild"}
                    </div>
                    <div className="text-[9px] text-slate-400 mt-0.5">
                        σ: {stats.consistency.toFixed(1)}
                    </div>
                </div>
            </div>

            <div className="p-4 grid grid-cols-2 gap-4">
                {/* Key Metrics */}
                <div className="space-y-3">
                    <div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase">Avg Score (Est OPR)</div>
                        <div className="text-2xl font-black text-blue-600 tabular-nums">
                            {stats.avgOPR.toFixed(1)}
                        </div>
                    </div>
                    <div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase">Max Score</div>
                        <div className="text-lg font-black text-slate-800 tabular-nums">
                            {stats.maxScore.toFixed(0)}
                        </div>
                    </div>
                </div>

                {/* Score Breakdown */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-slate-500">Auto</span>
                        <span className="font-bold text-slate-800">{stats.avgAuto.toFixed(1)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, (stats.avgAuto / 60) * 100)}%` }}></div>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-slate-500">Tele</span>
                        <span className="font-bold text-slate-800">{stats.avgTele.toFixed(1)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-green-500 rounded-full" style={{ width: `${Math.min(100, (stats.avgTele / 80) * 100)}%` }}></div>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-slate-500">End</span>
                        <span className="font-bold text-slate-800">{stats.avgEnd.toFixed(1)}</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-orange-500 rounded-full" style={{ width: `${Math.min(100, (stats.avgEnd / 30) * 100)}%` }}></div>
                    </div>
                </div>
            </div>

            {/* Spy Actions */}
            <div className="p-3 bg-slate-50 border-t border-slate-100 grid grid-cols-3 gap-2">
                <Link
                    href={spyLinks.youtube}
                    target="_blank"
                    className="flex flex-col items-center justify-center p-2 rounded hover:bg-red-50 hover:text-red-600 text-slate-400 transition-colors group"
                >
                    <Youtube size={16} className="mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-[9px] font-bold uppercase">Video</span>
                </Link>
                <Link
                    href={spyLinks.instagram}
                    target="_blank"
                    className="flex flex-col items-center justify-center p-2 rounded hover:bg-pink-50 hover:text-pink-600 text-slate-400 transition-colors group"
                >
                    <Instagram size={16} className="mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-[9px] font-bold uppercase">Social</span>
                </Link>
                <Link
                    href={spyLinks.theOrangeAlliance}
                    target="_blank"
                    className="flex flex-col items-center justify-center p-2 rounded hover:bg-orange-50 hover:text-orange-600 text-slate-400 transition-colors group"
                >
                    <Database size={16} className="mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-[9px] font-bold uppercase">TOA</span>
                </Link>
            </div>
        </div>
    );
}
