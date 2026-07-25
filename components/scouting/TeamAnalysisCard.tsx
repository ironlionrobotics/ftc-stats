"use client";

import { TeamSeasonStats } from "@/app/actions/pro-scouting";
import { generateSpyLinks } from "@/lib/utils";
import { Youtube, Instagram, Database } from "lucide-react";
import Link from "next/link";
import clsx from "clsx";

interface TeamAnalysisCardProps {
    stats: TeamSeasonStats;
    rank?: number;
}

export default function TeamAnalysisCard({ stats, rank }: TeamAnalysisCardProps) {
    const spyLinks = generateSpyLinks(stats.teamNumber, stats.teamName);

    return (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden hover:shadow-md transition-shadow">
            <div className="p-4 border-b border-border bg-muted flex justify-between items-start">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        {rank && (
                            <span className={clsx(
                                "text-xs font-black px-1.5 py-0.5 rounded",
                                rank <= 3 ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground"
                            )}>
                                #{rank}
                            </span>
                        )}
                        <h3 className="text-lg font-black text-foreground leading-none">
                            {stats.teamNumber}
                        </h3>
                    </div>
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-wide truncate max-w-[180px]">
                        {stats.teamName}
                    </div>
                </div>

                {/* Consistency Badge */}
                <div className="flex flex-col items-end">
                    <div className={clsx(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full",
                        stats.consistency < 15 ? "bg-success/15 text-success" :
                            stats.consistency < 30 ? "bg-secondary/15 text-secondary" :
                                "bg-danger/15 text-danger"
                    )}>
                        {stats.consistency < 15 ? "Consistent" : stats.consistency < 30 ? "Volatile" : "Wild"}
                    </div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">
                        σ: {stats.consistency.toFixed(1)}
                    </div>
                </div>
            </div>

            <div className="p-4 grid grid-cols-2 gap-4">
                {/* Key Metrics */}
                <div className="space-y-3">
                    <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Avg Score (Est OPR)</div>
                        <div className="text-2xl font-black text-secondary tabular-nums">
                            {stats.avgOPR.toFixed(1)}
                        </div>
                    </div>
                    <div>
                        <div className="text-[9px] font-bold text-muted-foreground uppercase">Max Score</div>
                        <div className="text-lg font-black text-foreground tabular-nums">
                            {stats.maxScore.toFixed(0)}
                        </div>
                    </div>
                </div>

                {/* Score Breakdown */}
                <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-muted-foreground">Auto</span>
                        <span className="font-bold text-foreground">{stats.avgAuto.toFixed(1)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, (stats.avgAuto / 60) * 100)}%` }}></div>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-muted-foreground">Tele</span>
                        <span className="font-bold text-foreground">{stats.avgTele.toFixed(1)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-success rounded-full" style={{ width: `${Math.min(100, (stats.avgTele / 80) * 100)}%` }}></div>
                    </div>

                    <div className="flex justify-between items-center text-xs">
                        <span className="font-medium text-muted-foreground">End</span>
                        <span className="font-bold text-foreground">{stats.avgEnd.toFixed(1)}</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-secondary rounded-full" style={{ width: `${Math.min(100, (stats.avgEnd / 30) * 100)}%` }}></div>
                    </div>
                </div>
            </div>

            {/* Spy Actions */}
            <div className="p-3 bg-muted border-t border-border grid grid-cols-3 gap-2">
                <Link
                    href={spyLinks.youtube}
                    target="_blank"
                    className="flex flex-col items-center justify-center p-2 rounded hover:bg-danger/10 hover:text-danger text-muted-foreground transition-colors group"
                >
                    <Youtube size={16} className="mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-[9px] font-bold uppercase">Video</span>
                </Link>
                <Link
                    href={spyLinks.instagram}
                    target="_blank"
                    className="flex flex-col items-center justify-center p-2 rounded hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors group"
                >
                    <Instagram size={16} className="mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-[9px] font-bold uppercase">Social</span>
                </Link>
                <Link
                    href={spyLinks.theOrangeAlliance}
                    target="_blank"
                    className="flex flex-col items-center justify-center p-2 rounded hover:bg-primary/10 hover:text-primary text-muted-foreground transition-colors group"
                >
                    <Database size={16} className="mb-1 group-hover:scale-110 transition-transform" />
                    <span className="text-[9px] font-bold uppercase">TOA</span>
                </Link>
            </div>
        </div>
    );
}
