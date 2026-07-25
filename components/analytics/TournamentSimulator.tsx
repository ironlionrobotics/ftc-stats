import { useState, useMemo } from "react";
import { TeamEvolution } from "@/app/actions/analytics";
import { Alliance, PlayoffMatch } from "@/types/oracle";
import { generateAlliances, initializeBracket, updateBracket, runMonteCarloSimulation, SimulationResult } from "@/lib/alliance-utils";
import { Play, RotateCcw, Trophy, Shield, Edit2, Save, FolderOpen, PieChart } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/ConfirmDialog";

interface TournamentSimulatorProps {
    teams: TeamEvolution[];
}

export default function TournamentSimulator({ teams }: TournamentSimulatorProps) {
    const [step, setStep] = useState<'config' | 'building' | 'bracket'>('config');
    const [allianceCount, setAllianceCount] = useState<2 | 4 | 6 | 8>(4);
    // 2 = formato estándar (§13.7.1); 3 = Championship/Premier (§15.3):
    // segunda ronda serpentina y solo 2 de los 3 robots juegan cada match.
    const [allianceSize, setAllianceSize] = useState<2 | 3>(2);
    const [alliances, setAlliances] = useState<Alliance[]>([]);
    const [overrides, setOverrides] = useState<Record<string, number>>({});
    const [simResults, setSimResults] = useState<SimulationResult[] | null>(null);
    // Seed scenarios from localStorage via a lazy initializer instead of a
    // mount effect. This component only mounts on a client click (the Tournament
    // toggle, default mode is "analysis"), so it never server-renders — the
    // window guard means no hydration mismatch and no setState-in-effect.
    const [scenarios, setScenarios] = useState<{ name: string, date: string, allianceCount: 2 | 4 | 6 | 8, alliances: Alliance[], overrides: Record<string, number> }[]>(() => {
        if (typeof window === "undefined") return [];
        try {
            const saved = localStorage.getItem('tournament_scenarios');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error("Failed to parse scenarios", e);
            return [];
        }
    });

    // The bracket is pure derived state: initialize the structure for the chosen
    // size, apply the user's manual winner overrides, then propagate + compute
    // win probabilities. useMemo (not an effect + setState) — resetting alliances
    // to [] in handleReset makes this collapse back to [] on its own.
    const bracket = useMemo<PlayoffMatch[]>(() => {
        if (alliances.length === 0) return [];
        const matches = initializeBracket(allianceCount);
        matches.forEach(m => {
            if (overrides[m.id]) {
                m.overriddenWinnerId = overrides[m.id];
            }
        });
        return updateBracket(matches, alliances);
    }, [alliances, overrides, allianceCount]);

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

    const confirm = useConfirm();

    const handleLoadScenario = async (s: typeof scenarios[0]) => {
        const ok = await confirm({
            title: `Cargar escenario "${s.name}"`,
            description: "Los cambios sin guardar se perderán.",
            confirmText: "Cargar",
        });
        if (!ok) return;
        setAllianceCount(s.allianceCount);
        setAlliances(s.alliances);
        setOverrides(s.overrides);
        setStep('bracket');
        setSimResults(null);
    };

    const handleDeleteScenario = async (index: number) => {
        const ok = await confirm({
            title: "Borrar escenario",
            description: "Esta acción es permanente.",
            confirmText: "Borrar",
            variant: "danger",
        });
        if (!ok) return;
        const updated = scenarios.filter((_, i) => i !== index);
        setScenarios(updated);
        localStorage.setItem('tournament_scenarios', JSON.stringify(updated));
    };

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
        const newAlliances = generateAlliances(teams, allianceCount, allianceSize);
        setAlliances(newAlliances);
        setStep('building');
    };

    const handleManualStart = () => {
        setOverrides({});
        // Initialize empty alliances
        const empty: Alliance[] = Array.from({ length: allianceCount }, (_, i) => ({
            id: i + 1,
            captain: null as unknown as TeamEvolution, // placeholder until user assigns a captain
            pick1: null,
            pick2: null,
            totalOPR: 0,
            totalAuto: 0,
            totalTele: 0,
            totalEndgame: 0,
            projectedScore: 0,
            // No history yet — Monte Carlo will fall back to default sigma.
            totalSigma: 0
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
            const members = [updated.captain, updated.pick1].filter((t): t is TeamEvolution => !!t);
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
            toast.warning("Completa todas las selecciones de alianza primero");
            return;
        }
        // Bracket is updated by useEffect
        setStep('bracket');
    };

    const handleReset = () => {
        setAlliances([]); // bracket is derived, so this clears it too
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
                <div className="bg-muted border border-border rounded-2xl p-8 flex flex-col items-center justify-center gap-6 text-center">
                    <div>
                        <h3 className="text-xl font-bold text-foreground">Tournament Configuration</h3>
                        <p className="text-muted-foreground text-sm">Select the number of alliances for the playoff tournament.</p>
                    </div>

                    <div className="flex gap-4">
                        {[2, 4, 6, 8].map((count) => (
                            <button
                                key={count}
                                onClick={() => setAllianceCount(count as 4 | 6 | 8)}
                                className={clsx(
                                    "w-16 h-16 rounded-2xl font-black text-2xl flex items-center justify-center transition-all border-2",
                                    allianceCount === count
                                        ? "bg-card border-secondary text-secondary shadow-sm scale-110"
                                        : "bg-card border-border text-muted-foreground hover:border-border"
                                )}
                            >
                                {count}
                            </button>
                        ))}
                    </div>

                    <div className="flex flex-col items-center gap-2">
                        <p className="font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">Robots por alianza</p>
                        <div className="flex gap-3">
                            {([2, 3] as const).map(size => (
                                <button
                                    key={size}
                                    onClick={() => setAllianceSize(size)}
                                    className={clsx(
                                        "px-5 py-2.5 rounded-xl font-bold text-sm transition-all border-2",
                                        allianceSize === size
                                            ? "bg-card border-primary text-primary shadow-sm"
                                            : "bg-card border-border text-muted-foreground"
                                    )}
                                >
                                    {size === 2 ? "2 — Estándar" : "3 — Championship/Premier"}
                                </button>
                            ))}
                        </div>
                        {allianceSize === 3 && (
                            <p className="text-[11px] text-muted-foreground max-w-sm">
                                Regla 15.3: 2ª ronda de picks en orden invertido; en cada match
                                juegan 2 de los 3 robots (la proyección usa el mejor par).
                            </p>
                        )}
                    </div>

                    <div className="flex gap-4">
                        <button
                            onClick={handleAutoGenerate}
                            className="flex items-center gap-2 px-8 py-4 bg-secondary hover:bg-secondary/90 text-secondary-foreground rounded-xl font-bold text-lg shadow-sm transition-all active:scale-95"
                        >
                            <Play size={20} fill="currentColor" /> Auto Generate
                        </button>
                        <button
                            onClick={handleManualStart}
                            className="flex items-center gap-2 px-8 py-4 bg-card border-2 border-border hover:border-border text-muted-foreground rounded-xl font-bold text-lg transition-all active:scale-95"
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
                        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <Shield className="text-secondary" /> Build Alliances
                        </h3>
                        <div className="flex gap-3">
                            <button
                                onClick={handleReset}
                                className="px-4 py-2 text-muted-foreground hover:text-foreground font-bold text-sm"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSimulate}
                                className="px-6 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold shadow-sm transition-all flex items-center gap-2"
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
                                <div key={alliance.id} className="bg-card border border-border rounded-xl p-4 shadow-sm relative">
                                    <div className="absolute top-0 left-0 bg-muted text-muted-foreground text-[10px] font-black px-2 py-1 rounded-br-lg">
                                        ALLIANCE {alliance.id}
                                    </div>
                                    <div className="mt-6 space-y-3">
                                        <div>
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Captain</label>
                                            <select
                                                className="w-full text-sm font-bold border border-border rounded-lg p-2 bg-muted focus:outline-none focus:ring-2 focus:ring-secondary"
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
                                            <label className="text-[10px] font-bold text-muted-foreground uppercase block mb-1">Partner</label>
                                            <select
                                                className="w-full text-sm font-bold border border-border rounded-lg p-2 bg-muted focus:outline-none focus:ring-2 focus:ring-secondary"
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
                                    <div className="mt-4 pt-3 border-t border-border flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-muted-foreground uppercase">Est. OPR</span>
                                        <span className="font-mono font-black text-foreground">{alliance.totalOPR?.toFixed(0) || 0}</span>
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
                    <div className="flex justify-between items-center bg-card p-4 rounded-xl border border-border shadow-sm relative z-20">
                        <div className="flex gap-2">
                            <button onClick={handleSaveScenario} className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/70 text-foreground rounded-lg text-xs font-bold transition-colors">
                                <Save size={14} /> Save Scenario
                            </button>
                            <div className="relative group">
                                <button className="flex items-center gap-2 px-3 py-1.5 bg-muted hover:bg-muted/70 text-foreground rounded-lg text-xs font-bold transition-colors">
                                    <FolderOpen size={14} /> Load Scenario ({scenarios.length})
                                </button>
                                <div className="absolute top-full left-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-sm p-2 hidden group-hover:block z-50">
                                    {scenarios.length === 0 && <div className="text-xs text-muted-foreground p-2">No saved scenarios</div>}
                                    {scenarios.map((s, i) => (
                                        <div key={i} className="flex justify-between items-center p-2 hover:bg-muted rounded-lg group/item cursor-pointer">
                                            <div onClick={() => handleLoadScenario(s)} className="flex-1">
                                                <div className="font-bold text-foreground text-xs truncate max-w-[150px]">{s.name}</div>
                                                <div className="text-[10px] text-muted-foreground">{new Date(s.date).toLocaleDateString()}</div>
                                            </div>
                                            <button onClick={(e) => { e.stopPropagation(); handleDeleteScenario(i) }} className="text-muted-foreground hover:text-danger p-1"><RotateCcw size={12} className="rotate-45" /></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button onClick={() => setStep('building')} className="text-xs font-bold text-secondary hover:underline flex items-center gap-1">
                            <Edit2 size={12} /> Edit Alliances
                        </button>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                        {/* Left Sidebar: Alliances & Analytics */}
                        <div className="lg:col-span-1 space-y-6">
                            {/* Monte Carlo Card */}
                            <div className="bg-muted border border-border rounded-xl p-4 text-foreground shadow-sm">
                                <h3 className="font-bold text-sm flex items-center gap-2 mb-3">
                                    <PieChart size={16} className="text-primary" /> Win Probability
                                </h3>
                                {!simResults ? (
                                    <div className="text-center py-4">
                                        <p className="text-xs text-muted-foreground mb-4">Run 2,000 simulations with performance variance to see realistic championship odds.</p>
                                        <button
                                            onClick={handleRunMonteCarlo}
                                            className="w-full py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-bold transition-colors shadow-sm"
                                        >
                                            Run Monte Carlo
                                        </button>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {simResults.slice(0, 5).map(res => (
                                            <div key={res.allianceId} className="relative">
                                                <div className="flex justify-between text-xs font-bold mb-1">
                                                    <span className="text-foreground">Alliance {res.allianceId}</span>
                                                    <span className="text-primary">{(res.championProbability * 100).toFixed(1)}%</span>
                                                </div>
                                                <div className="h-1.5 bg-border rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary rounded-full" style={{ width: `${res.championProbability * 100}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                        <button
                                            onClick={handleRunMonteCarlo}
                                            className="w-full mt-2 py-1.5 bg-border hover:bg-border/70 rounded-lg text-[10px] font-bold text-muted-foreground transition-colors"
                                        >
                                            Rerun Simulation
                                        </button>
                                    </div>
                                )}
                            </div>

                            {/* Alliances List */}
                            <div className="space-y-2">
                                {alliances.map((alliance) => (
                                    <div key={alliance.id} className="bg-card border border-border rounded-xl p-3 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
                                        <div className="bg-muted text-muted-foreground absolute top-0 left-0 w-8 h-8 flex items-center justify-center font-black text-xs rounded-br-xl group-hover:bg-secondary group-hover:text-secondary-foreground transition-colors">
                                            #{alliance.id}
                                        </div>
                                        <div className="ml-10 space-y-1">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0"></div>
                                                <span className="font-black text-foreground text-lg">{alliance.captain.teamNumber}</span>
                                                <span className="text-xs text-muted-foreground font-bold uppercase">{alliance.captain.teamName}</span>
                                            </div>
                                            {alliance.pick1 && (
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full bg-secondary flex-shrink-0"></div>
                                                    <span className="font-bold text-foreground">{alliance.pick1.teamNumber}</span>
                                                    <span className="text-xs text-muted-foreground font-medium uppercase">{alliance.pick1.teamName}</span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="mt-3 pt-2 border-t border-border flex justify-between items-center overflow-hidden">
                                            <div className="text-[10px] font-bold text-muted-foreground uppercase">Est. Score</div>
                                            <div className="font-mono font-black text-foreground">{alliance.totalOPR.toFixed(0)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Bracket Visual */}
                        <div className="lg:col-span-3 overflow-x-auto pb-8">
                            <div className="flex justify-between items-center bg-muted p-4 rounded-xl border border-border mb-6">
                                <div className="flex items-center gap-4">
                                    <span className="text-sm font-bold text-muted-foreground">
                                        Click on a match team to manually override the winner.
                                    </span>
                                </div>
                                <button
                                    onClick={handleReset}
                                    className="flex items-center gap-2 px-4 py-2 bg-card border border-border hover:bg-muted text-foreground rounded-lg font-bold text-sm transition-all"
                                >
                                    <RotateCcw size={16} /> Reset
                                </button>
                            </div>
                            <BracketVisual
                                bracket={bracket}
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
    2: {
        'M1': { col: 0, row: 1 },
        'M2': { col: 1, row: 1 },
        'M3': { col: 2, row: 1 },
    },
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
    onMatchClick: (matchId: string, allianceId: number) => void;
    type: 2 | 4 | 6 | 8;
}

function BracketVisual({ bracket, onMatchClick, type }: BracketVisualProps) {
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
                        const paths = [];
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
                                onMatchClick={onMatchClick}
                            />
                        </div>
                    );
                })}

                {/* Champion Trophy (Positioned after final match) */}
                {(() => {
                    const finalId = type === 2 ? 'M2' : type === 4 ? 'M6' : type === 6 ? 'M10' : 'M14';
                    const finalPos = getPos(finalId);
                    if (!finalPos) return null;
                    const trophyX = finalPos.x + NODE_WIDTH + 60;
                    const trophyY = finalPos.y;

                    const championId = bracket.find(m => m.id === finalId)?.winnerId;

                    return (
                        <div
                            className="absolute z-10 flex flex-col items-center justify-center bg-warning/10 border-2 border-warning/30 rounded-2xl shadow-sm p-2"
                            style={{ left: trophyX, top: trophyY - 20, width: 140, height: 120 }}
                        >
                            <Trophy size={32} className="text-warning mb-1" />
                            <div className="text-[10px] font-bold text-warning uppercase tracking-widest mb-0.5">Champion</div>
                            {championId ? (
                                <div className="text-2xl font-black text-foreground">
                                    #{championId}
                                </div>
                            ) : (
                                <div className="text-2xl font-black text-muted-foreground">?</div>
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
    onMatchClick: (matchId: string, allianceId: number) => void;
}

function MatchNode({ match, onMatchClick }: MatchNodeProps) {
    const isRedWinner = match.winnerId === match.redAllianceId && match.winnerId !== null;
    const isBlueWinner = match.winnerId === match.blueAllianceId && match.winnerId !== null;

    return (
        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm w-full h-full text-[10px] flex flex-col">
            <div className="bg-muted px-2 py-1 font-bold text-muted-foreground uppercase flex justify-between items-center border-b border-border h-6">
                <span className="truncate max-w-[120px]">{match.name}</span>
                <span className="text-muted-foreground text-[9px]">{match.id}</span>
            </div>

            <div className="flex-1 flex flex-col">
                {/* Red Alliance */}
                <button
                    onClick={() => match.redAllianceId && onMatchClick(match.id, match.redAllianceId)}
                    disabled={!match.redAllianceId}
                    className={clsx(
                        "flex-1 px-2 flex justify-between items-center transition-colors text-left border-b border-border",
                        isRedWinner ? "bg-danger/10 text-danger" : "hover:bg-muted text-muted-foreground",
                        // Override indicator
                        match.overriddenWinnerId === match.redAllianceId && "ring-1 ring-inset ring-danger bg-danger/10"
                    )}
                >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        <div className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", isRedWinner ? "bg-danger" : "bg-muted-foreground")} />
                        <span className="font-bold truncate">
                            {match.redAllianceId ? `Alliance ${match.redAllianceId}` : "TBD"}
                        </span>
                    </div>
                    {match.winProbabilityRed !== 0.5 && match.redAllianceId && match.blueAllianceId && (
                        <span className={clsx("font-mono font-black", isRedWinner ? "text-danger" : "text-muted-foreground")}>
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
                        isBlueWinner ? "bg-secondary/10 text-secondary" : "hover:bg-muted text-muted-foreground",
                        match.overriddenWinnerId === match.blueAllianceId && "ring-1 ring-inset ring-secondary bg-secondary/10"
                    )}
                >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        <div className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", isBlueWinner ? "bg-secondary" : "bg-muted-foreground")} />
                        <span className="font-bold truncate">
                            {match.blueAllianceId ? `Alliance ${match.blueAllianceId}` : "TBD"}
                        </span>
                    </div>
                    {match.winProbabilityRed !== 0.5 && match.redAllianceId && match.blueAllianceId && (
                        <span className={clsx("font-mono font-black", isBlueWinner ? "text-secondary" : "text-muted-foreground")}>
                            {((1 - match.winProbabilityRed) * 100).toFixed(0)}%
                        </span>
                    )}
                </button>
            </div>
        </div>
    );
}
