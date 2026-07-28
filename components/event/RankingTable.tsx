"use client";

import { useState, useMemo } from "react";
import { TeamRanking, FTCMatch } from "@/types/scouting";
import clsx from "clsx";
// Trophy and Star removed
import { Users, ArrowUpDown, ArrowUp, ArrowDown, Info } from "lucide-react";

interface RankingTableProps {
    rankings: TeamRanking[];
    matches?: FTCMatch[];
    onTeamClick?: (teamNumber: number) => void;
}

interface OprStats {
    opr: number;
    autoOPR: number;
    teleOPR: number;
    netDiscipline: number;
}

type TableRow = TeamRanking & OprStats & { highScore: number; wlt: string };

type SortConfig = { key: string; direction: 'asc' | 'desc' };

interface SortIconProps {
    column: string;
    sortConfig: SortConfig;
}

function SortIcon({ column, sortConfig }: SortIconProps) {
    if (sortConfig.key !== column) return <ArrowUpDown size={12} className="ml-1 text-muted-foreground/30" />;
    return sortConfig.direction === 'asc'
        ? <ArrowUp size={12} className="ml-1 text-primary" />
        : <ArrowDown size={12} className="ml-1 text-primary" />;
}

interface HeaderWithTooltipProps {
    label: string;
    column?: string;
    tooltip: React.ReactNode;
    sortConfig: SortConfig;
    handleSort: (key: string) => void;
}

function HeaderWithTooltip({ label, column, tooltip, sortConfig, handleSort }: HeaderWithTooltipProps) {
    return (
        <th className={clsx("p-4 font-bold relative group/head", column && "cursor-pointer hover:bg-muted/50 transition-colors")} onClick={() => column && handleSort(column)}>
            <div className={clsx("flex items-center gap-1 uppercase tracking-widest", column && "justify-center")}>
                <span className={clsx(column === 'opr' && "text-primary")}>{label}</span>
                {column && <SortIcon column={column} sortConfig={sortConfig} />}
                <div className="group/tip relative inline-block ml-1">
                    <Info size={10} className="text-muted-foreground/50 hover:text-primary transition-colors cursor-help" />
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-2 bg-card border border-border text-foreground text-[10px] rounded-lg shadow-sm opacity-0 invisible group-hover/tip:opacity-100 group-hover/tip:visible transition-all z-50 pointer-events-none text-left leading-relaxed font-normal normal-case tracking-normal">
                        {tooltip}
                    </div>
                </div>
            </div>
        </th>
    );
}

interface HighlightValueProps {
    value: number;
    column: string;
    formatted: string;
    extremes: Record<string, { max: number; min: number }>;
}

function HighlightValue({ value, column, formatted, extremes }: HighlightValueProps) {
    const isMax = value === extremes[column]?.max && value > 0;
    const isMin = value === extremes[column]?.min && value < 0;

    return (
        <span className={clsx(
            "transition-all",
            isMax && "text-warning font-black scale-110",
            isMin && "text-danger font-black scale-110"
        )}>
            {formatted}
        </span>
    );
}

export default function RankingTable({ rankings, matches = [], onTeamClick }: RankingTableProps) {
    // State for sorting
    const [sortConfig, setSortConfig] = useState<SortConfig>({ key: 'rank', direction: 'asc' });

    // 1. Calculate OPR Metrics (Duplicated logic from MatchList for self-containment/consistency)
    // In a larger refactor, this should move to a shared hook/context.
    const oprData = useMemo(() => {
        if (!matches.length || !rankings.length) return new Map<number, OprStats>();

        const calculateComponentOPR = (getValue: (m: FTCMatch, alliance: 'Red' | 'Blue') => number) => {
            const teamsList = rankings.map(r => r.teamNumber);
            const n = teamsList.length;
            const teamToIndex = new Map(teamsList.map((t, i) => [t, i]));
            const A = Array.from({ length: n }, () => new Float64Array(n));
            const B = new Float64Array(n);

            matches.forEach(m => {
                if (m.tournamentLevel === 'PRACTICE') return;
                const process = (alliance: 'Red' | 'Blue') => {
                    const allianceTeams = m.teams.filter(t => t.station.startsWith(alliance));
                    const indices = allianceTeams.map(t => teamToIndex.get(t.teamNumber)).filter((idx): idx is number => idx !== undefined);
                    const value = getValue(m, alliance);
                    indices.forEach(i => {
                        B[i] += value;
                        indices.forEach(j => { A[i][j] += 1; });
                    });
                };
                process('Red');
                process('Blue');
            });

            // Gauss-Seidel Solver (100 iterations for convergence)
            const x = new Float64Array(n).fill(0);
            for (let iter = 0; iter < 100; iter++) {
                for (let i = 0; i < n; i++) {
                    let sum = 0;
                    for (let j = 0; j < n; j++) if (i !== j) sum += A[i][j] * x[j];
                    if (A[i][i] > 0) x[i] = (B[i] - sum) / A[i][i];
                }
            }
            return new Map(teamsList.map((t, i) => [t, x[i]]));
        };

        const overall = calculateComponentOPR((m, alliance) => alliance === 'Red' ? (m.scoreRedFinal - m.scoreBlueFoul) : (m.scoreBlueFinal - m.scoreRedFoul));
        const auto = calculateComponentOPR((m, alliance) => alliance === 'Red' ? m.scoreRedAuto : m.scoreBlueAuto);
        const drawnFoul = calculateComponentOPR((m, alliance) => alliance === 'Red' ? m.scoreBlueFoul : m.scoreRedFoul);
        const committedFoul = calculateComponentOPR((m, alliance) => alliance === 'Red' ? m.scoreRedFoul : m.scoreBlueFoul);

        const merged = new Map();
        rankings.forEach(r => {
            const t = r.teamNumber;
            const opr = overall.get(t) || 0;
            const autoOPR = auto.get(t) || 0;
            const teleOPR = opr - autoOPR;
            const netDiscipline = (drawnFoul.get(t) || 0) - (committedFoul.get(t) || 0);
            merged.set(t, { opr, autoOPR, teleOPR, netDiscipline });
        });
        return merged;
    }, [matches, rankings]);

    // 2. Prepare Data for Table
    const tableData = useMemo(() => {
        // Pre-calculate High Scores per team
        const highScores = new Map<number, number>();
        matches.forEach(m => {
            if (m.tournamentLevel === "PRACTICE") return;
            m.teams.forEach(t => {
                const isRed = t.station.startsWith("Red");
                const score = isRed ? m.scoreRedFinal : m.scoreBlueFinal;
                highScores.set(t.teamNumber, Math.max(highScores.get(t.teamNumber) || 0, score));
            });
        });

        return rankings.map(rank => {
            const stats = oprData.get(rank.teamNumber) || { opr: 0, autoOPR: 0, teleOPR: 0, netDiscipline: 0 };
            return {
                ...rank,
                ...stats,
                highScore: highScores.get(rank.teamNumber) || 0,
                wlt: `${rank.wins}-${rank.losses}-${rank.ties}`
            };
        });
    }, [rankings, oprData, matches]);

    // 3. Sorting Logic
    const sortedData = useMemo(() => {
        const sorted = [...tableData];
        sorted.sort((a, b) => {
            const aValue = (a as TableRow)[sortConfig.key as keyof TableRow];
            const bValue = (b as TableRow)[sortConfig.key as keyof TableRow];

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return sorted;
    }, [tableData, sortConfig]);

    // 4. Calculate Column Extremes for Highlighting
    const extremes = useMemo(() => {
        const keys: (string)[] = ['opr', 'autoOPR', 'teleOPR', 'netDiscipline', 'sortOrder1', 'sortOrder2', 'sortOrder3', 'sortOrder4', 'highScore'];
        const result: Record<string, { max: number, min: number }> = {};

        keys.forEach(k => {
            const values = tableData.map(d => (d as TableRow)[k as keyof TableRow] as number);
            result[k] = {
                max: Math.max(...values),
                min: Math.min(...values)
            };
        });
        return result;
    }, [tableData]);

    if (!rankings || rankings.length === 0) {
        return (
            <div className="text-muted-foreground italic text-center py-8 bg-muted rounded-2xl border border-border">
                No ranking data available for this event yet.
            </div>
        );
    }

    const handleSort = (key: string) => {
        setSortConfig((current: SortConfig) => ({
            key,
            direction: current.key === key && current.direction === 'desc' ? 'asc' : 'desc'
        }));
    };

    return (
        <div className="bg-card border border-border rounded-2xl shadow-sm">
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-muted-foreground border-b border-border text-[10px] uppercase tracking-widest bg-muted/30">
                            <th className="p-4 font-bold cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('rank')}>
                                <div className="flex items-center gap-1">Rank <SortIcon column="rank" sortConfig={sortConfig} /></div>
                            </th>
                            <th className="p-4 font-bold">
                                <span className="flex items-center gap-1"><Users size={12} className="inline mr-1 text-secondary" /> Team</span>
                            </th>
                            <HeaderWithTooltip
                                label="RS" column="sortOrder1"
                                tooltip={<><strong>Ranking Score:</strong> Principal métrica oficial (RP). <br /> <span className="text-success">(+) Alto:</span> Mejor posición competitiva.</>}
                                sortConfig={sortConfig} handleSort={handleSort}
                            />
                            <HeaderWithTooltip
                                label="NP Avg" column="sortOrder2"
                                tooltip={<><strong>Match Points (Avg):</strong> Promedio de puntos sin penalizaciones. <br /> <span className="text-success">(+) Alto:</span> Potencia bruta de la alianza.</>}
                                sortConfig={sortConfig} handleSort={handleSort}
                            />
                            <HeaderWithTooltip
                                label="Base" column="sortOrder3"
                                tooltip={<><strong>Base Points:</strong> Puntos promedio de juego manual. <br /> <span className="text-success">(+) Alto:</span> Consistencia en TeleOp.</>}
                                sortConfig={sortConfig} handleSort={handleSort}
                            />
                            <HeaderWithTooltip
                                label="Auto" column="sortOrder4"
                                tooltip={<><strong>Auto Pts:</strong> Puntos promedio en autónomo oficial. <br /> <span className="text-success">(+) Alto:</span> Capacidad de inicio.</>}
                                sortConfig={sortConfig} handleSort={handleSort}
                            />
                            <HeaderWithTooltip
                                label="High" column="highScore"
                                tooltip={<><strong>High Score:</strong> Puntaje más alto logrado en el evento.</>}
                                sortConfig={sortConfig} handleSort={handleSort}
                            />
                            <HeaderWithTooltip
                                label="OPR" column="opr"
                                tooltip={<><strong>Offensive Power Rating:</strong> Contribución ofensiva individual estimada. <br /> <span className="text-success">(+) Alto:</span> Máxima anotación propia.</>}
                                sortConfig={sortConfig} handleSort={handleSort}
                            />
                            <HeaderWithTooltip
                                label="Disc" column="netDiscipline"
                                tooltip={<><strong>Net Discipline:</strong> Diferencia entre faltas provocadas y cometidas. <br /> <span className="text-success">(+) Mastermind</span></>}
                                sortConfig={sortConfig} handleSort={handleSort}
                            />
                            <th className="p-4 font-bold text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('wins')}>
                                <div className="flex items-center justify-center gap-1">W-L-T <SortIcon column="wins" sortConfig={sortConfig} /></div>
                            </th>
                            <th className="p-4 font-bold text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('matchesPlayed')}>
                                <div className="flex items-center justify-center gap-1">Plays <SortIcon column="matchesPlayed" sortConfig={sortConfig} /></div>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {sortedData.map((rank: TableRow) => (
                            <tr key={rank.teamNumber} className="hover:bg-muted/50 transition-colors group">
                                <td className="p-4">
                                    <div className={clsx(
                                        "w-8 h-8 rounded-lg flex items-center justify-center font-bold font-display text-sm",
                                        rank.rank === 1 ? "bg-warning/20 text-warning border border-warning/20" :
                                            rank.rank === 2 ? "bg-muted-foreground/20 text-muted-foreground border border-muted-foreground/20" :
                                                rank.rank === 3 ? "bg-warning/20 text-warning border border-warning/20" :
                                                    "bg-muted text-muted-foreground"
                                    )}>
                                        {rank.rank}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <button onClick={() => onTeamClick?.(rank.teamNumber)} className="text-left w-full group-hover:text-primary transition-colors">
                                        <div className="font-bold text-foreground text-lg">{rank.teamNumber}</div>
                                        <div className="text-[10px] text-muted-foreground font-medium truncate max-w-[150px]">{rank.teamName}</div>
                                    </button>
                                </td>
                                <td className="p-4 text-center text-sm font-bold">
                                    <HighlightValue value={rank.sortOrder1} column="sortOrder1" formatted={rank.sortOrder1.toFixed(2)} extremes={extremes} />
                                </td>
                                <td className="p-4 text-center text-sm text-muted-foreground">
                                    <HighlightValue value={rank.sortOrder2} column="sortOrder2" formatted={rank.sortOrder2.toFixed(1)} extremes={extremes} />
                                </td>
                                <td className="p-4 text-center text-sm text-muted-foreground">
                                    <HighlightValue value={rank.sortOrder3} column="sortOrder3" formatted={rank.sortOrder3.toFixed(1)} extremes={extremes} />
                                </td>
                                <td className="p-4 text-center text-sm text-muted-foreground">
                                    <HighlightValue value={rank.sortOrder4} column="sortOrder4" formatted={rank.sortOrder4.toFixed(1)} extremes={extremes} />
                                </td>
                                <td className="p-4 text-center text-sm">
                                    <HighlightValue value={rank.highScore} column="highScore" formatted={rank.highScore.toString()} extremes={extremes} />
                                </td>
                                <td className="p-4 text-center font-mono text-primary font-bold">
                                    <HighlightValue value={rank.opr} column="opr" formatted={rank.opr.toFixed(1)} extremes={extremes} />
                                </td>
                                <td className="p-4 text-center font-mono text-xs">
                                    <HighlightValue
                                        value={rank.netDiscipline}
                                        column="netDiscipline"
                                        formatted={(rank.netDiscipline > 0 ? "+" : "") + rank.netDiscipline.toFixed(1)}
                                        extremes={extremes}
                                    />
                                </td>
                                <td className="p-4 text-center">
                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted font-mono text-[10px]">
                                        <span className="text-success font-bold">{rank.wins}</span>
                                        <span className="text-muted-foreground/30">/</span>
                                        <span className="text-danger font-bold">{rank.losses}</span>
                                        <span className="text-muted-foreground/30">/</span>
                                        <span className="text-secondary font-bold">{rank.ties}</span>
                                    </div>
                                </td>
                                <td className="p-4 text-center text-sm text-muted-foreground">
                                    {rank.matchesPlayed}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
