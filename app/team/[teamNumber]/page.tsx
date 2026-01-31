import { fetchTeam, fetchTeamRankingsInSeason, fetchTeamAwards } from "@/lib/ftc-api";
import { ExtendedTeamRanking } from "@/types/ftc";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { MapPin, Globe, Award, Calendar, Trophy } from "lucide-react";
import clsx from "clsx";

const SUPPORTED_SEASONS = [2025, 2024, 2023, 2022];

const GAME_NAMES: Record<number, string> = {
    2025: "Decode",
    2024: "Into The Deep",
    2023: "CenterStage",
    2022: "PowerPlay",
};

interface TeamPageProps {
    params: Promise<{ teamNumber: string }>;
}

export default async function TeamPage(props: TeamPageProps) {
    const params = await props.params;
    const { teamNumber } = params;
    const teamNum = parseInt(teamNumber);

    const cookieStore = await cookies();
    const currentSeason = Number(cookieStore.get("ftc_season")?.value || 2024);

    // Fetch team metadata (try current season first)
    const team = await fetchTeam(currentSeason, teamNum);

    if (!team) {
        return notFound();
    }

    // Fetch history for all supported seasons
    const historyData = await Promise.all(
        SUPPORTED_SEASONS.map(async (s) => ({
            season: s,
            rankings: await fetchTeamRankingsInSeason(s, teamNum),
            awards: await fetchTeamAwards(s, teamNum),
        }))
    );

    const activeSeasons = historyData.filter(d => d.rankings.length > 0);

    return (
        <div className="container mx-auto px-4 py-8">
            {/* Header / Profile Card */}
            <div className="bg-gradient-to-br from-[#0a0a0b] to-[#1a1a1b] border border-white/10 rounded-2xl overflow-hidden shadow-2xl mb-8">
                <div className="bg-primary/10 h-32 w-full relative">
                    <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:20px_20px]" />
                </div>
                <div className="px-8 pb-8 -mt-16 flex flex-col md:flex-row gap-6 items-end md:items-center">
                    <div className="w-32 h-32 bg-[#121212] rounded-2xl border-4 border-[#0a0a0b] shadow-xl flex items-center justify-center p-4">
                        <span className="text-4xl font-bold font-display text-primary">{team.teamNumber}</span>
                    </div>
                    <div className="flex-1 pb-2">
                        <h1 className="text-4xl font-bold font-display text-white mb-1">{team.nameShort || team.nameFull}</h1>
                        <div className="flex flex-wrap gap-4 text-sm text-gray-400 items-center">
                            <span className="flex items-center gap-1">
                                <MapPin size={16} /> {team.city}, {team.stateProv}, {team.country}
                            </span>
                            {team.rookieYear && (
                                <span className="flex items-center gap-1">
                                    <Calendar size={16} /> Debut: {team.rookieYear}
                                </span>
                            )}
                            {team.website && (
                                <a href={team.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                                    <Globe size={16} /> {team.website}
                                </a>
                            )}
                        </div>
                    </div>
                </div>

                {/* Additional Info Section */}
                <div className="px-8 py-6 border-t border-white/5 bg-white/[0.02]">
                    <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-3">Team Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
                        <div>
                            <span className="text-gray-400 block mb-1">Full Name</span>
                            <span className="text-white">{team.nameFull}</span>
                        </div>
                        <div>
                            <span className="text-gray-400 block mb-1">Robot Name</span>
                            <span className="text-white">{team.robotName || "N/A"}</span>
                        </div>
                        <div className="md:col-span-2">
                            <span className="text-gray-400 block mb-1">Sponsors based on Name</span>
                            <span className="text-white opacity-70 italic">
                                {team.nameFull.replace(team.nameShort, "").trim() || "Information not explicitly structured in API"}
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Participation History */}
            <div className="space-y-8">
                <h2 className="text-3xl font-bold font-display text-white border-l-4 border-accent pl-4">Participation History</h2>

                <div className="grid grid-cols-1 gap-6">
                    {activeSeasons.length === 0 ? (
                        <p className="text-gray-500 italic">No recent participation history found in our digital records.</p>
                    ) : (
                        activeSeasons.sort((a, b) => b.season - a.season).map((year) => (
                            <div key={year.season} className="bg-white/[0.02] border border-white/5 rounded-2xl p-6 hover:bg-white/[0.04] transition-all">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                                    <div>
                                        <h3 className="text-2xl font-bold text-white mb-1 group-hover:text-primary transition-colors">
                                            {year.season} - {GAME_NAMES[year.season] || "Season"}
                                        </h3>
                                        <p className="text-sm text-gray-400 flex items-center gap-2">
                                            <Trophy size={14} className="text-secondary" />
                                            Performance across {year.rankings.length} event(s)
                                        </p>
                                    </div>
                                    <div className="inline-flex items-center px-4 py-2 rounded-xl bg-primary/10 border border-primary/20">
                                        <span className="text-lg font-bold text-primary">
                                            Best Rank: #{Math.min(...year.rankings.map(r => r.rank))}
                                        </span>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                    {year.rankings.map((rank: ExtendedTeamRanking, idx: number) => (
                                        <Card key={idx} className="bg-black/40 border-white/5 p-6 flex flex-col gap-4 hover:border-primary/30 transition-all group overflow-hidden relative">
                                            {/* Decorative Background */}
                                            <div className="absolute -right-6 -bottom-6 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
                                                <Trophy size={140} />
                                            </div>

                                            <div className="flex justify-between items-start border-b border-white/5 pb-4">
                                                <div className="flex-1">
                                                    <span className="text-[10px] font-black text-primary uppercase tracking-[0.2em] block mb-1">
                                                        {rank.eventCode}
                                                    </span>
                                                    <h4 className="text-white font-bold leading-tight line-clamp-1">{rank.eventName || "Torneo Regional"}</h4>
                                                </div>
                                                <div className="flex flex-col items-end">
                                                    <span className="px-3 py-1 rounded-lg bg-accent/20 text-accent text-xs font-black shadow-lg shadow-accent/5">
                                                        RANK #{rank.rank}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4 relative z-10">
                                                <KPIItem label="Win Rate" value={`${rank.winRate.toFixed(0)}%`} sub={`${rank.wins}-${rank.losses}-${rank.ties}`} />
                                                <KPIItem label="Avg NP Score" value={rank.avgNP.toFixed(1)} sub="Puntos Netos" />
                                                <KPIItem label="Avg Auto" value={rank.avgAuto.toFixed(1)} sub="Consistencia" />
                                                <KPIItem label="High Score" value={rank.highScore.toString()} sub="Max Puntos" highlighted />
                                            </div>
                                        </Card>
                                    ))}
                                </div>

                                {/* Awards Section for this season */}
                                {year.awards.length > 0 && (
                                    <div className="mt-8 pt-8 border-t border-white/5">
                                        <div className="flex items-center gap-3 mb-6">
                                            <div className="p-2 bg-yellow-500/10 rounded-xl">
                                                <Award size={20} className="text-yellow-500" />
                                            </div>
                                            <div>
                                                <h4 className="text-sm font-black text-white uppercase tracking-widest">Reconocimientos de Temporada</h4>
                                                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tighter">Méritos y Premios Obtenidos</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                            {year.awards.map((award, i) => (
                                                <div
                                                    key={i}
                                                    className="flex items-center gap-4 p-4 rounded-2xl bg-gradient-to-br from-yellow-500/5 to-transparent border border-yellow-500/10 hover:border-yellow-500/30 transition-all hover:bg-yellow-500/[0.08] group"
                                                >
                                                    <div className="w-10 h-10 rounded-full bg-yellow-500/20 flex items-center justify-center text-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.1)] group-hover:scale-110 transition-transform">
                                                        <Trophy size={18} />
                                                    </div>
                                                    <div className="flex-1">
                                                        <span className="text-xs font-black text-white block mb-0.5 leading-tight group-hover:text-yellow-400 transition-colors">{award.awardName}</span>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">{award.eventCode}</span>
                                                            <span className="w-1 h-1 rounded-full bg-yellow-500/30" />
                                                            <span className="text-[9px] text-yellow-500/60 font-bold uppercase tracking-tighter">Ganador</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

function KPIItem({ label, value, sub, highlighted }: { label: string, value: string, sub: string, highlighted?: boolean }) {
    return (
        <div className="bg-white/[0.03] rounded-xl p-3 border border-white/5">
            <span className="block text-[9px] text-gray-500 font-bold uppercase tracking-wider mb-1">{label}</span>
            <div className={clsx("text-lg font-black font-display leading-none mb-1", highlighted ? "text-primary" : "text-white")}>
                {value}
            </div>
            <span className="text-[9px] text-gray-600 font-medium italic">{sub}</span>
        </div>
    );
}
