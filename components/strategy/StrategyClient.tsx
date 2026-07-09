"use client";

import dynamic from "next/dynamic";
import { AggregatedTeamStats } from "@/types/scouting";
import AllianceSelector from "./AllianceSelector";
import MatchSimulator from "./MatchSimulator";
import MatchBriefingCard from "./MatchBriefingCard";
import LiveRankingProjection from "./LiveRankingProjection";

// PicklistEditor pulls all of @dnd-kit (~200KB raw). Most strategy-page
// visits don't immediately touch the picklist tab; defer loading until the
// tab is actually selected.
const PicklistEditor = dynamic(() => import("./PicklistEditor"), {
    ssr: false,
    loading: () => (
        <div className="p-12 text-center text-gray-400 text-sm">Cargando picklist...</div>
    ),
});
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import Tip from "@/components/ui/Tip";
import { Users, Swords, ListOrdered, FileText, Trophy } from "lucide-react";

interface StrategyClientProps {
    teams: AggregatedTeamStats[];
}

export default function StrategyClient({ teams }: StrategyClientProps) {
    return (
        <div className="container mx-auto px-4 py-6">
            <header className="mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h1 className="text-4xl font-bold text-white font-display tracking-tight">Estrategia de Alianzas</h1>
                    <p className="text-gray-500 text-sm mt-1">Análisis de datos híbridos (API + Scouting) para toma de decisiones.</p>
                </div>
            </header>

            <Tabs defaultValue="picklist" className="space-y-6">
                <TabsList className="bg-white/5 border-white/10">
                    <TabsTrigger value="picklist" className="flex items-center gap-2">
                        <ListOrdered size={16} /> Picklist
                    </TabsTrigger>
                    <TabsTrigger value="selector" className="flex items-center gap-2">
                        <Users size={16} /> Alliance Oracle
                    </TabsTrigger>
                    <TabsTrigger value="simulator" className="flex items-center gap-2">
                        <Swords size={16} /> Simulador de Partidos
                    </TabsTrigger>
                    <TabsTrigger value="briefing" className="flex items-center gap-2">
                        <FileText size={16} /> Briefing
                    </TabsTrigger>
                    <TabsTrigger value="ranking" className="flex items-center gap-2">
                        <Trophy size={16} /> Live Ranking
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="picklist" className="m-0 space-y-4">
                    <Tip id="picklist-intro-v1" title="Picklist colaborativo en vivo">
                        Arrastra equipos para reordenar. Usa <strong>Pesos</strong> para definir tu fórmula y <strong>Auto-sort</strong> para aplicarla. Los cambios sincronizan en vivo con todo tu equipo.
                    </Tip>
                    <PicklistEditor teams={teams} />
                </TabsContent>

                <TabsContent value="selector" className="m-0">
                    <AllianceSelector teams={teams} />
                </TabsContent>

                <TabsContent value="simulator" className="m-0 space-y-4">
                    <Tip id="simulator-intro-v1" title="Simulador con Bayesian blend">
                        Las predicciones combinan stats oficiales con scouting propio usando varianza inversa. La pill bajo cada equipo muestra cuántos scouts/orgs aportan el dato.
                    </Tip>
                    <MatchSimulator teams={teams} />
                </TabsContent>

                <TabsContent value="briefing" className="m-0 space-y-4">
                    <Tip id="briefing-intro-v1" title="Hoja imprimible para drive coach">
                        Selecciona el match y las 4 alianzas. El briefing genera win probability, insights y un foco estratégico. <strong>Imprimir</strong> oculta toda la app y deja solo la hoja en formato carta.
                    </Tip>
                    <MatchBriefingCard teams={teams} />
                </TabsContent>

                <TabsContent value="ranking" className="m-0 space-y-4">
                    <Tip id="ranking-intro-v1" title="Proyección lineal in-event">
                        Estima dónde terminarás en el ranking si mantienes tu RP/match actual. Útil para decidir si tirar un match buscando RPs vs. ir agresivo.
                    </Tip>
                    <LiveRankingProjection teams={teams} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
