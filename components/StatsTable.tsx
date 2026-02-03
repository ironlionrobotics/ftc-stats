"use client";

import { useState } from "react";
import { AggregatedTeamStats } from "@/types/ftc";
import { Card } from "./ui/Card";
import { motion } from "framer-motion";
import { ArrowUpDown, Search, Trophy, Star, Calculator } from "lucide-react";
import { clsx } from "clsx";
import Link from "next/link";

interface StatsTableProps {
    data: AggregatedTeamStats[];
}

type SortField = 'averageRS' | 'averageMatchPoints' | 'averageBasePoints' | 'averageAutoPoints' | 'averageHighScore' | 'totalWins' | 'averageRank' | 'teamNumber' | 'totalPoints' | 'judging' | 'playoff' | 'selection' | 'qualification';
type ViewMode = 'qualification' | 'advancement';

export default function StatsTable({ data }: StatsTableProps) {
    const [searchTerm, setSearchTerm] = useState("");
    const [sortField, setSortField] = useState<SortField>('averageRS');
    const [sortDesc, setSortDesc] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('qualification');
    const [showAdvancedOnly, setShowAdvancedOnly] = useState(false);

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDesc(!sortDesc);
        } else {
            setSortField(field);
            setSortDesc(true);
        }
    };

    const filteredData = data
        .filter(
            (team) => {
                const matchesSearch = team.teamNumber.toString().includes(searchTerm) ||
                    team.teamName.toLowerCase().includes(searchTerm.toLowerCase());
                const matchesAdvanced = showAdvancedOnly ? team.hasAdvanced : true;
                return matchesSearch && matchesAdvanced;
            }
        )
        .sort((a, b) => {
            let valA: number;
            let valB: number;

            if (sortField === 'totalPoints') {
                valA = a.advancementPoints.total;
                valB = b.advancementPoints.total;
            } else if (sortField === 'judging') {
                valA = a.advancementPoints.judging;
                valB = b.advancementPoints.judging;
            } else if (sortField === 'playoff') {
                valA = a.advancementPoints.playoff;
                valB = b.advancementPoints.playoff;
            } else if (sortField === 'selection') {
                valA = a.advancementPoints.selection;
                valB = b.advancementPoints.selection;
            } else if (sortField === 'qualification') {
                valA = a.advancementPoints.qualification;
                valB = b.advancementPoints.qualification;
            } else {
                valA = a[sortField as keyof AggregatedTeamStats] as number;
                valB = b[sortField as keyof AggregatedTeamStats] as number;
            }

            return sortDesc ? (valB > valA ? 1 : -1) : (valA > valB ? 1 : -1);
        });

    return (
        <Card className="w-full overflow-hidden p-0 bg-card border-border">
            <div className="pt-4 pb-4 px-4 border-b border-border flex flex-col gap-4">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <h2 className="text-2xl font-bold font-display text-foreground flex items-center gap-2">
                        {viewMode === 'qualification' ? <Trophy className="text-primary" /> : <Calculator className="text-secondary" />}
                        {viewMode === 'qualification' ? 'Rankings de Clasificación' : 'Reporte de Avance'}
                    </h2>

                    <div className="flex bg-muted rounded-lg p-1 border border-border">
                        <button
                            onClick={() => { setViewMode('qualification'); setSortField('averageRS'); }}
                            className={clsx(
                                "px-4 py-2 rounded-md text-sm font-bold transition-all",
                                viewMode === 'qualification' ? "bg-primary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Rankings
                        </button>
                        <button
                            onClick={() => { setViewMode('advancement'); setSortField('totalPoints'); }}
                            className={clsx(
                                "px-4 py-2 rounded-md text-sm font-bold transition-all",
                                viewMode === 'advancement' ? "bg-secondary text-white shadow-lg" : "text-muted-foreground hover:text-foreground"
                            )}
                        >
                            Advancement
                        </button>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Buscar equipo..."
                            className="pl-10 pr-4 py-3 bg-muted border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm w-full transition-all text-foreground placeholder:text-muted-foreground"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={() => setShowAdvancedOnly(!showAdvancedOnly)}
                        className={clsx(
                            "flex items-center gap-2 px-6 py-3 rounded-xl border font-bold transition-all whitespace-nowrap",
                            showAdvancedOnly
                                ? "bg-secondary/10 border-secondary/30 text-secondary shadow-lg shadow-secondary/10"
                                : "bg-muted border-border text-muted-foreground hover:text-foreground hover:bg-muted/80"
                        )}
                    >
                        <Star className={clsx("w-4 h-4", showAdvancedOnly ? "fill-secondary" : "")} />
                        Clasificados
                    </button>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-muted/50 border-b border-border text-muted-foreground text-[10px] uppercase tracking-widest">
                            <th className="p-4 text-center w-12 font-bold">#</th>
                            <th className="p-4 cursor-pointer hover:text-foreground transition-colors" onClick={() => handleSort('teamNumber')}>
                                <div className="flex items-center gap-2">Equipo <ArrowUpDown size={12} /></div>
                            </th>

                            {viewMode === 'qualification' && (
                                <>
                                    <th className="p-4 cursor-pointer hover:text-foreground transition-colors text-center whitespace-nowrap" onClick={() => handleSort('averageRS')}>
                                        <div className="flex items-center justify-center gap-1.5">RS <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-foreground transition-colors text-center whitespace-nowrap" onClick={() => handleSort('averageMatchPoints')}>
                                        <div className="flex items-center justify-center gap-1.5">Match <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-foreground transition-colors text-center whitespace-nowrap" onClick={() => handleSort('averageBasePoints')}>
                                        <div className="flex items-center justify-center gap-1.5">Base <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-foreground transition-colors text-center whitespace-nowrap" onClick={() => handleSort('averageAutoPoints')}>
                                        <div className="flex items-center justify-center gap-1.5">Auto <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-foreground transition-colors text-center whitespace-nowrap" onClick={() => handleSort('averageHighScore')}>
                                        <div className="flex items-center justify-center gap-1.5">Máximo <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-foreground transition-colors text-center whitespace-nowrap" onClick={() => handleSort('totalWins')}>
                                        <div className="flex items-center justify-center gap-1.5">W-L-T <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                </>
                            )}

                            {viewMode === 'advancement' && (
                                <>
                                    <th className="p-4 cursor-pointer hover:text-foreground transition-colors text-center whitespace-nowrap" onClick={() => handleSort('totalPoints')}>
                                        <div className="flex items-center justify-center gap-1.5">Total Pts <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-foreground transition-colors text-center whitespace-nowrap" onClick={() => handleSort('judging')}>
                                        <div className="flex items-center justify-center gap-1.5">Judging <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-foreground transition-colors text-center whitespace-nowrap" onClick={() => handleSort('playoff')}>
                                        <div className="flex items-center justify-center gap-1.5">Playoff <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-foreground transition-colors text-center whitespace-nowrap" onClick={() => handleSort('selection')}>
                                        <div className="flex items-center justify-center gap-1.5">Alianza <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-4 cursor-pointer hover:text-foreground transition-colors text-center whitespace-nowrap" onClick={() => handleSort('qualification')}>
                                        <div className="flex items-center justify-center gap-1.5">Qual Pts <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                </>
                            )}

                            <th className="p-4 text-center">Eventos</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                        {filteredData.map((team, index) => (
                            <motion.tr
                                key={team.teamNumber}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: index * 0.05 }}
                                className={clsx(
                                    "transition-colors group",
                                    team.hasAdvanced ? "bg-secondary/5 hover:bg-secondary/10" : "hover:bg-muted/30"
                                )}
                            >
                                <td className="p-4 text-center text-xs text-muted-foreground font-medium">
                                    {index + 1}
                                </td>
                                <td className="p-4">
                                    <Link href={`/team/${team.teamNumber}`} className="flex flex-col group/link">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-foreground text-lg font-display group-hover/link:text-primary transition-colors">{team.teamNumber}</span>
                                        </div>
                                        <span className="text-muted-foreground text-xs group-hover/link:text-primary transition-colors">{team.teamName}</span>
                                    </Link>
                                </td>

                                {viewMode === 'qualification' && (
                                    <>
                                        <td className="p-4 text-center text-primary font-bold text-lg">{team.averageRS.toFixed(2)}</td>
                                        <td className="p-4 text-center text-foreground font-medium">{team.averageMatchPoints.toFixed(2)}</td>
                                        <td className="p-4 text-center text-muted-foreground">{team.averageBasePoints.toFixed(2)}</td>
                                        <td className="p-4 text-center text-muted-foreground">{team.averageAutoPoints.toFixed(2)}</td>
                                        <td className="p-4 text-center text-foreground font-bold">{Math.round(team.averageHighScore)}</td>
                                        <td className="p-4 text-center whitespace-nowrap">
                                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-[10px] font-mono">
                                                <span className="text-green-600 dark:text-green-500">{team.totalWins}</span>
                                                <span className="text-muted-foreground/30">-</span>
                                                <span className="text-red-600 dark:text-red-500">{team.totalLosses}</span>
                                                <span className="text-muted-foreground/30">-</span>
                                                <span className="text-blue-600 dark:text-blue-500">{team.totalTies}</span>
                                            </div>
                                        </td>
                                    </>
                                )}

                                {viewMode === 'advancement' && (
                                    <>
                                        <td className="p-4 text-center text-foreground font-bold text-lg">{team.advancementPoints.total}</td>
                                        <td className="p-4 text-center text-muted-foreground">{team.advancementPoints.judging}</td>
                                        <td className="p-4 text-center text-muted-foreground">{team.advancementPoints.playoff}</td>
                                        <td className="p-4 text-center text-muted-foreground">{team.advancementPoints.selection}</td>
                                        <td className="p-4 text-center text-muted-foreground">{team.advancementPoints.qualification}</td>
                                    </>
                                )}

                                <td className="p-4 text-center">
                                    <div className="flex justify-center flex-wrap gap-2">
                                        {team.events.map((e) => (
                                            <span key={e.eventCode} className="px-2 py-1 rounded bg-muted text-[10px] border border-border text-muted-foreground">
                                                {e.eventCode}
                                            </span>
                                        ))}
                                    </div>
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {filteredData.length === 0 && (
                <div className="p-12 text-center text-muted-foreground italic">
                    No se encontraron equipos bajo estos criterios.
                </div>
            )}
        </Card>
    );
}
