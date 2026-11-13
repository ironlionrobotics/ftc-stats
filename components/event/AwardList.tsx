import { FTCAward, TeamRanking } from "@/types/scouting";
import { Award, Trophy } from "lucide-react";

interface AwardListProps {
    awards: FTCAward[];
    rankings?: TeamRanking[];
}

export default function AwardList({ awards, rankings }: AwardListProps) {
    if (!awards || awards.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground bg-muted rounded-2xl border border-dashed border-border">
                <Trophy size={48} className="mb-4 opacity-20" />
                <p>No awards data available yet.</p>
            </div>
        );
    }

    // Group awards by name
    const groupedAwards = awards.reduce((acc, award) => {
        const key = award.name || award.awardName || "Award";
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(award);
        return acc;
    }, {} as Record<string, FTCAward[]>);

    // Sort awards by some logic if needed, but usually API returns them in a reasonable order
    // We might want to sort by series (1st, 2nd, 3rd)

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(groupedAwards).map(([awardName, awardList]) => (
                <div key={awardName} className="bg-card rounded-xl border border-border shadow-sm overflow-hidden flex flex-col">
                    <div className="bg-muted px-4 py-3 border-b border-border flex items-center gap-2">
                        <Award className="text-primary" size={18} />
                        <h3 className="font-bold text-foreground text-sm">{awardName}</h3>
                    </div>
                    <div className="p-2 space-y-1">
                        {awardList.sort((a, b) => a.series - b.series).map((award, index) => {
                            const team = rankings?.find(r => r.teamNumber === award.teamNumber);
                            const teamName = team?.teamName || "Unknown Team";

                            return (
                                <div key={`${award.awardId}-${award.teamNumber}-${index}`} className="flex items-center justify-between p-2 hover:bg-muted rounded-lg transition-colors group">
                                    <div className="flex items-center gap-3 w-full">
                                        <div className={`
                                        w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-black border
                                        ${award.series === 1 ? "bg-warning/10 text-warning border-warning/20" :
                                                award.series === 2 ? "bg-muted text-muted-foreground border-border" :
                                                    "bg-primary/10 text-primary border-primary/20"}
                                    `}>
                                            {award.series}
                                        </div>
                                        <div className="flex flex-col min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-foreground leading-none">{award.teamNumber}</span>
                                                <span className="text-[10px] text-muted-foreground font-medium uppercase truncate">
                                                    {award.displayTeamNumber !== String(award.teamNumber) ? award.displayTeamNumber : ""}
                                                </span>
                                            </div>
                                            <span className="text-xs text-muted-foreground font-medium truncate">
                                                {teamName}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
