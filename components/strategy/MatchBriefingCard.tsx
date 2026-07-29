"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { DEFAULT_ORG_ID } from "@/lib/orgs";
import { listenToMatchScouting } from "@/lib/scouting-service";
import { buildBriefingData, type BriefingData } from "@/lib/briefings/briefing-data";
import { logPredictionAction } from "@/app/actions/calibration";
import type { AggregatedTeamStats, MatchScouting } from "@/types/scouting";
import { Card } from "@/components/ui/Card";
import { Printer, FileText, AlertCircle } from "lucide-react";
import clsx from "clsx";
import { guessActiveEventCode } from "@/lib/active-event";

interface MatchBriefingCardProps {
    teams: AggregatedTeamStats[];
}

/**
 * Match Strategy Briefing — generates a 1-page printable handout for the
 * drive coach. The user picks 2 red + 2 blue teams and a match number; the
 * card renders an at-a-glance summary and a "Print briefing" button that
 * triggers window.print() with print-CSS that hides everything else.
 *
 * Why print instead of @react-pdf/renderer: the renderer is ~200KB and the
 * print preview from any browser saves to PDF just fine. Drive coaches print
 * once per match at most — perf isn't critical, dependency weight is.
 */
export default function MatchBriefingCard({ teams }: MatchBriefingCardProps) {
    const { user, orgId } = useAuth();
    const { season } = useProgram();
    const eventCode = guessActiveEventCode(teams) ?? "MXTOL";
    const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;

    const [matchNumber, setMatchNumber] = useState(1);
    const [redTeams, setRedTeams] = useState<number[]>([]);
    const [blueTeams, setBlueTeams] = useState<number[]>([]);
    const [scoutingEntries, setScoutingEntries] = useState<MatchScouting[]>([]);

    useEffect(() => {
        const unsub = listenToMatchScouting(season, eventCode, effectiveOrgId, setScoutingEntries);
        return () => unsub();
    }, [season, eventCode, effectiveOrgId]);

    const ready = redTeams.length === 2 && blueTeams.length === 2;

    const briefing: BriefingData | null = useMemo(() => {
        if (!ready) return null;
        return buildBriefingData({
            matchNumber,
            eventCode,
            season,
            orgId: effectiveOrgId,
            redTeamNumbers: redTeams,
            blueTeamNumbers: blueTeams,
            teams,
            scoutingEntries,
        });
    }, [ready, matchNumber, eventCode, season, effectiveOrgId, redTeams, blueTeams, teams, scoutingEntries]);

    // Log the prediction to calibration_log when a briefing is generated.
    // The doc id in Firestore is deterministic (season+event+match+orgId), so
    // re-renders for the same match upsert instead of duplicating. Best-effort:
    // failures are silently ignored so calibration logging never blocks the UI.
    const lastLoggedRef = useRef<string | null>(null);
    useEffect(() => {
        if (!briefing || !user) return;
        const key = `${briefing.season}_${briefing.eventCode}_${briefing.matchNumber}_${briefing.orgId}`;
        if (lastLoggedRef.current === key) return;
        lastLoggedRef.current = key;
        (async () => {
            try {
                const idToken = await user.getIdToken();
                await logPredictionAction({
                    idToken,
                    prediction: {
                        season: briefing.season,
                        eventCode: briefing.eventCode,
                        matchNumber: briefing.matchNumber,
                        predictedWinProb: briefing.winProbabilityRed,
                        predictedRedScore: briefing.redAlliance.projectedScore,
                        predictedBlueScore: briefing.blueAlliance.projectedScore,
                    },
                });
            } catch {
                // ignore — calibration logging is best-effort
            }
        })();
    }, [briefing, user]);

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="space-y-6">
            {/* SETUP — hidden when printing */}
            <Card className="p-6 bg-muted border-border space-y-4 print:hidden">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div>
                        <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                            <FileText className="text-primary" size={22} /> Match Briefing
                        </h2>
                        <p className="text-xs text-muted-foreground mt-1">
                            Hoja imprimible para el drive coach. Selecciona match + 2 teams por alianza.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={handlePrint}
                        disabled={!ready}
                        className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground font-bold rounded-lg text-sm"
                    >
                        <Printer size={14} /> Imprimir briefing
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 block">
                            Match #
                        </label>
                        <input
                            type="number"
                            min={1}
                            value={matchNumber}
                            onChange={e => setMatchNumber(parseInt(e.target.value) || 1)}
                            className="w-full px-3 py-2 bg-card border border-border rounded-lg text-foreground font-bold text-lg"
                        />
                    </div>
                    <AllianceTeamPicker
                        label="Alianza Roja (2 teams)"
                        accent="red"
                        selected={redTeams}
                        teams={teams}
                        otherSelected={blueTeams}
                        onChange={setRedTeams}
                    />
                    <AllianceTeamPicker
                        label="Alianza Azul (2 teams)"
                        accent="blue"
                        selected={blueTeams}
                        teams={teams}
                        otherSelected={redTeams}
                        onChange={setBlueTeams}
                    />
                </div>

                {!ready && (
                    <div className="flex items-start gap-2 p-3 bg-warning/10 border border-warning/30 rounded-lg text-warning text-xs">
                        <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                        <span>Selecciona exactamente 2 teams por alianza para generar el briefing.</span>
                    </div>
                )}
            </Card>

            {/* PRINTABLE BRIEFING — visible always, but takes the whole page when printing */}
            {briefing && <PrintableBriefing briefing={briefing} />}
        </div>
    );
}

function AllianceTeamPicker({
    label,
    accent,
    selected,
    teams,
    otherSelected,
    onChange,
}: {
    label: string;
    accent: "red" | "blue";
    selected: number[];
    teams: AggregatedTeamStats[];
    otherSelected: number[];
    onChange: (next: number[]) => void;
}) {
    const accentRing = accent === "red" ? "ring-danger/50" : "ring-secondary/50";
    const accentBg = accent === "red" ? "bg-danger/10 border-danger/30" : "bg-secondary/10 border-secondary/30";

    const otherSet = new Set(otherSelected);
    const selectedSet = new Set(selected);

    const toggle = (teamNumber: number) => {
        if (selectedSet.has(teamNumber)) {
            onChange(selected.filter(t => t !== teamNumber));
        } else if (selected.length < 2) {
            onChange([...selected, teamNumber]);
        }
    };

    return (
        <div>
            <label className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider mb-1 block">
                {label}
            </label>
            <div className={clsx("max-h-40 overflow-y-auto rounded-lg border bg-card p-1 space-y-0.5", accentBg)}>
                {teams.map(t => {
                    const isSelected = selectedSet.has(t.teamNumber);
                    const inOther = otherSet.has(t.teamNumber);
                    return (
                        <button
                            key={t.teamNumber}
                            type="button"
                            disabled={inOther}
                            onClick={() => toggle(t.teamNumber)}
                            className={clsx(
                                "w-full flex items-center justify-between px-2 py-1 text-xs rounded transition-colors text-left",
                                inOther && "opacity-30 cursor-not-allowed",
                                !inOther && !isSelected && "text-muted-foreground hover:bg-muted",
                                isSelected && `ring-1 ${accentRing} text-foreground bg-muted font-bold`,
                            )}
                        >
                            <span>{t.teamNumber}</span>
                            <span className="text-[9px] text-muted-foreground truncate ml-2 max-w-[100px]">
                                {t.teamName}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Printable briefing — the actual handout. Uses print: classes so on-screen
// preview shows a compact card and print output uses the whole page.
// ---------------------------------------------------------------------------

function PrintableBriefing({ briefing }: { briefing: BriefingData }) {
    const redWinPct = Math.round(briefing.winProbabilityRed * 100);
    const blueWinPct = 100 - redWinPct;

    return (
        <article
            className={clsx(
                // Screen layout: looks like another card
                "bg-white text-black rounded-xl p-6 max-w-[8.5in] mx-auto shadow-2xl",
                // Print layout: hides all sibling chrome, takes whole page,
                // forces light theme for printer.
                "print:shadow-none print:rounded-none print:max-w-none print:m-0 print:p-6",
            )}
        >
            {/* Header */}
            <header className="flex items-end justify-between border-b-2 border-black pb-2 mb-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight">
                        MATCH #{briefing.matchNumber}
                    </h1>
                    <p className="text-xs font-mono text-gray-700">
                        {briefing.eventCode} · Equipo #{briefing.orgId} ·{" "}
                        {new Date(briefing.generatedAt).toLocaleString()}
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-gray-600 font-bold">
                        Drive Coach Briefing
                    </div>
                    <div className="text-[10px] text-gray-500">FTC Stats México</div>
                </div>
            </header>

            {/* Win Probability bar */}
            <section className="mb-4">
                <div className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-1">
                    Probabilidad de victoria
                </div>
                <div className="flex items-center text-xs font-bold">
                    <span className="text-red-600">RED {redWinPct}%</span>
                    <div className="flex-1 mx-2 h-3 bg-gray-200 rounded-full overflow-hidden flex">
                        <div className="h-full bg-red-500" style={{ width: `${redWinPct}%` }} />
                        <div className="h-full bg-blue-500" style={{ width: `${blueWinPct}%` }} />
                    </div>
                    <span className="text-blue-600">BLUE {blueWinPct}%</span>
                </div>
            </section>

            {/* Alliances side by side */}
            <section className="grid grid-cols-2 gap-4 mb-4">
                <AllianceColumn
                    color="red"
                    teams={briefing.redAlliance.teams}
                    projectedScore={briefing.redAlliance.projectedScore}
                />
                <AllianceColumn
                    color="blue"
                    teams={briefing.blueAlliance.teams}
                    projectedScore={briefing.blueAlliance.projectedScore}
                />
            </section>

            {/* Insights */}
            {briefing.insights.length > 0 && (
                <section className="mb-4">
                    <h2 className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-1 border-b border-gray-300">
                        Insights del modelo
                    </h2>
                    <ul className="text-xs space-y-1 mt-2">
                        {briefing.insights.map((insight, i) => (
                            <li key={i} className="flex gap-2">
                                <span className="text-gray-400">▸</span>
                                <span>{insight}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}

            {/* Strategic focus */}
            <section className="mb-4">
                <h2 className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-1 border-b border-gray-300">
                    Foco estratégico
                </h2>
                <ul className="text-xs space-y-1 mt-2">
                    {briefing.strategicFocus.map((focus, i) => (
                        <li key={i} className="flex gap-2">
                            <span className="text-gray-400 font-bold">{i + 1}.</span>
                            <span>{focus}</span>
                        </li>
                    ))}
                </ul>
            </section>

            {/* Handwritten notes area */}
            <section>
                <h2 className="text-[10px] uppercase tracking-widest font-bold text-gray-600 mb-1 border-b border-gray-300">
                    Notas pre-match (escribir a mano)
                </h2>
                <div className="grid grid-cols-2 gap-2 mt-2">
                    <div className="h-16 border border-dashed border-gray-400 rounded p-1 text-[9px] text-gray-400">Plan A</div>
                    <div className="h-16 border border-dashed border-gray-400 rounded p-1 text-[9px] text-gray-400">Plan B (si falla A)</div>
                </div>
            </section>
        </article>
    );
}

function AllianceColumn({
    color,
    teams,
    projectedScore,
}: {
    color: "red" | "blue";
    teams: import("@/lib/briefings/briefing-data").BriefingTeamRow[];
    projectedScore: number;
}) {
    const headerColor = color === "red" ? "text-red-600 border-red-600" : "text-blue-600 border-blue-600";
    return (
        <div>
            <div className={clsx("flex items-end justify-between border-b-2 pb-1 mb-2", headerColor)}>
                <h3 className="text-sm font-black uppercase tracking-wider">
                    {color === "red" ? "Alianza Roja" : "Alianza Azul"}
                </h3>
                <div className="text-2xl font-black font-mono">{Math.round(projectedScore)}</div>
            </div>
            <ul className="space-y-2">
                {teams.map(t => (
                    <li key={t.teamNumber} className="text-xs border border-gray-200 rounded p-2">
                        <div className="flex items-baseline justify-between">
                            <div className="font-bold text-sm">
                                {t.teamNumber} <span className="font-normal text-gray-600">{t.teamName}</span>
                            </div>
                            <div className="font-mono text-sm">
                                ~{Math.round(t.projectedPoints)}
                                <span className="text-[9px] text-gray-500 ml-1">
                                    [{t.reliability.charAt(0).toUpperCase()}]
                                </span>
                            </div>
                        </div>
                        <div className="text-[10px] text-gray-600 mt-1 grid grid-cols-3 gap-1">
                            <span>Auto: {Math.round(t.breakdownAuto)}</span>
                            <span>Tele: {Math.round(t.breakdownTeleop)}</span>
                            <span>End: {Math.round(t.breakdownEndgame)}</span>
                        </div>
                        <div className="text-[10px] text-gray-500 mt-0.5">
                            RS {t.averageRS.toFixed(1)} · NP {t.averageNP.toFixed(1)}
                        </div>
                        {t.redFlags.length > 0 && (
                            <div className="text-[10px] text-red-600 font-bold mt-1">
                                ⚠ {t.redFlags.join(" · ")}
                            </div>
                        )}
                        {t.recentNotes.length > 0 && (
                            <div className="text-[10px] text-gray-700 italic mt-1 line-clamp-2">
                                &quot;{t.recentNotes[0]}&quot;
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>
    );
}
