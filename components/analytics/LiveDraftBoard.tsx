"use client";

import { useMemo, useState } from "react";
import type { TeamEvolution } from "@/app/actions/analytics";
import type { FTCAllianceSelection } from "@/types/scouting";
import { calculateSynergyScore, explainSynergyScore, bestFieldedPair, computeTeamSigma, combineSigmas, runMonteCarloSimulation } from "@/lib/alliance-utils";
import type { Alliance } from "@/types/oracle";
import { Crown, RotateCcw, Star, Ban, Download, Users, Handshake } from "lucide-react";
import clsx from "clsx";

/**
 * Live alliance-selection assistant: the alliance board and "my best
 * available partner" panel share ONE state, so assigning a team to any
 * alliance instantly removes it from the recommendations. This is the view
 * a strategy lead keeps open DURING the real selection ceremony.
 *
 * Draft state persists in localStorage (per event) so an accidental reload
 * during the ceremony doesn't wipe the board. Marking a team as "declinó"
 * follows T702: a team that declines an invitation can no longer be picked.
 */

interface DraftState {
    allianceCount: 4 | 6 | 8;
    allianceSize: 2 | 3;
    /** slots[allianceIdx][slotIdx] = teamNumber | null */
    slots: (number | null)[][];
    declined: number[];
    myTeam: number | null;
}

function emptySlots(count: number, size: number): (number | null)[][] {
    return Array.from({ length: count }, () => Array.from({ length: size }, () => null));
}

function loadDraft(storageKey: string, teams: TeamEvolution[]): DraftState {
    const fallback: DraftState = {
        allianceCount: 6,
        allianceSize: 2,
        slots: emptySlots(6, 2),
        declined: [],
        myTeam: teams.some(t => t.teamNumber === 30311) ? 30311 : null,
    };
    if (typeof window === "undefined") return fallback;
    try {
        const raw = localStorage.getItem(storageKey);
        if (!raw) return fallback;
        const parsed = JSON.parse(raw) as DraftState;
        if (!Array.isArray(parsed.slots)) return fallback;
        return { ...fallback, ...parsed };
    } catch {
        return fallback;
    }
}


/** Builds an Alliance object (fielded-pair semantics) for simulation. */
function toAlliance(id: number, members: TeamEvolution[]): Alliance {
    const fielded = members.length >= 2 ? bestFieldedPair(members).pair : members;
    const totalOPR = fielded.reduce((s, t) => s + (t.opr || 0), 0);
    const totalAuto = fielded.reduce((s, t) => s + (t.autoOPR || 0), 0);
    return {
        id,
        captain: members[0],
        pick1: members[1] ?? null,
        pick2: members[2] ?? null,
        totalOPR,
        totalAuto,
        totalTele: totalOPR - totalAuto,
        totalEndgame: 0,
        projectedScore: totalOPR,
        totalSigma: combineSigmas(fielded.map(t => computeTeamSigma(t))),
    };
}

interface ScenarioOutcome {
    /** -1 = quedaste fuera de playoffs en este escenario. */
    myAllianceIdx: number;
    myMembers: TeamEvolution[];
    /** Quién se lleva el capitán que te invitó si tú declinas. */
    inviterTakes: TeamEvolution | null;
    strength: number;
    championP: number;
    finalsP: number;
}

/**
 * Completes the draft greedily from the current board state under one of two
 * branches and Monte-Carlos the resulting tournament:
 *  - accept: I become the inviter's pick.
 *  - decline: T702 — NOBODY may pick me anymore; the inviter immediately
 *    picks their next-best option (usually my own target), remaining captain
 *    seats fill by rank (I may claim one), and I pick from what's left.
 */
function simulateInvitationScenario(
    teams: TeamEvolution[],
    baseSlots: (number | null)[][],
    allianceCount: number,
    allianceSize: number,
    declined: number[],
    myTeam: number,
    inviterIdx: number,
    accept: boolean,
    /**
     * How OTHER captains pick when it's their turn:
     *  - "model": greedy best-synergy (a well-scouted team).
     *  - "rank": next best team BY RANKING TABLE — what teams without real
     *    scouting do. Inferred from the invitation itself (see advisor).
     * My own picks are always greedy — we DO have scouting.
     */
    captainStrategy: "model" | "rank" = "model",
): ScenarioOutcome {
    const byNum = new Map(teams.map(t => [t.teamNumber, t]));
    const rankOf = (t: TeamEvolution) => t.events[t.events.length - 1]?.rank ?? 999;
    const slots = Array.from({ length: allianceCount }, (_, a) =>
        Array.from({ length: allianceSize }, (_, s) => baseSlots[a]?.[s] ?? null),
    );
    const assigned = new Set(slots.flat().filter((n): n is number => n != null));
    let available = teams
        .filter(t => !assigned.has(t.teamNumber) && !declined.includes(t.teamNumber))
        .sort((a, b) => rankOf(a) - rankOf(b));
    const take = (n: number) => { available = available.filter(t => t.teamNumber !== n); };
    let inviterTakes: TeamEvolution | null = null;

    if (accept && slots[inviterIdx][1] == null && !assigned.has(myTeam)) {
        slots[inviterIdx][1] = myTeam;
        take(myTeam);
    }

    const pickBestFor = (captain: TeamEvolution, pool: TeamEvolution[]): TeamEvolution | null => {
        let best: TeamEvolution | null = null;
        let bestScore = -Infinity;
        for (const c of pool) {
            const score = calculateSynergyScore(captain, c);
            if (score > bestScore) { bestScore = score; best = c; }
        }
        return best;
    };

    // Round 1, seed order. In the decline branch nobody may pick me (T702).
    for (let idx = 0; idx < allianceCount; idx++) {
        if (slots[idx][0] == null) {
            const cap = available[0]; // best-ranked available becomes captain
            if (!cap) break;
            slots[idx][0] = cap.teamNumber;
            take(cap.teamNumber);
        }
        const captain = byNum.get(slots[idx][0]!);
        if (!captain) continue;
        if (slots[idx][1] == null) {
            const iAmCaptain = captain.teamNumber === myTeam;
            const pool = (!accept && !iAmCaptain)
                ? available.filter(t => t.teamNumber !== myTeam)
                : available;
            // pool stays rank-sorted, so pool[0] = next best by ranking table.
            const pick = (iAmCaptain || captainStrategy === "model")
                ? pickBestFor(captain, pool)
                : (pool[0] ?? null);
            if (pick) {
                slots[idx][1] = pick.teamNumber;
                take(pick.teamNumber);
                if (!accept && idx === inviterIdx) inviterTakes = pick;
            }
        }
    }

    // Round 2 (3-robot format): reversed order.
    if (allianceSize === 3) {
        for (let idx = allianceCount - 1; idx >= 0; idx--) {
            if (slots[idx][2] != null) continue;
            const members = slots[idx].filter((n): n is number => n != null).map(n => byNum.get(n)!).filter(Boolean);
            if (members.length < 2) continue;
            const iAmHere = slots[idx].includes(myTeam);
            const pool = (!accept && !iAmHere) ? available.filter(t => t.teamNumber !== myTeam) : available;
            let best: TeamEvolution | null = null;
            if (iAmHere || captainStrategy === "model") {
                let bestScore = -Infinity;
                for (const c of pool) {
                    const score = bestFieldedPair([...members, c]).score;
                    if (score > bestScore) { bestScore = score; best = c; }
                }
            } else {
                best = pool[0] ?? null;
            }
            if (best) { slots[idx][2] = best.teamNumber; take(best.teamNumber); }
        }
    }

    const myAllianceIdx = slots.findIndex(row => row.includes(myTeam));
    const alliances = slots
        .map((row, i) => {
            const members = row.filter((n): n is number => n != null).map(n => byNum.get(n)!).filter(Boolean);
            return members.length > 0 ? toAlliance(i + 1, members) : null;
        })
        .filter((a): a is Alliance => a !== null);

    let championP = 0;
    let finalsP = 0;
    let strength = 0;
    let myMembers: TeamEvolution[] = [];
    if (myAllianceIdx >= 0 && (allianceCount === 2 || allianceCount === 4 || allianceCount === 6 || allianceCount === 8) && alliances.length === allianceCount) {
        const results = runMonteCarloSimulation(alliances, allianceCount, 1500);
        const mine = results.find(r => r.allianceId === myAllianceIdx + 1);
        championP = mine?.championProbability ?? 0;
        finalsP = mine?.finalsProbability ?? 0;
        myMembers = slots[myAllianceIdx].filter((n): n is number => n != null).map(n => byNum.get(n)!).filter(Boolean);
        strength = myMembers.length >= 2 ? bestFieldedPair(myMembers).score : (myMembers[0]?.opr ?? 0);
    }
    return { myAllianceIdx, myMembers, inviterTakes, strength, championP, finalsP };
}

const SLOT_LABELS = ["Capitán", "Pick 1", "Pick 2"];

export default function LiveDraftBoard({ teams, official, storageKey = "live-draft" }: {
    teams: TeamEvolution[];
    /** Official selection from the API, for one-click import once published. */
    official?: FTCAllianceSelection[];
    storageKey?: string;
}) {
    const [draft, setDraft] = useState<DraftState>(() => loadDraft(storageKey, teams));

    const update = (patch: Partial<DraftState>) => {
        setDraft(prev => {
            const next = { ...prev, ...patch };
            try {
                localStorage.setItem(storageKey, JSON.stringify(next));
            } catch { /* quota/disabled — draft lives in memory */ }
            return next;
        });
    };

    const teamByNumber = useMemo(() => new Map(teams.map(t => [t.teamNumber, t])), [teams]);
    const assigned = useMemo(() => new Set(draft.slots.flat().filter((n): n is number => n != null)), [draft.slots]);

    const rankOf = (t: TeamEvolution) => t.events[t.events.length - 1]?.rank ?? 999;

    // Teams still on the table: not drafted, not declined (T702).
    const available = useMemo(() =>
        teams
            .filter(t => !assigned.has(t.teamNumber) && !draft.declined.includes(t.teamNumber))
            .sort((a, b) => rankOf(a) - rankOf(b)),
        [teams, assigned, draft.declined]);

    const myTeamObj = draft.myTeam != null ? teamByNumber.get(draft.myTeam) ?? null : null;

    // Partner recommendations for MY team over AVAILABLE teams only. Each carries
    // the reasons emitted by the scoring factors themselves (see explainSynergyScore
    // — deterministic justification, no LLM, offline-safe for venue).
    const recommendations = useMemo(() => {
        if (!myTeamObj) return [];
        return available
            .filter(t => t.teamNumber !== myTeamObj.teamNumber)
            .map(t => {
                const { score, reasons } = explainSynergyScore(myTeamObj, t);
                return { team: t, score, reasons };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 6);
    }, [available, myTeamObj]);

    // If my team is already inside an alliance, project that alliance.
    const myAlliance = useMemo(() => {
        if (draft.myTeam == null) return null;
        const idx = draft.slots.findIndex(row => row.includes(draft.myTeam));
        if (idx < 0) return null;
        const members = draft.slots[idx]
            .filter((n): n is number => n != null)
            .map(n => teamByNumber.get(n))
            .filter((t): t is TeamEvolution => !!t);
        if (members.length < 2) return { idx, members, pair: members, score: members[0]?.opr ?? 0 };
        const { pair, score } = bestFieldedPair(members);
        return { idx, members, pair, score };
    }, [draft.slots, draft.myTeam, teamByNumber]);

    // Full-board projection: once every alliance has captain + pick1, Monte
    // Carlo the tournament so each row shows its finals/championship odds.
    const boardProjection = useMemo(() => {
        const count = draft.allianceCount;
        if (count !== 4 && count !== 6 && count !== 8) return null;
        const complete = draft.slots.every(row => row[0] != null && row[1] != null);
        if (!complete) return null;
        const alliances = draft.slots.map((row, i) => {
            const members = row.filter((n): n is number => n != null).map(n => teamByNumber.get(n)!).filter(Boolean);
            return toAlliance(i + 1, members);
        });
        const res = runMonteCarloSimulation(alliances, count, 1500);
        return new Map(res.map(r => [r.allianceId - 1, r]));
    }, [draft.slots, draft.allianceCount, teamByNumber]);

    // Invitation advisor: compare "accept" vs "decline & captain" branches.
    const [inviterIdx, setInviterIdx] = useState<number | null>(null);
    // null = auto (use the inferred strategy); user can override.
    const [strategyOverride, setStrategyOverride] = useState<"model" | "rank" | null>(null);

    const invitationAnalysis = useMemo(() => {
        if (inviterIdx == null || draft.myTeam == null) return null;
        const captainNum = draft.slots[inviterIdx]?.[0];
        if (captainNum == null) return null;
        const inviterCaptain = teamByNumber.get(captainNum);
        if (!inviterCaptain) return null;

        // Scouting-quality inference: who SHOULD they have invited per the
        // model? If their best option is someone else by a clear margin and
        // they still invited me, they're drafting by ranking table — which
        // means declining does NOT cost me my own target.
        const rankOf = (t: TeamEvolution) => t.events[t.events.length - 1]?.rank ?? 999;
        let modelBest: TeamEvolution | null = null;
        let modelBestScore = -Infinity;
        for (const c of available) {
            const score = calculateSynergyScore(inviterCaptain, c);
            if (score > modelBestScore) { modelBestScore = score; modelBest = c; }
        }
        const myScore = myTeamObj ? calculateSynergyScore(inviterCaptain, myTeamObj) : -Infinity;
        const gap = modelBest && modelBest.teamNumber !== draft.myTeam ? modelBestScore - myScore : 0;
        const inferredStrategy: "model" | "rank" = gap > 8 ? "rank" : "model";
        const strategy = strategyOverride ?? inferredStrategy;

        const accept = simulateInvitationScenario(teams, draft.slots, draft.allianceCount, draft.allianceSize, draft.declined, draft.myTeam, inviterIdx, true, strategy);
        const decline = simulateInvitationScenario(teams, draft.slots, draft.allianceCount, draft.allianceSize, draft.declined, draft.myTeam, inviterIdx, false, strategy);
        return {
            accept,
            decline,
            strategy,
            inferredStrategy,
            inviterCaptain,
            modelBest,
            modelBestScore,
            myScoreForInviter: myScore,
            gap,
            modelBestRank: modelBest ? rankOf(modelBest) : null,
            myRank: myTeamObj ? rankOf(myTeamObj) : null,
        };
    }, [inviterIdx, draft, teams, teamByNumber, available, myTeamObj, strategyOverride]);

    const setSlot = (allianceIdx: number, slotIdx: number, value: string) => {
        const teamNumber = value === "" ? null : Number(value);
        const slots = draft.slots.map((row, a) =>
            row.map((cell, s) => (a === allianceIdx && s === slotIdx ? teamNumber : cell)),
        );
        update({ slots });
    };

    const setConfig = (allianceCount: 4 | 6 | 8, allianceSize: 2 | 3) => {
        // Re-shape the grid preserving what fits.
        const slots = Array.from({ length: allianceCount }, (_, a) =>
            Array.from({ length: allianceSize }, (_, s) => draft.slots[a]?.[s] ?? null),
        );
        update({ allianceCount, allianceSize, slots });
    };

    const importOfficial = () => {
        if (!official || official.length === 0) return;
        const size: 2 | 3 = official.some(a => a.round2 != null) ? 3 : 2;
        const count = (official.length === 4 || official.length === 6 || official.length === 8 ? official.length : 6) as 4 | 6 | 8;
        const slots = emptySlots(count, size);
        official.forEach((a, i) => {
            if (i >= count) return;
            slots[i][0] = a.captain?.teamNumber ?? null;
            slots[i][1] = a.round1?.teamNumber ?? null;
            if (size === 3) slots[i][2] = a.round2?.teamNumber ?? null;
        });
        update({ allianceCount: count, allianceSize: size, slots });
    };

    const toggleDeclined = (teamNumber: number) => {
        update({
            declined: draft.declined.includes(teamNumber)
                ? draft.declined.filter(n => n !== teamNumber)
                : [...draft.declined, teamNumber],
        });
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* ==== Board (left) ==== */}
            <div className="lg:col-span-3 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                    <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <Users size={18} className="text-primary" /> Tablero de selección
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                        <select
                            value={draft.allianceCount}
                            onChange={e => setConfig(Number(e.target.value) as 4 | 6 | 8, draft.allianceSize)}
                            className="px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-mono text-foreground"
                        >
                            {[4, 6, 8].map(n => <option key={n} value={n}>{n} alianzas</option>)}
                        </select>
                        <select
                            value={draft.allianceSize}
                            onChange={e => setConfig(draft.allianceCount, Number(e.target.value) as 2 | 3)}
                            className="px-2.5 py-1.5 bg-card border border-border rounded-lg text-xs font-mono text-foreground"
                        >
                            <option value={2}>2 robots</option>
                            <option value={3}>3 robots (§15.3)</option>
                        </select>
                        {official && official.length > 0 && (
                            <button
                                onClick={importOfficial}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-secondary/10 text-secondary border border-secondary/30 rounded-lg text-xs font-bold hover:bg-secondary/20 transition-colors"
                            >
                                <Download size={13} /> Importar oficial
                            </button>
                        )}
                        <button
                            onClick={() => update({ slots: emptySlots(draft.allianceCount, draft.allianceSize), declined: [] })}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-muted-foreground border border-border rounded-lg text-xs font-bold hover:text-danger hover:border-danger/30 transition-colors"
                        >
                            <RotateCcw size={13} /> Reiniciar
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    {draft.slots.map((row, a) => (
                        <div key={a} className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center gap-3">
                            <span className={clsx(
                                "w-7 h-7 shrink-0 rounded-md font-display font-bold text-sm flex items-center justify-center",
                                row.includes(draft.myTeam) ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary",
                            )}>
                                {a + 1}
                            </span>
                            <div className="flex-1 grid gap-2" style={{ gridTemplateColumns: `repeat(${draft.allianceSize}, minmax(0, 1fr))` }}>
                                {row.map((cell, s) => (
                                    <div key={s}>
                                        <label className="block font-mono text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">{SLOT_LABELS[s]}</label>
                                        <select
                                            value={cell ?? ""}
                                            onChange={e => setSlot(a, s, e.target.value)}
                                            className={clsx(
                                                "w-full px-2 py-1.5 rounded-lg border text-xs font-mono font-bold",
                                                cell === draft.myTeam && cell != null
                                                    ? "bg-primary/10 border-primary/40 text-primary"
                                                    : "bg-muted border-border text-foreground",
                                            )}
                                        >
                                            <option value="">—</option>
                                            {/* current value + still-available teams */}
                                            {cell != null && <option value={cell}>{cell}</option>}
                                            {available.map(t => (
                                                <option key={t.teamNumber} value={t.teamNumber}>
                                                    {t.teamNumber} (rk{rankOf(t)} · {Math.round(t.opr || 0)})
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                ))}
                            </div>
                            {(() => {
                                const members = row.filter((n): n is number => n != null).map(n => teamByNumber.get(n)!).filter(Boolean);
                                if (members.length < 2) return null;
                                const proj = boardProjection?.get(a);
                                return (
                                    <div className="shrink-0 text-right font-mono text-[10px] leading-tight w-14">
                                        <span className="block font-bold text-foreground">≈{Math.round(bestFieldedPair(members).score)}</span>
                                        {proj && (
                                            <span className="block text-secondary" title="P(llegar a la final) · P(campeón)">
                                                F {(proj.finalsProbability * 100).toFixed(0)}% · C {(proj.championProbability * 100).toFixed(0)}%
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                    ))}
                </div>

                {/* Declined (T702) */}
                <div className="bg-card border border-border rounded-xl px-3 py-2.5">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                            <Ban size={12} /> Declinaron (T702: ya no pueden ser elegidos)
                        </span>
                        <select
                            value=""
                            onChange={e => e.target.value && toggleDeclined(Number(e.target.value))}
                            className="px-2 py-1 bg-muted border border-border rounded-lg text-xs font-mono text-foreground"
                        >
                            <option value="">Marcar equipo…</option>
                            {available.map(t => <option key={t.teamNumber} value={t.teamNumber}>{t.teamNumber}</option>)}
                        </select>
                    </div>
                    {draft.declined.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                            {draft.declined.map(n => (
                                <button
                                    key={n}
                                    onClick={() => toggleDeclined(n)}
                                    title="Quitar de declinados"
                                    className="px-2 py-0.5 rounded-md bg-danger/10 text-danger border border-danger/20 font-mono text-xs font-bold line-through hover:bg-danger/20"
                                >
                                    {n}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ==== My team panel (right) ==== */}
            <div className="lg:col-span-2 space-y-4">
                <div className="bg-card border border-primary/30 rounded-xl p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                            <Crown size={16} className="text-primary" /> Mi equipo
                        </h3>
                        <select
                            value={draft.myTeam ?? ""}
                            onChange={e => update({ myTeam: e.target.value ? Number(e.target.value) : null })}
                            className="px-2.5 py-1.5 bg-muted border border-border rounded-lg text-xs font-mono font-bold text-foreground"
                        >
                            <option value="">Elegir…</option>
                            {teams.map(t => <option key={t.teamNumber} value={t.teamNumber}>{t.teamNumber}</option>)}
                        </select>
                    </div>

                    {myTeamObj && (
                        <div className="font-mono text-xs text-muted-foreground">
                            {myTeamObj.teamName} · rk{rankOf(myTeamObj)} · OPR {Math.round(myTeamObj.opr || 0)} · σ ±{Math.round(computeTeamSigma(myTeamObj))}
                        </div>
                    )}

                    {myAlliance && myAlliance.members.length >= 2 && (
                        <div className="bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 font-mono text-xs">
                            <span className="text-muted-foreground uppercase text-[9px] tracking-wider block mb-0.5">Tu alianza (#{myAlliance.idx + 1}) — mejor par en cancha</span>
                            <span className="text-foreground font-bold">{myAlliance.pair.map(t => t.teamNumber).join(" + ")}</span>
                            <span className="text-primary font-bold ml-2">≈ {Math.round(myAlliance.score)} pts</span>
                        </div>
                    )}
                </div>

                <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                        <Star size={15} className="text-warning" />
                        Mejor partner DISPONIBLE
                        <span className="ml-auto font-mono text-[10px] text-muted-foreground">{available.length} libres</span>
                    </h3>
                    {!myTeamObj && (
                        <p className="text-xs text-muted-foreground">Elige tu equipo para ver recomendaciones en vivo.</p>
                    )}
                    {myTeamObj && recommendations.length === 0 && (
                        <p className="text-xs text-muted-foreground">No quedan equipos disponibles.</p>
                    )}
                    <div className="space-y-1.5">
                        {recommendations.map((r, i) => (
                            <div
                                key={r.team.teamNumber}
                                className={clsx(
                                    "px-3 py-2 rounded-lg border",
                                    i === 0 ? "bg-warning/5 border-warning/30" : "bg-muted border-transparent",
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <span className={clsx("font-mono text-[10px] font-bold w-4", i === 0 ? "text-warning" : "text-muted-foreground")}>#{i + 1}</span>
                                    <div className="min-w-0 flex-1">
                                        <span className="font-mono text-sm font-bold text-foreground">{r.team.teamNumber}</span>
                                        <span className="text-[10px] text-muted-foreground ml-2 truncate">{r.team.teamName}</span>
                                    </div>
                                    <div className="font-mono text-[10px] text-muted-foreground text-right shrink-0">
                                        <div>OPR {Math.round(r.team.opr || 0)} · auto {Math.round(r.team.autoOPR || 0)}</div>
                                        <div className={clsx("font-bold", i === 0 ? "text-warning" : "text-foreground")}>score {Math.round(r.score)}</div>
                                    </div>
                                </div>
                                {/* Why: top pick shows its justification inline (it's the
                                    decision being made); the rest expand on demand. */}
                                {i === 0 ? (
                                    <ul className="mt-2 pt-2 border-t border-warning/20 space-y-1 text-[11px] text-muted-foreground leading-snug">
                                        {r.reasons.map((reason, j) => (
                                            <li key={j} className="flex gap-1.5">
                                                <span className="text-warning shrink-0">▸</span>
                                                <span>{reason}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <details className="mt-1 group/why">
                                        <summary className="cursor-pointer list-none text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors select-none">
                                            ¿Por qué? <span className="group-open/why:hidden">＋</span><span className="hidden group-open/why:inline">−</span>
                                        </summary>
                                        <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground leading-snug">
                                            {r.reasons.map((reason, j) => (
                                                <li key={j} className="flex gap-1.5">
                                                    <span className="text-secondary shrink-0">▸</span>
                                                    <span>{reason}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    </details>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Invitation advisor: aceptar vs declinar-y-capitanear */}
                <div className="bg-card border border-border rounded-xl p-4">
                    <h3 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
                        <Handshake size={15} className="text-primary" /> Asesor de invitación
                    </h3>
                    {!myTeamObj ? (
                        <p className="text-xs text-muted-foreground">Elige tu equipo para usar el asesor.</p>
                    ) : (
                        <>
                            <label className="block mb-3">
                                <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">¿Qué capitán te invitó?</span>
                                <select
                                    value={inviterIdx ?? ""}
                                    onChange={e => { setInviterIdx(e.target.value === "" ? null : Number(e.target.value)); setStrategyOverride(null); }}
                                    className="w-full mt-0.5 px-2.5 py-1.5 bg-muted border border-border rounded-lg font-mono text-sm text-foreground"
                                >
                                    <option value="">Elegir…</option>
                                    {draft.slots.map((row, i) =>
                                        row[0] != null && row[1] == null && row[0] !== draft.myTeam ? (
                                            <option key={i} value={i}>A{i + 1} · capitán {row[0]}</option>
                                        ) : null,
                                    )}
                                </select>
                            </label>

                            {invitationAnalysis && (() => {
                                const { accept, decline, strategy, inferredStrategy, modelBest, modelBestRank, myRank, gap } = invitationAnalysis;
                                const diffPP = (decline.finalsP - accept.finalsP) * 100;
                                const invitedDespiteBetter = modelBest != null && modelBest.teamNumber !== draft.myTeam && gap > 8;
                                const declineOut = decline.myAllianceIdx < 0;
                                const partnersOf = (o: ScenarioOutcome) =>
                                    o.myMembers.filter(t => t.teamNumber !== draft.myTeam).map(t => t.teamNumber).join("+") || "—";

                                const card = (title: string, o: ScenarioOutcome, tone: string) => (
                                    <div className={clsx("rounded-lg border px-3 py-2 font-mono text-[11px] leading-relaxed", tone)}>
                                        <span className="block font-bold uppercase tracking-wider text-[9px] opacity-80">{title}</span>
                                        {o.myAllianceIdx < 0 ? (
                                            <span className="text-danger font-bold">Fuera de playoffs</span>
                                        ) : (
                                            <>
                                                <span className="block text-foreground">A{o.myAllianceIdx + 1} con <span className="font-bold">{partnersOf(o)}</span> · ≈{Math.round(o.strength)} pts</span>
                                                <span className="block">
                                                    Final <span className="font-bold text-secondary">{(o.finalsP * 100).toFixed(0)}%</span>
                                                    {" · "}Campeón <span className="font-bold text-primary">{(o.championP * 100).toFixed(0)}%</span>
                                                </span>
                                            </>
                                        )}
                                    </div>
                                );

                                let verdict: { text: string; cls: string };
                                if (declineOut) {
                                    verdict = {
                                        cls: "bg-danger/10 border-danger/30 text-danger",
                                        text: `Si declinas NO alcanzas capitanía y por T702 nadie más podrá invitarte: quedarías FUERA de playoffs. Acepta la invitación.`,
                                    };
                                } else if (Math.abs(diffPP) <= 4 || (accept.finalsP > 0 && decline.finalsP / Math.max(accept.finalsP, 0.001) < 1.4 && diffPP > 0)) {
                                    verdict = {
                                        cls: "bg-warning/10 border-warning/30 text-foreground",
                                        text: `Prácticamente equivalentes (Δ ${diffPP >= 0 ? "+" : ""}${diffPP.toFixed(0)} pp de llegar a la final). Acepta la invitación: obtienes el mismo resultado competitivo y proteges la relación con el capitán A${(inviterIdx ?? 0) + 1}.`,
                                    };
                                } else if (diffPP > 4) {
                                    verdict = {
                                        cls: "bg-secondary/10 border-secondary/30 text-foreground",
                                        text: `Declinar y capitanear proyecta +${diffPP.toFixed(0)} pp de llegar a la final. Considera el costo relacional antes de decidir${decline.inviterTakes ? ` — y asume que A${(inviterIdx ?? 0) + 1} se llevará a ${decline.inviterTakes.teamNumber}` : ""}.`,
                                    };
                                } else {
                                    verdict = {
                                        cls: "bg-success/10 border-success/30 text-foreground",
                                        text: `Aceptar es también tu mejor jugada (+${(-diffPP).toFixed(0)} pp vs declinar). Decisión fácil: di que sí.`,
                                    };
                                }

                                return (
                                    <div className="space-y-2">
                                        {/* Scouting-quality read on the inviter */}
                                        {invitedDespiteBetter ? (
                                            <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-[11px] leading-relaxed text-foreground">
                                                🔍 Su mejor opción según el modelo era{" "}
                                                <span className="font-mono font-bold">{modelBest!.teamNumber}</span>
                                                {" "}(rk{modelBestRank}, +{gap.toFixed(0)} pts para ellos) y aun así te invitaron a ti (rk{myRank}).
                                                <span className="font-bold"> Señal de draft por tabla de ranking, no por scouting</span> — si declinas,
                                                probablemente NO se lleven a tu objetivo.
                                            </div>
                                        ) : modelBest && modelBest.teamNumber !== draft.myTeam ? null : (
                                            <div className="rounded-lg border border-border bg-muted px-3 py-2 text-[11px] text-muted-foreground">
                                                🔍 Eres su mejor opción según el modelo — su scouting parece bueno: si declinas, asumirán su siguiente mejor opción real.
                                            </div>
                                        )}

                                        {/* How do other captains pick if you decline? */}
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Los demás capitanes eligen:</span>
                                            {([["rank", "Por ranking"], ["model", "Por modelo"]] as const).map(([key, label]) => (
                                                <button
                                                    key={key}
                                                    type="button"
                                                    onClick={() => setStrategyOverride(key === inferredStrategy ? null : key)}
                                                    className={clsx(
                                                        "px-2 py-0.5 rounded-md border font-mono text-[10px] font-bold transition-colors",
                                                        strategy === key
                                                            ? "bg-primary/10 text-primary border-primary/30"
                                                            : "bg-muted text-muted-foreground border-border hover:text-foreground",
                                                    )}
                                                >
                                                    {label}{inferredStrategy === key ? " (inferido)" : ""}
                                                </button>
                                            ))}
                                        </div>

                                        {card("Aceptar la invitación", accept, "bg-muted border-border")}
                                        {card("Declinar y capitanear", decline, "bg-muted border-border")}
                                        {!declineOut && decline.inviterTakes && (
                                            <p className="font-mono text-[10px] text-muted-foreground">
                                                Si declinas, A{(inviterIdx ?? 0) + 1} tomaría a <span className="font-bold text-foreground">{decline.inviterTakes.teamNumber}</span> ({decline.inviterTakes.teamName}).
                                            </p>
                                        )}
                                        <div className={clsx("rounded-lg border px-3 py-2 text-xs leading-relaxed", verdict.cls)}>
                                            {verdict.text}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            Modelo: ambos escenarios completan el draft con picks greedy desde el estado actual del tablero y simulan el torneo (Monte Carlo ×1500). Al declinar, nadie puede volver a invitarte (T702).
                                        </p>
                                    </div>
                                );
                            })()}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
