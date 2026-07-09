import { AdvancementResponse, AdvancementPoints, TeamRanking } from "@/types/scouting";
import { Star, AlertCircle, Award, Play } from "lucide-react";

interface AdvancementListProps {
    advancement: AdvancementResponse | null;
    points: AdvancementPoints[];
    rankings: TeamRanking[];
}

export default function AdvancementList({ advancement, points, rankings }: AdvancementListProps) {
    if (!points || points.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-slate-50/50 rounded-2xl border border-dashed border-slate-200">
                <AlertCircle size={48} className="mb-4 opacity-20" />
                <p>No advancement data available yet.</p>
            </div>
        );
    }

    // Merge data: Points are the base for the list as they contain all teams ranked for advancement
    const fullList = points.map(p => {
        const advInfo = advancement?.advancement.find(a => a.team === p.team);
        const rankInfo = rankings.find(r => r.teamNumber === p.team);

        return {
            team: p.team,
            teamName: rankInfo?.teamName || "Unknown Team",
            displayTeam: advInfo?.displayTeam || rankInfo?.displayTeamNumber || String(p.team),
            totalPoints: p.points[0] || 0,
            judgingPoints: p.points[1] || 0,
            playoffPoints: p.points[2] || 0,
            selectionPoints: p.points[3] || 0,
            qualPoints: p.points[4] || 0,
            rp: p.points[5] || 0,
            tbp1: p.points[7] || 0,
            tbp2: p.points[8] || 0,
            slot: advInfo?.slot,
            criteria: advInfo?.criteria,
            status: advInfo?.status,
            declined: advInfo?.declined || false
        };
    }).sort((a, b) => b.totalPoints - a.totalPoints || (a.slot || 999) - (b.slot || 999));

    return (
        <div className="space-y-6">
            {advancement && (
                <div className="bg-primary/5 border border-primary/10 p-4 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <h3 className="text-sm font-bold text-primary uppercase tracking-wider">Advancement Goal</h3>
                        <p className="text-xl font-black text-slate-900">{advancement.advancesTo}</p>
                    </div>
                    <div className="flex gap-4">
                        <div className="text-center bg-white px-4 py-2 rounded-xl border border-primary/10 shadow-sm">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Available Slots</span>
                            <span className="text-lg font-black text-primary">{advancement.slots}</span>
                        </div>
                        <div className="text-center bg-white px-4 py-2 rounded-xl border border-primary/10 shadow-sm">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase">Reserved FCMP</span>
                            <span className="text-lg font-black text-slate-700">{advancement.fcmpReserved}</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-3">
                {fullList.map((item, index) => {
                    const isAdvanced = item.status === "Won";

                    return (
                        <div
                            key={item.team}
                            className={`
                                relative flex flex-col transition-all duration-300 border rounded-2xl overflow-hidden
                                ${isAdvanced && !item.declined
                                    ? "bg-emerald-50 border-emerald-200 ring-1 ring-emerald-100 shadow-md transform scale-[1.01] z-10"
                                    : "bg-white border-slate-200 hover:border-slate-300 shadow-sm"}
                                ${item.declined ? "opacity-60 saturate-50 grayscale-[0.3]" : ""}
                            `}
                        >
                            {/* Left Accent Bar for Advanced Teams */}
                            {isAdvanced && !item.declined && (
                                <div className="absolute top-0 left-0 bottom-0 w-1 bg-emerald-500 z-20" />
                            )}

                            {isAdvanced && !item.declined && (
                                <div className="absolute top-0 right-0 p-2 overflow-hidden w-24 h-24 pointer-events-none z-20">
                                    <div className="absolute top-[-5px] right-[-35px] bg-emerald-600 text-white text-[10px] font-black py-1 w-32 text-center rotate-45 shadow-md uppercase tracking-widest border-b border-emerald-400">
                                        Advanced
                                    </div>
                                </div>
                            )}

                            <div className="p-4 flex flex-col md:flex-row md:items-center gap-4">
                                {/* Team Info */}
                                <div className="flex items-center gap-4 md:w-1/4">
                                    <div className={`
                                        w-12 h-12 rounded-xl flex items-center justify-center font-black text-xl shadow-sm border
                                        ${isAdvanced ? "bg-green-600 text-white border-green-500" : "bg-slate-100 text-slate-400 border-slate-200"}
                                    `}>
                                        {item.slot || index + 1}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-2xl font-black tracking-tighter ${item.declined ? "line-through" : "text-slate-900"}`}>
                                                {item.team}
                                            </span>
                                            {item.declined && (
                                                <span className="text-[10px] font-black bg-red-100 text-red-600 px-1.5 py-0.5 rounded uppercase">Declined</span>
                                            )}
                                        </div>
                                        <span className="text-xs font-bold text-slate-500 truncate uppercase mt-[-2px]">
                                            {item.teamName}
                                        </span>
                                    </div>
                                </div>

                                {/* Points Breakdown */}
                                <div className="flex-1 grid grid-cols-2 md:grid-cols-6 gap-2">
                                    <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                                            <Award size={10} /> Judging
                                        </span>
                                        <span className="font-mono text-sm font-black text-slate-700">{item.judgingPoints}</span>
                                    </div>
                                    <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                                            <Play size={10} /> Playoff
                                        </span>
                                        <span className="font-mono text-sm font-black text-slate-700">{item.playoffPoints}</span>
                                    </div>
                                    <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                                            <Star size={10} /> Alliance
                                        </span>
                                        <span className="font-mono text-sm font-black text-slate-700">{item.selectionPoints}</span>
                                    </div>
                                    <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-100 flex flex-col items-center justify-center">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase mb-1">Quals</span>
                                        <span className="font-mono text-sm font-black text-slate-700">{item.qualPoints}</span>
                                    </div>
                                    <div className="bg-slate-50/80 p-2 rounded-xl border border-slate-100 flex flex-col items-center justify-center group/tbp relative">
                                        <span className="text-[9px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                                            TBP <AlertCircle size={8} />
                                        </span>
                                        <span className="font-mono text-[10px] font-bold text-slate-500">{item.tbp1.toFixed(0)} / {item.tbp2.toFixed(0)}</span>

                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-32 p-2 bg-slate-900 text-[8px] text-white rounded shadow-xl opacity-0 invisible group-hover/tbp:opacity-100 group-hover/tbp:visible transition-all z-20 pointer-events-none">
                                            Tie-Break Points: Used to rank teams with identical total points.
                                        </div>
                                    </div>
                                    <div className={`
                                        p-2 rounded-xl border flex flex-col items-center justify-center min-w-[80px]
                                        ${isAdvanced ? "bg-green-600/10 border-green-200" : "bg-slate-50 border-slate-200"}
                                    `}>
                                        <span className={`text-[9px] font-bold uppercase mb-0.5 ${isAdvanced ? "text-green-700" : "text-slate-500"}`}>Total</span>
                                        <span className={`font-mono text-xl font-black ${isAdvanced ? "text-green-700" : "text-slate-900"}`}>{item.totalPoints}</span>
                                    </div>
                                </div>

                                {/* Criteria/Status */}
                                <div className="md:w-1/5 flex flex-col items-end justify-center">
                                    {item.criteria ? (
                                        <div className="text-right">
                                            <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest mb-1">Qualified Via</span>
                                            <span className={`
                                                px-3 py-1.5 rounded-lg text-xs font-black shadow-sm inline-block
                                                ${isAdvanced ? "bg-green-600 text-white" : "bg-slate-100 text-slate-600 border border-slate-200"}
                                            `}>
                                                {item.criteria}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-[10px] font-bold text-slate-300 uppercase italic">Not Advanced</span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
