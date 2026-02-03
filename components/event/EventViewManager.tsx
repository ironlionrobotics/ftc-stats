"use client";

import { useState } from "react";
import MatchList from "./MatchList";
import RankingTable from "./RankingTable";
import { FTCMatch, TeamRanking } from "@/types/ftc";
import { Trophy, LayoutList } from "lucide-react";
import clsx from "clsx";

interface EventViewManagerProps {
    matches: FTCMatch[];
    rankings: TeamRanking[];
}

export default function EventViewManager({ matches, rankings }: EventViewManagerProps) {
    const [activeTab, setActiveTab] = useState<"matches" | "rankings">("rankings");

    return (
        <div className="space-y-6">
            {/* Tab Switcher */}
            <div className="flex p-1 bg-muted rounded-2xl w-full md:w-fit border border-border mt-2 shadow-inner">
                <button
                    onClick={() => setActiveTab("rankings")}
                    className={clsx(
                        "flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200",
                        activeTab === "rankings"
                            ? "bg-primary text-white shadow-lg"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <Trophy size={18} />
                    Rankings
                </button>
                <button
                    onClick={() => setActiveTab("matches")}
                    className={clsx(
                        "flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all duration-200",
                        activeTab === "matches"
                            ? "bg-secondary text-white shadow-lg"
                            : "text-muted-foreground hover:text-foreground"
                    )}
                >
                    <LayoutList size={18} />
                    Matches
                </button>
            </div>

            {/* Content Section */}
            <div className="animate-in fade-in duration-500">
                {activeTab === "rankings" && (
                    <RankingTable rankings={rankings} matches={matches} />
                )}
                {activeTab === "matches" && (
                    <MatchList matches={matches} rankings={rankings} />
                )}
            </div>
        </div>
    );
}
