import { fetchTeam, fetchTeamRankingsInSeason, fetchTeamAwards } from "@/lib/ftc-api";
import { ExtendedTeamRanking } from "@/types/scouting";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { MapPin, Globe, Award, Calendar, Trophy } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";

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
        <div className="container mx-auto px-4 py-8 max-w-7xl">
            {/* Header / Profile Card */}
            <div className="relative mb-12 group">
                {/* Background Glow */}
                <div className="absolute -inset-1 bg-linear-to-r from-primary/20 via-accent/10 to-secondary/20 rounded-3xl blur-xl opacity-50 transition-opacity group-hover:opacity-70" />

                <div className="relative glass-card rounded-3xl overflow-hidden border-border/50">
                    <div className="h-48 md:h-64 w-full relative overflow-hidden">
                        <div className="absolute inset-0 bg-primary/20 bg-linear-to-br from-primary/30 to-secondary/30" />
                        <div className="absolute inset-0 bg-grid-white/[0.1] bg-[size:30px_30px]" />
                        <div className="absolute inset-0 bg-linear-to-t from-background via-transparent to-transparent" />

                        {/* Abstract shapes */}
                        <div className="absolute top-10 right-10 w-64 h-64 bg-accent/20 rounded-full blur-3xl animate-pulse" />
                        <div className="absolute -bottom-10 -left-10 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
                    </div>

                    <div className="px-6 md:px-12 pb-10 -mt-12 md:-mt-20 flex flex-col md:flex-row gap-8 items-start md:items-end relative z-10">
                        <div className="w-32 h-32 md:w-44 md:h-44 bg-card rounded-3xl border-4 border-background shadow-2xl flex items-center justify-center p-6 relative overflow-hidden group/box">
                            <div className="absolute inset-0 bg-linear-to-br from-primary/5 to-transparent" />
                            <span className="text-3xl md:text-5xl font-black font-display text-primary relative z-10">{team.teamNumber}</span>
                        </div>

                        <div className="flex-1 space-y-3">
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className="text-4xl md:text-6xl font-black font-display tracking-tight text-foreground">{team.nameShort || team.nameFull}</h1>
                                {team.rookieYear && (
                                    <div className="px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-bold uppercase tracking-wider">
                                        Since {team.rookieYear}
                                    </div>
                                )}
                            </div>

                            <div className="flex flex-wrap gap-6 text-sm md:text-base font-medium text-muted-foreground items-center">
                                <span className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-xl border border-border/50">
                                    <MapPin size={18} className="text-primary" /> {team.city}, {team.stateProv}, {team.country}
                                </span>
                                {team.website && (
                                    <a href={team.website} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-secondary hover:text-primary transition-colors bg-muted/50 px-3 py-1.5 rounded-xl border border-border/50">
                                        <Globe size={18} /> Visit Website
                                    </a>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Team Metadata Section */}
                    <div className="px-6 md:px-12 py-8 bg-muted/20 border-t border-border/50">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start">
                            <div className="space-y-1">
                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] block">Full Organization Name</span>
                                <p className="text-foreground font-bold leading-relaxed">{team.nameFull}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] block">Robot Identity</span>
                                <p className="text-foreground font-bold">{team.robotName || "Designation Pending"}</p>
                            </div>
                            <div className="space-y-1">
                                <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em] block">Sponsors & Affiliations</span>
                                <p className="text-muted-foreground text-sm italic leading-relaxed">
                                    {team.nameFull.replace(team.nameShort, "").trim() || "Managed by Local Educational Institution"}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Participation History */}
            <div className="space-y-12">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-2 bg-primary rounded-full" />
                    <h2 className="text-4xl font-black font-display text-foreground tracking-tight">Participation History</h2>
                </div>

                <div className="grid grid-cols-1 gap-12">
                    {activeSeasons.length === 0 ? (
                        <div className="p-20 text-center glass rounded-3xl border-dashed border-2 border-border/50">
                            <Calendar size={48} className="mx-auto text-muted-foreground mb-4 opacity-20" />
                            <p className="text-muted-foreground text-xl font-medium italic">No recent match records found in our database.</p>
                        </div>
                    ) : (
                        activeSeasons.sort((a, b) => b.season - a.season).map((year) => (
                            <div key={year.season} className="space-y-6">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 bg-linear-to-r from-muted/50 to-transparent p-6 rounded-3xl border-l-8 border-secondary">
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-3">
                                            <h3 className="text-4xl font-black text-foreground">
                                                {year.season}
                                            </h3>
                                            <span className="px-4 py-1.5 rounded-full bg-secondary/10 border border-secondary/20 text-secondary text-sm font-black uppercase tracking-widest">
                                                {GAME_NAMES[year.season] || "Official Season"}
                                            </span>
                                        </div>
                                        <p className="text-muted-foreground font-medium flex items-center gap-2">
                                            <Trophy size={16} className="text-accent" />
                                            Analyzing performance across {year.rankings.length} major tournaments
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <div className="text-right hidden md:block">
                                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">Season Peak</span>
                                            <span className="text-2xl font-black text-primary font-display">Rank #{Math.min(...year.rankings.map((r: any) => r.rank))}</span>
                                        </div>
                                        <div className="w-14 h-14 rounded-2xl bg-primary shadow-xl shadow-primary/20 flex items-center justify-center text-white">
                                            <Trophy size={32} />
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {year.rankings.map((rank: ExtendedTeamRanking, idx: number) => (
                                        <div key={idx} className="group relative">
                                            <div className="absolute -inset-0.5 bg-linear-to-br from-border to-transparent rounded-2xl opacity-50 group-hover:opacity-100 transition-opacity" />
                                            <Card className="relative bg-card p-6 flex flex-col gap-6 hover:shadow-2xl transition-all duration-500 overflow-hidden border-border/50 min-h-[300px]">
                                                {/* Decorative Icon */}
                                                <Trophy className="absolute -right-8 -bottom-8 w-40 h-40 text-primary/5 -rotate-12 transition-transform group-hover:scale-110 group-hover:rotate-0" />

                                                <div className="flex justify-between items-start relative z-10">
                                                    <div className="flex-1 space-y-1">
                                                        <span className="text-[10px] font-black text-secondary uppercase tracking-[0.25em] block">
                                                            {rank.eventCode}
                                                        </span>
                                                        <h4 className="text-xl font-black text-foreground leading-tight">{rank.eventName || "Regional Event"}</h4>
                                                    </div>
                                                    <div className="flex flex-col items-end">
                                                        <div className="px-3 py-1.5 rounded-xl bg-accent text-white text-sm font-black shadow-lg shadow-accent/20">
                                                            #{rank.rank}
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 gap-3 relative z-10 flex-1">
                                                    <KPIItem label="Win Rate" value={`${rank.winRate.toFixed(0)}%`} sub={`${rank.wins}-${rank.losses}-${rank.ties}`} />
                                                    <KPIItem label="Max Score" value={rank.highScore.toString()} sub="Season Peak" highlighted />
                                                    <KPIItem label="Avg Net" value={rank.avgNP.toFixed(1)} sub="Performance" />
                                                    <KPIItem label="Auto Avg" value={rank.avgAuto.toFixed(1)} sub="Consistencia" />
                                                </div>

                                                <Link href={`/event/${rank.eventCode}`} className="relative z-10 w-full py-2.5 rounded-xl bg-muted hover:bg-muted/80 text-foreground text-xs font-black text-center transition-colors border border-border/50">
                                                    VIEW EVENT DETAILS
                                                </Link>
                                            </Card>
                                        </div>
                                    ))}
                                </div>

                                {/* Awards Section for this season */}
                                {year.awards.length > 0 && (
                                    <div className="bg-muted/10 rounded-3xl p-8 border border-border/50">
                                        <div className="flex items-center gap-4 mb-8">
                                            <div className="p-3 bg-accent/20 rounded-2xl">
                                                <Award size={24} className="text-accent" />
                                            </div>
                                            <div>
                                                <h4 className="text-xl font-black text-foreground uppercase tracking-widest">Season Honors</h4>
                                                <p className="text-xs text-muted-foreground font-medium italic">Recognizing exceptional engineering, design, and outreach</p>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                            {year.awards.map((award: any, i: number) => {
                                                const aName = award.awardName || (award as any).name || "Official Award";
                                                return (
                                                    <div
                                                        key={i}
                                                        className="flex items-center gap-5 p-6 rounded-2xl bg-card border border-border hover:border-accent/50 hover:shadow-xl transition-all group"
                                                    >
                                                        <div className="w-14 h-14 rounded-2xl bg-accent/10 flex items-center justify-center text-accent group-hover:scale-110 group-hover:bg-accent group-hover:text-white transition-all shadow-accent/5">
                                                            <Trophy size={28} />
                                                        </div>
                                                        <div className="flex-1">
                                                            <span className="text-sm md:text-base font-black text-foreground block mb-0.5 leading-tight uppercase tracking-tight">
                                                                {aName}
                                                            </span>
                                                            <div className="flex items-center gap-2">
                                                                <span className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">{award.eventCode}</span>
                                                                <span className="w-1 h-1 rounded-full bg-border" />
                                                                <span className="text-[10px] text-accent font-black uppercase tracking-widest">Award Winner</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
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
            <div className={clsx("text-lg font-black font-display leading-none mb-1", highlighted ? "text-primary" : "text-foreground")}>
                {value}
            </div>
            <span className="text-[9px] text-gray-600 font-medium italic">{sub}</span>
        </div>
    );
}
