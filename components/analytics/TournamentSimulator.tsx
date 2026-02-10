import { useState, useEffect } from "react";
import { TeamEvolution } from "@/app/actions/analytics";
import { Alliance, PlayoffMatch } from "@/types/oracle";
import { generateAlliances, initializeBracket, updateBracket, runMonteCarloSimulation, SimulationResult } from "@/lib/alliance-utils";
import { Play, RotateCcw, Trophy, Shield, Swords, Users, Crown, Edit2, Check, Save, FolderOpen, PieChart } from "lucide-react";
import clsx from "clsx";

interface TournamentSimulatorProps {
    teams: TeamEvolution[];
}

export default function TournamentSimulator({ teams }: TournamentSimulatorProps) {
    const [step, setStep] = useState<'config' | 'building' | 'bracket'>('config');
    const [allianceCount, setAllianceCount] = useState<4 | 6 | 8>(4);
    const [alliances, setAlliances] = useState<Alliance[]>([]);
    const [bracket, setBracket] = useState<PlayoffMatch[]>([]);
    const [overrides, setOverrides] = useState<Record<string, number>>({});
    const [simResults, setSimResults] = useState<SimulationResult[] | null>(null);
    const [scenarios, setScenarios] = useState<{ name: string, date: string, allianceCount: 4 | 6 | 8, alliances: Alliance[], overrides: Record<string, number> }[]>([]);

    // Load scenarios on mount
    useEffect(() => {
        const saved = localStorage.getItem('tournament_scenarios');
        if (saved) {
            try {
                setScenarios(JSON.parse(saved));
            } catch (e) {
                console.error("Failed to parse scenarios", e);
            }
        }
    }, []);

    const handleRunMonteCarlo = () => {
        const results = runMonteCarloSimulation(alliances, allianceCount);
        setSimResults(results);
    };

    const handleSaveScenario = () => {
        const name = prompt("Enter scenario name (e.g., 'Upset in Semis'):");
        if (!name) return;

        const newScenario = {
            name,
            date: new Date().toISOString(),
            allianceCount,
            alliances,
            overrides
        };
        const updated = [...scenarios, newScenario];
        setScenarios(updated);
        localStorage.setItem('tournament_scenarios', JSON.stringify(updated));
    };

    const handleLoadScenario = (s: typeof scenarios[0]) => {
        if (confirm(`Load scenario "${s.name}"? Unsaved changes will be lost.`)) {
            setAllianceCount(s.allianceCount);
            setAlliances(s.alliances);
            setOverrides(s.overrides);
            setStep('bracket');
            setSimResults(null);
        }
    };

    const handleDeleteScenario = (index: number) => {
        if (confirm("Delete this scenario?")) {
            const updated = scenarios.filter((_, i) => i !== index);
            setScenarios(updated);
            localStorage.setItem('tournament_scenarios', JSON.stringify(updated));
        }
    };

    // Effect to keep bracket updated whenever alliances or overrides change.
    // This ensures propagation is always calculated from a fresh state.
    useEffect(() => {
        if (alliances.length === 0) return;

        // 1. Start with fresh bracket structure (clears previous derived data)
        const matches = initializeBracket(allianceCount);

        // 2. Apply Match Overrides
        matches.forEach(m => {
            if (overrides[m.id]) {
                m.overriddenWinnerId = overrides[m.id];
            }
        });

        // 3. Propagate & Calculate Probabilities
        const updated = updateBracket(matches, alliances);
        setBracket(updated);
    }, [alliances, overrides, allianceCount]);

    // Available teams for selection (filtered by usage)
    const getAvailableTeams = (currentAllianceId: number, isCaptain: boolean) => {
        const usedTeamNumbers = new Set<number>();
        alliances.forEach(a => {
            if (a.id === currentAllianceId) return;
            if (a.captain) usedTeamNumbers.add(a.captain.teamNumber);
            if (a.pick1) usedTeamNumbers.add(a.pick1.teamNumber);
        });

        const current = alliances.find(a => a.id === currentAllianceId);
        if (current) {
            if (isCaptain && current.pick1) usedTeamNumbers.add(current.pick1.teamNumber);
            if (!isCaptain && current.captain) usedTeamNumbers.add(current.captain.teamNumber);
        }

        return teams
            .filter(t => !usedTeamNumbers.has(t.teamNumber))
            .sort((a, b) => (a.events[0]?.rank || 99) - (b.events[0]?.rank || 99));
    };

    const handleAutoGenerate = () => {
        setOverrides({}); // Reset overrides on new generation
        const newAlliances = generateAlliances(teams, allianceCount);
        setAlliances(newAlliances);
        setStep('building');
    };

    const handleManualStart = () => {
        setOverrides({});
        // Initialize empty alliances
        const empty: Alliance[] = Array.from({ length: allianceCount }, (_, i) => ({
            id: i + 1,
            captain: null as any,
            pick1: null as any,
            pick2: null,
            totalOPR: 0,
            totalAuto: 0,
            totalTele: 0,
            totalEndgame: 0,
            projectedScore: 0
        }));
        setAlliances(empty);
        setStep('building');
    };

    const updateAllianceMember = (allianceId: number, memberType: 'captain' | 'pick1', teamNumber: string) => {
        const team = teams.find(t => t.teamNumber === parseInt(teamNumber));
        if (!team) return;

        const newAlliances = alliances.map(a => {
            if (a.id !== allianceId) return a;

            const updated = { ...a, [memberType]: team };
            // Recalculate stats
            const members = [updated.captain, updated.pick1].filter(Boolean);
            const totalOPR = members.reduce((sum, t) => sum + (t.opr || 0), 0);

            return {
                ...updated,
                totalOPR,
                projectedScore: totalOPR
            };
        });
        setAlliances(newAlliances);
    };

    const handleSimulate = () => {
        // Validate
        if (alliances.some(a => !a.captain || !a.pick1)) {
            alert("Please complete all alliance selections.");
            return;
        }
        // Bracket is updated by useEffect
        setStep('bracket');
    };

    const handleReset = () => {
        setAlliances([]);
        setBracket([]);
        setOverrides({});
        setStep('config');
    };

    // Override Winner - Updates override state, triggering useEffect
    const handleMatchClick = (matchId: string, allianceId: number) => {
        setOverrides(prev => {
            const next = { ...prev };
            if (next[matchId] === allianceId) {
                delete next[matchId];
            } else {
                next[matchId] = allianceId;
            }
            return next;
        });
    };

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Step 1: Configuration */}
            {step === 'config' && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-6 text-center">
                    <div>
                        <h3 className="text-xl font-bold text-slate-900">Tournament Configuration</h3>
                        <p className="text-slate-500 text-sm">Select the number of alliances for the playoff tournament.</p>
                    </div>

                    <div className="flex gap-4">
                        {[4, 6, 8].map((count) => (
                            <button
                                key={count}
                                onClick={() => setAllianceCount(count as 4 | 6 | 8)}
                                className={clsx(
                                    "w-16 h-16 rounded-2xl font-black text-2xl flex items-center justify-center transition-all border-2",
                                    allianceCount === count
                                        ? "bg-white border-blue-600 text-blue-600 shadow-lg shadow-blue-100 scale-110"
                                        : "bg-white border-slate-200 text-slate-400 hover:border-slate-300"
                                )}
                            >
                                {count}
                            </button>
                        ))}
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={handleAutoGenerate}
                            className="flex items-center gap-2 px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-lg shadow-xl shadow-blue-200 transition-all active:scale-95"
                        >
                            <Play size={20} fill="currentColor" /> Auto Generate
                        </button>
                        <button
                            onClick={handleManualStart}
                            className="flex items-center gap-2 px-8 py-4 bg-white border-2 border-slate-200 hover:border-slate-300 text-slate-600 rounded-xl font-bold text-lg transition-all active:scale-95"
                        >
                            <Edit2 size={20} /> Manual Build
                        </button>
                    </div>
                </div>
            )}

            {/* Step 2: Building Alliances */}
            {step === 'building' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center">
                        <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                            <Shield className="text-blue-600" /> Build Alliances
                        </h3>
                        <div className="flex gap-3">
                            <button
                                onClick={handleReset}
                                className="px-4 py-2 text-slate-400 hover:text-slate-600 font-bold text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSimulate}
                                className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-lg shadow-purple-200 transition-all flex items-center gap-2"
                            >
                                <Play size={16} fill="currentColor" /> Run Simulation
                            </button>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {alliances.map((alliance) => {
                            const captainOptions = getAvailableTeams(alliance.id, true);
                            const pick1Options = getAvailableTeams(alliance.id, false);

                            return (
                                <div key={alliance.id} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm relative">
                                    <div className="absolute top-0 left-0 bg-slate-100 text-slate-500 text-[10px] font-black px-2 py-1 rounded-br-lg">
                                        ALLIANCE {alliance.id}
                                    </div>
                                    <div className="mt-6 space-y-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Captain</label>
                                            <select
                                                className="w-full text-sm font-bold border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                value={alliance.captain?.teamNumber || ""}
                                                onChange={(e) => updateAllianceMember(alliance.id, 'captain', e.target.value)}
                                            >
                                                <option value="">Select...</option>
                                                {alliance.captain && <option value={alliance.captain.teamNumber}>{alliance.captain.teamNumber} - {alliance.captain.teamName}</option>}
                                                {captainOptions.map(t => (
                                                    <option key={t.teamNumber} value={t.teamNumber}>
                                                        {t.events[0]?.rank}. {t.teamNumber} - {t.teamName}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase block mb-1">Partner</label>
                                            <select
                                                className="w-full text-sm font-bold border border-slate-200 rounded-lg p-2 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                value={alliance.pick1?.teamNumber || ""}
                                                onChange={(e) => updateAllianceMember(alliance.id, 'pick1', e.target.value)}
                                            >
                                                <option value="">Select...</option>
                                                {alliance.pick1 && <option value={alliance.pick1.teamNumber}>{alliance.pick1.teamNumber} - {alliance.pick1.teamName}</option>}
                                                {pick1Options.map(t => (
                                                    <option key={t.teamNumber} value={t.teamNumber}>
                                                        {t.events[0]?.rank}. {t.teamNumber} - {t.teamName} (OPR: {t.opr?.toFixed(0)})
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Est. OPR</span>
                                        <span className="font-mono font-black text-slate-900">{alliance.totalOPR?.toFixed(0) || 0}</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Step 3: Bracket Visualization */}
            {step === 'bracket' && (
                <div className="space-y-6">
                    {/* Toolbar */}
                    <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative z-20">
                        <div className="flex gap-2">
                            <button onClick={handleSaveScenario} className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors">
                                <Save size={14} /> Save Scenario
                            </button>
                            <div className="relative group">
                                <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors">
                                    <FolderOpen size={14} /> Load Scenario ({scenarios.length})
                                </button>
                                <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-2 hidden group-hover:block z-50">
                                    {scenarios.length === 0 && <div className="text-xs text-slate-400 p-2">No saved scenarios</div>}
                                    {scenarios.map((s, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 hover:bg-slate-50 rounded-lg group/item cursor-pointer">
                                            <div onClick={() => handleLoadScenario(s)} className="flex-1">
                                                <div className="font-bold text-slate-700 text-xs truncate max-w-[150px]">{s.name}</div>
                                                <div className="text-[10px] text-slate-400">{new Date(s.date).toLocaleDateString()}</div>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteScenario(i) }} className="text-slate-300 hover:text-red-500 p-1"><RotateCcw size={12} className="rotate-45" /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button onClick={() => setStep('building')} className="text-xs font-bold text-blue-600 hover:underline flex items-center gap-1">
                            <Edit2 size={12} /> Edit Alliances
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        {/* Left Sidebar: Alliances & Analytics */}
                        <div className="lg:col-span-1 space-y-6">
                            {/* Monte Carlo Card */}
                            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-xl p-4 text-white shadow-lg">
                                <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                                    <PieChart size={16} className="text-purple-400" /> Win Probability
                                </h3>
                                {!simResults ? (
                                    <div className="text-center py-4">
                                        <p className="text-xs text-slate-400 mb-4">Run 2,000 simulations with performance variance to see realistic championship odds.</p>
                                        <button
                                            onClick={handleRunMonteCarlo}
                                            className="w-full py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs font-bold transition-colors shadow-lg shadow-purple-900/50"
                                        >
                                            Run Monte Carlo
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {simResults.slice(0, 5).map(res => (
                                            <div key={res.allianceId} className="relative">
                                                <div className="flex justify-between text-xs font-bold mb-1">
                                                    <span className="text-slate-200">Alliance {res.allianceId}</span>
                                                    <span className="text-purple-300">{(res.championProbability * 100).toFixed(1)}%</span>
                                                </div>
                                                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                    <div className="h-full bg-purple-500 rounded-full" style={{ width: `${res.championProbability * 100}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                        <button
                                            onClick={handleRunMonteCarlo}
                                            className="w-full mt-2 py-1.5 bg-slate-700 hover:bg-slate-600 rounded-lg text-[10px] font-bold text-slate-300 transition-colors"
                                        >
                                            Rerun Simulation
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Alliances List */}
                            <div className="space-y-2">
                                {alliances.map((alliance) => (
                                    <div key={alliance.id} className="bg-white border border-slate-200 rounded-xl p-3 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                                        <div className="bg-slate-100 text-slate-500 absolute top-0 left-0 w-8 h-8 flex items-center justify-center font-black text-xs rounded-br-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                            #{alliance.id}
                                        </div>
                                        <div className="ml-10 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0"></div>
                                                <span className="font-black text-slate-900 text-lg">{alliance.captain.teamNumber}</span>
                                                <span className="text-xs text-slate-400 font-bold uppercase">{alliance.captain.teamName}</span>
                                            </div>
                                            {alliance.pick1 && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                                                    <span className="font-bold text-slate-700">{alliance.pick1.teamNumber}</span>
                                                    <span className="text-xs text-slate-400 font-medium uppercase">{alliance.pick1.teamName}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-3 pt-2 border-t border-slate-100 flex justify-between items-center overflow-hidden">
                                            <div className="text-[10px] font-bold text-slate-400 uppercase">Est. Score</div>
                                            <div className="font-mono font-black text-slate-900">{alliance.totalOPR.toFixed(0)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Bracket Visual */}
                        <div className="lg:col-span-3 overflow-x-auto pb-8">
                            <div className="flex justify-between items-center bg-slate-50 p-4 rounded-xl border border-slate-200 mb-6">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm font-bold text-slate-500">
                                        Click on a match team to manually override the winner.
                                    </span>
                                </div>
                                <button
                                    onClick={handleReset}
                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-bold text-sm transition-all"
                                >
                                    <RotateCcw size={16} /> Reset
                                </button>
                            </div>
                            <BracketVisual
                                bracket={bracket}
                                alliances={alliances}
                                onMatchClick={handleMatchClick}
                                type={allianceCount}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Bracket Visualization Sub-Components ---

const NODE_WIDTH = 220;
const NODE_HEIGHT = 80;
const GAP_X = 60;
const GAP_Y = 40;

// Coordinates are in "Grid Units" (Col, Row)
// We map them to pixels: x = col * (NODE_WIDTH + GAP_X), y = row * (NODE_HEIGHT + GAP_Y)
const MATCH_LAYOUTS: Record<number, Record<string, { col: number, row: number }>> = {
    4: {
        'M1': { col: 0, row: 0 },
        'M2': { col: 0, row: 2 },
        'M3': { col: 1, row: 1 },
        'M4': { col: 1, row: 3 }, // Lower Bracket Start
        'M5': { col: 2, row: 2 },
        'M6': { col: 3, row: 1.5 }, // Grand Final
    },
    6: {
        'M1': { col: 0, row: 1 },
        'M2': { col: 0, row: 3 },
        'M3': { col: 1, row: 0 }, // Waiting for Winner M1
        'M4': { col: 1, row: 4 }, // Waiting for Winner M2
        'M5': { col: 1, row: 2 }, // Lower
        'M6': { col: 1, row: 3 }, // Lower
        'M7': { col: 2, row: 2 }, // Upper Final
        'M8': { col: 2, row: 3 }, // Lower Round 3
        'M9': { col: 3, row: 2.5 }, // Lower Final
        'M10': { col: 4, row: 2.25 }, // Grand Final
    },
    8: {
        'M1': { col: 0, row: 0 },
        'M2': { col: 0, row: 1 },
        'M3': { col: 0, row: 3 }, // Gap for visual separation
        'M4': { col: 0, row: 4 },

        'M5': { col: 1, row: 5 }, // Lower Start
        'M6': { col: 1, row: 6 },

        'M7': { col: 1, row: 0.5 }, // Upper Semi
        'M8': { col: 1, row: 3.5 },

        'M9': { col: 2, row: 4.5 }, // Lower R2
        'M10': { col: 2, row: 5.5 },

        'M11': { col: 2, row: 2 }, // Upper Final

        'M12': { col: 3, row: 5 }, // Lower R3

        'M13': { col: 4, row: 3.5 }, // Lower Final

        'M14': { col: 5, row: 2.75 }, // Grand Final
    }
}

interface BracketVisualProps {
    bracket: PlayoffMatch[];
    alliances: Alliance[];
    onMatchClick: (matchId: string, allianceId: number) => void;
    type: 4 | 6 | 8;
}

function BracketVisual({ bracket, alliances, onMatchClick, type }: BracketVisualProps) {
    const layout = MATCH_LAYOUTS[type] || MATCH_LAYOUTS[4];

    // Helper to calculate pixel position
    const getPos = (id: string) => {
        const grid = layout[id] || { col: 0, row: 0 };
        return {
            x: grid.col * (NODE_WIDTH + GAP_X) + 20, // Padding left
            y: grid.row * (NODE_HEIGHT + GAP_Y) + 20, // Padding top
        };
    };

    // Calculate dimensions
    const maxCol = Math.max(...Object.values(layout).map(l => l.col));
    const maxRow = Math.max(...Object.values(layout).map(l => l.row));
    const containerWidth = (maxCol + 1) * (NODE_WIDTH + GAP_X) + 40;
    const containerHeight = (maxRow + 1) * (NODE_HEIGHT + GAP_Y) + 40;

    return (
        <div className="relative overflow-auto pb-8" style={{ height: Math.max(containerHeight, 600) }}>
            <div className="relative" style={{ width: containerWidth, height: containerHeight }}>

                {/* SVG Connections Layer */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none z-0">
                    <defs>
                        <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill="#cbd5e1" />
                        </marker>
                        <marker id="arrowhead-win" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
                            <polygon points="0 0, 6 2, 0 4" fill="#3b82f6" />
                        </marker>
                    </defs>
                    {bracket.map(match => {
                        const start = getPos(match.id);
                        const startPt = { x: start.x + NODE_WIDTH, y: start.y + NODE_HEIGHT / 2 };

                        // Winner Path
                        let paths = [];
                        if (match.nextMatchWinner) {
                            const end = getPos(match.nextMatchWinner);
                            const endPt = { x: end.x, y: end.y + NODE_HEIGHT / 2 };
                            const controlX = (startPt.x + endPt.x) / 2;

                            const isWinnerDetermined = match.winnerId !== null;
                            const color = isWinnerDetermined ? "#3b82f6" : "#e2e8f0"; // Blue if active
                            const marker = isWinnerDetermined ? "url(#arrowhead-win)" : "url(#arrowhead)";

                            paths.push(
                                <path
                                    key={`${match.id}-win`}
                                    d={`M ${startPt.x} ${startPt.y} C ${controlX} ${startPt.y}, ${controlX} ${endPt.y}, ${endPt.x} ${endPt.y}`}
                                    fill="none"
                                    stroke={color}
                                    strokeWidth="2"
                                    markerEnd={marker}
                                />
                            );
                        }

                        // Loser Path (Dashed)
                        if (match.nextMatchLoser) {
                            const end = getPos(match.nextMatchLoser);
                            const endPt = { x: end.x, y: end.y + NODE_HEIGHT / 2 };
                            // Adjust start point slightly for visual separation? No, same source.
                            const controlX = (startPt.x + endPt.x) / 2;

                            paths.push(
                                <path
                                    key={`${match.id}-loss`}
                                    d={`M ${startPt.x} ${startPt.y} C ${controlX} ${startPt.y}, ${controlX} ${endPt.y}, ${endPt.x} ${endPt.y}`}
                                    fill="none"
                                    stroke="#cbd5e1"
                                    strokeWidth="1.5"
                                    strokeDasharray="4 4"
                                    markerEnd="url(#arrowhead)"
                                    opacity="0.6"
                                />
                            );
                        }
                        return paths;
                    })}
                </svg>

                {/* Nodes Layer */}
                {bracket.map(match => {
                    const pos = getPos(match.id);
                    return (
                        <div
                            key={match.id}
                            className="absolute z-10"
                            style={{ left: pos.x, top: pos.y, width: NODE_WIDTH, height: NODE_HEIGHT }}
                        >
                            <MatchNode
                                match={match}
                                alliances={alliances}
                                onMatchClick={onMatchClick}
                            />
                        </div>
                    );
                })}

                {/* Champion Trophy (Positioned after final match) */}
                {(() => {
                    const finalId = type === 4 ? 'M6' : type === 6 ? 'M10' : 'M14';
                    const finalPos = getPos(finalId);
                    if (!finalPos) return null;
                    const trophyX = finalPos.x + NODE_WIDTH + 60;
                    const trophyY = finalPos.y;

                    const championId = bracket.find(m => m.id === finalId)?.winnerId;

                    return (
                        <div
                            className="absolute z-10 flex flex-col items-center justify-center bg-yellow-50 border-2 border-yellow-300 rounded-2xl shadow-lg p-2"
                            style={{ left: trophyX, top: trophyY - 20, width: 140, height: 120 }}
                        >
                            <Trophy size={32} className="text-yellow-500 mb-1" />
                            <div className="text-[10px] font-bold text-yellow-600 uppercase tracking-widest mb-0.5">Champion</div>
                            {championId ? (
                                <div className="text-2xl font-black text-slate-900">
                                    #{championId}
                                </div>
                            ) : (
                                <div className="text-2xl font-black text-slate-300">?</div>
                            )}
                        </div>
                    );
                })()}

            </div>
        </div>
    );
}

interface MatchNodeProps {
    match: PlayoffMatch;
    alliances: Alliance[];
    onMatchClick: (matchId: string, allianceId: number) => void;
}

function MatchNode({ match, alliances, onMatchClick }: MatchNodeProps) {
    const red = alliances.find(a => a.id === match.redAllianceId);
    const blue = alliances.find(a => a.id === match.blueAllianceId);

    const isRedWinner = match.winnerId === match.redAllianceId && match.winnerId !== null;
    const isBlueWinner = match.winnerId === match.blueAllianceId && match.winnerId !== null;

    return (
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm w-full h-full text-[10px] flex flex-col">
            <div className="bg-slate-50 px-2 py-1 font-bold text-slate-400 uppercase flex justify-between items-center border-b border-slate-100 h-6">
                <span className="truncate max-w-[120px]">{match.name}</span>
                <span className="text-slate-300 text-[9px]">{match.id}</span>
            </div>

            <div className="flex-1 flex flex-col">
                {/* Red Alliance */}
                <button
                    onClick={() => match.redAllianceId && onMatchClick(match.id, match.redAllianceId)}
                    disabled={!match.redAllianceId}
                    className={clsx(
                        "flex-1 px-2 flex justify-between items-center transition-colors text-left border-b border-slate-50",
                        isRedWinner ? "bg-red-50 text-red-900" : "hover:bg-slate-50 text-slate-500",
                        // Override indicator
                        match.overriddenWinnerId === match.redAllianceId && "ring-1 ring-inset ring-red-500 bg-red-50"
                    )}
                >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        <div className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", isRedWinner ? "bg-red-600" : "bg-slate-300")} />
                        <span className="font-bold truncate">
                            {match.redAllianceId ? `Alliance ${match.redAllianceId}` : "TBD"}
                        </span>
                    </div>
                    {match.winProbabilityRed !== 0.5 && match.redAllianceId && match.blueAllianceId && (
                        <span className={clsx("font-mono font-black", isRedWinner ? "text-red-600" : "text-slate-300")}>
                            {(match.winProbabilityRed * 100).toFixed(0)}%
                        </span>
                    )}
                </button>

                {/* Blue Alliance */}
                <button
                    onClick={() => match.blueAllianceId && onMatchClick(match.id, match.blueAllianceId)}
                    disabled={!match.blueAllianceId}
                    className={clsx(
                        "flex-1 px-2 flex justify-between items-center transition-colors text-left",
                        isBlueWinner ? "bg-blue-50 text-blue-900" : "hover:bg-slate-50 text-slate-500",
                        match.overriddenWinnerId === match.blueAllianceId && "ring-1 ring-inset ring-blue-500 bg-blue-50"
                    )}
                >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        <div className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", isBlueWinner ? "bg-blue-600" : "bg-slate-300")} />
                        <span className="font-bold truncate">
                            {match.blueAllianceId ? `Alliance ${match.blueAllianceId}` : "TBD"}
                        </span>
                    </div>
                    {match.winProbabilityRed !== 0.5 && match.redAllianceId && match.blueAllianceId && (
                        <span className={clsx("font-mono font-black", isBlueWinner ? "text-blue-600" : "text-slate-300")}>
                            {((1 - match.winProbabilityRed) * 100).toFixed(0)}%
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}
