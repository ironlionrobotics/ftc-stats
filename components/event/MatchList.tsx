"use client";

import { gameDefinitionFor } from "@/lib/games/registry";
import { inputsFromEntry } from "@/lib/games/score-inputs";
import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { FTCMatch, TeamRanking, FTCMatchTeam, MatchScouting, FTCMatchScouting, FTCHybridScheduleMatch, FTCAward, FTCAllianceSelection } from "@/types/scouting";
import { winProbabilityFromNormalModel } from "@/lib/win-probability";
import { playoffForecaster } from "@/lib/playoff-form";
import { eventStrengthModel } from "@/lib/live-projection";
import { hasStartingPoints, type StartingPoints } from "@/lib/starting-points";
import { predictionLedger, scorecard, type LedgerRow } from "@/lib/prediction-ledger";
import PredictionCell, { LedgerSummary, PredictionBar } from "@/components/event/PredictionLedger";
import clsx from "clsx";
import { Trophy, Zap, Star, Target, MousePointer2, AlertTriangle, Clock, ChevronDown, Award, Users, Filter } from "lucide-react";
import { TeamLink } from "@/components/ui/TeamLink";
import InfoTip from "@/components/event/InfoTip";

interface MatchListProps {
    matches: FTCMatch[];
    rankings: TeamRanking[];
    filterTeam: number | null;
    setFilterTeam: (team: number | null) => void;
    scoutingData: MatchScouting[];
    /** Full hybrid schedule (played + upcoming). Upcoming = null scores. */
    schedule?: FTCHybridScheduleMatch[];
    /** Event awards — surfaced in a filtered team's record header. */
    awards?: FTCAward[];
    /** Official playoff alliances — used to show a team's alliance role. */
    selectedAlliances?: FTCAllianceSelection[];
    /** Event code, so team links carry the event to the team page. */
    eventCode?: string;
    /** Per-robot starting points (#117): forecasts from the first qual. */
    startingPoints?: StartingPoints | null;
}

/** Translator signature shared with module-level helpers. */
type Tr = (key: string, values?: Record<string, string | number>) => string;

export default function MatchList({ matches, rankings, filterTeam, setFilterTeam, scoutingData, schedule, awards, selectedAlliances, eventCode, startingPoints }: MatchListProps) {
    const [expandedMatch, setExpandedMatch] = useState<string | null>(null);
    const tLedger = useTranslations("PredictionLedger");
    const tA = useTranslations("Alliance");
    const t = useTranslations("MatchList");

    const toggleMatch = (matchId: string) => {
        setExpandedMatch(prev => prev === matchId ? null : matchId);
    };

    const filteredMatches = filterTeam
        ? matches.filter(m => m.teams.some(t => t.teamNumber === filterTeam))
        : matches;

    // What PRIDE said BEFORE each played match vs who won (decision #111). Built
    // from the full match list (the model only ever sees earlier matches).
    const ledger = useMemo(() => predictionLedger(matches, startingPoints), [matches, startingPoints]);
    const ledgerByKey = useMemo(() => new Map(ledger.map(r => [`${r.level}:${r.series}:${r.matchNumber}`, r])), [ledger]);
    const ledgerCard = useMemo(
        () => scorecard(filterTeam ? ledger.filter(r => r.red.includes(filterTeam) || r.blue.includes(filterTeam)) : ledger),
        [ledger, filterTeam],
    );
    const predictionFor = (m: FTCMatch): LedgerRow | undefined => ledgerByKey.get(`${m.tournamentLevel}:${m.series ?? 0}:${m.matchNumber}`);

    const qualMatches = filteredMatches.filter(m => m.tournamentLevel === "QUALIFICATION");
    const otherMatches = filteredMatches.filter(m => m.tournamentLevel !== "QUALIFICATION" && m.tournamentLevel !== "PRACTICE");

    const teamNamesMap = new Map(rankings.map(r => [r.teamNumber, r.teamName]));

    // Generic OPR Calculation Helper. useCallback so its identity is stable
    // across renders where matches/rankings are unchanged — the oprData useMemo
    // below depends on it, so an unstable identity would defeat that memoization
    // (React Compiler `preserve-manual-memoization`).
    const calculateComponentOPR = useCallback((getValue: (m: FTCMatch, alliance: 'Red' | 'Blue') => number) => {
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
    }, [matches, rankings]);

    // Calculate Extended OPR Metrics
    const oprData = useMemo(() => {
        // 1. Overall OPR (score minus RECEIVED penalty points) = own output.
        // API semantics (verified vs the official score display): scoreXFoul =
        // penalty points COMMITTED by X, awarded to the opponent — so red's
        // received points are scoreBlueFoul.
        const overall = calculateComponentOPR((m, alliance) =>
            alliance === 'Red' ? (m.scoreRedFinal - m.scoreBlueFoul) : (m.scoreBlueFinal - m.scoreRedFoul)
        );

        // 2. Auto OPR (Autonomous Score)
        const auto = calculateComponentOPR((m, alliance) =>
            alliance === 'Red' ? m.scoreRedAuto : m.scoreBlueAuto
        );

        // 3. Drawn Foul OPR (points RECEIVED from the opponent's fouls) —
        // "Strategy/Provocation". Red receives scoreBlueFoul.
        const drawnFoul = calculateComponentOPR((m, alliance) =>
            alliance === 'Red' ? m.scoreBlueFoul : m.scoreRedFoul
        );

        // 4. Committed Foul OPR (points GIFTED to the opponent) —
        // "Discipline/Sloppiness". Red commits scoreRedFoul.
        const committedFoul = calculateComponentOPR((m, alliance) =>
            alliance === 'Red' ? m.scoreRedFoul : m.scoreBlueFoul
        );

        return { overall, auto, drawnFoul, committedFoul };
    }, [calculateComponentOPR]);

    // --- Upcoming matches + predictions ---------------------------------
    // The hybrid schedule includes unplayed matches (null scores). Predicted
    // no-penalty score = sum of each alliance's overall OPR; win probability
    // comes from the normal model with σ estimated from this event's own OPR
    // residuals (how far real alliances landed from their OPR sum so far).
    const upcomingMatches = useMemo(() => {
        const pending = (schedule ?? []).filter(
            m => m.scoreRedFinal == null && m.tournamentLevel !== "PRACTICE",
        );
        const visible = filterTeam
            ? pending.filter(m => m.teams.some(t => t.teamNumber === filterTeam))
            : pending;
        if (visible.length === 0) return [];

        const residuals: number[] = [];
        matches.forEach(m => {
            if (m.tournamentLevel === "PRACTICE") return;
            (["Red", "Blue"] as const).forEach(alliance => {
                const actual = alliance === "Red"
                    ? m.scoreRedFinal - m.scoreBlueFoul
                    : m.scoreBlueFinal - m.scoreRedFoul;
                const predicted = m.teams
                    .filter(t => t.station.startsWith(alliance))
                    .reduce((s, t) => s + (oprData.overall.get(t.teamNumber) ?? 0), 0);
                residuals.push(actual - predicted);
            });
        });
        // With <4 observations σ=0 and winProbabilityFromNormalModel falls
        // back to its logistic-on-projections estimate.
        const sigmaAlliance = residuals.length >= 4
            ? Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / residuals.length)
            : 0;

        // Same calibrated model as "Hoy" and the following cards (#109/#111);
        // the hand-rolled OPR above only explains the split (auto/tele/fouls).
        const playedQuals = matches.filter(m => m.tournamentLevel === "QUALIFICATION"
            && (!!m.postResultTime || m.scoreRedFinal + m.scoreBlueFinal > 0));
        const model = playedQuals.length >= 2 || hasStartingPoints(startingPoints) ? eventStrengthModel(playedQuals, startingPoints) : null;
        // Upcoming playoffs also learn from the playoff results so far (#113).
        const fc = model ? playoffForecaster(model, matches.filter(m => m.tournamentLevel === "PLAYOFF"
            && (!!m.postResultTime || m.scoreRedFinal + m.scoreBlueFinal > 0))) : null;
        const sigmaDiff = model ? model.sigmaDiff : sigmaAlliance * Math.SQRT2;
        const allianceDetail = (teams: FTCHybridScheduleMatch["teams"]) => {
            const perTeam = teams.map(t => {
                const opr = oprData.overall.get(t.teamNumber) ?? 0;
                const auto = oprData.auto.get(t.teamNumber) ?? 0;
                return {
                    teamNumber: t.teamNumber,
                    opr,
                    auto,
                    tele: opr - auto,
                    foulsGiven: oprData.committedFoul.get(t.teamNumber) ?? 0,
                };
            });
            return {
                perTeam,
                total: perTeam.reduce((s, t) => s + t.opr, 0),
                auto: perTeam.reduce((s, t) => s + t.auto, 0),
                tele: perTeam.reduce((s, t) => s + t.tele, 0),
                foulsGiven: perTeam.reduce((s, t) => s + t.foulsGiven, 0),
            };
        };

        return [...visible]
            .sort((a, b) => a.matchNumber - b.matchNumber)
            .map(m => {
                const red = m.teams.filter(t => t.station.startsWith("Red"));
                const blue = m.teams.filter(t => t.station.startsWith("Blue"));
                const redDetail = allianceDetail(red);
                const blueDetail = allianceDetail(blue);
                const redNums = red.map(t => t.teamNumber), blueNums = blue.map(t => t.teamNumber);
                const isQual = m.tournamentLevel === "QUALIFICATION";
                const mu = (a: number[]) => (!isQual && fc ? fc.mu(a) : a.reduce((sum, t) => sum + (model?.strength(t) ?? 0), 0));
                const pRed = !model || !fc
                    ? winProbabilityFromNormalModel(redDetail.total, blueDetail.total, sigmaDiff)
                    : isQual
                        ? model.pRed(redNums, blueNums)
                        : fc.pRed(redNums, blueNums);
                return {
                    match: m,
                    red,
                    blue,
                    muRed: model ? mu(redNums) : redDetail.total,
                    muBlue: model ? mu(blueNums) : blueDetail.total,
                    pRed,
                    redDetail,
                    blueDetail,
                    sigmaDiff,
                };
            });
    }, [schedule, matches, oprData, filterTeam, startingPoints]);

    // Pre-match win probability of the still-unplayed matches (same numbers as
    // the upcoming cards above) so the phone rows can show it without recomputing.
    const pRedByKey = new Map(upcomingMatches.map(u => [`${u.match.tournamentLevel}:${u.match.series ?? 0}:${u.match.matchNumber}`, u.pRed]));
    const phoneList = (list: FTCMatch[]) => (
        <div className="space-y-2 md:hidden">
            {/* Red/blue always with the word (#116): one legend per list. */}
            <div className="flex justify-between px-12 text-xs font-extrabold tracking-[0.08em]" aria-hidden>
                <span className="text-alliance-red">{tA("red")}</span>
                <span className="text-alliance-blue">{tA("blue")}</span>
            </div>
            {list.map(match => (
                <MatchCard
                    key={`${match.tournamentLevel}-${match.series ?? 0}-${match.matchNumber}-${match.description}`}
                    match={match}
                    filterTeam={filterTeam}
                    eventCode={eventCode}
                    prediction={predictionFor(match)}
                    pRedPending={pRedByKey.get(`${match.tournamentLevel}:${match.series ?? 0}:${match.matchNumber}`)}
                />
            ))}
        </div>
    );

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

    // Awards + alliance role for the filtered team, shown in its record header.
    const teamAwards = filterTeam && awards ? awards.filter(a => a.teamNumber === filterTeam) : [];
    const allianceRole = (() => {
        if (!filterTeam || !selectedAlliances?.length) return null;
        for (const a of selectedAlliances) {
            if (a.captain?.teamNumber === filterTeam) return { number: a.number, role: t("roleCaptain") };
            if (a.round1?.teamNumber === filterTeam) return { number: a.number, role: t("rolePick1") };
            if (a.round2?.teamNumber === filterTeam) return { number: a.number, role: t("rolePick2") };
            if (a.backup?.teamNumber === filterTeam) return { number: a.number, role: t("roleBackup") };
        }
        return null;
    })();

    return (
        <div className="space-y-8">
            {filterTeam && (
                <div className="space-y-6 animate-in fade-in slide-in-from-top-4 duration-500">
                    {/* Filter Header */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between p-6 bg-gradient-to-r from-primary/10 to-transparent border border-primary/20 rounded-3xl gap-6">
                        <div className="flex items-center gap-5">
                            <div className="min-w-16 w-fit h-16 px-4 bg-primary rounded-2xl flex items-center justify-center text-3xl font-black text-primary-foreground shadow-sm shadow-primary/20">
                                {filterTeam}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-foreground tracking-tight leading-none mb-2">{teamNamesMap.get(filterTeam)}</h2>
                                <div className="flex items-center gap-3 text-muted-foreground text-sm font-medium">
                                    <span className="flex items-center gap-1.5"><Trophy size={14} className="text-primary" /> {t("matchesAnalyzed", { n: stats.count })}</span>
                                    <span className="w-1 h-1 rounded-full bg-border" />
                                    <span>{t("ftcSeason")}</span>
                                </div>
                                {(allianceRole || teamAwards.length > 0) && (
                                    <div className="flex flex-wrap items-center gap-2 mt-3">
                                        {allianceRole && (
                                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-xs font-bold">
                                                <Users size={12} /> {t("allianceRole", { n: allianceRole.number, role: allianceRole.role })}
                                            </span>
                                        )}
                                        {teamAwards.map((aw, i) => {
                                            const label = aw.name || aw.awardName || t("awardFallback");
                                            const isWin = aw.series === 1;
                                            return (
                                                <span
                                                    key={`${aw.awardId ?? label}-${i}`}
                                                    className={clsx(
                                                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border",
                                                        isWin ? "bg-warning/10 text-warning border-warning/20" : "bg-muted text-muted-foreground border-border",
                                                    )}
                                                >
                                                    <Award size={12} /> {label}
                                                </span>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => setFilterTeam(null)}
                            className="px-6 py-3 bg-muted hover:bg-muted/80 text-foreground text-sm font-bold rounded-2xl transition-all border border-border flex items-center justify-center gap-2 group"
                        >
                            {t("clearFilter")} <span className="text-primary group-hover:rotate-90 transition-transform">×</span>
                        </button>
                    </div>

                    {/* KPI Grid */}
                    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
                        <KPICard
                            label={t("kpiOpr")}
                            value={opr.toFixed(1)}
                            icon={<Zap className="text-warning" size={20} />}
                            subline={t("kpiOprSub")}
                            tooltip={
                                <div className="space-y-2">
                                    <p><strong className="text-warning">{t("tipWhat")}</strong> {t("tipOprWhat")}</p>
                                    <p><strong>{t("tipHow")}</strong> {t("tipOprHow")}</p>
                                    <p><strong>{t("tipRead")}</strong></p>
                                    <ul className="list-disc list-inside opacity-90">
                                        <li><span className="text-success">{t("tipHigh")}</span> {t("tipOprHigh")}</li>
                                        <li><span className="text-error">{t("tipLow")}</span> {t("tipOprLow")}</li>
                                    </ul>
                                </div>
                            }
                        />
                        <KPICard
                            label={t("kpiAuto")}
                            value={autoOPR.toFixed(1)}
                            icon={<Target className="text-primary" size={20} />}
                            subline={t("kpiAutoSub")}
                            tooltip={
                                <div className="space-y-2">
                                    <p><strong className="text-primary">{t("tipWhat")}</strong> {t("tipAutoWhat")}</p>
                                    <p><strong>{t("tipHow")}</strong> {t("tipAutoHow")}</p>
                                    <p><strong>{t("tipUse")}</strong> {t("tipAutoUse")}</p>
                                </div>
                            }
                        />
                        <KPICard
                            label={t("kpiTele")}
                            value={teleOPR.toFixed(1)}
                            icon={<MousePointer2 className="text-secondary" size={20} />}
                            subline={t("kpiTeleSub")}
                            tooltip={
                                <div className="space-y-2">
                                    <p><strong className="text-secondary">{t("tipWhat")}</strong> {t("tipTeleWhat")}</p>
                                    <p><strong>{t("tipHow")}</strong> {t("tipTeleHow")}</p>
                                    <p><strong>{t("tipUse")}</strong> {t("tipTeleUse")}</p>
                                </div>
                            }
                        />
                        <KPICard
                            label={t("kpiFoul")}
                            value={(drawnFoulOPR > 0 ? "+" : "") + drawnFoulOPR.toFixed(1)}
                            icon={<Star className="text-primary" size={20} />}
                            subline={t("kpiFoulSub")}
                            tooltip={
                                <div className="space-y-2">
                                    <p><strong className="text-primary">{t("tipWhat")}</strong> {t("tipFoulWhat")}</p>
                                    <p><strong>{t("tipHow")}</strong> {t("tipFoulHow")}</p>
                                    <p><strong>{t("tipRead")}</strong></p>
                                    <ul className="list-disc list-inside opacity-90">
                                        <li><span className="text-success">{t("tipHigh")}</span> {t("tipFoulHigh")}</li>
                                        <li><span className="text-muted-foreground">{t("tipZero")}</span> {t("tipFoulLow")}</li>
                                    </ul>
                                </div>
                            }
                        />
                        <KPICard
                            label={t("kpiNet")}
                            value={(netDiscipline > 0 ? "+" : "") + netDiscipline.toFixed(1)}
                            icon={<Zap className={netDiscipline >= 0 ? "text-success" : "text-error"} size={20} />}
                            subline={t("kpiNetSub")}
                            tooltip={
                                <div className="space-y-2">
                                    <p><strong className={netDiscipline >= 0 ? "text-success" : "text-error"}>{t("tipWhat")}</strong> {t("tipNetWhat")}</p>
                                    <p><strong>{t("tipHow")}</strong> {t("tipNetHow")}</p>
                                    <p><strong>{t("tipRead")}</strong></p>
                                    <ul className="list-disc list-inside opacity-90">
                                        <li><span className="text-success">{t("tipPos")}</span> {t("tipNetPos")}</li>
                                        <li><span className="text-error">{t("tipNeg")}</span> {t("tipNetNeg")}</li>
                                    </ul>
                                </div>
                            }
                        />
                        <div className="bg-card border border-border rounded-2xl p-4 hover:border-primary/30 transition-all shadow-sm flex flex-col justify-between relative">
                            <InfoTip align="end" className="absolute top-2 right-2">
                                <p className="mb-1"><strong className="text-error">{t("tipCardsTitle")}</strong></p>
                                <p className="text-xs leading-relaxed">{t("tipCardsBody")}</p>
                            </InfoTip>
                            <div className="flex items-center justify-between mb-3">
                                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{t("kpiCards")}</span>
                                <AlertTriangle className="text-danger" size={20} />
                            </div>

                            <div className="flex gap-2">
                                <div className="flex-1 bg-warning/10 border border-warning/20 rounded-lg p-2 text-center">
                                    <div className="text-xl font-black text-warning">{stats.yellowCards}</div>
                                    <div className="text-xs font-bold text-warning uppercase">{t("yellow")}</div>
                                </div>
                                <div className="flex-1 bg-danger/10 border border-danger/20 rounded-lg p-2 text-center">
                                    <div className="text-xl font-black text-danger">{stats.redCards}</div>
                                    <div className="text-xs font-bold text-danger uppercase">{t("red")}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {upcomingMatches.length > 0 && (
                <section>
                    <div className="flex items-baseline justify-between mb-4 gap-3 flex-wrap">
                        <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
                            <span className="w-2 h-8 bg-secondary rounded-full" />
                            {t("upcoming")}
                            <span className="px-2 py-0.5 rounded-md bg-secondary/10 text-secondary font-mono text-xs">{upcomingMatches.length}</span>
                        </h3>
                        <p className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">
                            {t("predictionNote")}
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                        {upcomingMatches.map((item, idx) => (
                            <UpcomingMatchCard
                                key={`${item.match.tournamentLevel}-${item.match.matchNumber}-${item.match.series ?? 0}`}
                                item={item}
                                filterTeam={filterTeam}
                                eventCode={eventCode}
                                isNext={idx === 0}
                            />
                        ))}
                    </div>
                </section>
            )}

            {ledgerCard.n > 0 && <LedgerSummary card={ledgerCard} team={filterTeam} />}

            {qualMatches.length > 0 && (
                <section>
                    <h3 className="text-xl font-bold text-foreground mb-4 flex items-center gap-2">
                        <span className="w-2 h-8 bg-primary rounded-full transition-all" />
                        {t("qualResults")} {filterTeam && <span className="text-muted-foreground text-sm font-normal">{t("matchCount", { n: qualMatches.length })}</span>}
                    </h3>
                    {phoneList(qualMatches)}
                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="text-muted-foreground border-b border-border text-sm uppercase tracking-wider">
                                    <th className="p-4 font-medium min-w-[170px]">{t("colMatch")} · {tLedger("column")}</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-alliance-red/5 text-alliance-red rounded-tl-lg border-x border-border/50">{t("colRed")}</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-alliance-blue/5 text-alliance-blue rounded-tr-lg border-x border-border/50">{t("colBlue")}</th>
                                    <th className="p-4 font-medium text-center min-w-[120px]">{t("colScore")}</th>
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
                                        prediction={predictionFor(match)}
                                        eventCode={eventCode}
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
                        {t("playoffs")} {filterTeam && <span className="text-muted-foreground text-sm font-normal">{t("matchCount", { n: otherMatches.length })}</span>}
                    </h3>
                    {phoneList(otherMatches)}
                    <div className="hidden overflow-x-auto md:block">
                        <table className="w-full text-left border-collapse min-w-[900px]">
                            <thead>
                                <tr className="text-muted-foreground border-b border-border text-sm uppercase tracking-wider">
                                    <th className="p-4 font-medium min-w-[170px]">{t("colMatch")} · {tLedger("column")}</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-alliance-red/5 text-alliance-red rounded-tl-lg border-x border-border/50">{t("colRed")}</th>
                                    <th colSpan={2} className="p-2 font-medium text-center bg-alliance-blue/5 text-alliance-blue rounded-tr-lg border-x border-border/50">{t("colBlue")}</th>
                                    <th className="p-4 font-medium text-center min-w-[120px]">{t("colScore")}</th>
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
                                        prediction={predictionFor(match)}
                                        eventCode={eventCode}
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}

            {filteredMatches.length === 0 && (
                <div className="text-muted-foreground italic text-center py-8">{t("empty")}</div>
            )}
        </div>
    );
}

function KPICard({ label, value, icon, subline, tooltip }: { label: string, value: string, icon: React.ReactNode, subline: string, tooltip?: React.ReactNode }) {
    return (
        <div className="bg-card border border-border rounded-2xl p-4 hover:border-primary/30 transition-all shadow-sm relative">
            {tooltip && <InfoTip align="end" className="absolute top-2 right-2">{tooltip}</InfoTip>}
            <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{label}</span>
                <div className="p-2 bg-muted rounded-lg group-hover:bg-primary/10 transition-colors">
                    {icon}
                </div>
            </div>
            <div className="text-2xl font-black text-foreground font-display mb-1">{value}</div>
            <div className="text-xs text-muted-foreground font-medium">{subline}</div>
        </div>
    );
}

function TeamInfo({ team, teamNamesMap, onTeamClick, filterTeam, eventCode }: { team?: FTCMatchTeam, teamNamesMap: Map<number, string>, onTeamClick: (id: number) => void, filterTeam: number | null, eventCode?: string }) {
    const t = useTranslations("MatchList");
    if (!team) return <div className="min-w-[120px]" />;
    const name = teamNamesMap.get(team.teamNumber) || t("teamFallback");
    const isRed = team.station.startsWith('Red');
    const isFiltered = filterTeam === team.teamNumber;

    return (
        <div
            className={clsx(
                "flex flex-col items-center min-w-[140px] px-3 rounded-xl py-2 transition-all relative",
                isFiltered
                    ? (isRed
                        ? "bg-alliance-red/10 ring-2 ring-alliance-red z-20 shadow-sm"
                        : "bg-alliance-blue/10 ring-2 ring-alliance-blue z-20 shadow-sm")
                    : ""
            )}
        >
            <div className="absolute top-1 right-1 flex flex-col gap-0.5">
                {team.yellowCard && <div className="w-1.5 h-3 bg-warning rounded-sm shadow-sm" />}
                {team.redCard && <div className="w-1.5 h-3 bg-error text-white rounded-sm shadow-sm" />}
            </div>
            {/* The number goes to the team page; filtering is its own explicit control. */}
            <span className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                <TeamLink
                    team={team.teamNumber}
                    event={eventCode}
                    className={clsx(isRed ? "text-alliance-red" : "text-alliance-blue", isFiltered ? "font-black text-lg" : "font-bold text-base")}
                />
                <button
                    type="button"
                    onClick={() => onTeamClick(team.teamNumber)}
                    aria-label={t("filterTeam", { team: team.teamNumber })}
                    aria-pressed={isFiltered}
                    className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                    <Filter size={14} aria-hidden />
                </button>
            </span>
            <span className={clsx(
                "text-xs uppercase tracking-tighter font-medium text-center leading-tight whitespace-normal max-w-[130px]",
                isFiltered
                    ? (isRed ? "text-alliance-red font-black" : "text-alliance-blue font-black")
                    : "text-muted-foreground"
            )}>
                {name}
            </span>
        </div>
    );
}

/** "Q14" for quals, the shortened description otherwise ("Round 1 Match 2" -> "R1 M2"). */
function shortenDescription(desc: string) {
    return desc
        .replace(/Round\s+/g, 'R')
        .replace(/Match\s+/g, 'M')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Phone layout of one match (< md): label, red alliance left, score (or the
 * predicted win % when unplayed) in the middle with the winning score
 * underlined, blue alliance right. Team numbers open the team page.
 */
function MatchCard({ match, filterTeam, eventCode, prediction, pRedPending }: {
    match: FTCMatch;
    filterTeam: number | null;
    eventCode?: string;
    prediction?: LedgerRow;
    /** P(red wins) for a match that has not been played yet. */
    pRedPending?: number;
}) {
    const t = useTranslations("MatchList");
    const redTeams = match.teams.filter(x => x.station.startsWith('Red')).sort((a, b) => a.station.localeCompare(b.station));
    const blueTeams = match.teams.filter(x => x.station.startsWith('Blue')).sort((a, b) => a.station.localeCompare(b.station));
    const isPlayed = !!match.postResultTime || (match.scoreRedFinal > 0 || match.scoreBlueFinal > 0);
    const redWin = isPlayed && match.scoreRedFinal > match.scoreBlueFinal;
    const blueWin = isPlayed && match.scoreBlueFinal > match.scoreRedFinal;
    const mine = filterTeam != null && match.teams.some(x => x.teamNumber === filterTeam);
    const label = match.tournamentLevel === "QUALIFICATION" ? `Q${match.matchNumber}` : shortenDescription(match.description);
    const time = match.actualStartTime
        ? new Date(match.actualStartTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : null;
    const pctRed = pRedPending === undefined ? null : Math.round(pRedPending * 100);
    const scoreCls = (win: boolean, color: string) => clsx(
        "font-mono text-lg tabular-nums",
        win ? clsx("font-black underline decoration-2 underline-offset-4", color) : "font-medium text-muted-foreground",
    );

    return (
        <div className={clsx(
            "min-h-[52px] rounded-xl border border-border bg-card px-3 py-1",
            mine && "shadow-[inset_4px_0_0_var(--color-brand)]",
        )}>
            {mine && <span className="sr-only">{t("phoneFollowed")}</span>}
            <div className="grid grid-cols-[3.25rem_1fr_auto_1fr] items-center gap-2">
                <span className="font-mono text-xs font-bold leading-tight text-muted-foreground">{label}</span>
                <div className="flex flex-col items-start">
                    <span className="sr-only">{t("sideRed")}</span>
                    {redTeams.map(x => (
                        <TeamLink key={x.teamNumber} team={x.teamNumber} event={eventCode} className="inline-flex min-h-8 items-center px-1 text-base font-bold text-alliance-red" />
                    ))}
                </div>
                <div className="text-center">
                    {isPlayed ? (
                        <>
                            <span className={scoreCls(redWin, "text-alliance-red")}>{match.scoreRedFinal}</span>
                            <span className="mx-1 text-muted-foreground" aria-hidden>–</span>
                            <span className={scoreCls(blueWin, "text-alliance-blue")}>{match.scoreBlueFinal}</span>
                        </>
                    ) : pctRed !== null ? (
                        <span className="font-mono text-xs font-bold tabular-nums text-muted-foreground">{t("phoneWinPct", { red: pctRed, blue: 100 - pctRed })}</span>
                    ) : (
                        <span className="text-xs text-muted-foreground" suppressHydrationWarning>{time ?? t("pending")}</span>
                    )}
                </div>
                <div className="flex flex-col items-end">
                    <span className="sr-only">{t("sideBlue")}</span>
                    {blueTeams.map(x => (
                        <TeamLink key={x.teamNumber} team={x.teamNumber} event={eventCode} className="inline-flex min-h-8 items-center px-1 text-base font-bold text-alliance-blue" />
                    ))}
                </div>
            </div>
            {isPlayed && <div className="pb-1.5 pl-[3.75rem]"><PredictionCell row={prediction} /></div>}
        </div>
    );
}

function MatchRow({ match, rankings, teamNamesMap, onTeamClick, filterTeam, scoutingData, isExpanded, onToggle, prediction, eventCode }: {
    eventCode?: string,
    match: FTCMatch,
    rankings: TeamRanking[],
    teamNamesMap: Map<number, string>,
    onTeamClick: (id: number) => void,
    filterTeam: number | null,
    scoutingData: MatchScouting[],
    isExpanded: boolean,
    onToggle: () => void,
    /** PRIDE's pre-match forecast for this match (#111). */
    prediction?: LedgerRow
}) {
    const redTeams = match.teams.filter(t => t.station.startsWith('Red')).sort((a, b) => a.station.localeCompare(b.station));
    const blueTeams = match.teams.filter(t => t.station.startsWith('Blue')).sort((a, b) => a.station.localeCompare(b.station));

    const t = useTranslations("MatchList");
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

    return (
        <>
            <tr onClick={onToggle} className={`cursor-pointer transition-colors border-b border-border/50 last:border-0 ${isExpanded ? "bg-muted shadow-inner" : "hover:bg-muted/50"}`}>
                <td className="p-4">
                    <div className="font-bold text-foreground whitespace-nowrap flex items-center gap-2">
                        {shortenDescription(match.description)}
                        {isExpanded && <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />}
                    </div>
                    {isPlayed && <div className="mt-1.5"><PredictionCell row={prediction} /></div>}
                </td>

                <td className={clsx("p-4 border-l-4", redWin ? "border-alliance-red bg-alliance-red/10" : "border-transparent")}>
                    <TeamInfo team={redTeams[0]} teamNamesMap={teamNamesMap} onTeamClick={(id) => { onTeamClick(id); }} filterTeam={filterTeam} eventCode={eventCode} />
                </td>
                <td className={clsx("p-4 border-r border-border/20", redWin ? "bg-alliance-red/10" : "border-transparent")}>
                    <TeamInfo team={redTeams[1]} teamNamesMap={teamNamesMap} onTeamClick={(id) => { onTeamClick(id); }} filterTeam={filterTeam} eventCode={eventCode} />
                </td>

                <td className={clsx("p-4", blueWin ? "bg-alliance-blue/10" : "border-transparent")}>
                    <TeamInfo team={blueTeams[0]} teamNamesMap={teamNamesMap} onTeamClick={(id) => { onTeamClick(id); }} filterTeam={filterTeam} eventCode={eventCode} />
                </td>
                <td className={clsx("p-4 border-r-4", blueWin ? "border-alliance-blue bg-alliance-blue/10" : "border-transparent")}>
                    <TeamInfo team={blueTeams[1]} teamNamesMap={teamNamesMap} onTeamClick={(id) => { onTeamClick(id); }} filterTeam={filterTeam} eventCode={eventCode} />
                </td>

                <td className="p-4 text-center min-w-[200px]">
                    {isPlayed ? (
                        <div className="flex flex-col gap-2">
                            <div className="flex items-center justify-center gap-2 font-display px-2">
                                <div className={clsx(
                                    "flex items-center justify-center min-w-[45px] py-1 rounded-lg transition-all",
                                    redWin ? "bg-alliance-red-fill text-white shadow-sm" : "text-muted-foreground/30 font-medium"
                                )}>
                                    <span className={clsx("text-xl", redWin ? "font-black" : "font-bold")}>{match.scoreRedFinal}</span>
                                </div>
                                <span className="text-xs font-black text-border uppercase">{t("final")}</span>
                                <div className={clsx(
                                    "flex items-center justify-center min-w-[45px] py-1 rounded-lg transition-all",
                                    blueWin ? "bg-alliance-blue-fill text-white shadow-sm" : "text-muted-foreground/30 font-medium"
                                )}>
                                    <span className={clsx("text-xl", blueWin ? "font-black" : "font-bold")}>{match.scoreBlueFinal}</span>
                                </div>
                            </div>
                            <PredictionBar row={prediction} />

                        </div>
                    ) : (
                        <div className="text-center">
                            {startTime ? <span className="px-2 py-1 bg-muted rounded text-xs font-bold text-muted-foreground" suppressHydrationWarning>{startTime}</span> : <span className="text-xs text-muted-foreground">{t("pending")}</span>}
                        </div>
                    )}
                </td>
            </tr>

            {isExpanded && (
                <tr className="bg-muted/30 animate-in slide-in-from-top-2 duration-300">
                    <td colSpan={6} className="p-0">
                        <MatchDetails match={match} rankings={rankings} scoutingData={scoutingData} eventCode={eventCode} />
                    </td>
                </tr>
            )}
        </>
    );
}

function MatchDetails({ match, rankings, scoutingData, eventCode }: { match: FTCMatch, rankings: TeamRanking[], scoutingData: MatchScouting[], eventCode?: string }) {
    const t = useTranslations("MatchList");
    const redTele = match.scoreRedFinal - match.scoreRedAuto - match.scoreBlueFoul;
    const blueTele = match.scoreBlueFinal - match.scoreBlueAuto - match.scoreRedFoul;

    const redTeams = match.teams.filter(t => t.station.startsWith('Red'));
    const blueTeams = match.teams.filter(t => t.station.startsWith('Blue'));

    const getTeamStats = (teamNumber: number) => {
        // Try to find specific match scouting data
        const matchScouting = scoutingData.find(s => s.teamNumber === teamNumber && s.matchNumber === match.matchNumber);
        // Also get season stats
        const rank = rankings.find(r => r.teamNumber === teamNumber);

        return {
            name: rank?.teamName || t("teamFallback"),
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
                    <h4 className="text-alliance-red font-bold uppercase tracking-widest text-xs border-b border-alliance-red/20 pb-2">{t("detailRed")}</h4>
                    <div className="grid gap-2">
                        <StatRow label={t("statAuto")} value={match.scoreRedAuto} color="text-alliance-red font-bold" />
                        <StatRow label={t("statTele")} value={redTele} color="text-alliance-red" />
                        <StatRow label={t("statPenaltyIn")} value={match.scoreBlueFoul} color="text-muted-foreground italic" />
                        <div className="pt-2 border-t border-border mt-2">
                            <StatRow label={t("statTotal")} value={match.scoreRedFinal} color="text-alliance-red font-black text-lg" />
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-center">
                    <div className="h-full w-px bg-border mx-auto" />
                </div>

                <div className="space-y-4">
                    <h4 className="text-alliance-blue font-bold uppercase tracking-widest text-xs border-b border-alliance-blue/20 pb-2">{t("detailBlue")}</h4>
                    <div className="grid gap-2">
                        <StatRow label={t("statAuto")} value={match.scoreBlueAuto} color="text-alliance-blue font-bold" />
                        <StatRow label={t("statTele")} value={blueTele} color="text-alliance-blue" />
                        <StatRow label={t("statPenaltyIn")} value={match.scoreRedFoul} color="text-muted-foreground italic" />
                        <div className="pt-2 border-t border-border mt-2">
                            <StatRow label={t("statTotal")} value={match.scoreBlueFinal} color="text-alliance-blue font-black text-lg" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Team Breakdown (If Scouting Data Exists) */}
            <div className="bg-card rounded-xl border border-border p-4">
                <h4 className="font-bold text-foreground mb-4 flex items-center gap-2">
                    <Zap size={16} className="text-primary" /> {t("insights")}
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {[redTeams, blueTeams].map((teams, idx) => (
                        <div key={idx} className="space-y-3">
                            {teams.map(tm => {
                                const stats = getTeamStats(tm.teamNumber);
                                return (
                                    <div key={tm.teamNumber} className="flex items-center justify-between p-3 bg-muted rounded-lg border border-border">
                                        <div>
                                            <div className={`text-lg font-black font-mono ${idx === 0 ? "text-alliance-red" : "text-alliance-blue"}`}>
                                                <TeamLink team={tm.teamNumber} event={eventCode} />
                                            </div>
                                            <div className="text-xs text-muted-foreground font-bold uppercase">{stats.name}</div>
                                        </div>
                                        <div className="text-right">
                                            {scoutingData.map((sdItem, i) => {
                                                const sd = sdItem as FTCMatchScouting;
                                                const pts = gameDefinitionFor(sd.program ?? "FTC", sd.season)?.score?.(inputsFromEntry(sd));
                                                const autoTotal = pts?.auto ?? 0;
                                                const teleTotal = pts?.teleop ?? 0;
                                                const endTotal = pts?.endgame ?? 0;
                                                return (
                                                    <div key={i} className="flex justify-between items-center text-xs py-1 px-2 border-b border-primary/10">
                                                        <span className="text-muted-foreground truncate max-w-[100px]">{sd.scoutName ?? sd.scouterName}</span>
                                                        <div className="flex gap-2 text-foreground font-mono">
                                                            <span className={autoTotal > 0 ? "text-success" : ""}>A:{autoTotal}</span>
                                                            <span>T:{teleTotal}</span>
                                                            <span className={endTotal > 0 ? "text-primary" : ""}>E:{endTotal}</span>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            <div>
                                                <span className="block text-xs text-muted-foreground uppercase">{t("seasonNp")}</span>
                                                <span className="font-mono font-bold text-sm text-muted-foreground">{stats.opr.toFixed(1)}</span>
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

/** Per-alliance OPR breakdown used by the prediction and its analysis. */
interface AllianceDetail {
    perTeam: { teamNumber: number; opr: number; auto: number; tele: number; foulsGiven: number }[];
    total: number;
    auto: number;
    tele: number;
    foulsGiven: number;
}

interface UpcomingItem {
    match: FTCHybridScheduleMatch;
    red: FTCHybridScheduleMatch["teams"];
    blue: FTCHybridScheduleMatch["teams"];
    muRed: number;
    muBlue: number;
    pRed: number;
    redDetail: AllianceDetail;
    blueDetail: AllianceDetail;
    sigmaDiff: number;
}

/**
 * Deterministic narrative for "why this prediction": where the edge is built
 * (auto vs teleop), who drives it, foul discipline, and how solid the lead is
 * relative to the event's observed score noise.
 */
function buildMatchAnalysis(t: Tr, redDetail: AllianceDetail, blueDetail: AllianceDetail, pRed: number, sigmaDiff: number): string[] {
    const bullets: string[] = [];
    const diff = redDetail.total - blueDetail.total;
    const favName = t(diff >= 0 ? "sideFemRed" : "sideFemBlue");
    const favDetail = diff >= 0 ? redDetail : blueDetail;
    const absDiff = Math.abs(diff);
    const favPct = Math.round((diff >= 0 ? pRed : 1 - pRed) * 100);

    const autoDiff = redDetail.auto - blueDetail.auto;
    const teleDiff = redDetail.tele - blueDetail.tele;
    const phase = Math.abs(autoDiff) >= Math.abs(teleDiff)
        ? { name: t("anPhaseAuto"), d: autoDiff }
        : { name: t("anPhaseTele"), d: teleDiff };

    if (absDiff < 5) {
        bullets.push(t("anTied", { diff: absDiff.toFixed(0), pct: favPct }));
    } else {
        bullets.push(t("anFavored", { fav: favName, diff: absDiff.toFixed(0), phase: phase.name, phaseDiff: Math.abs(phase.d).toFixed(0) }));
    }

    const top = [...favDetail.perTeam].sort((a, b) => b.opr - a.opr)[0];
    if (top && favDetail.total > 0 && top.opr / Math.max(favDetail.total, 1) >= 0.6) {
        bullets.push(t("anEngine", { fav: favName, team: top.teamNumber, opr: top.opr.toFixed(0), total: favDetail.total.toFixed(0) }));
    }

    const foulGap = Math.abs(redDetail.foulsGiven - blueDetail.foulsGiven);
    const sloppy = redDetail.foulsGiven >= blueDetail.foulsGiven
        ? { side: t("sideFemRed"), v: redDetail.foulsGiven }
        : { side: t("sideFemBlue"), v: blueDetail.foulsGiven };
    if (sloppy.v >= 8 && foulGap >= 5) {
        bullets.push(t("anDiscipline", { side: sloppy.side, pts: sloppy.v.toFixed(0) }));
    }

    if (sigmaDiff > 0) {
        const z = absDiff / sigmaDiff;
        if (z < 0.5) {
            bullets.push(t("anVolatile", { sigma: sigmaDiff.toFixed(0) }));
        } else if (z < 1.2) {
            bullets.push(t("anOpen", { diff: absDiff.toFixed(0), sigma: sigmaDiff.toFixed(0) }));
        } else {
            bullets.push(t("anSolid", { diff: absDiff.toFixed(0), sigma: sigmaDiff.toFixed(0), upset: 100 - favPct }));
        }
    }
    return bullets;
}

/**
 * Card for an unplayed match: alliances, scheduled time, predicted no-penalty
 * score, win-probability split bar, and an expandable "why" analysis built
 * from the OPR components. Module-level per the React Compiler
 * static-components rule.
 */
function UpcomingMatchCard({ item, filterTeam, eventCode, isNext }: {
    item: UpcomingItem;
    filterTeam: number | null;
    eventCode?: string;
    /** The soonest upcoming match — gets the Direction C live scanline signature. */
    isNext?: boolean;
}) {
    const t = useTranslations("MatchList");
    const { match, red, blue, muRed, muBlue, pRed, redDetail, blueDetail, sigmaDiff } = item;
    const [showAnalysis, setShowAnalysis] = useState(false);
    const pctRed = Math.round(pRed * 100);
    const pctBlue = 100 - pctRed;
    const time = match.startTime
        ? new Date(match.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : null;
    const isQual = match.tournamentLevel === "QUALIFICATION";
    const label = isQual ? `Q${match.matchNumber}` : match.description;

    // Team numbers open the team page; the followed/filtered team gets the gold "you" ring.
    const TeamChip = ({ tm, side }: { tm: FTCHybridScheduleMatch["teams"][number]; side: "red" | "blue" }) => (
        <TeamLink
            team={tm.teamNumber}
            event={eventCode}
            underline={false}
            className={clsx(
                "inline-flex min-h-11 items-center px-2 rounded-md text-sm font-bold border",
                side === "red" ? "bg-alliance-red-tint text-alliance-red border-alliance-red/20" : "bg-alliance-blue-tint text-alliance-blue border-alliance-blue/20",
                filterTeam === tm.teamNumber && "ring-2 ring-brand",
            )}
        >
            {tm.teamNumber}{tm.surrogate ? "*" : ""}
        </TeamLink>
    );

    return (
        <div className={clsx(
            "relative overflow-hidden bg-card border rounded-xl p-4 space-y-3 transition-colors",
            isNext ? "border-primary/50" : "border-border hover:border-primary/30",
        )}>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="font-mono text-sm font-bold text-foreground">{label}</span>
                    {isNext && (
                        <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 text-primary font-mono text-xs font-bold uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                            {t("next")}
                        </span>
                    )}
                </div>
                <span className="flex items-center gap-1.5 font-mono text-xs uppercase tracking-wider text-muted-foreground" suppressHydrationWarning>
                    {time && <><Clock size={12} /> {time}</>}
                </span>
            </div>

            <div className="flex items-center justify-between gap-2">
                <div className="flex gap-1.5 flex-wrap">
                    {red.map(tm => <TeamChip key={tm.teamNumber} tm={tm} side="red" />)}
                </div>
                <span className="text-xs font-bold text-muted-foreground uppercase shrink-0">{t("vs")}</span>
                <div className="flex gap-1.5 flex-wrap justify-end">
                    {blue.map(tm => <TeamChip key={tm.teamNumber} tm={tm} side="blue" />)}
                </div>
            </div>

            {/* Predicted score + win probability split */}
            <div className="space-y-1.5">
                <div className="flex items-center justify-between font-mono text-xs text-muted-foreground">
                    <span className={clsx(pRed >= 0.5 && "text-alliance-red font-bold")}>{pctRed}% · {Math.round(muRed)}</span>
                    <span className="text-xs uppercase tracking-wider">{t("projection")}</span>
                    <span className={clsx(pRed < 0.5 && "text-alliance-blue font-bold")}>{Math.round(muBlue)} · {pctBlue}%</span>
                </div>
                <div className="flex h-1.5 rounded-full overflow-hidden bg-muted">
                    <div className="bg-alliance-red-fill transition-all" style={{ width: `${pctRed}%` }} />
                    <div className="bg-alliance-blue-fill transition-all" style={{ width: `${pctBlue}%` }} />
                </div>
            </div>

            {/* Why this prediction */}
            <button
                type="button"
                onClick={() => setShowAnalysis(v => !v)}
                className="w-full flex items-center justify-between text-xs font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors pt-1"
            >
                {t("why")}
                <ChevronDown size={14} className={clsx("transition-transform", showAnalysis && "rotate-180")} />
            </button>

            {showAnalysis && (
                <div className="space-y-3 pt-1 border-t border-border animate-in fade-in slide-in-from-top-1 duration-200">
                    {/* Component comparison: Auto / Teleop */}
                    <div className="grid grid-cols-2 gap-2 font-mono text-xs">
                        {[
                            { name: t("statAuto"), r: redDetail.auto, b: blueDetail.auto },
                            { name: t("teleEnd"), r: redDetail.tele, b: blueDetail.tele },
                        ].map(row => (
                            <div key={row.name} className="bg-muted rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                                <span className={clsx("font-bold", row.r >= row.b ? "text-alliance-red" : "text-muted-foreground")}>{row.r.toFixed(0)}</span>
                                <span className="text-xs uppercase tracking-wider text-muted-foreground">{row.name}</span>
                                <span className={clsx("font-bold", row.b > row.r ? "text-alliance-blue" : "text-muted-foreground")}>{row.b.toFixed(0)}</span>
                            </div>
                        ))}
                    </div>
                    {/* Per-team contributions */}
                    <div className="flex justify-between gap-3 font-mono text-xs text-muted-foreground">
                        <div className="space-y-0.5">
                            {redDetail.perTeam.map(tm => (
                                <div key={tm.teamNumber}>
                                    <span className="text-alliance-red font-bold">{tm.teamNumber}</span> · {t("oprOf", { opr: tm.opr.toFixed(0) })}
                                </div>
                            ))}
                        </div>
                        <div className="space-y-0.5 text-right">
                            {blueDetail.perTeam.map(tm => (
                                <div key={tm.teamNumber}>
                                    {t("oprOf", { opr: tm.opr.toFixed(0) })} · <span className="text-alliance-blue font-bold">{tm.teamNumber}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                    <ul className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
                        {buildMatchAnalysis(t, redDetail, blueDetail, pRed, sigmaDiff).map((b, i) => (
                            <li key={i} className="flex gap-2">
                                <span className="text-primary shrink-0 mt-0.5">▸</span>
                                <span>{b}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {isNext && <span className="live-scanline" aria-hidden />}
        </div>
    );
}
