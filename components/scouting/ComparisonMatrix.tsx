"use client";

import { TeamSeasonStats } from "@/app/actions/pro-scouting";
import { ArrowRight, Trophy, Zap, Target, Flag } from "lucide-react";
import clsx from "clsx";

interface ComparisonMatrixProps {
    heroStats: TeamSeasonStats;
    opponentStats: TeamSeasonStats;
}

type NumericStatKey = "avgOPR" | "maxScore" | "avgAuto" | "avgTele" | "avgEnd" | "consistency";

interface Metric {
    label: string;
    key: NumericStatKey;
    icon: typeof Trophy;
    format: (v: number) => string;
    inverse?: boolean;
}

export default function ComparisonMatrix({ heroStats, opponentStats }: ComparisonMatrixProps) {
    const metrics: Metric[] = [
        { label: "Est. OPR", key: "avgOPR", icon: Trophy, format: (v: number) => v.toFixed(1) },
        { label: "Max Score", key: "maxScore", icon: Zap, format: (v: number) => v.toFixed(0) },
        { label: "Auto Avg", key: "avgAuto", icon: Target, format: (v: number) => v.toFixed(1) },
        { label: "Tele Avg", key: "avgTele", icon: Target, format: (v: number) => v.toFixed(1) },
        { label: "Endgame Avg", key: "avgEnd", icon: Flag, format: (v: number) => v.toFixed(1) },
        { label: "Consistency (σ)", key: "consistency", icon: Target, format: (v: number) => v.toFixed(1), inverse: true },
    ];

    return (
        <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
            <div className="p-4 bg-muted border-b border-border flex justify-between items-center">
                <div className="text-right flex-1">
                    <div className="text-2xl font-black text-foreground">{heroStats.teamNumber}</div>
                    <div className="text-xs font-bold text-muted-foreground uppercase">{heroStats.teamName}</div>
                </div>

                <div className="px-4">
                    <div className="bg-border text-muted-foreground rounded-full p-1.5">
                        <ArrowRight size={16} />
                    </div>
                </div>

                <div className="text-left flex-1">
                    <div className="text-2xl font-black text-foreground">{opponentStats.teamNumber}</div>
                    <div className="text-xs font-bold text-muted-foreground uppercase">{opponentStats.teamName}</div>
                </div>
            </div>

            <div className="divide-y divide-border">
                {metrics.map((m) => {
                    const valA = heroStats[m.key];
                    const valB = opponentStats[m.key];
                    const diff = valA - valB;

                    // Logic for "better": usually higher is better, unless inverse (consistency/sigma)
                    const isBetter = m.inverse ? valA < valB : valA > valB;
                    const isEven = Math.abs(diff) < 0.1;

                    return (
                        <div key={m.key} className="grid grid-cols-3 items-center py-3 px-4 hover:bg-muted transition-colors">
                            <div className={clsx("text-right font-black tabular-nums", isBetter && !isEven ? "text-success" : "text-muted-foreground")}>
                                {m.format(valA)}
                            </div>

                            <div className="flex flex-col items-center justify-center">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase mb-0.5">{m.label}</span>
                                {Math.abs(diff) > 0 && (
                                    <span className={clsx(
                                        "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                                        isEven ? "bg-muted text-muted-foreground" :
                                            (isBetter ? "bg-success/15 text-success" : "bg-danger/15 text-danger")
                                    )}>
                                        {diff > 0 ? "+" : ""}{diff.toFixed(1)}
                                    </span>
                                )}
                            </div>

                            <div className={clsx("text-left font-black tabular-nums", !isBetter && !isEven ? "text-success" : "text-muted-foreground")}>
                                {m.format(valB)}
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="p-3 bg-muted border-t border-border text-center">
                <p className="text-[10px] text-muted-foreground">
                    * Comparison based on full season aggregated data.
                </p>
            </div>
        </div>
    );
}
