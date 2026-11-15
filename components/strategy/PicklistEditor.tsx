"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
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
import { guessActiveEventCode } from "@/lib/active-event";
import {
    computeWeightedScores,
    sortTeamsByWeightedScore,
    defaultWeightsFor,
    weightKeysFor,
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
    const t = useTranslations("PicklistEditor");
    const format = useFormatter();
    const eventCode = eventCodeProp ?? guessActiveEventCode(teams) ?? "MXTOL";

    const [picklist, setPicklist] = useState<Picklist | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [weightsOpen, setWeightsOpen] = useState(false);
    // BIOBUZZ+ ranks by the event's model OPR by default; DECODE keeps its weights (#115).
    const [weights, setWeights] = useState<PicklistWeights>(() => defaultWeightsFor(season));

    const effectiveOrgId = orgId ?? DEFAULT_ORG_ID;
    // Per-(org,event) weights live in localStorage so they're personal to the
    // strategy lead, not pushed onto the org's shared picklist doc.
    // v2 from BIOBUZZ on: weights saved under the old defaults must not override the new ones.
    const weightsKey = `picklist-weights:${season >= 2026 ? "v2:" : ""}${effectiveOrgId}:${eventCode}`;

    // Hydrate weights from localStorage once we know the event.
    useEffect(() => {
        if (typeof window === "undefined") return;
        let cancelled = false;
        // Deferred one microtask so setWeights never runs synchronously in
        // the effect body.
        void Promise.resolve().then(() => {
            if (cancelled) return;
            try {
                const stored = localStorage.getItem(weightsKey);
                if (stored) setWeights({ ...defaultWeightsFor(season), ...JSON.parse(stored) });
            } catch {
                // ignore malformed JSON
            }
        });
        return () => { cancelled = true; };
    }, [weightsKey, season]);

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
            try {
                await loadOrCreatePicklist({
                    orgId: effectiveOrgId,
                    eventCode,
                    season,
                    creatorUid: user.uid,
                    initialTeamOrder: initialOrder,
                });
            } catch (e) {
                // Offline / permission error: without this catch the promise
                // rejected unhandled and the UI stayed on "Cargando…" forever.
                console.error("[picklist] loadOrCreatePicklist failed:", e);
                if (!cancelled) setLoading(false);
                return;
            }
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
            title: t("resetTitle"),
            description: t("resetBody"),
            confirmText: t("resetConfirm"),
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
            title: t("applyTitle"),
            description: t("applyBody"),
            confirmText: t("applyConfirm"),
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
            <Card className="p-8 text-center text-muted-foreground">
                {t("signIn")}
            </Card>
        );
    }

    if (loading || !picklist) {
        return (
            <Card className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="animate-spin" size={16} />
                {t("loading")}
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
                    <h2 className="text-2xl font-bold text-foreground">{t("title")}</h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        {t("hint")}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border rounded-lg text-xs text-muted-foreground">
                        <Wifi size={12} className={picklist.updatedBy ? "text-success" : "text-muted-foreground"} />
                        <span>{t("teamLine", { org: picklist.orgId, event: picklist.eventCode })}</span>
                    </div>
                    {saving && <Loader2 size={14} className="animate-spin text-primary" />}
                    <button
                        type="button"
                        onClick={() => setWeightsOpen(o => !o)}
                        className={clsx(
                            "min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors",
                            weightsOpen
                                ? "bg-primary/20 text-primary border border-primary/30"
                                : "bg-muted hover:bg-muted/70 text-muted-foreground border border-border",
                        )}
                        title={t("weightsTitle")}
                    >
                        <Sliders size={12} /> {t("weights")}
                    </button>
                    <button
                        type="button"
                        onClick={applyWeightsToOrder}
                        disabled={picklist.teams.length === 0}
                        className="min-h-[36px] px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground rounded-lg text-xs font-bold flex items-center gap-1.5 active:scale-[0.98] transition-all"
                        title={t("autoSortTitle")}
                    >
                        <Wand2 size={12} /> {t("autoSort")}
                    </button>
                    <button
                        type="button"
                        onClick={resetAll}
                        className="min-h-[36px] px-3 py-1.5 bg-muted hover:bg-muted/70 text-muted-foreground rounded-lg text-xs font-bold flex items-center gap-1.5"
                        title={t("resetStateTitle")}
                    >
                        <RotateCcw size={12} /> {t("resetState")}
                    </button>
                </div>
            </div>

            {weightsOpen && (
                <Card className="p-4 bg-muted border-primary/20 space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                            <Sliders size={14} className="text-primary" />
                            {t("weightsHeading")}
                        </h3>
                        <p className="text-[10px] text-muted-foreground">
                            {t.rich("weightsHint", { b: (chunks) => <strong>{chunks}</strong> })}
                        </p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                        {weightKeysFor(season).map(key => (
                            <div key={key} className="space-y-1">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-medium text-foreground">
                                        {t(`weight_${key}`)}
                                    </label>
                                    <span className="text-[10px] text-muted-foreground font-mono">
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
                        title={t("bucketPicklist")}
                        count={picklist.teams.length}
                        accent="emerald"
                        helpText={t("bucketPicklistHelp")}
                    >
                        <SortableContext items={picklist.teams.map(String)} strategy={verticalListSortingStrategy}>
                            {picklist.teams.length === 0 ? (
                                <EmptyState text={t("emptyPicklist")} />
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
                        title={t("bucketAvailable")}
                        count={available.length}
                        accent="blue"
                        helpText={t("bucketAvailableHelp")}
                    >
                        {available.length === 0 ? (
                            <EmptyState text={t("emptyAvailable")} />
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
                        title={t("bucketDnp")}
                        count={picklist.doNotPick.length}
                        accent="red"
                        helpText={t("bucketDnpHelp")}
                    >
                        {picklist.doNotPick.length === 0 ? (
                            <EmptyState text={t("emptyDnp")} />
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
                <div className="text-[10px] text-muted-foreground flex items-center gap-2 justify-end">
                    <User size={10} />
                    {t("lastEdit", { when: format.dateTime(new Date(picklist.updatedAt.seconds * 1000), { dateStyle: "medium", timeStyle: "short" }) })}
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
        emerald: "border-success/30 bg-success/5",
        blue: "border-secondary/30 bg-secondary/5",
        red: "border-danger/30 bg-danger/5",
    }[accent];
    const accentText = {
        emerald: "text-success",
        blue: "text-secondary",
        red: "text-danger",
    }[accent];
    return (
        <Card className={clsx("p-4 flex flex-col gap-2 min-h-[400px] max-h-[75vh]", accentColor)}>
            <div className="flex items-center justify-between">
                <h3 className={clsx("text-sm font-black uppercase tracking-wider", accentText)}>
                    {title}
                </h3>
                <span className="text-xs font-bold text-muted-foreground">{count}</span>
            </div>
            <p className="text-[10px] text-muted-foreground mb-2">{helpText}</p>
            <div className="space-y-1.5 overflow-y-auto flex-1 custom-scrollbar">{children}</div>
        </Card>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="text-center text-muted-foreground text-xs italic py-12">{text}</div>
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
    const t = useTranslations("PicklistEditor");
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
                "flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-card/80 transition-colors",
                selected && "ring-2 ring-success/50",
                declined && "opacity-50",
            )}
        >
            <button
                {...attributes}
                {...listeners}
                // 32px touch target so the grip is grabbable on tablet without
                // accidentally tapping the team card.
                className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing min-w-[32px] min-h-[32px] flex items-center justify-center"
                aria-label={t("reorder")}
            >
                <GripVertical size={16} />
            </button>
            <div className="w-7 text-center text-[10px] font-mono font-black text-muted-foreground">
                {rank}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{teamNumber}</span>
                    {score !== undefined && <ScoreBadge score={score} />}
                </div>
                {team && (
                    <div className="text-[10px] text-muted-foreground truncate">
                        {team.teamName} · {teamLine(team)}
                    </div>
                )}
            </div>
            <div className="flex items-center gap-1">
                <IconBtn
                    title={t("markSelected")}
                    active={selected}
                    activeColor="emerald"
                    onClick={onToggleSelected}
                >
                    <CheckCircle2 size={13} />
                </IconBtn>
                <IconBtn
                    title={t("markDeclined")}
                    active={declined}
                    activeColor="amber"
                    onClick={onToggleDeclined}
                >
                    <XCircle size={13} />
                </IconBtn>
                <IconBtn title={t("moveToDnp")} onClick={onMoveToDNP} activeColor="red">
                    <Ban size={13} />
                </IconBtn>
                <IconBtn title={t("removeFromPicklist")} onClick={onMoveToAvailable} activeColor="blue">
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
    const t = useTranslations("PicklistEditor");
    return (
        <div className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-card/80">
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-foreground">{team.teamNumber}</span>
                    {score !== undefined && <ScoreBadge score={score} />}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                    {team.teamName} · {teamLine(team)}
                </div>
            </div>
            <IconBtn title={t("addToPicklist")} onClick={onAddToPicklist} activeColor="emerald">
                <Plus size={13} />
            </IconBtn>
            <IconBtn title={t("markDnp")} onClick={onAddToDNP} activeColor="red">
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
/** Event metrics when the team played quals at the selected event (#115), else season averages. */
function teamLine(team: AggregatedTeamStats): string {
    const p = team.pick;
    if (!p) return `RS ${team.averageRS?.toFixed(1) ?? "—"} · NP ${team.averageNP?.toFixed(1) ?? "—"}`;
    const parts = [`OPR ${p.opr.toFixed(0)}`];
    if (p.tipsOpr !== undefined) parts.push(`TIPS ${p.tipsOpr.toFixed(1)}`);
    if (p.leavePark !== undefined) parts.push(`L/P ${Math.round(p.leavePark * 100)}%`);
    return parts.join(" · ");
}

function ScoreBadge({ score }: { score: number }) {
    const t = useTranslations("PicklistEditor");
    const pct = Math.round(score * 100);
    const color =
        pct >= 67 ? "bg-success/15 text-success border-success/30"
        : pct >= 34 ? "bg-warning/15 text-warning border-warning/30"
        : "bg-muted text-muted-foreground border-border";
    return (
        <span
            className={clsx("px-1.5 py-0.5 rounded text-[9px] font-black tracking-wider border font-mono", color)}
            title={t("scoreTitle", { pct })}
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
    const t = useTranslations("PicklistEditor");
    return (
        <div className="flex items-center gap-2 p-2 rounded-lg border bg-card hover:bg-card/80 opacity-70">
            <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-foreground line-through decoration-danger/50">
                    {teamNumber}
                </div>
                <div className="text-[10px] text-muted-foreground truncate">
                    {team?.teamName ?? "—"}
                </div>
            </div>
            <IconBtn title={t("removeFromDnp")} onClick={onMoveToAvailable} activeColor="blue">
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
        emerald: active ? "bg-success/30 text-success" : "hover:bg-success/20 text-muted-foreground hover:text-success",
        amber: active ? "bg-warning/30 text-warning" : "hover:bg-warning/20 text-muted-foreground hover:text-warning",
        red: active ? "bg-danger/30 text-danger" : "hover:bg-danger/20 text-muted-foreground hover:text-danger",
        blue: active ? "bg-secondary/30 text-secondary" : "hover:bg-secondary/20 text-muted-foreground hover:text-secondary",
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
