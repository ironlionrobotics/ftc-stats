"use client";

import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { DEFAULT_ORG_ID } from "@/lib/orgs";
import {
    loadOrCreatePicklist,
    listenToPicklist,
    updatePicklist,
} from "@/lib/picklist-service";
import type { Picklist } from "@/types/picklist";
import type { AggregatedTeamStats } from "@/types/scouting";
import { Card } from "@/components/ui/Card";
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    arrayMove,
    useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    GripVertical,
    Plus,
    Ban,
    CheckCircle2,
    XCircle,
    RotateCcw,
    Loader2,
    Wifi,
    User,
    Sliders,
    Wand2,
} from "lucide-react";
import clsx from "clsx";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import {
    computeWeightedScores,
    sortTeamsByWeightedScore,
    DEFAULT_WEIGHTS,
    WEIGHT_KEYS,
    WEIGHT_LABELS,
    type PicklistWeights,
} from "@/lib/picklist-weights";

interface PicklistEditorProps {
    teams: AggregatedTeamStats[];
    /** Event code for this picklist. Auto-derived from the teams' first event when omitted. */
    eventCode?: string;
}

/**
 * Drag-and-drop picklist editor with real-time collaboration.
 *
 * Three buckets:
 *   - Ranked picklist (left)    — index 0 = first pick priority
 *   - Available (middle)        — teams not yet assigned to a bucket
 *   - Do Not Pick (right)       — explicit "skip" list
 *
 * During live alliance selection, each team can additionally be marked as
 * `selected` (someone else picked them) or `declined` (they're a captain
 * themselves). These don't move the team between buckets — they overlay a
 * status badge so the strategy lead can scan quickly.
 *
 * Sync: Firestore listener; concurrent edits = last-write-wins.
 */
export default function PicklistEditor({ teams, eventCode: eventCodeProp }: PicklistEditorProps) {
    const { user, orgId } = useAuth();
    const { season } = useProgram();
    const confirmDialog = useConfirm();
    const eventCode = eventCodeProp ?? teams[0]?.events[0]?.eventCode ?? "MXTOL";

    const [picklist, setPicklist] = useState<Picklist | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [weightsOpen, setWeightsOpen] = useState(false);
    const [weights, setWeights] = useState<PicklistWeights>(DEFAULT_WEIGHTS);

    const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;
    // Per-(org,event) weights live in localStorage so they're personal to the
    // strategy lead, not pushed onto the org's shared picklist doc.
    const weightsKey = `picklist-weights:${effectiveOrgId}:${eventCode}`;

    // Hydrate weights from localStorage once we know the event.
    useEffect(() => {
        if (typeof window === "undefined") return;
        try {
            const stored = localStorage.getItem(weightsKey);
            if (stored) setWeights({ ...DEFAULT_WEIGHTS, ...JSON.parse(stored) });
        } catch {
            // ignore malformed JSON
        }
    }, [weightsKey]);

    const updateWeight = (key: keyof PicklistWeights, value: number) => {
        setWeights(prev => {
            const next = { ...prev, [key]: value };
            try {
                localStorage.setItem(weightsKey, JSON.stringify(next));
            } catch {
                // localStorage quota / disabled — fine, weights live in memory
            }
            return next;
        });
    };

    // Weighted score per team based on current sliders.
    const weightedScores = useMemo(
        () => computeWeightedScores(teams, weights),
        [teams, weights],
    );

    // Build a fast lookup of teamNumber → stats for the cards.
    const statsByTeam = useMemo(() => {
        const m = new Map<number, AggregatedTeamStats>();
        for (const t of teams) m.set(t.teamNumber, t);
        return m;
    }, [teams]);

    const initialOrder = useMemo(
        () =>
            [...teams]
                .sort((a, b) => (b.averageRS ?? 0) - (a.averageRS ?? 0))
                .map(t => t.teamNumber),
        [teams],
    );

    // Subscribe to picklist + create on first visit.
    useEffect(() => {
        if (!user) return;
        let cancelled = false;
        let unsub: (() => void) | null = null;

        (async () => {
            setLoading(true);
            await loadOrCreatePicklist({
                orgId: effectiveOrgId,
                eventCode,
                season,
                creatorUid: user.uid,
                initialTeamOrder: initialOrder,
            });
            if (cancelled) return;
            unsub = listenToPicklist(effectiveOrgId, eventCode, p => {
                if (!cancelled) {
                    setPicklist(p);
                    setLoading(false);
                }
            });
        })();

        return () => {
            cancelled = true;
            if (unsub) unsub();
        };
    }, [user, effectiveOrgId, eventCode, season, initialOrder]);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!picklist || !user || !over || active.id === over.id) return;
        const oldIndex = picklist.teams.indexOf(Number(active.id));
        const newIndex = picklist.teams.indexOf(Number(over.id));
        if (oldIndex < 0 || newIndex < 0) return;
        const reordered = arrayMove(picklist.teams, oldIndex, newIndex);
        setSaving(true);
        try {
            await updatePicklist(picklist, user.uid, { teams: reordered });
        } finally {
            setSaving(false);
        }
    };

    const moveTo = async (teamNumber: number, target: "ranked" | "doNotPick" | "available") => {
        if (!picklist || !user) return;
        const teams = picklist.teams.filter(t => t !== teamNumber);
        const doNotPick = picklist.doNotPick.filter(t => t !== teamNumber);
        if (target === "ranked") teams.push(teamNumber);
        if (target === "doNotPick") doNotPick.push(teamNumber);
        setSaving(true);
        try {
            await updatePicklist(picklist, user.uid, { teams, doNotPick });
        } finally {
            setSaving(false);
        }
    };

    const toggleSelected = async (teamNumber: number) => {
        if (!picklist || !user) return;
        const selected = picklist.selected.includes(teamNumber)
            ? picklist.selected.filter(t => t !== teamNumber)
            : [...picklist.selected, teamNumber];
        setSaving(true);
        try {
            await updatePicklist(picklist, user.uid, { selected });
        } finally {
            setSaving(false);
        }
    };

    const toggleDeclined = async (teamNumber: number) => {
        if (!picklist || !user) return;
        const declined = picklist.declined.includes(teamNumber)
            ? picklist.declined.filter(t => t !== teamNumber)
            : [...picklist.declined, teamNumber];
        setSaving(true);
        try {
            await updatePicklist(picklist, user.uid, { declined });
        } finally {
            setSaving(false);
        }
    };

    const resetAll = async () => {
        if (!picklist || !user) return;
        const ok = await confirmDialog({
            title: "Reiniciar estado de selección",
            description: "Borra los marcadores 'selected' y 'declined' de la picklist. La ordenación y la DNP list se conservan intactas.",
            confirmText: "Reiniciar",
            variant: "danger",
        });
        if (!ok) return;
        setSaving(true);
        try {
            await updatePicklist(picklist, user.uid, { selected: [], declined: [] });
        } finally {
            setSaving(false);
        }
    };

    // Re-order the existing picklist column by weighted score. Doesn't move
    // teams between buckets — Available and DNP stay as-is. Confirmation
    // first because this overwrites any manual tweaks the lead made.
    const applyWeightsToOrder = async () => {
        if (!picklist || !user) return;
        if (picklist.teams.length === 0) return;
        const ok = await confirmDialog({
            title: "Aplicar pesos a la picklist",
            description: "Reordena la lista actual por el score ponderado. Las ediciones manuales de orden se pierden. La DNP y Available no se tocan.",
            confirmText: "Reordenar",
            variant: "danger",
        });
        if (!ok) return;
        const sorted = sortTeamsByWeightedScore(picklist.teams, weightedScores);
        setSaving(true);
        try {
            await updatePicklist(picklist, user.uid, { teams: sorted });
        } finally {
            setSaving(false);
        }
    };

    if (!user) {
        return (
            <Card className="p-8 text-center text-gray-400">
                Inicia sesión para usar el picklist editor.
            </Card>
        );
    }

    if (loading || !picklist) {
        return (
            <Card className="p-8 text-center text-gray-400 flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={16} />
                Cargando picklist...
            </Card>
        );
    }

    const rankedSet = new Set(picklist.teams);
    const dnpSet = new Set(picklist.doNotPick);
    const available = teams
        .filter(t => !rankedSet.has(t.teamNumber) && !dnpSet.has(t.teamNumber))
        .sort((a, b) => (b.averageRS ?? 0) - (a.averageRS ?? 0));

    return (
        <div className="space-y-4">
            {/* Header / status */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-white">Picklist Editor</h2>
                    <p className="text-xs text-gray-500 mt-1">
                        Arrastra para reordenar · Click derecho/long-press para mover entre listas · Cambios sincronizan en vivo con tu equipo
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-xs text-gray-400">
                        <Wifi size={12} className={picklist.updatedBy ? "text-emerald-400" : "text-gray-500"} />
                        <span>Equipo #{picklist.orgId} · {picklist.eventCode}</span>
                    </div>
                    {saving && <Loader2 size={14} className="animate-spin text-primary" />}
                    <button
                        type="button"
                        onClick={() => setWeightsOpen(o => !o)}
                        className={clsx(
                            "min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors",
                            weightsOpen
                                ? "bg-primary/20 text-primary border border-primary/30"
                                : "bg-white/5 hover:bg-white/10 text-gray-400 border border-white/10",
                        )}
                        title="Ajustar pesos del ranking"
                    >
                        <Sliders size={12} /> Pesos
                    </button>
                    <button
                        type="button"
                        onClick={applyWeightsToOrder}
                        disabled={picklist.teams.length === 0}
                        className="min-h-[36px] px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 active:scale-[0.98] transition-all"
                        title="Reordenar la picklist por score ponderado"
                    >
                        <Wand2 size={12} /> Auto-sort
                    </button>
                    <button
                        type="button"
                        onClick={resetAll}
                        className="min-h-[36px] px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 rounded-lg text-xs font-bold flex items-center gap-1.5"
                        title="Reiniciar marcado de selected/declined"
                    >
                        <RotateCcw size={12} /> Reset estado
                    </button>
                </div>
            </div>

            {weightsOpen && (
                <Card className="p-4 bg-white/[0.02] border-primary/20 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                            <Sliders size={14} className="text-primary" />
                            Pesos del ranking
                        </h3>
                        <p className="text-[10px] text-gray-500">
                            Cambian solo tu vista del score. Pulsa <strong>Auto-sort</strong> para aplicarlo a la picklist.
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                        {WEIGHT_KEYS.map(key => (
                            <div key={key} className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-gray-300">
                                        {WEIGHT_LABELS[key]}
                                    </label>
                                    <span className="text-[10px] text-gray-500 font-mono">
                                        {weights[key]}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={weights[key]}
                                    onChange={e => updateWeight(key, Number(e.target.value))}
                                    className="w-full accent-primary cursor-pointer"
                                />
                            </div>
                        ))}
                    </div>
                </Card>
            )}

            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* RANKED PICKLIST */}
                    <Bucket
                        title="Picklist"
                        count={picklist.teams.length}
                        accent="emerald"
                        helpText="Orden de prioridad (top = first pick)"
                    >
                        <SortableContext items={picklist.teams.map(String)} strategy={verticalListSortingStrategy}>
                            {picklist.teams.length === 0 ? (
                                <EmptyState text="Mueve equipos desde Disponibles" />
                            ) : (
                                picklist.teams.map((t, idx) => (
                                    <SortableTeamCard
                                        key={t}
                                        rank={idx + 1}
                                        team={statsByTeam.get(t)}
                                        teamNumber={t}
                                        score={weightedScores.get(t)}
                                        selected={picklist.selected.includes(t)}
                                        declined={picklist.declined.includes(t)}
                                        onMoveToDNP={() => moveTo(t, "doNotPick")}
                                        onMoveToAvailable={() => moveTo(t, "available")}
                                        onToggleSelected={() => toggleSelected(t)}
                                        onToggleDeclined={() => toggleDeclined(t)}
                                    />
                                ))
                            )}
                        </SortableContext>
                    </Bucket>

                    {/* AVAILABLE */}
                    <Bucket
                        title="Disponibles"
                        count={available.length}
                        accent="blue"
                        helpText="Equipos sin clasificar"
                    >
                        {available.length === 0 ? (
                            <EmptyState text="Todos los equipos están en una lista" />
                        ) : (
                            available.map(t => (
                                <AvailableTeamCard
                                    key={t.teamNumber}
                                    team={t}
                                    score={weightedScores.get(t.teamNumber)}
                                    onAddToPicklist={() => moveTo(t.teamNumber, "ranked")}
                                    onAddToDNP={() => moveTo(t.teamNumber, "doNotPick")}
                                />
                            ))
                        )}
                    </Bucket>

                    {/* DO NOT PICK */}
                    <Bucket
                        title="Do Not Pick"
                        count={picklist.doNotPick.length}
                        accent="red"
                        helpText="No escoger bajo ninguna circunstancia"
                    >
                        {picklist.doNotPick.length === 0 ? (
                            <EmptyState text="Sin equipos descartados" />
                        ) : (
                            picklist.doNotPick.map(t => (
                                <DNPTeamCard
                                    key={t}
                                    team={statsByTeam.get(t)}
                                    teamNumber={t}
                                    onMoveToAvailable={() => moveTo(t, "available")}
                                />
                            ))
                        )}
                    </Bucket>
                </div>
            </DndContext>

            {/* Footer audit */}
            {picklist.updatedAt?.seconds && (
                <div className="text-[10px] text-gray-500 flex items-center gap-2 justify-end">
                    <User size={10} />
                    Última edición: {new Date(picklist.updatedAt.seconds * 1000).toLocaleString()}
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function Bucket({
    title,
    count,
    accent,
    helpText,
    children,
}: {
    title: string;
    count: number;
    accent: "emerald" | "blue" | "red";
    helpText: string;
    children: React.ReactNode;
}) {
    const accentColor = {
        emerald: "border-emerald-500/30 bg-emerald-500/5",
        blue: "border-blue-500/30 bg-blue-500/5",
        red: "border-red-500/30 bg-red-500/5",
    }[accent];
    const accentText = {
        emerald: "text-emerald-300",
        blue: "text-blue-300",
        red: "text-red-300",
    }[accent];
    return (
        <Card className={clsx("p-4 flex flex-col gap-2 min-h-[400px] max-h-[75vh]", accentColor)}>
            <div className="flex items-center justify-between">
                <h3 className={clsx("text-sm font-black uppercase tracking-wider", accentText)}>
                    {title}
                </h3>
                <span className="text-xs font-bold text-gray-400">{count}</span>
            </div>
            <p className="text-[10px] text-gray-500 mb-2">{helpText}</p>
            <div className="space-y-1.5 overflow-y-auto flex-1 custom-scrollbar">{children}</div>
        </Card>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="text-center text-gray-600 text-xs italic py-12">{text}</div>
    );
}

function SortableTeamCard({
    rank,
    team,
    teamNumber,
    score,
    selected,
    declined,
    onMoveToDNP,
    onMoveToAvailable,
    onToggleSelected,
    onToggleDeclined,
}: {
    rank: number;
    team: AggregatedTeamStats | undefined;
    teamNumber: number;
    score: number | undefined;
    selected: boolean;
    declined: boolean;
    onMoveToDNP: () => void;
    onMoveToAvailable: () => void;
    onToggleSelected: () => void;
    onToggleDeclined: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
        id: String(teamNumber),
    });
    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={clsx(
                "flex items-center gap-2 p-2 rounded-lg border bg-black/20 hover:bg-black/30 transition-colors",
                selected && "ring-2 ring-emerald-500/50",
                declined && "opacity-50",
            )}
        >
            <button
                {...attributes}
                {...listeners}
                // 32px touch target so the grip is grabbable on tablet without
                // accidentally tapping the team card.
                className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing min-w-[32px] min-h-[32px] flex items-center justify-center"
                aria-label="Reordenar"
            >
                <GripVertical size={16} />
            </button>
            <div className="w-7 text-center text-[10px] font-mono font-black text-gray-400">
                {rank}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{teamNumber}</span>
                    {score !== undefined && <ScoreBadge score={score} />}
                </div>
                {team && (
                    <div className="text-[10px] text-gray-500 truncate">
                        {team.teamName} · RS {team.averageRS?.toFixed(1) ?? "—"} · NP {team.averageNP?.toFixed(1) ?? "—"}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1">
                <IconBtn
                    title="Marcar selected"
                    active={selected}
                    activeColor="emerald"
                    onClick={onToggleSelected}
                >
                    <CheckCircle2 size={13} />
                </IconBtn>
                <IconBtn
                    title="Marcar declined"
                    active={declined}
                    activeColor="amber"
                    onClick={onToggleDeclined}
                >
                    <XCircle size={13} />
                </IconBtn>
                <IconBtn title="Mover a DNP" onClick={onMoveToDNP} activeColor="red">
                    <Ban size={13} />
                </IconBtn>
                <IconBtn title="Quitar del picklist" onClick={onMoveToAvailable} activeColor="blue">
                    <ArrowOut />
                </IconBtn>
            </div>
        </div>
    );
}

function AvailableTeamCard({
    team,
    score,
    onAddToPicklist,
    onAddToDNP,
}: {
    team: AggregatedTeamStats;
    score: number | undefined;
    onAddToPicklist: () => void;
    onAddToDNP: () => void;
}) {
    return (
        <div className="flex items-center gap-2 p-2 rounded-lg border bg-black/20 hover:bg-black/30">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{team.teamNumber}</span>
                    {score !== undefined && <ScoreBadge score={score} />}
                </div>
                <div className="text-[10px] text-gray-500 truncate">
                    {team.teamName} · RS {team.averageRS?.toFixed(1) ?? "—"}
                </div>
            </div>
            <IconBtn title="Agregar a picklist" onClick={onAddToPicklist} activeColor="emerald">
                <Plus size={13} />
            </IconBtn>
            <IconBtn title="Marcar DNP" onClick={onAddToDNP} activeColor="red">
                <Ban size={13} />
            </IconBtn>
        </div>
    );
}

/**
 * Pequeño chip que muestra el score ponderado 0-100 con color por tercil.
 * Verde > 66, ámbar > 33, gris si más bajo. Da contexto al ranking sin
 * dominar visualmente la card.
 */
function ScoreBadge({ score }: { score: number }) {
    const pct = Math.round(score * 100);
    const color =
        pct >= 67 ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
        : pct >= 34 ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
        : "bg-white/5 text-gray-400 border-white/10";
    return (
        <span
            className={clsx("px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider border font-mono", color)}
            title={`Score ponderado: ${pct}/100`}
        >
            {pct}
        </span>
    );
}

function DNPTeamCard({
    team,
    teamNumber,
    onMoveToAvailable,
}: {
    team: AggregatedTeamStats | undefined;
    teamNumber: number;
    onMoveToAvailable: () => void;
}) {
    return (
        <div className="flex items-center gap-2 p-2 rounded-lg border bg-black/20 hover:bg-black/30 opacity-70">
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white line-through decoration-red-500/50">
                    {teamNumber}
                </div>
                <div className="text-[10px] text-gray-500 truncate">
                    {team?.teamName ?? "—"}
                </div>
            </div>
            <IconBtn title="Quitar de DNP" onClick={onMoveToAvailable} activeColor="blue">
                <ArrowOut />
            </IconBtn>
        </div>
    );
}

function IconBtn({
    title,
    onClick,
    active,
    activeColor,
    children,
}: {
    title: string;
    onClick: () => void;
    active?: boolean;
    activeColor: "emerald" | "amber" | "red" | "blue";
    children: React.ReactNode;
}) {
    const colorMap = {
        emerald: active ? "bg-emerald-500/30 text-emerald-300" : "hover:bg-emerald-500/20 text-gray-500 hover:text-emerald-300",
        amber: active ? "bg-amber-500/30 text-amber-300" : "hover:bg-amber-500/20 text-gray-500 hover:text-amber-300",
        red: active ? "bg-red-500/30 text-red-300" : "hover:bg-red-500/20 text-gray-500 hover:text-red-300",
        blue: active ? "bg-blue-500/30 text-blue-300" : "hover:bg-blue-500/20 text-gray-500 hover:text-blue-300",
    };
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            // 32px touch target — comfortable on tablet for secondary actions
            // packed into a row. Primary CTAs use min-h-[44px] elsewhere.
            className={clsx(
                "min-w-[32px] min-h-[32px] p-2 rounded transition-colors flex items-center justify-center",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
                colorMap[activeColor],
            )}
        >
            {children}
        </button>
    );
}

function ArrowOut() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
    );
}
