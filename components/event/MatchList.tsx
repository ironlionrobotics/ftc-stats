"use client";

import { useState, useMemo } from "react";
import { FTCMatch, TeamRanking, FTCMatchTeam, MatchScouting, FTCMatchScouting } from "@/types/scouting";
import clsx from "clsx";
import { Trophy, Zap, Star, Info, Target, MousePointer2, AlertTriangle } from "lucide-react";

interface MatchListProps {
    matches: FTCMatch[];
    rankings: TeamRanking[];
    filterTeam: number | null;
    setFilterTeam: (team: number | null) => void;
    scoutingData: MatchScouting[];
}

export default function MatchList({ matches, rankings, filterTeam, setFilterTeam, scoutingData }: MatchListProps) {
    const [expandedMatch, setExpandedMatch] = useState<string | null>(null);

    const toggleMatch = (matchId: string) => {
        setExpandedMatch(prev => prev === matchId ? null : matchId);
    };

    const filteredMatches = filterTeam
        ? matches.filter(m => m.teams.some(t => t.teamNumber === filterTeam))
        : matches;

    const qualMatches = filteredMatches.filter(m => m.tournamentLevel === "QUALIFICATION");
    const otherMatches = filteredMatches.filter(m => m.tournamentLevel !== "QUALIFICATION" && m.tournamentLevel !== "PRACTICE");

    const teamNamesMap = new Map(rankings.map(r => [r.teamNumber, r.teamName]));

    // Generic OPR Calculation Helper
    const calculateComponentOPR = (getValue: (m: FTCMatch, alliance: 'Red' | 'Blue') => number) => {
        if (!matches.length || !rankings.length) return new Map<number, number>();

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
                    indices.forEach(j => {
                        A[i][j] += 1;
                    });
                });
            };
            process('Red');
            process('Blue');
        });

        // Solve Ax = B using Gauss-Seidel (In-place updates for convergence)
        const x = new Float64Array(n).fill(0);
        for (let iter = 0; iter < 100; iter++) {
            for (let i = 0; i < n; i++) {
                let sum = 0;
                for (let j = 0; j < n; j++) {
                    if (i !== j) sum += A[i][j] * x[j];
                }
                if (A[i][i] > 0) {
                    x[i] = (B[i] - sum) / A[i][i];
                }
            }
        }

        return new Map(teamsList.map((t, i) => [t, x[i]]));
    };

    // Calculate Extended OPR Metrics
    const oprData = useMemo(() => {
        // 1. Overall OPR (Score - Foul) = "offensive contribution"
        const overall = calculateComponentOPR((m, alliance) =>
            alliance === 'Red' ? (m.scoreRedFinal - m.scoreRedFoul) : (m.scoreBlueFinal - m.scoreBlueFoul)
        );

        // 2. Auto OPR (Autonomous Score)
        const auto = calculateComponentOPR((m, alliance) =>
            alliance === 'Red' ? m.scoreRedAuto : m.scoreBlueAuto
        );

        // 3. Drawn Foul OPR (Points given by opponents due to fouls) - "Strategy/Provocation"
        // Red Alliance gets scoreRedFoul (points FROM Blue committing fouls)
        const drawnFoul = calculateComponentOPR((m, alliance) =>
            alliance === 'Red' ? m.scoreRedFoul : m.scoreBlueFoul
        );

        // 4. Committed Foul OPR (Points given TO opponents by this alliance) - "Discipline/Sloppiness"
        // Red Alliance GIVES scoreBlueFoul points to Blue
        const committedFoul = calculateComponentOPR((m, alliance) =>
            alliance === 'Red' ? m.scoreBlueFoul : m.scoreRedFoul
        );

        return { overall, auto, drawnFoul, committedFoul };
    }, [matches, rankings]);

    // Calculate Dynamic KPIs for filtered team
    const stats = {
        wins: 0, losses: 0, ties: 0,
        totalNP: 0, totalAuto: 0,
        highScore: 0, count: 0,
        yellowCards: 0, redCards: 0
    };

    if (filterTeam) {
        filteredMatches.forEach(m => {
            const isRed = m.teams.some(t => t.teamNumber === filterTeam && t.station.startsWith('Red'));
            const teamInfo = m.teams.find(t => t.teamNumber === filterTeam);
            const teamScore = isRed ? m.scoreRedFinal : m.scoreBlueFinal;
            const autoScore = isRed ? m.scoreRedAuto : m.scoreBlueAuto;
            const oppFoul = isRed ? m.scoreBlueFoul : m.scoreRedFoul;
            const oppScore = isRed ? m.scoreBlueFinal : m.scoreRedFinal;

            if (teamInfo?.yellowCard) stats.yellowCards++;
            if (teamInfo?.redCard) stats.redCards++;

            stats.totalNP += (teamScore - oppFoul);
            stats.totalAuto += autoScore;
            stats.highScore = Math.max(stats.highScore, teamScore);
            stats.count++;

            if (teamScore > oppScore) stats.wins++;
            else if (teamScore < oppScore) stats.losses++;
            else stats.ties++;
        });
    }

    // Derived OPR Stats
    const opr = filterTeam ? (oprData.overall.get(filterTeam) || 0) : 0;
    const autoOPR = filterTeam ? (oprData.auto.get(filterTeam) || 0) : 0;
    const teleOPR = opr - autoOPR; // TeleOp Contribution Estimate

    const drawnFoulOPR = filterTeam ? (oprData.drawnFoul.get(filterTeam) || 0) : 0;
    const committedFoulOPR = filterTeam ? (oprData.committedFoul.get(filterTeam) || 0) : 0;
    const netDiscipline = drawnFoulOPR - committedFoulOPR; // Strategy Metric: Postive = Provokes more than commits

    return (
        <div className="space-y-8">
            {filterTeam && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                    {/* Filter Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-3xl gap-6">
                        <div className="flex items-center gap-5">
                            <div className="min-w-16 w-fit h-16 px-4 bg-primary rounded-2xl flex items-center justify-center text-3xl font-black text-white shadow-lg shadow-primary/20">
                                {filterTeam}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-foreground tracking-tight leading-none mb-2">{teamNamesMap.get(filterTeam)}</h2>
                                <div className="flex items-center gap-3 text-muted-foreground text-sm font-medium">
                                    <span className="flex items-center gap-1.5"><Trophy size={14} className="text-primary" /> {stats.count} Matches analizados</span>
                                    <span className="w-1 h-1 rounded-full bg-border" />
                                    <span>Sistema Decode 2025</span>
                                </div>
                            </div>
                        </div>
                        <button
                            onClick={() => setFilterTeam(null)}
                            className="px-6 py-3 bg-muted hover:bg-muted/80 text-foreground text-sm font-bold rounded-2xl transition-all border border-border flex items-center justify-center gap-2 group"
                        >
                            Quitar Filtro <span className="text-primary group-hover:rotate-90 transition-transform">×</span>
                        </button>
                    </div>

                    {/* KPI Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                        <KPICard
                            label="OPR"
                            value={opr.toFixed(1)}
                            icon={<Zap className="text-yellow-500" size={20} />}
                            subline="Offensive Power Rating"
                            tooltip={
                                <div className="space-y-2">
                                    <p><strong className="text-yellow-400">¿Qué es?</strong> Offensive Power Rating.</p>
                                    <p><strong>Cálculo:</strong> Algoritmo de álgebra lineal que aísla la contribución individual de cada robot del puntaje total de sus alianzas.</p>
                                    <p><strong>Interpretación:</strong></p>
                                    <ul className="list-disc list-inside opacity-90">
                                        <li><span className="text-green-400">Alto (+):</span> Gran capacidad de anotación.</li>
                                        <li><span className="text-red-400">Bajo (-):</span> Bajo rendimiento ofensivo.</li>
                                    </ul>
                                </div>
                            }
                        />
                        <KPICard
                            label="Auto OPR"
                            value={autoOPR.toFixed(1)}
                            icon={<Target className="text-primary" size={20} />}
                            subline="Contribution (Calculated)"
                            tooltip={
                                <div className="space-y-2">
                                    <p><strong className="text-primary">¿Qué es?</strong> Contribución en Autónomo.</p>
                                    <p><strong>Cálculo:</strong> OPR aplicado exclusivamente a los puntos anotados en el periodo autónomo.</p>
                                    <p><strong>Uso:</strong> Identificar equipos con rutinas autónomas consistentes y de alto valor.</p>
                                </div>
                            }
                        />
                        <KPICard
                            label="TeleOp OPR"
                            value={teleOPR.toFixed(1)}
                            icon={<MousePointer2 className="text-blue-500" size={20} />}
                            subline="Driver Control (Estimated)"
                            tooltip={
                                <div className="space-y-2">
                                    <p><strong className="text-blue-400">¿Qué es?</strong> Poder en TeleOp/Endgame.</p>
                                    <p><strong>Cálculo:</strong> (OPR Total) - (Auto OPR).</p>
                                    <p><strong>Uso:</strong> Evaluar la habilidad del conductor y la capacidad de anotación manual del robot.</p>
                                </div>
                            }
                        />
                        <KPICard
                            label="Foul Strategy"
                            value={(drawnFoulOPR > 0 ? "+" : "") + drawnFoulOPR.toFixed(1)}
                            icon={<Star className="text-purple-500" size={20} />}
                            subline="Pts provocados al rival"
                            tooltip={
                                <div className="space-y-2">
                                    <p><strong className="text-purple-400">¿Qué es?</strong> Faltas Provocadas (Drawn).</p>
                                    <p><strong>Cálculo:</strong> OPR de los puntos que la alianza <em>oponente</em> regaló por penalizaciones.</p>
                                    <p><strong>Interpretación:</strong></p>
                                    <ul className="list-disc list-inside opacity-90">
                                        <li><span className="text-green-400">Alto (+):</span> El equipo fuerza errores en el rival (Estrategia).</li>
                                        <li><span className="text-slate-400">Bajo/Cero:</span> Juego neutral, no provoca faltas.</li>
                                    </ul>
                                </div>
                            }
                        />
                        <KPICard
                            label="Net Discipline"
                            value={(netDiscipline > 0 ? "+" : "") + netDiscipline.toFixed(1)}
                            icon={<Zap className={netDiscipline >= 0 ? "text-green-500" : "text-red-500"} size={20} />}
                            subline="Margen Neto"
                            tooltip={
                                <div className="space-y-2">
                                    <p><strong className={netDiscipline >= 0 ? "text-green-400" : "text-red-400"}>¿Qué es?</strong> Disciplina Neta.</p>
                                    <p><strong>Cálculo:</strong> (Faltas Provocadas) - (Faltas Cometidas).</p>
                                    <p><strong>Interpretación:</strong></p>
                                    <ul className="list-disc list-inside opacity-90">
                                        <li><span className="text-green-400">Positivo (+):</span> Ganas más puntos por estrategia de los que pierdes por errores (Mastermind).</li>
                                        <li><span className="text-red-400">Negativo (-):</span> Regalas más puntos de los que generas. (Riesgo).</li>
                                    </ul>
                                </div>
                            }
                        />
                        <div className="bg-card border border-border rounded-2xl p-4 hover:border-primary/30 transition-all shadow-sm flex flex-col justify-between relative">
                            <div className="absolute top-2 right-2 group/tooltip">
                                <div className="p-1 text-muted-foreground hover:text-primary transition-colors cursor-help">
                                    <Info size={14} />
                                </div>
                                <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-900 border border-slate-700 text-slate-100 text-xs rounded-xl shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none text-left leading-relaxed">
                                    <p className="mb-1"><strong className="text-red-400">Tarjetas (Cards)</strong></p>
                                    <p className="text-[10px] leading-relaxed">Advertencias (Yellow) y Descalificaciones (Red) acumuladas en el evento. Un alto número indica riesgo de descalificación para la alianza.</p>
                                </div>
                            </div>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Cards</span>
                                <AlertTriangle className="text-red-500" size={20} />
                            </div>

                            <div className="flex gap-2">
                                <div className="flex-1 bg-yellow-400/10 border border-yellow-400/20 rounded-lg p-2 text-center">
                                    <div className="text-xl font-black text-yellow-600">{stats.yellowCards}</div>
                                    <div className="text-[8px] font-bold text-yellow-700 uppercase">Yellow</div>
                                </div>
                                <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                                    <div className="text-xl font-black text-red-600">{stats.redCards}</div>
                                    <div className="text-[8px] font-bold text-red-700 uppercase">Red</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {qualMatches.length > 0 && (
                <section>
                    <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                        <span className="w-2 h-8 bg-primary rounded-full transition-all" />
                        Qualification Matches {filterTeam && <span className="text-muted-foreground text-sm font-normal">— {qualMatches.length} partidos</span>}
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="text-muted-foreground border-b border-border text-sm uppercase tracking-wider">
                                    <th className="p-4 font-medium min-w-[150px]">Match</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-red-500/5 text-red-600 dark:text-red-400 rounded-tl-lg border-x border-border/50">Red Alliance</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-blue-500/5 text-blue-600 dark:text-blue-400 rounded-tr-lg border-x border-border/50">Blue Alliance</th>
                                    <th className="p-4 font-medium text-center min-w-[120px]">Score</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {qualMatches.map((match) => (
                                    <MatchRow
                                        key={match.matchNumber}
                                        match={match}
                                        rankings={rankings}
                                        teamNamesMap={teamNamesMap}
                                        onTeamClick={setFilterTeam}
                                        filterTeam={filterTeam}
                                        scoutingData={scoutingData}
                                        isExpanded={expandedMatch === match.description}
                                        onToggle={() => toggleMatch(match.description)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {otherMatches.length > 0 && (
                <section>
                    <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                        <span className="w-2 h-8 bg-secondary rounded-full" />
                        Playoffs {filterTeam && <span className="text-muted-foreground text-sm font-normal">— {otherMatches.length} partidos</span>}
                    </h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="text-muted-foreground border-b border-border text-sm uppercase tracking-wider">
                                    <th className="p-4 font-medium min-w-[150px]">Match</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-red-500/5 text-red-600 dark:text-red-400 rounded-tl-lg border-x border-border/50">Red Alliance</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-blue-500/5 text-blue-600 dark:text-blue-400 rounded-tr-lg border-x border-border/50">Blue Alliance</th>
                                    <th className="p-4 font-medium text-center min-w-[120px]">Score</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border/50">
                                {otherMatches.map((match) => (
                                    <MatchRow
                                        key={match.description}
                                        match={match}
                                        rankings={rankings}
                                        teamNamesMap={teamNamesMap}
                                        onTeamClick={setFilterTeam}
                                        filterTeam={filterTeam}
                                        scoutingData={scoutingData}
                                        isExpanded={expandedMatch === match.description}
                                        onToggle={() => toggleMatch(match.description)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {filteredMatches.length === 0 && (
                <div className="text-muted-foreground italic text-center py-8">No match data available for this filter.</div>
            )}
        </div>
    );
}

function KPICard({ label, value, icon, subline, tooltip }: { label: string, value: string, icon: React.ReactNode, subline: string, tooltip?: React.ReactNode }) {
    return (
        <div className="bg-card border border-border rounded-2xl p-4 hover:border-primary/30 transition-all shadow-sm relative">
            {tooltip && (
                <div className="absolute top-2 right-2 group/tooltip">
                    <div className="p-1 text-muted-foreground hover:text-primary transition-colors cursor-help">
                        <Info size={14} />
                    </div>
                    <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-slate-900 border border-slate-700 text-slate-100 text-xs rounded-xl shadow-xl opacity-0 invisible group-hover/tooltip:opacity-100 group-hover/tooltip:visible transition-all z-50 pointer-events-none text-left leading-relaxed">
                        {tooltip}
                    </div>
                </div>
            )}
            <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
                <div className="p-2 bg-muted rounded-lg group-hover:bg-primary/10 transition-colors">
                    {icon}
                </div>
            </div>
            <div className="text-2xl font-black text-foreground font-display mb-1">{value}</div>
            <div className="text-[10px] text-muted-foreground font-medium">{subline}</div>
        </div>
    );
}

function TeamInfo({ team, teamNamesMap, onTeamClick, filterTeam }: { team?: FTCMatchTeam, teamNamesMap: Map<number, string>, onTeamClick: (id: number) => void, filterTeam: number | null }) {
    if (!team) return <div className="min-w-[120px]" />;
    const name = teamNamesMap.get(team.teamNumber) || "Team";
    const isRed = team.station.startsWith('Red');
    const isFiltered = filterTeam === team.teamNumber;

    return (
        <button
            onClick={() => onTeamClick(team.teamNumber)}
            className={clsx(
                "flex flex-col items-center min-w-[140px] px-3 group/team rounded-xl py-2 transition-all relative",
                isFiltered
                    ? (isRed
                        ? "bg-red-500/10 ring-2 ring-red-500 scale-105 z-20 shadow-lg shadow-red-100"
                        : "bg-blue-500/10 ring-2 ring-blue-500 scale-105 z-20 shadow-lg shadow-blue-100")
                    : "hover:bg-muted"
            )}
            key={team.teamNumber}
        >
            <div className="absolute top-1 right-1 flex flex-col gap-0.5">
                {team.yellowCard && <div className="w-1.5 h-3 bg-yellow-400 rounded-sm shadow-sm" />}
                {team.redCard && <div className="w-1.5 h-3 bg-red-500 rounded-sm shadow-sm" />}
            </div>
            <span className={clsx(
                "font-mono transition-all",
                isFiltered
                    ? (isRed ? "text-red-600" : "text-blue-600") + " scale-110 font-black text-lg"
                    : (isRed ? "text-red-500 dark:text-red-400" : "text-blue-500 dark:text-blue-400") + " font-bold text-base",
                !isFiltered && "group-hover/team:scale-110"
            )}>
                {team.teamNumber}
            </span>
            <span className={clsx(
                "text-[10px] uppercase tracking-tighter transition-colors font-medium text-center leading-tight whitespace-normal max-w-[130px]",
                isFiltered
                    ? (isRed ? "text-red-700 font-black" : "text-blue-700 font-black")
                    : "text-muted-foreground group-hover/team:text-foreground"
            )}>
                {name}
            </span>
        </button>
    );
}

// ... (KPICard and TeamInfo remain unchanged) ...

function MatchRow({ match, rankings, teamNamesMap, onTeamClick, filterTeam, scoutingData, isExpanded, onToggle }: {
    match: FTCMatch,
    rankings: TeamRanking[],
    teamNamesMap: Map<number, string>,
    onTeamClick: (id: number) => void,
    filterTeam: number | null,
    scoutingData: MatchScouting[],
    isExpanded: boolean,
    onToggle: () => void
}) {
    const redTeams = match.teams.filter(t => t.station.startsWith('Red')).sort((a, b) => a.station.localeCompare(b.station));
    const blueTeams = match.teams.filter(t => t.station.startsWith('Blue')).sort((a, b) => a.station.localeCompare(b.station));

    const shortenDescription = (desc: string) => {
        return desc
            .replace(/Round\s+/g, 'R')
            .replace(/Match\s+/g, 'M')
            .replace(/\s+/g, ' ')
            .trim();
    };

    const isPlayed = !!match.postResultTime || (match.scoreRedFinal > 0 || match.scoreBlueFinal > 0);
    const redWin = isPlayed && match.scoreRedFinal > match.scoreBlueFinal;
    const blueWin = isPlayed && match.scoreBlueFinal > match.scoreRedFinal;

    const formatTime = (timeStr?: string) => {
        if (!timeStr) return null;
        try {
            const date = new Date(timeStr);
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } catch {
            return null;
        }
    };

    const startTime = formatTime(match.actualStartTime);

    // PREDICTION LOGIC
    const getAllianceStats = (teams: FTCMatchTeam[]) => {
        let totalStrength = 0;
        let totalMatches = 0;
        let teamsFound = 0;
        teams.forEach(t => {
            const rank = rankings.find(r => r.teamNumber === t.teamNumber);
            if (rank) {
                const strength = rank.qualAverage || rank.sortOrder2 || 0;
                totalStrength += strength;
                totalMatches += rank.matchesPlayed;
                teamsFound++;
            }
        });
        return { strength: teamsFound > 0 ? totalStrength : 0, matchesPlayed: teamsFound > 0 ? Math.round(totalMatches / teamsFound) : 0 };
    };

    const redStats = getAllianceStats(redTeams);
    const blueStats = getAllianceStats(blueTeams);

    // Bill James' Pythagorean Expectation adaptation
    let redProb = 50;
    let blueProb = 50;
    let hasPrediction = false;

    if (redStats.strength > 0 || blueStats.strength > 0) {
        const r2 = Math.pow(redStats.strength, 2);
        const b2 = Math.pow(blueStats.strength, 2);
        if (r2 + b2 > 0) {
            redProb = (r2 / (r2 + b2)) * 100;
            blueProb = 100 - redProb;
            hasPrediction = true;
        }
    }

    return (
        <>
            <tr onClick={onToggle} className={`cursor-pointer transition-colors border-b border-border/50 last:border-0 ${isExpanded ? "bg-muted shadow-inner" : "hover:bg-muted/50"}`}>
                <td className="p-4">
                    <div className="font-bold text-foreground whitespace-nowrap flex items-center gap-2">
                        {shortenDescription(match.description)}
                        {isExpanded && <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                    </div>
                </td>

                <td className={clsx("p-4 border-l-4", redWin ? "border-red-500 bg-red-500/10" : "border-transparent")}>
                    <TeamInfo team={redTeams[0]} teamNamesMap={teamNamesMap} onTeamClick={(id) => { onTeamClick(id); }} filterTeam={filterTeam} />
                </td>
                <td className={clsx("p-4 border-r border-border/20", redWin ? "bg-red-500/10" : "border-transparent")}>
                    <TeamInfo team={redTeams[1]} teamNamesMap={teamNamesMap} onTeamClick={(id) => { onTeamClick(id); }} filterTeam={filterTeam} />
                </td>

                <td className={clsx("p-4", blueWin ? "bg-blue-500/10" : "border-transparent")}>
                    <TeamInfo team={blueTeams[0]} teamNamesMap={teamNamesMap} onTeamClick={(id) => { onTeamClick(id); }} filterTeam={filterTeam} />
                </td>
                <td className={clsx("p-4 border-r-4", blueWin ? "border-blue-500 bg-blue-500/10" : "border-transparent")}>
                    <TeamInfo team={blueTeams[1]} teamNamesMap={teamNamesMap} onTeamClick={(id) => { onTeamClick(id); }} filterTeam={filterTeam} />
                </td>

                <td className="p-4 text-center min-w-[200px]">
                    {isPlayed ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-center gap-2 font-display px-2">
                                <div className={clsx(
                                    "flex items-center justify-center min-w-[45px] py-1 rounded-lg transition-all",
                                    redWin ? "bg-red-500 text-white shadow-md shadow-red-200" : "text-muted-foreground/30 font-medium"
                                )}>
                                    <span className={clsx("text-xl", redWin ? "font-black" : "font-bold")}>{match.scoreRedFinal}</span>
                                </div>
                                <span className="text-[10px] font-black text-border uppercase">Final</span>
                                <div className={clsx(
                                    "flex items-center justify-center min-w-[45px] py-1 rounded-lg transition-all",
                                    blueWin ? "bg-blue-500 text-white shadow-md shadow-blue-200" : "text-muted-foreground/30 font-medium"
                                )}>
                                    <span className={clsx("text-xl", blueWin ? "font-black" : "font-bold")}>{match.scoreBlueFinal}</span>
                                </div>
                            </div>

                            {/* Prediction Bar */}
                            {hasPrediction && (
                                <div className="w-full max-w-[140px] mx-auto opacity-80 hover:opacity-100 transition-opacity">
                                    <div className="h-1 w-full flex rounded-full overflow-hidden bg-slate-100">
                                        <div style={{ width: `${redProb}%` }} className="h-full bg-red-400" />
                                        <div style={{ width: `${blueProb}%` }} className="h-full bg-blue-400" />
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="text-center">
                            {startTime ? <span className="px-2 py-1 bg-slate-100 rounded text-[10px] font-bold text-slate-500">{startTime}</span> : <span className="text-xs text-muted-foreground">Pending</span>}
                        </div>
                    )}
                </td>
            </tr>

            {isExpanded && (
                <tr className="bg-muted/30 animate-in slide-in-from-top-2 duration-300">
                    <td colSpan={6} className="p-0">
                        <MatchDetails match={match} rankings={rankings} scoutingData={scoutingData} />
                    </td>
                </tr>
            )}
        </>
    );
}

function MatchDetails({ match, rankings, scoutingData }: { match: FTCMatch, rankings: TeamRanking[], scoutingData: MatchScouting[] }) {
    const redTele = match.scoreRedFinal - match.scoreRedAuto - match.scoreRedFoul;
    const blueTele = match.scoreBlueFinal - match.scoreBlueAuto - match.scoreBlueFoul;

    const redTeams = match.teams.filter(t => t.station.startsWith('Red'));
    const blueTeams = match.teams.filter(t => t.station.startsWith('Blue'));

    const getTeamStats = (teamNumber: number) => {
        // Try to find specific match scouting data
        const matchScouting = scoutingData.find(s => s.teamNumber === teamNumber && s.matchNumber === match.matchNumber);
        // Also get season stats
        const rank = rankings.find(r => r.teamNumber === teamNumber);

        return {
            name: rank?.teamName || "Team",
            opr: rank?.sortOrder2 || 0, // Fallback OPR/NP
            avgAuto: rank?.sortOrder4 || 0, // This is Matches Played in Rank, not Avg Auto. Need recalculation or trust rankings map
            // Note: sortOrder meaning varies. Standard: 1=RP, 2=TBP1, 3=TBP2. 
            // In our earlier code we mapped sortOrder2 as NP Average.
            scoutedAuto: (matchScouting as FTCMatchScouting)?.autoPoints,
            scoutedTele: matchScouting
                ? ((matchScouting as FTCMatchScouting).teleopPurpleArtifacts ?? 0) +
                  ((matchScouting as FTCMatchScouting).teleopGreenArtifacts ?? 0)
                : undefined,
            hasScouting: !!matchScouting
        };
    };

    return (
        <div className="p-6 grid gap-8">
            {/* Alliance Comparison */}
            <div className="grid grid-cols-3 gap-4 text-center">
                <div className="space-y-4">
                    <h4 className="text-red-600 font-bold uppercase tracking-widest text-xs border-b border-red-200 pb-2">Red Alliance</h4>
                    <div className="grid gap-2">
                        <StatRow label="Auto" value={match.scoreRedAuto} color="text-red-600 font-bold" />
                        <StatRow label="TeleOp" value={redTele} color="text-red-500" />
                        <StatRow label="Penalty In" value={match.scoreRedFoul} color="text-slate-400 italic" />
                        <div className="pt-2 border-t border-slate-200 mt-2">
                            <StatRow label="Total" value={match.scoreRedFinal} color="text-red-700 font-black text-lg" />
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-center">
                    <div className="h-full w-px bg-border mx-auto" />
                </div>

                <div className="space-y-4">
                    <h4 className="text-blue-600 font-bold uppercase tracking-widest text-xs border-b border-blue-200 pb-2">Blue Alliance</h4>
                    <div className="grid gap-2">
                        <StatRow label="Auto" value={match.scoreBlueAuto} color="text-blue-600 font-bold" />
                        <StatRow label="TeleOp" value={blueTele} color="text-blue-500" />
                        <StatRow label="Penalty In" value={match.scoreBlueFoul} color="text-slate-400 italic" />
                        <div className="pt-2 border-t border-slate-200 mt-2">
                            <StatRow label="Total" value={match.scoreBlueFinal} color="text-blue-700 font-black text-lg" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Team Breakdown (If Scouting Data Exists) */}
            <div className="bg-white rounded-xl border border-slate-200 p-4">
                <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                    <Zap size={16} className="text-primary" /> Team Performance Insights
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {[redTeams, blueTeams].map((teams, idx) => (
                        <div key={idx} className="space-y-3">
                            {teams.map(t => {
                                const stats = getTeamStats(t.teamNumber);
                                return (
                                    <div key={t.teamNumber} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-100">
                                        <div>
                                            <div className={`text-lg font-black font-mono ${idx === 0 ? "text-red-600" : "text-blue-600"}`}>
                                                {t.teamNumber}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground font-bold uppercase">{stats.name}</div>
                                        </div>
                                        <div className="text-right">
                                            {scoutingData.map((sdItem, i) => {
                                                const sd = sdItem as FTCMatchScouting;
                                                const autoTotal = (sd.autoPurpleArtifacts ?? 0) + (sd.autoGreenArtifacts ?? 0);
                                                const teleTotal = (sd.teleopPurpleArtifacts ?? 0) + (sd.teleopGreenArtifacts ?? 0);
                                                const parking = sd.endgameBaseParking ?? 'None';
                                                return (
                                                    <div key={i} className="flex justify-between items-center text-xs py-1 px-2 border-b border-primary/10">
                                                        <span className="text-gray-400 truncate max-w-[100px]">{sd.scoutName ?? sd.scouterName}</span>
                                                        <div className="flex gap-2 text-white font-mono">
                                                            <span className={autoTotal > 0 ? "text-green-400" : ""}>A:{autoTotal}</span>
                                                            <span>T:{teleTotal}</span>
                                                            <span className={parking !== 'None' ? "text-primary" : ""}>E:{parking.substring(0, 1)}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            <div>
                                                <span className="block text-[8px] text-slate-400 uppercase">Season NP Avg</span>
                                                <span className="font-mono font-bold text-sm text-slate-600">{stats.opr.toFixed(1)}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function StatRow({ label, value, color }: { label: string, value: number, color?: string }) {
    return (
        <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground font-medium">{label}</span>
            <span className={`font-mono ${color}`}>{value}</span>
        </div>
    );
}
