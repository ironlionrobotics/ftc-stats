"use client";

import { useState } from "react";
import { FTCEvent } from "@/types/ftc";
import { analyzeMultipleEvents, EventAnalysisData, TeamEvolution } from "@/app/actions/analytics";
import EventSelector from "./EventSelector";
import ComparisonView from "./ComparisonView";
import { Loader2, Play } from "lucide-react";

interface AnalyticsDashboardProps {
    initialEvents: FTCEvent[];
    season: number;
}

export default function AnalyticsDashboard({ initialEvents, season }: AnalyticsDashboardProps) {
    const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [maxRounds, setMaxRounds] = useState<number>(0);
    const [data, setData] = useState<{ eventStats: EventAnalysisData[], teamEvolution: TeamEvolution[] } | null>(null);

    const toggleEvent = (code: string) => {
        setSelectedCodes(prev =>
            prev.includes(code)
                ? prev.filter(c => c !== code)
                : [...prev, code]
        );
    };

    const runAnalysis = async () => {
        if (selectedCodes.length === 0) return;

        setIsLoading(true);
        try {
            const result = await analyzeMultipleEvents(season, selectedCodes, maxRounds);
            setData(result);
        } catch (error) {
            console.error("Analysis failed", error);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleAll = (shouldSelectAll: boolean) => {
        if (shouldSelectAll) {
            setSelectedCodes(initialEvents.map(e => e.code));
        } else {
            setSelectedCodes([]);
        }
    };

    return (
        <div className="space-y-8">
            <div className="bg-card border border-border rounded-2xl p-6 shadow-xl">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                    <div>
                        <h2 className="text-xl font-bold text-foreground">Selección de Eventos</h2>
                        <p className="text-sm text-muted-foreground">Selecciona 2 o más eventos para comparar rendimiento y consistencia.</p>
                    </div>

                    <div className="flex flex-col gap-2 min-w-[200px]">
                        <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Simulación de Torneo</label>
                        <div className="flex items-center gap-3 bg-muted/30 p-2 rounded-lg border border-border">
                            <span className="text-xs font-bold text-primary whitespace-nowrap">Ronda {maxRounds === 0 ? 'FINAL' : maxRounds}</span>
                            <input
                                type="range"
                                min="1"
                                max="6"
                                step="1"
                                value={maxRounds === 0 ? 6 : maxRounds}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value);
                                    setMaxRounds(val === 6 ? 0 : val);
                                }}
                                className="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
                            />
                        </div>
                    </div>

                    <button
                        onClick={runAnalysis}
                        disabled={selectedCodes.length < 1 || isLoading}
                        className="px-8 py-3 bg-primary hover:bg-primary/80 disabled:bg-muted disabled:text-muted-foreground text-white rounded-xl font-bold transition-all flex items-center gap-2 shadow-lg shadow-primary/20 disabled:shadow-none"
                    >
                        {isLoading ? (
                            <>
                                <Loader2 className="animate-spin" /> Procesando...
                            </>
                        ) : (
                            <>
                                <Play fill="currentColor" size={16} /> Analizar Datos
                            </>
                        )}
                    </button>
                </div>

                <EventSelector
                    events={initialEvents}
                    selectedCodes={selectedCodes}
                    onToggle={toggleEvent}
                    onToggleAll={toggleAll}
                />
            </div>

            {data && !isLoading && (
                <ComparisonView
                    eventStats={data.eventStats}
                    teamEvolution={data.teamEvolution}
                />
            )}
        </div>
    );
}
