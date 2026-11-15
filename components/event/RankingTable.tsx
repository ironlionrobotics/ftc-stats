"use client";

import { useState, useMemo } from "react";
import { TeamRanking, FTCMatch } from "@/types/scouting";
import clsx from "clsx";
// Trophy and Star removed
import { Users, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { TeamLink } from "@/components/ui/TeamLink";
import InfoTip from "@/components/event/InfoTip";

interface RankingTableProps {
    rankings: TeamRanking[];
    matches?: FTCMatch[];
    onTeamClick?: (teamNumber: number) => void;
    /** Event code, so team links carry the event to the team page. */
    eventCode?: string;
}

interface OprStats {
    opr: number;
    autoOPR: number;
    teleOPR: number;
    netDiscipline: number;
    scheduleLuck: number;
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
    tipAlign?: "start" | "center" | "end";
}

function HeaderWithTooltip({ label, column, tooltip, sortConfig, handleSort, tipAlign }: HeaderWithTooltipProps) {
    return (
        <th className={clsx("p-4 font-bold relative group/head", column && "cursor-pointer hover:bg-muted/50 transition-colors")} onClick={() => column && handleSort(column)}>
            <div className={clsx("flex items-center gap-1 uppercase tracking-widest", column && "justify-center")}>
                <span className={clsx(column === 'opr' && "text-primary")}>{label}</span>
                {column && <SortIcon column={column} sortConfig={sortConfig} />}
                <InfoTip align={tipAlign} className="ml-1">{tooltip}</InfoTip>
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

export default function RankingTable({ rankings, matches = [], onTeamClick, eventCode }: RankingTableProps) {
    const t = useTranslations("RankingTable");
    const tip = (key: "Rs" | "Np" | "Base" | "Auto" | "High" | "Opr" | "Disc" | "Sched", tone?: "Good" | "Bad") => (
        <>
            <strong>{t(`tip${key}Title`)}</strong> {t(`tip${key}Body`)}
            {tone && <><br /><span className={tone === "Good" ? "text-success" : "text-error"}>{t(`tip${key}${tone}`)}</span></>}
        </>
    );
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

        // Schedule strength (suerte de calendario): over QUAL matches, mean
        // partner OPR minus mean opponent OPR. Positive = easy draw (strong
        // partners / weak opponents); negative = hard draw. Lets a team read
        // "ranked 12th but with the 3rd-hardest schedule" — rank alone lies.
        const schedAgg = new Map<number, { p: number; o: number; n: number }>();
        matches.forEach(m => {
            if (m.tournamentLevel !== 'QUALIFICATION') return;
            (['Red', 'Blue'] as const).forEach(alliance => {
                const mine = m.teams.filter(t => t.station.startsWith(alliance));
                const opp = m.teams.filter(t => !t.station.startsWith(alliance));
                const oppAvg = opp.reduce((s, t) => s + (overall.get(t.teamNumber) || 0), 0) / (opp.length || 1);
                mine.forEach(t => {
                    const partners = mine.filter(x => x.teamNumber !== t.teamNumber);
                    const pAvg = partners.reduce((s, x) => s + (overall.get(x.teamNumber) || 0), 0) / (partners.length || 1);
                    const a = schedAgg.get(t.teamNumber) ?? { p: 0, o: 0, n: 0 };
                    a.p += pAvg; a.o += oppAvg; a.n += 1;
                    schedAgg.set(t.teamNumber, a);
                });
            });
        });

        const merged = new Map();
        rankings.forEach(r => {
            const t = r.teamNumber;
            const opr = overall.get(t) || 0;
            const autoOPR = auto.get(t) || 0;
            const teleOPR = opr - autoOPR;
            const netDiscipline = (drawnFoul.get(t) || 0) - (committedFoul.get(t) || 0);
            const sa = schedAgg.get(t);
            const scheduleLuck = sa && sa.n > 0 ? (sa.p - sa.o) / sa.n : 0;
            merged.set(t, { opr, autoOPR, teleOPR, netDiscipline, scheduleLuck });
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
            const stats = oprData.get(rank.teamNumber) || { opr: 0, autoOPR: 0, teleOPR: 0, netDiscipline: 0, scheduleLuck: 0 };
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
        const keys: (string)[] = ['opr', 'autoOPR', 'teleOPR', 'netDiscipline', 'scheduleLuck', 'sortOrder1', 'sortOrder2', 'sortOrder3', 'sortOrder4', 'highScore'];
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
                {t("empty")}
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
                        <tr className="text-muted-foreground border-b border-border text-xs uppercase tracking-widest bg-muted/30">
                            <th className="p-4 font-bold cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('rank')}>
                                <div className="flex items-center gap-1">{t("rank")} <SortIcon column="rank" sortConfig={sortConfig} /></div>
                            </th>
                            <th className="p-4 font-bold">
                                <span className="flex items-center gap-1"><Users size={12} className="inline mr-1 text-secondary" /> {t("team")}</span>
                            </th>
                            <HeaderWithTooltip
                                label={t("rs")} column="sortOrder1"
                                tooltip={tip("Rs")}
                                sortConfig={sortConfig} handleSort={handleSort}
                            />
                            <HeaderWithTooltip
                                label={t("npAvg")} column="sortOrder2"
                                tooltip={tip("Np", "Good")}
                                sortConfig={sortConfig} handleSort={handleSort}
                            />
                            <HeaderWithTooltip
                                label={t("base")} column="sortOrder3"
                                tooltip={tip("Base", "Good")}
                                sortConfig={sortConfig} handleSort={handleSort}
                            />
                            <HeaderWithTooltip
                                label={t("auto")} column="sortOrder4"
                                tooltip={tip("Auto", "Good")}
                                sortConfig={sortConfig} handleSort={handleSort}
                            />
                            <HeaderWithTooltip
                                label={t("high")} column="highScore"
                                tooltip={tip("High")}
                                sortConfig={sortConfig} handleSort={handleSort}
                            />
                            <HeaderWithTooltip
                                label={t("opr")} column="opr"
                                tooltip={tip("Opr", "Good")}
                                sortConfig={sortConfig} handleSort={handleSort} tipAlign="end"
                            />
                            <HeaderWithTooltip
                                label={t("disc")} column="netDiscipline"
                                tooltip={tip("Disc", "Good")}
                                sortConfig={sortConfig} handleSort={handleSort} tipAlign="end"
                            />
                            <HeaderWithTooltip
                                label={t("sched")} column="scheduleLuck"
                                tooltip={tip("Sched", "Bad")}
                                sortConfig={sortConfig} handleSort={handleSort} tipAlign="end"
                            />
                            <th className="p-4 font-bold text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('wins')}>
                                <div className="flex items-center justify-center gap-1">{t("wlt")} <SortIcon column="wins" sortConfig={sortConfig} /></div>
                            </th>
                            <th className="p-4 font-bold text-center cursor-pointer hover:bg-muted/50 transition-colors" onClick={() => handleSort('matchesPlayed')}>
                                <div className="flex items-center justify-center gap-1">{t("plays")} <SortIcon column="matchesPlayed" sortConfig={sortConfig} /></div>
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
                                    <TeamLink team={rank.teamNumber} event={eventCode} className="block text-lg font-bold text-foreground" />
                                    <button
                                        type="button"
                                        onClick={() => onTeamClick?.(rank.teamNumber)}
                                        aria-label={t("openProfile", { team: rank.teamNumber })}
                                        className="block max-w-[150px] truncate text-left text-xs font-medium text-muted-foreground hover:text-foreground"
                                    >
                                        {rank.teamName}
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
                                <td className="p-4 text-center font-mono text-xs">
                                    <span className={rank.scheduleLuck < -3 ? "text-danger font-bold" : rank.scheduleLuck > 3 ? "text-success" : "text-muted-foreground"}
                                        title={rank.scheduleLuck < -3 ? t("schedHard") : rank.scheduleLuck > 3 ? t("schedEasy") : t("schedNeutral")}>
                                        {(rank.scheduleLuck > 0 ? "+" : "") + rank.scheduleLuck.toFixed(1)}
                                    </span>
                                </td>
                                <td className="p-4 text-center">
                                    <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted font-mono text-xs">
                                        <span className="text-success font-bold">{rank.wins}</span>
                                        <span className="text-muted-foreground/30">/</span>
                                        <span className="text-muted-foreground font-bold">{rank.losses}</span>
                                        <span className="text-muted-foreground/30">/</span>
                                        <span className="text-muted-foreground font-bold">{rank.ties}</span>
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
