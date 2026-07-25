"use client";

import { useMemo, useState } from "react";
import type { TeamEvolution } from "@/app/actions/analytics";
import type { FTCAllianceSelection } from "@/types/scouting";
import { calculateSynergyScore, bestFieldedPair, computeTeamSigma } from "@/lib/alliance-utils";
import { Crown, RotateCcw, Star, Ban, Download, Users } from "lucide-react";
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

    // Partner recommendations for MY team over AVAILABLE teams only.
    const recommendations = useMemo(() => {
        if (!myTeamObj) return [];
        return available
            .filter(t => t.teamNumber !== myTeamObj.teamNumber)
            .map(t => ({ team: t, score: calculateSynergyScore(myTeamObj, t) }))
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
                                    "flex items-center gap-3 px-3 py-2 rounded-lg border",
                                    i === 0 ? "bg-warning/5 border-warning/30" : "bg-muted border-transparent",
                                )}
                            >
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
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
