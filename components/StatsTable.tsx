"use client";

import { useState } from "react";
import { AggregatedTeamStats } from "@/types/ftc";
import { Card } from "./ui/Card";
import { motion } from "framer-motion";
import { ArrowUpDown, Search, Trophy, Medal, Star, Calculator, BarChart3 } from "lucide-react";
import { clsx } from "clsx";

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
        <Card className="w-full overflow-hidden p-0">
            <div className="p-6 border-b border-white/10 flex flex-col gap-6">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <h2 className="text-2xl font-bold font-display text-white flex items-center gap-2">
                        {viewMode === 'qualification' ? <Trophy className="text-accent" /> : <Calculator className="text-secondary" />}
                        {viewMode === 'qualification' ? 'Rankings de Clasificación' : 'Reporte de Avance'}
                    </h2>

                    <div className="flex bg-white/5 rounded-lg p-1 border border-white/10">
                        <button
                            onClick={() => { setViewMode('qualification'); setSortField('averageRS'); }}
                            className={clsx(
                                "px-4 py-2 rounded-md text-sm font-medium transition-all",
                                viewMode === 'qualification' ? "bg-primary text-white shadow-lg" : "text-gray-400 hover:text-white"
                            )}
                        >
                            Rankings
                        </button>
                        <button
                            onClick={() => { setViewMode('advancement'); setSortField('totalPoints'); }}
                            className={clsx(
                                "px-4 py-2 rounded-md text-sm font-medium transition-all",
                                viewMode === 'advancement' ? "bg-secondary text-white shadow-lg" : "text-gray-400 hover:text-white"
                            )}
                        >
                            Advancement
                        </button>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row gap-4 items-center">
                    <div className="relative flex-1 w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" />
                        <input
                            type="text"
                            placeholder="Buscar equipo..."
                            className="pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-sm w-full transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <button
                        onClick={() => setShowAdvancedOnly(!showAdvancedOnly)}
                        className={clsx(
                            "flex items-center gap-2 px-6 py-3 rounded-xl border font-bold transition-all whitespace-nowrap",
                            showAdvancedOnly
                                ? "bg-secondary/20 border-secondary text-secondary shadow-[0_0_20px_rgba(139,92,246,0.3)]"
                                : "bg-white/5 border-white/10 text-gray-400 hover:text-white hover:bg-white/10"
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
                        <tr className="bg-white/5 border-b border-white/5 text-gray-400 text-sm uppercase tracking-wider">
                            <th className="p-3 text-center w-12 text-xs font-medium">#</th>
                            <th className="p-3 cursor-pointer hover:text-white transition-colors" onClick={() => handleSort('teamNumber')}>
                                <div className="flex items-center gap-2 text-xs">Equipo <ArrowUpDown size={12} /></div>
                            </th>

                            {viewMode === 'qualification' && (
                                <>
                                    <th className="p-3 cursor-pointer hover:text-white transition-colors text-center whitespace-nowrap" onClick={() => handleSort('averageRS')}>
                                        <div className="flex items-center justify-center gap-1.5 text-xs">RS <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-3 cursor-pointer hover:text-white transition-colors text-center whitespace-nowrap" onClick={() => handleSort('averageMatchPoints')}>
                                        <div className="flex items-center justify-center gap-1.5 text-xs">Match <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-3 cursor-pointer hover:text-white transition-colors text-center whitespace-nowrap" onClick={() => handleSort('averageBasePoints')}>
                                        <div className="flex items-center justify-center gap-1.5 text-xs">Base <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-3 cursor-pointer hover:text-white transition-colors text-center whitespace-nowrap" onClick={() => handleSort('averageAutoPoints')}>
                                        <div className="flex items-center justify-center gap-1.5 text-xs">Auto <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-3 cursor-pointer hover:text-white transition-colors text-center whitespace-nowrap" onClick={() => handleSort('averageHighScore')}>
                                        <div className="flex items-center justify-center gap-1.5 text-xs">Máximo <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-3 cursor-pointer hover:text-white transition-colors text-center whitespace-nowrap" onClick={() => handleSort('totalWins')}>
                                        <div className="flex items-center justify-center gap-1.5 text-xs">W-L-T <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                </>
                            )}

                            {viewMode === 'advancement' && (
                                <>
                                    <th className="p-3 cursor-pointer hover:text-white transition-colors text-center whitespace-nowrap" onClick={() => handleSort('totalPoints')}>
                                        <div className="flex items-center justify-center gap-1.5 text-xs">Total Pts <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-3 cursor-pointer hover:text-white transition-colors text-center whitespace-nowrap" onClick={() => handleSort('judging')}>
                                        <div className="flex items-center justify-center gap-1.5 text-xs">Judging <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-3 cursor-pointer hover:text-white transition-colors text-center whitespace-nowrap" onClick={() => handleSort('playoff')}>
                                        <div className="flex items-center justify-center gap-1.5 text-xs">Playoff <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-3 cursor-pointer hover:text-white transition-colors text-center whitespace-nowrap" onClick={() => handleSort('selection')}>
                                        <div className="flex items-center justify-center gap-1.5 text-xs">Alianza <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                    <th className="p-3 cursor-pointer hover:text-white transition-colors text-center whitespace-nowrap" onClick={() => handleSort('qualification')}>
                                        <div className="flex items-center justify-center gap-1.5 text-xs">Qual Pts <ArrowUpDown size={12} className="flex-shrink-0" /></div>
                                    </th>
                                </>
                            )}

                            <th className="p-3 text-center text-xs">Eventos</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                        {filteredData.map((team, index) => (
                            <motion.tr
                                key={team.teamNumber}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: index * 0.05 }}
                                className={clsx(
                                    "transition-colors group",
                                    team.hasAdvanced ? "bg-secondary/20 hover:bg-secondary/30" : "hover:bg-white/5"
                                )}
                            >
                                <td className="p-3 text-center text-xs text-gray-500 font-medium">
                                    {index + 1}
                                </td>
                                <td className="p-3">
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-white text-lg font-display">{team.teamNumber}</span>
                                            {team.hasAdvanced && (
                                                <span className="px-1.5 py-0.5 rounded-full bg-secondary/20 border border-secondary/30 text-[10px] text-secondary font-bold uppercase tracking-tighter">
                                                    Clasificado
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-gray-400 text-sm group-hover:text-primary transition-colors">{team.teamName}</span>
                                    </div>
                                </td>

                                {viewMode === 'qualification' && (
                                    <>
                                        <td className="p-3 text-center text-accent font-bold text-lg">{team.averageRS.toFixed(2)}</td>
                                        <td className="p-3 text-center text-white">{team.averageMatchPoints.toFixed(2)}</td>
                                        <td className="p-3 text-center text-white">{team.averageBasePoints.toFixed(2)}</td>
                                        <td className="p-3 text-center text-white">{team.averageAutoPoints.toFixed(2)}</td>
                                        <td className="p-3 text-center text-white">{Math.round(team.averageHighScore)}</td>
                                        <td className="p-3 text-center text-gray-300 whitespace-nowrap text-sm">
                                            {team.totalWins}-{team.totalLosses}-{team.totalTies}
                                        </td>
                                    </>
                                )}

                                {viewMode === 'advancement' && (
                                    <>
                                        <td className="p-3 text-center text-white font-bold text-lg">{team.advancementPoints.total}</td>
                                        <td className="p-3 text-center text-gray-400">{team.advancementPoints.judging}</td>
                                        <td className="p-3 text-center text-gray-400">{team.advancementPoints.playoff}</td>
                                        <td className="p-3 text-center text-gray-400">{team.advancementPoints.selection}</td>
                                        <td className="p-3 text-center text-gray-400">{team.advancementPoints.qualification}</td>
                                    </>
                                )}

                                <td className="p-3 text-center">
                                    <div className="flex justify-center flex-wrap gap-2">
                                        {team.events.map((e) => (
                                            <span key={e.eventCode} className="px-2 py-1 rounded bg-white/10 text-[10px] border border-white/5 text-gray-300">
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
                <div className="p-12 text-center text-gray-500">
                    No se encontraron equipos.
                </div>
            )}
        </Card>
    );
}
