"use client";

import { useState } from "react";
import { AggregatedTeamStats } from "@/types/ftc";
import AllianceSelector from "./AllianceSelector";
import MatchSimulator from "./MatchSimulator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Users, Swords } from "lucide-react";

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

            <Tabs defaultValue="selector" className="space-y-6">
                <TabsList className="bg-white/5 border-white/10">
                    <TabsTrigger value="selector" className="flex items-center gap-2">
                        <Users size={16} /> Selector Builder
                    </TabsTrigger>
                    <TabsTrigger value="simulator" className="flex items-center gap-2">
                        <Swords size={16} /> Simulador de Partidos
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="selector" className="m-0">
                    <AllianceSelector teams={teams} />
                </TabsContent>

                <TabsContent value="simulator" className="m-0">
                    <MatchSimulator teams={teams} />
                </TabsContent>
            </Tabs>
        </div>
    );
}
