import { FTCMatch, TeamRanking } from "@/types/ftc";
import clsx from "clsx";

interface MatchListProps {
    matches: FTCMatch[];
    rankings: TeamRanking[];
}

export default function MatchList({ matches, rankings }: MatchListProps) {
    const qualMatches = matches.filter(m => m.tournamentLevel === "QUALIFICATION");
    const otherMatches = matches.filter(m => m.tournamentLevel !== "QUALIFICATION" && m.tournamentLevel !== "PRACTICE");

    // Helper to create a map for quick team name lookup
    const teamNamesMap = new Map(rankings.map(r => [r.teamNumber, r.teamName]));

    return (
        <div className="space-y-8">
            {qualMatches.length > 0 && (
                <section>
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <span className="w-2 h-8 bg-primary rounded-full" />
                        Qualification Matches
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="text-gray-400 border-b border-white/10 text-sm uppercase tracking-wider">
                                    <th className="p-4 font-medium min-w-[150px]">Match</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-red-500/10 text-red-400 rounded-tl-lg border-x border-white/5">Red Alliance</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-blue-500/10 text-blue-400 rounded-tr-lg border-x border-white/5">Blue Alliance</th>
                                    <th className="p-4 font-medium text-center min-w-[120px]">Score</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {qualMatches.map((match) => (
                                    <MatchRow key={match.matchNumber} match={match} teamNamesMap={teamNamesMap} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {otherMatches.length > 0 && (
                <section>
                    <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <span className="w-2 h-8 bg-secondary rounded-full" />
                        Playoffs
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="text-gray-400 border-b border-white/10 text-sm uppercase tracking-wider">
                                    <th className="p-4 font-medium min-w-[150px]">Match</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-red-500/10 text-red-400 rounded-tl-lg border-x border-white/5">Red Alliance</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-blue-500/10 text-blue-400 rounded-tr-lg border-x border-white/5">Blue Alliance</th>
                                    <th className="p-4 font-medium text-center min-w-[120px]">Score</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {otherMatches.map((match) => (
                                    <MatchRow key={match.description} match={match} teamNamesMap={teamNamesMap} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {matches.length === 0 && (
                <div className="text-gray-500 italic text-center py-8">No match data available yet.</div>
            )}
        </div>
    );
}

function MatchRow({ match, teamNamesMap }: { match: FTCMatch, teamNamesMap: Map<number, string> }) {
    const redTeams = match.teams.filter(t => t.station.startsWith('Red')).sort((a, b) => a.station.localeCompare(b.station));
    const blueTeams = match.teams.filter(t => t.station.startsWith('Blue')).sort((a, b) => a.station.localeCompare(b.station));

    const shortenDescription = (desc: string) => {
        return desc
            .replace(/Round\s+/g, 'R')
            .replace(/Match\s+/g, 'M')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const redWin = match.scoreRedFinal > match.scoreBlueFinal;
    const blueWin = match.scoreBlueFinal > match.scoreRedFinal;

    const TeamInfo = ({ team }: { team?: any, isRed: boolean }) => {
        if (!team) return <div className="min-w-[120px]" />;
        const name = teamNamesMap.get(team.teamNumber) || "Team";
        const isRed = team.station.startsWith('Red');
        return (
            <div className="flex flex-col items-center min-w-[120px] px-2" key={team.teamNumber}>
                <span className={clsx("font-mono font-bold text-base", isRed ? "text-red-400" : "text-blue-400")}>
                    {team.teamNumber}
                </span>
                <span className="text-[10px] text-gray-400 uppercase tracking-tighter truncate max-w-[110px]">
                    {name}
                </span>
            </div>
        );
    };

    return (
        <tr className="hover:bg-white/5 transition-colors border-b border-white/5 last:border-0">
            <td className="p-4">
                <div className="font-bold text-white whitespace-nowrap">
                    {shortenDescription(match.description)}
                </div>
            </td>

            {/* Red Alliance Teams (2 columns) */}
            <td className={clsx("p-4 border-l-4", redWin ? "border-red-500 bg-red-500/10" : "border-transparent")}>
                <TeamInfo team={redTeams[0]} isRed={true} />
            </td>
            <td className={clsx("p-4 border-r border-white/5", redWin ? "bg-red-500/10" : "border-transparent")}>
                <TeamInfo team={redTeams[1]} isRed={true} />
            </td>

            {/* Blue Alliance Teams (2 columns) */}
            <td className={clsx("p-4", blueWin ? "bg-blue-500/10" : "border-transparent")}>
                <TeamInfo team={blueTeams[0]} isRed={false} />
            </td>
            <td className={clsx("p-4 border-r-4", blueWin ? "border-blue-500 bg-blue-500/10" : "border-transparent")}>
                <TeamInfo team={blueTeams[1]} isRed={false} />
            </td>

            {/* Score */}
            <td className="p-4 text-center">
                <div className="flex items-center justify-center gap-3 font-display text-lg px-4">
                    <span className={clsx("font-bold", redWin ? "text-red-500" : "text-gray-500")}>
                        {match.scoreRedFinal}
                    </span>
                    <span className="text-gray-600">-</span>
                    <span className={clsx("font-bold", blueWin ? "text-blue-500" : "text-gray-500")}>
                        {match.scoreBlueFinal}
                    </span>
                </div>
            </td>
        </tr>
    )
}
