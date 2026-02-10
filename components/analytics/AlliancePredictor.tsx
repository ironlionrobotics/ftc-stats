import { useState, useMemo } from "react";
import { Search, Info, X, Zap, Trophy, TrendingUp, TrendingDown, Minus, Bot, User, Check, AlertTriangle, Sparkles, Network } from "lucide-react";
import { Card } from "@/components/ui/Card";
import clsx from "clsx";
import { TeamEvolution } from "@/app/actions/analytics";
import { MatchScouting } from "@/types/ftc";
import TournamentSimulator from "./TournamentSimulator";

interface AlliancePredictorProps {
    teams: TeamEvolution[];
    scoutingData?: MatchScouting[];
    initialTeam?: TeamEvolution | null;
    onTeamSelect?: (team: TeamEvolution | null) => void;
}

interface ScoutedMetrics {
    driverSkill: number;
    reliability: number; // 0-1 based on observation count vs max
    archetype: 'Miner' | 'Architect' | 'Balanced' | 'Unknown';
    endgameSuccess: number; // 0-1
    notes: string[];
}

export default function AlliancePredictor({ teams, scoutingData = [], initialTeam, onTeamSelect }: AlliancePredictorProps) {
    const [unavailableTeams, setUnavailableTeams] = useState<number[]>([]);
    const [unavailableInput, setUnavailableInput] = useState("");
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedTeam, setSelectedTeam] = useState<TeamEvolution | null>(null);
    const [mode, setMode] = useState<"analysis" | "simulator">("analysis");

    // Sync with external selection (e.g. from the table)
    useMemo(() => {
        if (initialTeam) {
            setSelectedTeam(initialTeam);
            setSearchTerm(initialTeam.teamNumber.toString());
        }
    }, [initialTeam]);

    // ... (keep scouting metrics helpers) ...
    // Helper to calculate scouting metrics
    const calculateScoutingMetrics = (teamNumber: number): ScoutedMetrics => {
        const teamMatches = scoutingData.filter(m => m.teamNumber === teamNumber);
        if (!teamMatches.length) return { driverSkill: 0, reliability: 0, archetype: 'Unknown', endgameSuccess: 0, notes: [] };

        const avgSkill = teamMatches.reduce((acc, m) => acc + m.driverSkill, 0) / teamMatches.length;

        // Archetype logic: Miner (Heavy Artifacts) vs Architect (Heavy Patterns)
        const avgArtifacts = teamMatches.reduce((acc, m) => acc + m.teleopPurpleArtifacts + m.teleopGreenArtifacts, 0) / teamMatches.length;
        const avgPatterns = teamMatches.reduce((acc, m) => acc + m.patternsCompleted, 0) / teamMatches.length;

        let archetype: ScoutedMetrics['archetype'] = 'Balanced';
        if (avgArtifacts > avgPatterns * 2) archetype = 'Miner';
        else if (avgPatterns > avgArtifacts * 0.5 && avgPatterns > 0) archetype = 'Architect';

        const endgameSuccess = teamMatches.filter(m => m.endgameBaseParking !== 'None').length / teamMatches.length;

        return {
            driverSkill: avgSkill,
            reliability: Math.min(teamMatches.length / 3, 1), // 3+ matches = full reliability confidence
            archetype,
            endgameSuccess,
            notes: teamMatches.filter(m => m.notes).map(m => m.notes).slice(0, 3)
        };
    };

    const targetStats = useMemo(() => {
        if (!selectedTeam) return null;
        return calculateScoutingMetrics(selectedTeam.teamNumber);
    }, [selectedTeam, scoutingData]);

    const handleUnavailableAdd = () => {
        const teamNum = parseInt(unavailableInput);
        if (!isNaN(teamNum) && !unavailableTeams.includes(teamNum)) {
            setUnavailableTeams([...unavailableTeams, teamNum]);
            setUnavailableInput("");
        }
    };

    const handleSearch = (term: string) => {
        setSearchTerm(term);
        if (term === "") {
            setSelectedTeam(null);
            onTeamSelect?.(null);
        }
    };

    const handleSelectTeam = (team: TeamEvolution) => {
        setSelectedTeam(team);
        setSearchTerm(team.teamNumber.toString());
        onTeamSelect?.(team);
    };

    const filteredTeams = teams.filter(t =>
        t.teamNumber.toString().includes(searchTerm) ||
        t.teamName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const allScoredTeams = useMemo(() => {
        if (!selectedTeam) return [];

        return teams
            .filter(t => t.teamNumber !== selectedTeam.teamNumber && !unavailableTeams.includes(t.teamNumber))
            .map(partner => {
                const scouted = [calculateScoutingMetrics(partner.teamNumber)]; // Use array for extensibility or if we want multiple sources
                // But wait, calculateScoutingMetrics returns a single object.
                const scoutedMetrics = calculateScoutingMetrics(partner.teamNumber);

                let synergyScore = 0;
                let synergyLabel = "Balanced";
                const isRisky = (selectedTeam.netDiscipline || 0) + (partner.netDiscipline || 0) < -5;
                const projectedScore = (selectedTeam.opr || 0) + (partner.opr || 0);

                // --- Improved Synergy Logic ---

                // 1. OPR Power Check
                // If projected score is significantly higher than event average (approx 30 pts for FTC centerstage? No, Into the Deep is higher)
                // Let's use relative power.
                // No hardcoded values if possible, but 100 is decent combined OPR for a good alliance?
                // Actually, let's stick to relative comparison.

                // 2. Auto Compatibility (The Check)
                // If combined Auto OPR is dangerously high (meaning they might conflict for resources)
                // Threshold: In Into The Deep, max auto is around ... let's say 45-50 realistic max per bot? 
                // If combined > 80, they are monsters. If > 50, good. 
                // Collision warning? No, just "High Ceiling".
                const autoSynergy = (selectedTeam.autoOPR || 0) + (partner.autoOPR || 0);
                if (autoSynergy > 30) {
                    synergyScore += 10;
                    synergyLabel = "Auto Dominance";
                }

                // 3. Discipline Factor (The Risk) - UPDATED: Dynamic Penalty
                if (isRisky) {
                    // Instead of fixed -20, we use a scaled penalty relative to the risk.
                    // Risk of -10 discipline -> -8 score. Risk of -30 -> -24 score.
                    // This allows massive OPR (-30 disc but +50 OPR advantage) to still win.
                    const riskMagnitude = Math.abs((selectedTeam.netDiscipline || 0) + (partner.netDiscipline || 0));
                    const dynamicPenalty = Math.min(riskMagnitude * 0.8, 30); // Cap penalty at 30pts max

                    synergyScore -= dynamicPenalty;
                    synergyLabel = "High Foul Risk";
                } else if ((partner.netDiscipline || 0) > 5) {
                    synergyScore += 10;
                    synergyLabel = "Disciplined";
                }

                // 4. Archetype Complement (Still Valid)
                if (targetStats?.archetype === 'Miner' && scoutedMetrics.archetype === 'Architect') {
                    synergyScore += 15;
                    synergyLabel = "Perfect Match";
                } else if (targetStats?.archetype === 'Architect' && scoutedMetrics.archetype === 'Miner') {
                    synergyScore += 15;
                    synergyLabel = "Perfect Match";
                }

                // 5. RP Complementarity (The Money)
                // --- FIX: Inject estimated RPs if 0 but OPR is high ---
                let effMov = partner.rpMovement || 0;
                let effArt = partner.rpArtifacts || 0;
                let effPat = partner.rpPattern || 0;

                // If no data (0) but high OPR, give benefit of doubt (0.7)
                if (effMov === 0 && (partner.autoOPR || 0) > 25) effMov = 0.7;
                if (effArt === 0 && (partner.teleOPR || 0) > 60) effArt = 0.7;
                if (effPat === 0 && projectedScore > 120) effPat = 0.6; // High score usually means some pattern success

                // If I am bad at Patterns (< 0.4) and partner is GOD at Patterns (> 0.8), huge boost
                if ((selectedTeam.rpPattern || 0) < 0.4 && effPat > 0.8) {
                    synergyScore += 25;
                    synergyLabel = "Pattern Specialist";
                }
                // If I am bad at Artifacts (< 0.4) and partner is GOD at volume (> 0.8)
                if ((selectedTeam.rpArtifacts || 0) < 0.4 && effArt > 0.8) {
                    synergyScore += 20;
                    synergyLabel = "Volume Loader";
                }
                // If both are decent at Movement/Auto (> 0.6), we lock that RP down
                if ((selectedTeam.rpMovement || 0) > 0.6 && effMov > 0.6) {
                    synergyScore += 10;
                    // Dont override "Perfect Match" unless it was default
                    if (synergyLabel === "Balanced") synergyLabel = "Auto RP Lock";
                }

                // Weighted Final Score
                // OPR (Performance) 70% (increased from 50%), Scouting/RP 20%, Synergy 10%
                // Raw power matters more in high scoring games.
                const oprFactor = (projectedScore / 100) * 100 * 0.7;
                const rpFactor = (effPat + effArt + effMov) * 33 * 0.15; // Mean RP prob using EFFECTIVE values
                const scoutingFactor = (scoutedMetrics.driverSkill * 20 * 0.15) + rpFactor;

                let finalScore = oprFactor + scoutingFactor + synergyScore;

                return {
                    partner,
                    scouted: scoutedMetrics,
                    synergy: synergyLabel,
                    combinedScore: finalScore,
                    projectedScore,
                    isRisky,
                    autoSynergy,
                    effectiveRP: {
                        movement: effMov,
                        artifacts: effArt,
                        pattern: effPat
                    }
                };
            })
            .sort((a, b) => b.combinedScore - a.combinedScore);
    }, [teams, selectedTeam, unavailableTeams, targetStats, scoutingData]);

    const topRecommendations = (allScoredTeams || []).slice(0, 6);
    const otherTeams = (allScoredTeams || []).slice(6);

    const triggerAI = (partner: TeamEvolution) => {
        if (!selectedTeam) return;
        const partnerStats = calculateScoutingMetrics(partner.teamNumber);

        // ... existing AI prompt code ...
        const prompt = `Analyze alliance: Team ${selectedTeam.teamNumber} & Team ${partner.teamNumber}.
        TARGET: OPR ${(selectedTeam.opr || 0).toFixed(1)}, Auto ${(selectedTeam.autoOPR || 0).toFixed(1)}, Disc ${(selectedTeam.netDiscipline || 0).toFixed(1)}.
        RP PROBS: Mov ${(selectedTeam.rpMovement || 0).toFixed(2)}, Art ${(selectedTeam.rpArtifacts || 0).toFixed(2)}, Pat ${(selectedTeam.rpPattern || 0).toFixed(2)}.
        PARTNER: OPR ${(partner.opr || 0).toFixed(1)}, Auto ${(partner.autoOPR || 0).toFixed(1)}, Disc ${(partner.netDiscipline || 0).toFixed(1)}.
        RP PROBS: Mov ${(partner.rpMovement || 0).toFixed(2)}, Art ${(partner.rpArtifacts || 0).toFixed(2)}, Pat ${(partner.rpPattern || 0).toFixed(2)}.
        Context: Combined OPR ${(selectedTeam.opr || 0) + (partner.opr || 0)}. Match compatibility?`;

        const event = new CustomEvent('open-ai-chat', { detail: { message: prompt } });
        window.dispatchEvent(event);
    };

    const clearSelection = () => {
        setSelectedTeam(null);
        setSearchTerm("");
        setUnavailableTeams([]);
        onTeamSelect?.(null);
    };

    return (
        <Card className="p-8 bg-white border border-slate-200 shadow-sm relative overflow-visible rounded-3xl">
            <div className="relative z-10">
                <div className="flex flex-col md:flex-row md:items-start justify-between mb-8 gap-4 border-b border-slate-100 pb-8">
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                            <Sparkles className="text-blue-600 w-6 h-6" />
                            Alliance Oracle
                        </h2>
                        <p className="text-slate-500 mt-2 text-sm max-w-xl leading-relaxed">
                            Select a target team to identify statistically optimal partners.
                            Now integrated with <span className="text-purple-600 font-bold">OPR Analytics</span> for precise scoring predictions.
                        </p>
                    </div>
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setMode("analysis")}
                            className={clsx(
                                "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all",
                                mode === "analysis" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
                            )}
                        >
                            <User size={16} /> Partner Finder
                        </button>
                        <button
                            onClick={() => setMode("simulator")}
                            className={clsx(
                                "px-4 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all",
                                mode === "simulator" ? "bg-white text-purple-600 shadow-sm" : "text-slate-500 hover:text-slate-900"
                            )}
                        >
                            <Network size={16} /> Tournament
                        </button>
                    </div>
                </div>

                {mode === "simulator" ? (
                    <TournamentSimulator teams={teams} />
                ) : (
                    <>
                        {/* Selection Area (Same as before) */}
                        <div className="mb-8 p-6 bg-slate-50/50 border border-slate-100 rounded-2xl">

                            <div className="flex flex-col lg:flex-row items-center gap-6">
                                {/* Team Selector / Search */}
                                <div className="w-full lg:w-1/3">
                                    {!selectedTeam ? (
                                        <div className="relative group w-full">
                                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 w-5 h-5 group-focus-within:text-blue-600 transition-colors" />
                                            <input
                                                type="text"
                                                placeholder="Select Target Team..."
                                                className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-slate-900 placeholder:text-slate-400 font-bold transition-all shadow-sm"
                                                value={searchTerm}
                                                onChange={(e) => handleSearch(e.target.value)}
                                            />
                                            {searchTerm && filteredTeams.length > 0 && (
                                                <div className="absolute top-full left-0 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-[250px] overflow-y-auto">
                                                    {filteredTeams.map(t => (
                                                        <button key={t.teamNumber} onClick={() => handleSelectTeam(t)} className="w-full p-3 text-left hover:bg-slate-50 flex justify-between items-center border-b border-slate-100 last:border-0 transition-all">
                                                            <span className="font-bold text-slate-900">{t.teamNumber} <span className="text-slate-400 font-normal ml-2">{t.teamName}</span></span>
                                                            <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-2 py-1 rounded">SELECT</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-4 bg-white p-3 rounded-xl border border-orange-100 shadow-sm w-full">
                                            <div className="bg-orange-600 text-white w-12 h-12 rounded-lg flex flex-col items-center justify-center shadow-lg shadow-orange-200">
                                                <span className="text-[7px] font-black uppercase tracking-tighter text-white/90">Rank</span>
                                                <span className="text-xl font-black leading-none text-white">{selectedTeam.events[0]?.rank || "-"}</span>
                                            </div>
                                            <div className="flex-1">
                                                <div className="text-xl font-black text-slate-900">{selectedTeam.teamNumber}</div>
                                                <div className="text-[11px] font-bold text-slate-500 uppercase tracking-tight">{selectedTeam.teamName}</div>
                                            </div>
                                            <button onClick={clearSelection} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><X size={18} /></button>
                                        </div>
                                    )}
                                </div>

                                {/* Quick Metrics Bar (Updated) */}
                                {selectedTeam && (
                                    <div className="flex-1 flex flex-wrap items-center gap-4 w-full">
                                        <div className="flex-1 min-w-[100px] bg-white p-3 rounded-xl border border-slate-100">
                                            <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">OPR (Est)</div>
                                            <div className="text-lg font-black text-blue-600">{(selectedTeam.opr || 0).toFixed(1)}</div>
                                        </div>
                                        <div className="flex-1 min-w-[100px] bg-white p-3 rounded-xl border border-slate-100">
                                            <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">Auto OPR</div>
                                            <div className="text-lg font-black text-slate-900">{(selectedTeam.autoOPR || 0).toFixed(1)}</div>
                                        </div>
                                        <div className="flex-1 min-w-[100px] bg-white p-3 rounded-xl border border-slate-100">
                                            <div className="text-[8px] font-bold text-slate-400 uppercase mb-1">Discipline</div>
                                            <div className={clsx("text-lg font-black", (selectedTeam.netDiscipline || 0) >= 0 ? "text-green-500" : "text-red-500")}>
                                                {(selectedTeam.netDiscipline || 0) > 0 ? "+" : ""}{(selectedTeam.netDiscipline || 0).toFixed(1)}
                                            </div>
                                        </div>

                                        <div className="flex gap-2 bg-white p-2 rounded-xl border border-slate-100">
                                            <input
                                                type="number"
                                                placeholder="Exclude #"
                                                className="w-20 px-2 py-1 text-xs font-bold bg-slate-50 rounded focus:outline-none"
                                                value={unavailableInput}
                                                onChange={(e) => setUnavailableInput(e.target.value)}
                                                onKeyDown={(e) => e.key === 'Enter' && handleUnavailableAdd()}
                                            />
                                            <button onClick={handleUnavailableAdd} className="px-2 py-1 bg-slate-100 hover:bg-red-50 hover:text-red-600 rounded text-[8px] font-black uppercase transition-all">Block</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Excluded Pills */}
                            {unavailableTeams.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-100/50">
                                    {unavailableTeams.map(t => (
                                        <button key={t} onClick={() => setUnavailableTeams(unavailableTeams.filter(u => u !== t))} className="group flex items-center gap-1.5 px-2 py-1 bg-red-50 hover:bg-red-100 border border-red-100 rounded-lg text-[10px] font-bold text-red-500 transition-all">
                                            <X size={10} className="group-hover:scale-110" /> {t}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Recommendations Grid */}
                        <div className="space-y-6">
                            {selectedTeam && (
                                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8">
                                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                        {topRecommendations.map((rec, idx) => {
                                            const lastEvent = rec.partner.events[rec.partner.events.length - 1];
                                            return (
                                                <div
                                                    key={rec.partner.teamNumber}
                                                    className="bg-white border border-slate-200 hover:border-blue-400 hover:shadow-md rounded-2xl p-4 transition-all group relative flex flex-col justify-between min-h-[260px]"
                                                >
                                                    <div className="absolute top-4 right-4 text-5xl font-black text-slate-100 pointer-events-none transition-colors">
                                                        #{idx + 1}
                                                    </div>

                                                    {/* Explicit Rank Badge (Top Left Corner Option) */}
                                                    {/* <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-black text-sm shadow-lg shadow-blue-200 z-20">
                                                {idx + 1}
                                            </div> */}

                                                    <div>
                                                        <div className="flex justify-between items-start mb-2 relative z-10">
                                                            <div className="flex items-center gap-3">
                                                                <div className="bg-secondary text-white w-10 h-10 rounded-lg flex flex-col items-center justify-center shadow-md shadow-orange-100 group-hover:bg-orange-500 transition-colors">
                                                                    <span className="text-[6px] font-black uppercase tracking-tighter text-white/90">Rank</span>
                                                                    <span className="text-sm font-black leading-none text-white">{lastEvent?.rank || "-"}</span>
                                                                </div>
                                                                <div>
                                                                    <div className="text-xl font-black text-slate-900 group-hover:text-blue-600 transition-colors leading-none mb-1">
                                                                        {rec.partner.teamNumber}
                                                                    </div>
                                                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-tight leading-tight">
                                                                        {rec.partner.teamName}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Stats Badges */}
                                                        <div className="flex flex-wrap gap-1.5 mt-2 relative z-10">
                                                            <span className={clsx(
                                                                "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide border",
                                                                rec.isRisky ? "bg-red-50 text-red-600 border-red-100" :
                                                                    rec.synergy === "Auto Dominance" ? "bg-purple-50 text-purple-600 border-purple-100" :
                                                                        "bg-blue-50 text-blue-600 border-blue-100"
                                                            )}>
                                                                {rec.synergy}
                                                            </span>
                                                            {rec.scouted.driverSkill >= 4 && (
                                                                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wide bg-amber-50 text-amber-600 border border-amber-100 flex items-center gap-1">
                                                                    <Trophy size={10} /> Top Driver
                                                                </span>
                                                            )}
                                                        </div>

                                                        {/* NEW: OPR Breakdown */}
                                                        <div className="grid grid-cols-4 gap-1 mt-5 p-2 bg-slate-50/50 rounded-xl border border-slate-100 relative z-10 overflow-hidden">
                                                            <div className="col-span-4 text-center pb-2 border-b border-slate-200 mb-2">
                                                                <div className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Projected Alliance Score</div>
                                                                <div className="text-2xl font-black text-blue-600 font-mono">{rec.projectedScore.toFixed(0)}</div>
                                                            </div>

                                                            <div className="text-center px-1">
                                                                <div className="text-[7px] font-bold text-slate-400 uppercase leading-tight">OPR</div>
                                                                <div className="text-xs font-black text-slate-900">{(rec.partner.opr || 0).toFixed(0)}</div>
                                                            </div>
                                                            <div className="text-center px-1 border-l border-slate-200">
                                                                <div className="text-[7px] font-bold text-slate-400 uppercase leading-tight">Auto</div>
                                                                <div className="text-xs font-black text-slate-900">{(rec.partner.autoOPR || 0).toFixed(0)}</div>
                                                            </div>
                                                            <div className="text-center px-1 border-l border-slate-200">
                                                                <div className="text-[7px] font-bold text-slate-400 uppercase leading-tight">Tele</div>
                                                                <div className="text-xs font-black text-slate-900">{(rec.partner.teleOPR || 0).toFixed(0)}</div>
                                                            </div>
                                                            <div className="text-center px-1 border-l border-slate-200">
                                                                <div className="text-[7px] font-bold text-slate-400 uppercase leading-tight">Disc</div>
                                                                <div className={clsx("text-xs font-black", (rec.partner.netDiscipline || 0) < 0 ? "text-red-500" : "text-green-500")}>{(rec.partner.netDiscipline || 0).toFixed(0)}</div>
                                                            </div>
                                                        </div>

                                                        {/* RP Probability Breakdown (FIXED: Use effective RPs) */}
                                                        <div className="mt-3 flex gap-2">
                                                            <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                                                                <div className="text-[6px] font-bold text-slate-400 uppercase tracking-wider mb-1">MOV RP</div>
                                                                <div className={clsx("text-xs font-black", (rec.effectiveRP.movement || 0) > 0.7 ? "text-green-600" : "text-slate-700")}>
                                                                    {Math.round((rec.effectiveRP.movement || 0) * 100)}%
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                                                                <div className="text-[6px] font-bold text-slate-400 uppercase tracking-wider mb-1">ART RP</div>
                                                                <div className={clsx("text-xs font-black", (rec.effectiveRP.artifacts || 0) > 0.7 ? "text-purple-600" : "text-slate-700")}>
                                                                    {Math.round((rec.effectiveRP.artifacts || 0) * 100)}%
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 bg-slate-50 border border-slate-100 rounded-lg p-2 text-center">
                                                                <div className="text-[6px] font-bold text-slate-400 uppercase tracking-wider mb-1">PAT RP</div>
                                                                <div className={clsx("text-xs font-black", (rec.effectiveRP.pattern || 0) > 0.7 ? "text-blue-600" : "text-slate-700")}>
                                                                    {Math.round((rec.effectiveRP.pattern || 0) * 100)}%
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-3 mt-5 pt-4 border-t border-slate-50 relative z-10">
                                                        <button
                                                            onClick={() => setUnavailableTeams([...unavailableTeams, rec.partner.teamNumber])}
                                                            className="py-2.5 bg-slate-50 border border-slate-100 text-slate-500 hover:text-red-500 hover:bg-red-50 rounded-xl text-xs font-bold uppercase transition-all"
                                                        >
                                                            Exclude
                                                        </button>
                                                        <button
                                                            onClick={() => triggerAI(rec.partner)}
                                                            className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white border border-transparent rounded-xl text-xs font-bold uppercase transition-all shadow-md shadow-blue-200 flex items-center justify-center gap-2 active:scale-95"
                                                        >
                                                            <Bot size={16} /> AI Analysis
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Remaining Teams List (Simplified) */}
                                    {otherTeams.length > 0 && (
                                        <div className="mt-12 bg-slate-50/50 rounded-3xl border border-slate-100 p-8">
                                            <div className="flex items-center justify-between mb-6">
                                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                                                    <Search size={20} className="text-slate-400" />
                                                    Remaining Pool
                                                </h3>
                                                <span className="text-xs font-bold text-slate-500 bg-white px-3 py-1 rounded-full border border-slate-200 shadow-sm">
                                                    {otherTeams.length} Teams Available
                                                </span>
                                            </div>
                                            <div className="space-y-2">
                                                {otherTeams.map(rec => {
                                                    const lastEvent = rec.partner.events[rec.partner.events.length - 1]; // Get rank for list items
                                                    return (
                                                        <button
                                                            key={rec.partner.teamNumber}
                                                            onClick={() => triggerAI(rec.partner)} // Or open detail
                                                            className="w-full bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between hover:border-blue-200 hover:shadow-sm transition-all group text-left"
                                                        >
                                                            <div className="flex items-center gap-4">
                                                                <div className="w-16 flex items-center gap-2">
                                                                    {/* Rank Badge in List */}
                                                                    <div className="bg-slate-100 text-slate-600 w-6 h-6 rounded flex items-center justify-center text-[10px] font-black group-hover:bg-blue-100 group-hover:text-blue-600 transition-colors">
                                                                        {lastEvent?.rank || "-"}
                                                                    </div>
                                                                    <div className="font-black text-slate-900 text-lg group-hover:text-blue-600 transition-colors">
                                                                        {rec.partner.teamNumber}
                                                                    </div>
                                                                </div>
                                                                <div className="flex-1">
                                                                    <div className="text-xs font-bold text-slate-700 uppercase mb-0.5">{rec.partner.teamName}</div>
                                                                    <div className="flex gap-4 text-[10px] font-mono text-slate-400">
                                                                        <span>OPR: <b className="text-slate-600">{(rec.partner.opr || 0).toFixed(0)}</b></span>
                                                                        <span className={(rec.partner.netDiscipline || 0) < 0 ? "text-red-500 font-bold" : "text-green-500 font-bold"}>
                                                                            {(rec.partner.netDiscipline || 0) > 0 ? "+" : ""}{(rec.partner.netDiscipline || 0).toFixed(0)} Disc
                                                                        </span>
                                                                        {/* Mini RP Indicators for List */}
                                                                        <div className="flex gap-1 ml-2">
                                                                            {(rec.effectiveRP.movement || 0) > 0.6 && <span className="text-[9px] font-black text-green-600 bg-green-50 px-1 rounded">MOV</span>}
                                                                            {(rec.effectiveRP.artifacts || 0) > 0.6 && <span className="text-[9px] font-black text-purple-600 bg-purple-50 px-1 rounded">ART</span>}
                                                                            {(rec.effectiveRP.pattern || 0) > 0.6 && <span className="text-[9px] font-black text-blue-600 bg-blue-50 px-1 rounded">PAT</span>}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                            <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity">
                                                                Analyze
                                                            </div>
                                                        </button>
                                                    )
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </Card>
    );
}
