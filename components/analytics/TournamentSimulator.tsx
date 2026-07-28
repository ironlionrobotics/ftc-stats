import { useState, useMemo } from "react";
import { TeamEvolution } from "@/app/actions/analytics";
import type { FTCMatch } from "@/types/scouting";
import { Alliance, PlayoffMatch } from "@/types/oracle";
import { generateAlliances, alliancesFromOfficial, initializeBracket, updateBracket, runMonteCarloSimulation, SimulationResult, MAJOR_FOUL_POINTS, type MatchAdjustment } from "@/lib/alliance-utils";
import { Play, RotateCcw, Trophy, Shield, Edit2, Save, FolderOpen, PieChart, Download } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/ConfirmDialog";

import type { FTCAllianceSelection } from "@/types/scouting";

interface TournamentSimulatorProps {
    teams: TeamEvolution[];
    /** Official published selection — enables one-click tournament setup. */
    official?: FTCAllianceSelection[];
    /** Real playoff matches from the API — enables one-click reality import. */
    playoffMatches?: FTCMatch[];
}

export default function TournamentSimulator({ teams, official, playoffMatches }: TournamentSimulatorProps) {
    const [step, setStep] = useState<'config' | 'building' | 'bracket'>('config');
    const [allianceCount, setAllianceCount] = useState<2 | 4 | 6 | 8>(4);
    // 2 = formato estándar (§13.7.1); 3 = Championship/Premier (§15.3):
    // segunda ronda serpentina y solo 2 de los 3 robots juegan cada match.
    const [allianceSize, setAllianceSize] = useState<2 | 3>(2);
    const [alliances, setAlliances] = useState<Alliance[]>([]);
    const [overrides, setOverrides] = useState<Record<string, number>>({});
    // Per-match reality layer: real scores + incidents (robot failure, major
    // fouls). Persisted with scenarios for estimate-vs-real comparison.
    const [matchData, setMatchData] = useState<Record<string, MatchAdjustment>>({});
    const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
    const [simResults, setSimResults] = useState<SimulationResult[] | null>(null);
    // Seed scenarios from localStorage via a lazy initializer instead of a
    // mount effect. This component only mounts on a client click (the Tournament
    // toggle, default mode is "analysis"), so it never server-renders — the
    // window guard means no hydration mismatch and no setState-in-effect.
    const [scenarios, setScenarios] = useState<{ name: string, date: string, allianceCount: 2 | 4 | 6 | 8, allianceSize?: 2 | 3, alliances: Alliance[], overrides: Record<string, number>, matchData?: Record<string, MatchAdjustment> }[]>(() => {
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
        return updateBracket(matches, alliances, matchData);
    }, [alliances, overrides, allianceCount, matchData]);

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
            allianceSize,
            alliances,
            overrides,
            matchData
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
        setAllianceSize(s.allianceSize ?? 2);
        setAlliances(s.alliances);
        setOverrides(s.overrides);
        setMatchData(s.matchData ?? {});
        setSelectedMatchId(null);
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
        setOverrides({});
        setMatchData({});
        setSelectedMatchId(null); // Reset overrides on new generation
        const newAlliances = generateAlliances(teams, allianceCount, allianceSize);
        setAlliances(newAlliances);
        setStep('building');
    };

    const handleFromOfficial = () => {
        if (!official || official.length === 0) return;
        setOverrides({});
        setMatchData({});
        setSelectedMatchId(null);
        const officialAlliances = alliancesFromOfficial(official, teams);
        const count = ([2, 4, 6, 8].includes(officialAlliances.length) ? officialAlliances.length : 6) as 2 | 4 | 6 | 8;
        const size: 2 | 3 = official.some(a => a.round2 != null) ? 3 : 2;
        setAllianceCount(count);
        setAllianceSize(size);
        setAlliances(officialAlliances);
        setStep('building');
        toast.success(`${officialAlliances.length} alianzas oficiales cargadas (${size} robots)`);
    };

    const handleManualStart = () => {
        setOverrides({});
        setMatchData({});
        setSelectedMatchId(null);
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
    // Imports REAL playoff results (scores + committed foul points) from the
    // FIRST API into the reality layer. Iterative: each imported result can
    // resolve the next round's pairing, so we recompute the bracket until no
    // new matches can be matched (bounded by bracket depth).
    const handleImportRealResults = () => {
        if (!playoffMatches || playoffMatches.length === 0) {
            toast.warning("El API aún no publica resultados de playoffs para este evento");
            return;
        }
        const rosterOf = (a: Alliance) => new Set(
            [a.captain, a.pick1, a.pick2].filter(Boolean).map(t => (t as TeamEvolution).teamNumber),
        );
        const next: Record<string, MatchAdjustment> = { ...matchData };
        let importedTotal = 0;

        for (let pass = 0; pass < 6; pass++) {
            const base = initializeBracket(allianceCount);
            base.forEach(m => { if (overrides[m.id]) m.overriddenWinnerId = overrides[m.id]; });
            const current = updateBracket(base, alliances, next);
            let importedThisPass = 0;

            for (const pm of playoffMatches) {
                const redTeams = pm.teams.filter(t => t.station.startsWith("Red")).map(t => t.teamNumber);
                const blueTeams = pm.teams.filter(t => t.station.startsWith("Blue")).map(t => t.teamNumber);
                const redAl = alliances.find(a => redTeams.some(n => rosterOf(a).has(n)));
                const blueAl = alliances.find(a => blueTeams.some(n => rosterOf(a).has(n)));
                if (!redAl || !blueAl) continue;

                const candidates = current.filter(b =>
                    (b.redAllianceId === redAl.id && b.blueAllianceId === blueAl.id) ||
                    (b.redAllianceId === blueAl.id && b.blueAllianceId === redAl.id),
                );
                const slot = candidates.find(b => next[b.id]?.realRed == null);
                if (!slot) continue;

                const sameOrientation = slot.redAllianceId === redAl.id;
                next[slot.id] = {
                    ...next[slot.id],
                    realRed: sameOrientation ? pm.scoreRedFinal : pm.scoreBlueFinal,
                    realBlue: sameOrientation ? pm.scoreBlueFinal : pm.scoreRedFinal,
                    // scoreXFoul = penalty points COMMITTED by X (verified
                    // against the official score display).
                    foulPointsRed: sameOrientation ? pm.scoreRedFoul : pm.scoreBlueFoul,
                    foulPointsBlue: sameOrientation ? pm.scoreBlueFoul : pm.scoreRedFoul,
                };
                importedThisPass++;
                importedTotal++;
            }
            if (importedThisPass === 0) break;
        }

        setMatchData(next);
        if (importedTotal > 0) toast.success(`${importedTotal} resultados reales importados del API (marcadores + fouls)`);
        else toast.info("No hubo matches nuevos que importar");
    };

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

                    <div className="flex gap-4 flex-wrap justify-center">
                        {official && official.length > 0 && (
                            <button
                                onClick={handleFromOfficial}
                                className="flex items-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-xl font-bold text-lg shadow-sm transition-all active:scale-95"
                            >
                                <Download size={20} /> Usar alianzas oficiales
                            </button>
                        )}
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
                        <div className="flex gap-3 flex-wrap">
                            {/* Scenario versioning also lives here (not only in the
                                bracket step) so alliance COMBINATIONS can be saved
                                and compared before ever simulating. */}
                            <button onClick={handleSaveScenario} className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/70 text-foreground rounded-lg text-xs font-bold transition-colors">
                                <Save size={14} /> Guardar escenario
                            </button>
                            <div className="relative group">
                                <button className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/70 text-foreground rounded-lg text-xs font-bold transition-colors">
                                    <FolderOpen size={14} /> Cargar ({scenarios.length})
                                </button>
                                <div className="absolute top-full right-0 mt-2 w-64 bg-card border border-border rounded-xl shadow-sm p-2 hidden group-hover:block z-50">
                                    {scenarios.length === 0 && <div className="text-xs text-muted-foreground p-2">Sin escenarios guardados</div>}
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
                            <button onClick={handleImportRealResults} className="flex items-center gap-2 px-3 py-1.5 bg-secondary/10 text-secondary border border-secondary/30 hover:bg-secondary/20 rounded-lg text-xs font-bold transition-colors">
                                <Download size={14} /> Importar resultados (API)
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
                                        Click en un equipo para forzar ganador · click en ✎ para capturar resultado real e incidentes.
                                    </span>
                                </div>
                                <button
                                    onClick={handleReset}
                                    className="flex items-center gap-2 px-4 py-2 bg-card border border-border hover:bg-muted text-foreground rounded-lg font-bold text-sm transition-all"
                                >
                                    <RotateCcw size={16} /> Reset
                                </button>
                            </div>
                            {selectedMatchId && (() => {
                                const m = bracket.find(x => x.id === selectedMatchId);
                                if (!m) return null;
                                return (
                                    <MatchRealityEditor
                                        match={m}
                                        red={alliances.find(a => a.id === m.redAllianceId) ?? null}
                                        blue={alliances.find(a => a.id === m.blueAllianceId) ?? null}
                                        adj={matchData[m.id] ?? {}}
                                        onChange={(next) => setMatchData(prev => ({ ...prev, [m.id]: next }))}
                                        onClose={() => setSelectedMatchId(null)}
                                    />
                                );
                            })()}
                            <BracketVisual
                                bracket={bracket}
                                onMatchClick={handleMatchClick}
                                onSelectMatch={setSelectedMatchId}
                                alliances={alliances}
                                matchData={matchData}
                                type={allianceCount}
                            />
                            <EstimateVsRealTable bracket={bracket} alliances={alliances} matchData={matchData} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// --- Bracket Visualization Sub-Components ---

const NODE_WIDTH = 220;
const NODE_HEIGHT = 96;
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
    // Band layout: UPPER bracket rows 0-1, LOWER bracket below the divider,
    // Grand Final on the far right between both bands.
    4: {
        'M1': { col: 0, row: 0 },     // Semi-Final 1
        'M2': { col: 0, row: 1 },     // Semi-Final 2
        'M3': { col: 1, row: 0.5 },   // Upper Final
        'M4': { col: 1, row: 2.6 },   // Lower Round 1 (L M1 + L M2)
        'M5': { col: 2, row: 2.6 },   // Lower Final (W M4 + L M3)
        'M6': { col: 3, row: 1.5 },   // Grand Final
    },
    6: {
        'M1': { col: 0, row: 0 },     // Round 1-1 (A4 vs A5)
        'M2': { col: 0, row: 1 },     // Round 1-2 (A3 vs A6)
        'M3': { col: 1, row: 0 },     // Upper Semi 1 (A1 vs W M1)
        'M4': { col: 1, row: 1 },     // Upper Semi 2 (A2 vs W M2)
        'M7': { col: 2, row: 0.5 },   // Upper Final
        'M5': { col: 1.6, row: 2.7 }, // Lower Round 2-1 (L M2 + L M3)
        'M6': { col: 1.6, row: 3.7 }, // Lower Round 2-2 (L M1 + L M4)
        'M8': { col: 2.6, row: 3.2 }, // Lower Round 3 (W M5 + W M6)
        'M9': { col: 3.6, row: 3.2 }, // Lower Final (W M8 + L M7)
        'M10': { col: 4.6, row: 1.8 },// Grand Final
    },
    8: {
        'M1': { col: 0, row: 0 },     // Upper R1
        'M2': { col: 0, row: 1 },
        'M3': { col: 0, row: 2 },
        'M4': { col: 0, row: 3 },
        'M7': { col: 1, row: 0.5 },   // Upper Semis
        'M8': { col: 1, row: 2.5 },
        'M11': { col: 2, row: 1.5 },  // Upper Final
        'M5': { col: 0.8, row: 4.9 }, // Lower R1 (L M1 + L M2)
        'M6': { col: 0.8, row: 5.9 }, // Lower R1 (L M3 + L M4)
        'M10': { col: 1.8, row: 4.9 },// Lower R2 (W M5 + L M8)
        'M9': { col: 1.8, row: 5.9 }, // Lower R2 (W M6 + L M7)
        'M12': { col: 2.8, row: 5.4 },// Lower R3
        'M13': { col: 3.8, row: 5.4 },// Lower Final (W M12 + L M11)
        'M14': { col: 4.8, row: 3.2 },// Grand Final
    },
};

// Row where the upper band ends and the lower band begins (for the divider
// line and zone labels). Type 2 has no lower bracket.
const BAND_DIVIDER_ROW: Record<number, number | null> = {
    2: null,
    4: 2.05,
    6: 2.15,
    8: 4.35,
};

interface BracketVisualProps {
    alliances: Alliance[];
    matchData: Record<string, MatchAdjustment>;
    onSelectMatch: (matchId: string) => void;
    bracket: PlayoffMatch[];
    onMatchClick: (matchId: string, allianceId: number) => void;
    type: 2 | 4 | 6 | 8;
}

function BracketVisual({ bracket, onMatchClick, type, alliances, matchData, onSelectMatch }: BracketVisualProps) {
    const allianceMap = new Map(alliances.map(a => [a.id, a]));
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

                {/* Band zones: upper on top, lower below the dashed divider. */}
                {(() => {
                    const dividerRow = BAND_DIVIDER_ROW[type];
                    if (dividerRow == null) return null;
                    const dividerY = dividerRow * (NODE_HEIGHT + GAP_Y) + 20;
                    return (
                        <>
                            <div className="absolute left-0 right-0 top-0 bg-primary/[0.04] pointer-events-none" style={{ height: dividerY }} />
                            <div className="absolute left-0 right-0 bg-warning/[0.045] pointer-events-none" style={{ top: dividerY, bottom: 0 }} />
                            <div className="absolute left-0 right-0 border-t-2 border-dashed border-border pointer-events-none" style={{ top: dividerY }} />
                            <span className="absolute left-2 top-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary/70 pointer-events-none">
                                ▲ Upper Bracket
                            </span>
                            <span className="absolute left-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-warning/80 pointer-events-none" style={{ top: dividerY + 6 }}>
                                ▼ Lower Bracket · una derrota elimina
                            </span>
                        </>
                    );
                })()}

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
                                onSelectMatch={onSelectMatch}
                                allianceMap={allianceMap}
                                adj={matchData[match.id]}
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
    onSelectMatch: (matchId: string) => void;
    allianceMap: Map<number, Alliance>;
    adj?: MatchAdjustment;
}

/** Compact "captain+pick(+pick2)" label; full names go in the title attr. */
function allianceTeamsLabel(a?: Alliance | null): string {
    if (!a || !a.captain) return "";
    const nums = [a.captain, a.pick1, a.pick2].filter(Boolean).map(t => (t as TeamEvolution).teamNumber);
    return nums.join("+");
}
function allianceTeamNames(a?: Alliance | null): string {
    if (!a || !a.captain) return "";
    return [a.captain, a.pick1, a.pick2].filter(Boolean).map(t => `${(t as TeamEvolution).teamNumber} ${(t as TeamEvolution).teamName}`).join(" · ");
}

function MatchNode({ match, onMatchClick, onSelectMatch, allianceMap, adj }: MatchNodeProps) {
    const isRedWinner = match.winnerId === match.redAllianceId && match.winnerId !== null;
    const isBlueWinner = match.winnerId === match.blueAllianceId && match.winnerId !== null;
    const red = match.redAllianceId ? allianceMap.get(match.redAllianceId) : null;
    const blue = match.blueAllianceId ? allianceMap.get(match.blueAllianceId) : null;
    const hasReal = adj?.realRed != null && adj?.realBlue != null;
    const hasIncident = !!adj && (adj.failedTeamRed != null || adj.failedTeamBlue != null || adj.failRed || adj.failBlue || (adj.foulPointsRed ?? 0) > 0 || (adj.foulPointsBlue ?? 0) > 0 || (adj.foulsRed ?? 0) > 0 || (adj.foulsBlue ?? 0) > 0);

    const rightCell = (side: "red" | "blue") => {
        if (!match.redAllianceId || !match.blueAllianceId) return null;
        if (hasReal) {
            const v = side === "red" ? adj!.realRed : adj!.realBlue;
            return <span className="font-mono font-black">{v}</span>;
        }
        const pred = side === "red" ? match.redScorePrediction : match.blueScorePrediction;
        const prob = side === "red" ? match.winProbabilityRed : 1 - match.winProbabilityRed;
        if (match.winProbabilityRed === 0.5 && pred == null) return null;
        return (
            <span className="font-mono text-right leading-tight">
                <span className="font-black">{(prob * 100).toFixed(0)}%</span>
                {pred != null && <span className="block text-[8px] opacity-80">~{Math.round(pred)} pts</span>}
            </span>
        );
    };

    return (
        <div className="bg-card border border-border rounded-lg overflow-hidden shadow-sm w-full h-full text-[10px] flex flex-col">
            <div className="bg-muted px-2 py-1 font-bold text-muted-foreground uppercase flex justify-between items-center border-b border-border h-6">
                <span className="truncate max-w-[110px]">
                    {hasReal && <span className="text-success mr-1" title="Resultado real capturado">●</span>}
                    {hasIncident && !hasReal && <span className="text-warning mr-1" title="Incidente modelado">⚡</span>}
                    {match.name}
                </span>
                <button
                    onClick={() => onSelectMatch(match.id)}
                    className="text-muted-foreground hover:text-primary font-mono text-[9px] px-1 rounded transition-colors"
                    title="Capturar resultado real / incidentes"
                >
                    ✎ {match.id}
                </button>
            </div>

            <div className="flex-1 flex flex-col">
                {/* Red Alliance */}
                <button
                    onClick={() => match.redAllianceId && onMatchClick(match.id, match.redAllianceId)}
                    disabled={!match.redAllianceId}
                    title={allianceTeamNames(red)}
                    className={clsx(
                        "flex-1 px-2 flex justify-between items-center transition-colors text-left border-b border-border gap-1",
                        isRedWinner ? "bg-danger/10 text-danger" : "hover:bg-muted text-muted-foreground",
                        match.overriddenWinnerId === match.redAllianceId && "ring-1 ring-inset ring-danger bg-danger/10"
                    )}
                >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        <div className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", isRedWinner ? "bg-danger" : "bg-muted-foreground")} />
                        <span className="truncate leading-tight">
                            <span className="font-black">{match.redAllianceId ? `A${match.redAllianceId}` : "TBD"}</span>
                            {red && <span className="block font-mono text-[9px] opacity-90">{allianceTeamsLabel(red)}{(adj?.failedTeamRed != null || adj?.failRed) ? " ⚡" : ""}{((adj?.foulPointsRed ?? (adj?.foulsRed ?? 0) * MAJOR_FOUL_POINTS) > 0) ? ` ⚠${adj?.foulPointsRed ?? (adj?.foulsRed ?? 0) * MAJOR_FOUL_POINTS}` : ""}</span>}
                        </span>
                    </div>
                    {rightCell("red")}
                </button>

                {/* Blue Alliance */}
                <button
                    onClick={() => match.blueAllianceId && onMatchClick(match.id, match.blueAllianceId)}
                    disabled={!match.blueAllianceId}
                    title={allianceTeamNames(blue)}
                    className={clsx(
                        "flex-1 px-2 flex justify-between items-center transition-colors text-left gap-1",
                        isBlueWinner ? "bg-secondary/10 text-secondary" : "hover:bg-muted text-muted-foreground",
                        match.overriddenWinnerId === match.blueAllianceId && "ring-1 ring-inset ring-secondary bg-secondary/10"
                    )}
                >
                    <div className="flex items-center gap-1.5 overflow-hidden">
                        <div className={clsx("w-1.5 h-1.5 rounded-full flex-shrink-0", isBlueWinner ? "bg-secondary" : "bg-muted-foreground")} />
                        <span className="truncate leading-tight">
                            <span className="font-black">{match.blueAllianceId ? `A${match.blueAllianceId}` : "TBD"}</span>
                            {blue && <span className="block font-mono text-[9px] opacity-90">{allianceTeamsLabel(blue)}{(adj?.failedTeamBlue != null || adj?.failBlue) ? " ⚡" : ""}{((adj?.foulPointsBlue ?? (adj?.foulsBlue ?? 0) * MAJOR_FOUL_POINTS) > 0) ? ` ⚠${adj?.foulPointsBlue ?? (adj?.foulsBlue ?? 0) * MAJOR_FOUL_POINTS}` : ""}</span>}
                        </span>
                    </div>
                    {rightCell("blue")}
                </button>
            </div>
        </div>
    );
}

/**
 * Reality editor for one playoff match: capture the REAL score and model the
 * incidents that predictions can't see (robot failure, major fouls). The
 * adjusted projection updates live so "what should have happened" is explicit.
 */
function MatchRealityEditor({ match, red, blue, adj, onChange, onClose }: {
    match: PlayoffMatch;
    red: Alliance | null;
    blue: Alliance | null;
    adj: MatchAdjustment;
    onChange: (next: MatchAdjustment) => void;
    onClose: () => void;
}) {
    const set = (patch: Partial<MatchAdjustment>) => onChange({ ...adj, ...patch });
    const numOrNull = (v: string) => (v === "" ? null : Number(v));

    const sideBlock = (side: "red" | "blue", alliance: Alliance | null) => {
        const isRed = side === "red";
        const color = isRed ? "text-danger" : "text-secondary";
        return (
            <div className="space-y-2">
                <div className={clsx("font-bold text-sm", color)}>
                    {alliance ? `A${alliance.id} · ${allianceTeamsLabel(alliance)}` : "TBD"}
                </div>
                <label className="block">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Puntaje real</span>
                    <input
                        type="number"
                        min={0}
                        value={(isRed ? adj.realRed : adj.realBlue) ?? ""}
                        onChange={e => set(isRed ? { realRed: numOrNull(e.target.value) } : { realBlue: numOrNull(e.target.value) })}
                        className="w-full mt-0.5 px-2.5 py-1.5 bg-muted border border-border rounded-lg font-mono text-sm text-foreground"
                        placeholder="—"
                    />
                </label>
                <label className="block">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">⚡ Robot que falló</span>
                    <select
                        value={(isRed ? adj.failedTeamRed : adj.failedTeamBlue) ?? ""}
                        onChange={e => {
                            const v = e.target.value === "" ? null : Number(e.target.value);
                            set(isRed ? { failedTeamRed: v, failRed: false } : { failedTeamBlue: v, failBlue: false });
                        }}
                        className="w-full mt-0.5 px-2.5 py-1.5 bg-muted border border-border rounded-lg font-mono text-sm text-foreground"
                    >
                        <option value="">Ninguno</option>
                        {alliance && [alliance.captain, alliance.pick1, alliance.pick2]
                            .filter((t): t is TeamEvolution => !!t)
                            .map(t => (
                                <option key={t.teamNumber} value={t.teamNumber}>
                                    {t.teamNumber} · OPR {Math.round(t.opr || 0)}
                                </option>
                            ))}
                    </select>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">La alianza proyecta con el robot sobreviviente.</span>
                </label>
                <label className="block">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">⚠ Puntos de foul cometidos <span className="normal-case">(van al rival)</span></span>
                    <div className="flex gap-1.5 mt-0.5">
                        <input
                            type="number"
                            min={0}
                            value={(isRed ? adj.foulPointsRed : adj.foulPointsBlue) ?? 0}
                            onChange={e => set(isRed ? { foulPointsRed: Number(e.target.value) || 0, foulsRed: 0 } : { foulPointsBlue: Number(e.target.value) || 0, foulsBlue: 0 })}
                            className="flex-1 px-2.5 py-1.5 bg-muted border border-border rounded-lg font-mono text-sm text-foreground"
                        />
                        {[5, MAJOR_FOUL_POINTS].map(step => (
                            <button
                                key={step}
                                type="button"
                                onClick={() => {
                                    const cur = (isRed ? adj.foulPointsRed : adj.foulPointsBlue) ?? 0;
                                    set(isRed ? { foulPointsRed: cur + step, foulsRed: 0 } : { foulPointsBlue: cur + step, foulsBlue: 0 });
                                }}
                                className="px-2.5 py-1.5 bg-card border border-border rounded-lg font-mono text-xs font-bold text-muted-foreground hover:text-foreground"
                                title={step === 5 ? "Minor foul" : "Major foul"}
                            >
                                +{step}
                            </button>
                        ))}
                    </div>
                    <span className="block text-[10px] text-muted-foreground mt-0.5">Minor = 5 · Major = 15 (igual que "Penalty Points Committed" oficial).</span>
                </label>
                {alliance && (
                    <p className="font-mono text-[10px] text-muted-foreground">
                        Indisciplina en quals (neto): {[alliance.captain, alliance.pick1, alliance.pick2]
                            .filter((t): t is TeamEvolution => !!t)
                            .reduce((s, t) => s + (t.netDiscipline || 0), 0).toFixed(0)} pts/match
                    </p>
                )}
            </div>
        );
    };

    return (
        <div className="bg-card border-2 border-primary/30 rounded-xl p-4 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">
            <div className="flex items-center justify-between">
                <h4 className="font-bold text-foreground text-sm">
                    ✎ {match.name} <span className="font-mono text-muted-foreground text-xs">({match.id})</span>
                </h4>
                <button onClick={onClose} className="text-xs font-bold text-muted-foreground hover:text-foreground px-2 py-1">Cerrar ✕</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sideBlock("red", red)}
                {sideBlock("blue", blue)}
            </div>
            <p className="font-mono text-[11px] text-muted-foreground border-t border-border pt-2">
                Proyección ajustada: <span className="text-danger font-bold">{Math.round(match.redScorePrediction ?? 0)}</span>
                {" – "}
                <span className="text-secondary font-bold">{Math.round(match.blueScorePrediction ?? 0)}</span>
                {" · "}P(roja) {(match.winProbabilityRed * 100).toFixed(0)}%
                {adj.realRed != null && adj.realBlue != null && " · El resultado REAL define al ganador en el bracket."}
            </p>
        </div>
    );
}

/**
 * Estimate vs reality: every match with a captured real score, compared
 * against the model's BASELINE projection (no incident adjustments — that is
 * what was actually forecast before the match).
 */
function EstimateVsRealTable({ bracket, alliances, matchData }: {
    bracket: PlayoffMatch[];
    alliances: Alliance[];
    matchData: Record<string, MatchAdjustment>;
}) {
    const byId = new Map(alliances.map(a => [a.id, a]));
    const rows = bracket
        .filter(m => {
            const adj = matchData[m.id];
            return adj && adj.realRed != null && adj.realBlue != null && m.redAllianceId && m.blueAllianceId;
        })
        .map(m => {
            const adj = matchData[m.id]!;
            const red = byId.get(m.redAllianceId!)!;
            const blue = byId.get(m.blueAllianceId!)!;
            const baseRed = red.totalOPR;
            const baseBlue = blue.totalOPR;
            const predictedWinner = baseRed >= baseBlue ? m.redAllianceId! : m.blueAllianceId!;
            const realWinner = adj.realRed! > adj.realBlue! ? m.redAllianceId! : m.blueAllianceId!;
            return { m, adj, red, blue, baseRed, baseBlue, predictedWinner, realWinner, hit: predictedWinner === realWinner };
        });

    if (rows.length === 0) return null;
    const hits = rows.filter(r => r.hit).length;

    return (
        <div className="bg-card border border-border rounded-xl p-4">
            <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
                <h4 className="font-bold text-foreground text-sm">Estimado vs Real</h4>
                <span className="font-mono text-[11px] text-muted-foreground">
                    Aciertos de ganador: <span className={clsx("font-bold", hits === rows.length ? "text-success" : "text-foreground")}>{hits}/{rows.length}</span>
                </span>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-xs">
                    <thead>
                        <tr className="text-muted-foreground font-mono text-[10px] uppercase tracking-wider border-b border-border">
                            <th className="text-left py-1.5 pr-3">Match</th>
                            <th className="text-center py-1.5 px-3">Estimado</th>
                            <th className="text-center py-1.5 px-3">Real</th>
                            <th className="text-center py-1.5 px-3">Ganador</th>
                            <th className="text-left py-1.5 pl-3">Incidentes</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {rows.map(({ m, adj, red, blue, baseRed, baseBlue, realWinner, hit }) => (
                            <tr key={m.id}>
                                <td className="py-2 pr-3">
                                    <span className="font-bold text-foreground">{m.name}</span>
                                    <span className="block font-mono text-[10px] text-muted-foreground">
                                        <span className="text-danger">A{m.redAllianceId} {allianceTeamsLabel(red)}</span>
                                        {" vs "}
                                        <span className="text-secondary">A{m.blueAllianceId} {allianceTeamsLabel(blue)}</span>
                                    </span>
                                </td>
                                <td className="text-center py-2 px-3 font-mono">
                                    <span className="text-danger">{Math.round(baseRed)}</span>–<span className="text-secondary">{Math.round(baseBlue)}</span>
                                </td>
                                <td className="text-center py-2 px-3 font-mono font-bold">
                                    <span className="text-danger">{adj.realRed}</span>–<span className="text-secondary">{adj.realBlue}</span>
                                </td>
                                <td className="text-center py-2 px-3">
                                    <span className={clsx("font-bold", hit ? "text-success" : "text-danger")}>
                                        {hit ? "✓" : "✗"} A{realWinner}
                                    </span>
                                </td>
                                <td className="py-2 pl-3 text-muted-foreground">
                                    {[
                                        (adj.failedTeamRed != null || adj.failRed) && `⚡ falla ${adj.failedTeamRed ?? `A${m.redAllianceId}`}`,
                                        (adj.failedTeamBlue != null || adj.failBlue) && `⚡ falla ${adj.failedTeamBlue ?? `A${m.blueAllianceId}`}`,
                                        ((adj.foulPointsRed ?? (adj.foulsRed ?? 0) * MAJOR_FOUL_POINTS) > 0) && `⚠ ${adj.foulPointsRed ?? (adj.foulsRed ?? 0) * MAJOR_FOUL_POINTS} pts foul A${m.redAllianceId}`,
                                        ((adj.foulPointsBlue ?? (adj.foulsBlue ?? 0) * MAJOR_FOUL_POINTS) > 0) && `⚠ ${adj.foulPointsBlue ?? (adj.foulsBlue ?? 0) * MAJOR_FOUL_POINTS} pts foul A${m.blueAllianceId}`,
                                    ].filter(Boolean).join(" · ") || "—"}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
