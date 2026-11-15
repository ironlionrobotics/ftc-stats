"use client";

import { useState, useMemo, useEffect } from "react";
import EventStats from "./EventStats";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Sheet } from "@/components/ui/Sheet";
import MatchList from "./MatchList";
import RankingTable from "./RankingTable";
import ParticipantList from "./ParticipantList";
import AlliancePredictor from "../analytics/AlliancePredictor";
import { FTCMatch, TeamRanking, MatchScouting, AdvancementResponse, FTCAward, AdvancementPoints, FTCMatchScouting, FTCHybridScheduleMatch, FTCAllianceSelection } from "@/types/scouting";
import type { TeamEvolution } from "@/app/actions/analytics";
import type { BiobuzzRpInputs } from "@/lib/rp-counts";
import { seasonRulesFor } from "@/lib/games/season-rules";
import { eventStrengthModel } from "@/lib/live-projection";
import { oracleRobotSigma } from "@/lib/playoff-form";
import { Trophy, LayoutList, History, Sparkles, Medal, Target, Zap as LucideZap, MoreHorizontal } from "lucide-react";
// lib/scouting-service is imported dynamically in the effect below: it reaches
// the Firebase client SDK, and this is the public event page — the one people
// load most on venue wifi. Statically importing it put ~397 KB of Firestore in
// front of the first paint of a page that server-renders its rankings and
// matches from the FTC API and only needs live scouting for two of its tabs.
import clsx from "clsx";
import { Users as LucideUsers } from "lucide-react";
import AwardList from "./AwardList";
import AdvancementList from "./AdvancementList";
import Link from "next/link";
// useAuth only reads context; AuthProvider is already mounted app-wide in the
// root layout, so this adds no Firebase to the public event bundle (the SDK
// itself stays behind the dynamic import in the effect below).
import { useAuth } from "@/context/AuthContext";
import { DEFAULT_ORG_ID } from "@/lib/constants";

/** Server-computed RP probabilities for one team (BIOBUZZ count models). */
export interface EventTeamRp {
    rp?: Record<string, number>;
    rpInputs?: BiobuzzRpInputs;
}

interface EventViewManagerProps {
    matches: FTCMatch[];
    rankings: TeamRanking[];
    advancement: AdvancementResponse | null;
    awards: FTCAward[];
    advancementPoints: AdvancementPoints[];
    schedule: FTCHybridScheduleMatch[];
    /** Official playoff alliances once selection is published (empty before). */
    selectedAlliances?: FTCAllianceSelection[];
    eventCode: string;
    season: number;
    /** Official bonus RPs per qual alliance, keyed "<matchNumber>-Red|Blue". */
    matchBonusRp?: Record<string, number>;
    /** BIOBUZZ RP probabilities per team, computed on the server. */
    teamRp?: Record<number, EventTeamRp>;
}

type TabKey = "matches" | "rankings" | "alliances" | "teams" | "advancement" | "awards";
/** Phone shows the first three; the rest live under "Más" (decision #116). */
const PRIMARY_TABS = [
    { key: "matches", icon: LayoutList },
    { key: "rankings", icon: Trophy },
    { key: "alliances", icon: Sparkles },
] as const;
const MORE_TABS = [
    { key: "teams", icon: LucideUsers },
    { key: "advancement", icon: Target },
    { key: "awards", icon: Medal },
] as const;

export default function EventViewManager({ matches, rankings, advancement, awards, advancementPoints, schedule, selectedAlliances, eventCode, season, matchBonusRp, teamRp }: EventViewManagerProps) {
    const t = useTranslations("EventView");
    const tShell = useTranslations("Shell");
    const router = useRouter();
    // Partidos first: the live / next match is what people open an event for (#116).
    const [activeTab, setActiveTab] = useState<TabKey>("matches");
    const [moreOpen, setMoreOpen] = useState(false);
    const openTeam = (teamNumber: number) => router.push(`/team/${teamNumber}?event=${eventCode}`);
    const [scoutingData, setScoutingData] = useState<MatchScouting[]>([]);
    const [filterTeam, setFilterTeam] = useState<number | null>(null);
    const { orgId } = useAuth();
    const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;

    // Determine total rounds based on max plays by any team, defaults to 5 if not found
    const totalRounds = useMemo(() => {
        if (!rankings.length) return 5;
        return Math.max(...rankings.map(r => r.matchesPlayed)) || 5;
    }, [rankings]);

    // null = "Final" (follows new rounds as they come in). The slider lives on
    // Ranking only, so the other tabs always use the latest round.
    const [roundChoice, setRoundChoice] = useState<number | null>(null);
    const selectedRound = activeTab === "rankings" && roundChoice !== null ? Math.min(roundChoice, totalRounds) : totalRounds;

    // Fetch scouting data when Oracle or Matches is active
    useEffect(() => {
        if (!((activeTab === 'alliances' || activeTab === 'matches') && eventCode)) return;
        let cancelled = false;
        let unsubscribe: (() => void) | undefined;
        (async () => {
            const { listenToMatchScouting } = await import("@/lib/scouting-service");
            if (cancelled) return;
            unsubscribe = listenToMatchScouting(season, eventCode, effectiveOrgId, (data) => {
                setScoutingData(data);
            });
        })();
        return () => { cancelled = true; unsubscribe?.(); };
    }, [activeTab, eventCode, season, effectiveOrgId]);

    const matchesPerRound = useMemo(() => {
        if (!rankings.length) return 0;
        const qualMatches = matches.filter(m => m.tournamentLevel === 'QUALIFICATION');
        return Math.ceil(qualMatches.length / totalRounds);
    }, [matches, rankings.length, totalRounds]);

    const simulatedRankings = useMemo(() => {
        if (selectedRound >= totalRounds) {
            return rankings;
        }

        const matchLimit = selectedRound * matchesPerRound;
        const validMatches = matches
            .filter(m => m.tournamentLevel === 'QUALIFICATION')
            .sort((a, b) => a.matchNumber - b.matchNumber)
            .slice(0, matchLimit);

        const teamNames = new Map(rankings.map(r => [r.teamNumber, r.teamName]));
        const stats = new Map<number, {
            teamNumber: number;
            rp: number;
            tbp1: number;
            tbp2: number;
            matchesPlayed: number;
            wins: number;
            losses: number;
            ties: number;
            highScore: number;
        }>();

        rankings.forEach(r => {
            stats.set(r.teamNumber, {
                teamNumber: r.teamNumber,
                rp: 0,
                tbp1: 0,
                tbp2: 0,
                matchesPlayed: 0,
                wins: 0,
                losses: 0,
                ties: 0,
                highScore: 0
            });
        });

        // Win/tie RP of the season (3/1 in DECODE and BIOBUZZ) plus the
        // official bonus RPs of each alliance — RS is their average.
        const { winRp, tieRp } = seasonRulesFor(season);
        validMatches.forEach(m => {
            const processTeam = (teamNumber: number, alliance: 'Red' | 'Blue', myScore: number, oppScore: number, myAuto: number, myFoulGiven: number) => {
                const s = stats.get(teamNumber);
                if (!s) return;
                s.matchesPlayed++;
                if (myScore > oppScore) { s.rp += winRp; s.wins++; }
                else if (myScore < oppScore) { s.losses++; }
                else { s.rp += tieRp; s.ties++; }
                s.rp += matchBonusRp?.[`${m.matchNumber}-${alliance}`] ?? 0;
                const np = myScore - myFoulGiven;
                s.tbp1 += np;
                s.tbp2 += myAuto;
                s.highScore = Math.max(s.highScore, myScore);
            };
            m.teams.forEach(t => {
                const isRed = t.station.startsWith('Red');
                // np subtracts penalties RECEIVED (= the opponent's committed fouls).
                if (isRed) processTeam(t.teamNumber, 'Red', m.scoreRedFinal, m.scoreBlueFinal, m.scoreRedAuto, m.scoreBlueFoul);
                else processTeam(t.teamNumber, 'Blue', m.scoreBlueFinal, m.scoreRedFinal, m.scoreBlueAuto, m.scoreRedFoul);
            });
        });

        const calculated = Array.from(stats.values()).map(s => {
            const played = s.matchesPlayed || 1;
            return {
                rank: 0,
                teamNumber: s.teamNumber,
                teamName: teamNames.get(s.teamNumber) || `Team ${s.teamNumber}`,
                sortOrder1: s.rp / played,
                sortOrder2: s.tbp1 / played,
                sortOrder3: 0,
                sortOrder4: s.tbp2 / played,
                wins: s.wins,
                losses: s.losses,
                ties: s.ties,
                matchesPlayed: s.matchesPlayed,
                dq: 0
            } as TeamRanking;
        });

        calculated.sort((a, b) => {
            if (b.sortOrder1 !== a.sortOrder1) return b.sortOrder1 - a.sortOrder1;
            if (b.sortOrder2 !== a.sortOrder2) return b.sortOrder2 - a.sortOrder2;
            return b.sortOrder4 - a.sortOrder4;
        });

        calculated.forEach((item, index) => { item.rank = index + 1; });
        return calculated;
    }, [matches, rankings, selectedRound, totalRounds, matchesPerRound, season, matchBonusRp]);

    // MAP TO TEAM EVOLUTION FOR ORACLE
    const oracleTeams = useMemo(() => {
        // 1. Calculate OPR Metrics based on current match filter
        const matchLimit = selectedRound * matchesPerRound;
        const validMatches = matches
            .filter(m => m.tournamentLevel === 'QUALIFICATION')
            .sort((a, b) => a.matchNumber - b.matchNumber)
            .slice(0, matchLimit);

        const calculateComponentOPR = (getValue: (m: FTCMatch, alliance: 'Red' | 'Blue') => number) => {
            const teamsList = simulatedRankings.map(r => r.teamNumber);
            const n = teamsList.length;
            if (n === 0) return new Map();
            const teamToIndex = new Map(teamsList.map((t, i) => [t, i]));
            const A = Array.from({ length: n }, () => new Float64Array(n));
            const B = new Float64Array(n);

            validMatches.forEach(m => {
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

            // Gauss-Seidel Solver (50 iterations for speed/responsiveness)
            const x = new Float64Array(n).fill(0);
            for (let iter = 0; iter < 50; iter++) {
                for (let i = 0; i < n; i++) {
                    let sum = 0;
                    for (let j = 0; j < n; j++) if (i !== j) sum += A[i][j] * x[j];
                    if (A[i][i] > 0) x[i] = (B[i] - sum) / A[i][i];
                }
            }
            return new Map(teamsList.map((t, i) => [t, x[i]]));
        };

        // Strength + σ = the calibrated live model (#109/#113), the same numbers
        // the ledger, "Hoy" and the match list use. (Was an unregularized OPR,
        // noisy with ~5 quals per robot, and a σ from a one-event fallback.)
        const model = eventStrengthModel(validMatches.filter(m => !!m.postResultTime || m.scoreRedFinal + m.scoreBlueFinal > 0));
        const robotSigma = oracleRobotSigma(model);
        const overallOPR = new Map(simulatedRankings.map(r => [r.teamNumber, model.strength(r.teamNumber)]));
        const autoOPR = calculateComponentOPR((m, alliance) => alliance === 'Red' ? m.scoreRedAuto : m.scoreBlueAuto);
        const drawnFoul = calculateComponentOPR((m, alliance) => alliance === 'Red' ? m.scoreBlueFoul : m.scoreRedFoul);
        const committedFoul = calculateComponentOPR((m, alliance) => alliance === 'Red' ? m.scoreRedFoul : m.scoreBlueFoul);

        // Calculate maxes for normalization
        const maxPower = Math.max(...simulatedRankings.map(r => r.sortOrder2 + r.sortOrder4)) || 1;

        return simulatedRankings.map(rank => {
            // Trend logic: compare last 2 matches vs overall event avg
            // reusing validMatches which is already sorted
            const teamMatches = validMatches.filter(m => m.teams.some(t => t.teamNumber === rank.teamNumber));
            const lastTwo = teamMatches.slice(-2);
            let trend: 'up' | 'down' | 'stable' = 'stable';

            if (lastTwo.length >= 2) {
                const recentAvg = lastTwo.reduce((acc, m) => {
                    const isRed = m.teams.some(t => t.teamNumber === rank.teamNumber && t.station.startsWith('Red'));
                    return acc + (isRed ? m.scoreRedFinal - m.scoreBlueFoul : m.scoreBlueFinal - m.scoreRedFoul);
                }, 0) / 2;

                const overallAvg = rank.sortOrder2;
                if (recentAvg > overallAvg * 1.1) trend = 'up';
                else if (recentAvg < overallAvg * 0.9) trend = 'down';
            }

            const powerScore = ((rank.sortOrder2 + rank.sortOrder4) / maxPower) * 100;

            const opr = overallOPR.get(rank.teamNumber) || 0;
            const auto = autoOPR.get(rank.teamNumber) || 0;
            const tele = opr - auto;
            const netDisc = (drawnFoul.get(rank.teamNumber) || 0) - (committedFoul.get(rank.teamNumber) || 0);

            // RP Probabilities (Hybrid: API inferred + Scouting fallback)
            // We calculate the % of matches where the team's ALLIANCE achieved thresholds likely to grant RPs.
            const rpTeamMatches = validMatches.filter(m => m.teams.some(t => t.teamNumber === rank.teamNumber));
            const totalMatches = rpTeamMatches.length;

            let rpMovement = 0;
            let rpArtifacts = 0;
            let rpPattern = 0;

            // BIOBUZZ (2026+): probabilities come from the server's count
            // models (teamRp); no invented point thresholds here.
            if (season < 2026 && totalMatches > 0) {
                let autoSuccess = 0;
                let teleSuccess = 0;
                let patternSuccess = 0;

                rpTeamMatches.forEach(m => {
                    const isRed = m.teams.some(t => t.teamNumber === rank.teamNumber && t.station.startsWith('Red'));
                    const autoScore = isRed ? m.scoreRedAuto : m.scoreBlueAuto;
                    const totalScore = isRed ? m.scoreRedFinal : m.scoreBlueFinal;
                    const teleScore = totalScore - autoScore - (isRed ? m.scoreBlueFoul : m.scoreRedFoul); // Approx teleop (minus RECEIVED penalties)

                    // Thresholds for "Into The Deep" (Estimated)
                    // Auto RP usually requires specific tasks (Ascent + Samples). ~40pts is a good proxy for high auto achievement.
                    if (autoScore >= 35) autoSuccess++;

                    // Artifacts/Volume RP equivalent -> High TeleOp throughput. ~80pts implies significant cycling.
                    if (teleScore >= 75) teleSuccess++;

                    // Pattern/Endgame? Hard to infer. Let's use a very high score threshold (>130) as specific "Complete Game" proxy.
                    if (totalScore >= 130) patternSuccess++;
                });

                rpMovement = autoSuccess / totalMatches;
                rpArtifacts = teleSuccess / totalMatches;
                rpPattern = patternSuccess / totalMatches;
            }

            // Fallback/Augment with Scouting if available (take the higher value to be generous/accurate)
            const teamScoutingMatches = scoutingData.filter(m => m.teamNumber === rank.teamNumber);
            if (season < 2026 && teamScoutingMatches.length > 0) {
                const sTotal = teamScoutingMatches.length;
                const sMov = teamScoutingMatches.filter(m => (m as FTCMatchScouting).movementRP).length / sTotal;
                const sArt = teamScoutingMatches.filter(m => (m as FTCMatchScouting).goalRP).length / sTotal;
                const sPat = teamScoutingMatches.filter(m => (m as FTCMatchScouting).patternRP).length / sTotal;

                rpMovement = Math.max(rpMovement, sMov);
                rpArtifacts = Math.max(rpArtifacts, sArt);
                rpPattern = Math.max(rpPattern, sPat);
            }

            const lastEventStats = {
                eventCode: "CURRENT",
                rank: rank.rank,
                avgPoints: rank.sortOrder2 + rank.sortOrder4,
                avgAuto: rank.sortOrder4,
                avgTeleOp: rank.sortOrder2,
                avgFoul: 0,
                maxPoints: 0,
                rankingPoints: rank.sortOrder1,
                matchesPlayed: rank.matchesPlayed,
                wins: rank.wins || 0,
                losses: rank.losses || 0,
                ties: rank.ties || 0,
                avgEndGame: 0,
                awards: []
            };

            return {
                teamNumber: rank.teamNumber,
                teamName: rank.teamName,
                isAdvanced: false,
                events: [lastEventStats],
                consistencyScore: 0.8, // simplified
                trend,
                powerScore,
                opr,
                season,
                sigma: robotSigma,
                autoOPR: auto,
                teleOPR: tele,
                netDiscipline: netDisc,
                rpMovement,
                rpArtifacts,
                rpPattern,
                ...(season < 2026
                    ? { rp: { movement: rpMovement, goal: rpArtifacts, pattern: rpPattern } }
                    : { rp: teamRp?.[rank.teamNumber]?.rp, rpInputs: teamRp?.[rank.teamNumber]?.rpInputs })
            } as TeamEvolution;
        });
    }, [simulatedRankings, matches, selectedRound, matchesPerRound, scoutingData, season, teamRp]);

    const tabButton = (key: TabKey, Icon: typeof Trophy, extra?: string) => (
        <button
            key={key}
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            onClick={() => { setActiveTab(key); setMoreOpen(false); }}
            className={clsx(
                "flex min-h-[44px] min-w-0 items-center justify-center gap-2 rounded-lg px-2 text-sm font-bold whitespace-nowrap md:shrink-0 md:px-4",
                activeTab === key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                extra,
            )}
        >
            <Icon size={16} aria-hidden className="hidden sm:block" /> {t(`tabs.${key}`)}
        </button>
    );
    const moreActive = MORE_TABS.some(x => x.key === activeTab);

    return (
        <div className="space-y-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div role="tablist" aria-label={t("moreTitle")} className="flex w-full gap-1 rounded-xl bg-muted p-1 md:w-fit">
                    {PRIMARY_TABS.map(x => tabButton(x.key, x.icon, "flex-1 md:flex-none"))}
                    {MORE_TABS.map(x => tabButton(x.key, x.icon, "hidden md:flex"))}
                    <button
                        type="button"
                        onClick={() => setMoreOpen(true)}
                        aria-haspopup="dialog"
                        className={clsx("flex min-h-[44px] min-w-0 flex-1 items-center justify-center gap-1 rounded-lg px-2 text-sm font-bold md:hidden", moreActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}
                    >
                        <MoreHorizontal size={16} aria-hidden /> {moreActive ? t(`tabs.${activeTab}`) : t("tabs.more")}
                    </button>
                    <Link
                        href={`/event/${eventCode}/pro`}
                        className="hidden min-h-[44px] shrink-0 items-center justify-center gap-2 rounded-lg px-4 text-sm font-bold text-brand-ink hover:bg-card md:flex"
                    >
                        <LucideZap size={16} aria-hidden /> PRO
                    </Link>
                </div>

                {activeTab === "rankings" && (
                    <div className="flex w-full min-w-[240px] flex-col gap-1 md:w-auto">
                        <div className="flex items-center justify-between px-1">
                            <label htmlFor="round-history" className="flex items-center gap-1 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                <History size={12} aria-hidden /> {t("history")}
                            </label>
                            <span className="rounded bg-muted px-2 py-0.5 text-xs font-bold text-foreground">
                                {selectedRound === totalRounds ? t("final") : t("round", { n: selectedRound })}
                            </span>
                        </div>
                        <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-2">
                            <span className="text-xs font-bold text-muted-foreground">R1</span>
                            <input
                                id="round-history"
                                type="range"
                                min="1"
                                max={totalRounds}
                                step="1"
                                value={selectedRound}
                                onChange={(e) => { const n = parseInt(e.target.value); setRoundChoice(n >= totalRounds ? null : n); }}
                                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-brand"
                            />
                            <span className="text-xs font-bold text-muted-foreground">{t("final")}</span>
                        </div>
                    </div>
                )}
            </div>

            <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t("moreTitle")} closeLabel={tShell("account.close")}>
                <div className="divide-y divide-border">
                    {MORE_TABS.map(x => (
                        <button key={x.key} type="button" onClick={() => { setActiveTab(x.key); setMoreOpen(false); }}
                            className="flex min-h-[52px] w-full items-center gap-3 px-1 text-left text-base text-foreground">
                            <x.icon size={18} className="text-muted-foreground" aria-hidden /> {t(`tabs.${x.key}`)}
                        </button>
                    ))}
                    <Link href={`/event/${eventCode}/pro`} onClick={() => setMoreOpen(false)} className="flex min-h-[52px] items-center gap-3 px-1 text-base text-foreground">
                        <LucideZap size={18} className="text-muted-foreground" aria-hidden /> PRO
                    </Link>
                </div>
            </Sheet>

            <div className="animate-in fade-in duration-500">
                {activeTab === "rankings" && (
                    <div className="space-y-5">
                        <RankingTable
                            rankings={simulatedRankings}
                            matches={matches}
                            onTeamClick={openTeam}
                            eventCode={eventCode}
                        />
                        <EventStats matches={matches} rankings={rankings} />
                    </div>
                )}
                {activeTab === "teams" && (
                    <ParticipantList
                        rankings={rankings}
                        onTeamClick={openTeam}
                    />
                )}
                {activeTab === "matches" && (
                    <MatchList
                        matches={matches}
                        rankings={simulatedRankings}
                        filterTeam={filterTeam}
                        setFilterTeam={setFilterTeam}
                        scoutingData={scoutingData}
                        schedule={schedule}
                        awards={awards}
                        selectedAlliances={selectedAlliances}
                        eventCode={eventCode}
                    />
                )}
                {activeTab === "alliances" && (
                    <div className="space-y-6">
                        {selectedAlliances && selectedAlliances.length > 0 && (
                            <SelectedAlliancesPanel alliances={selectedAlliances} />
                        )}
                        <AlliancePredictor
                            teams={oracleTeams}
                            scoutingData={scoutingData}
                            officialAlliances={selectedAlliances}
                            eventCode={eventCode}
                            playoffMatches={matches.filter(m => m.tournamentLevel !== "QUALIFICATION" && m.tournamentLevel !== "PRACTICE")}
                        />
                    </div>
                )}
                {activeTab === "advancement" && (
                    <AdvancementList advancement={advancement} points={advancementPoints} rankings={rankings} />
                )}
                {activeTab === "awards" && (
                    <AwardList awards={awards} rankings={rankings} />
                )}
            </div>
        </div>
    );
}

/**
 * Official playoff alliances as published by the FIRST API. Detects the
 * event's format from the data itself: any alliance with a round-2 pick means
 * 3-robot alliances (Competition Manual §15.3 — any 2 of the 3 play each
 * match). Module-level per the React Compiler static-components rule.
 */
function SelectedAlliancesPanel({ alliances }: { alliances: FTCAllianceSelection[] }) {
    const t = useTranslations("EventView");
    const isThreeRobot = alliances.some(a => a.round2 != null);
    return (
        <div className="bg-card border border-border rounded-xl p-4 md:p-5">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
                <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                    {t("officialAlliances")}
                </h3>
                <span className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
                    {t("alliancesFormat", { n: alliances.length, format: isThreeRobot ? t("threeRobot") : t("twoRobot") })}
                </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {alliances.map(a => (
                    <div key={a.number} className="bg-muted rounded-lg px-3 py-2.5 flex items-center gap-3">
                        <span className="w-7 h-7 shrink-0 rounded-md bg-card text-foreground font-display font-bold text-sm flex items-center justify-center">
                            {a.number}
                        </span>
                        <div className="font-mono text-xs text-foreground flex flex-wrap gap-x-2 gap-y-0.5">
                            {a.captain && <span className="font-bold" title={a.captain.teamName ?? undefined}>{a.captain.teamNumber}</span>}
                            {a.round1 && <span title={a.round1.teamName ?? undefined}>· {a.round1.teamNumber}</span>}
                            {a.round2 && <span className="text-muted-foreground" title={a.round2.teamName ?? undefined}>· {a.round2.teamNumber}</span>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
