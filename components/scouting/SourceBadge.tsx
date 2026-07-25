"use client";

import { useMemo, useState } from "react";
import type { BaseMatchScouting } from "@/types/scouting";
import { scoutIdOf, scoutNameOf } from "@/types/scouting";
import {
    aggregateMatchTeam,
    type FieldConsensus,
} from "@/lib/scouting-aggregation";
import { Users, AlertTriangle, ChevronDown } from "lucide-react";
import clsx from "clsx";

interface SourceBadgeProps {
    /** All scouting entries that flow into the consensus being displayed. */
    entries: BaseMatchScouting[];
    /**
     * Optional: scout reliabilities from users/{uid}.reliability. Defaults to 1.0
     * per scout. Sprint 1.7 populates this from ground-truth validation.
     */
    scoutReliabilities?: Record<string, number>;
    /** Compact (chip) or full (chip + popover trigger). Defaults to "full". */
    variant?: "compact" | "full";
    className?: string;
}

/**
 * Compact provenance indicator for federated scouting data. Tells the strategy
 * lead at a glance: how many scouts contributed, how many orgs they came from,
 * and how many fields are flagged for disagreement.
 *
 * The "full" variant adds a click-to-expand popover with per-scout breakdown.
 *
 * Design rationale: the strategy lead needs to know in <1 second whether to
 * trust the displayed numbers. A green chip = consensus; an amber chip with a
 * flag count = look closer before making decisions on this team.
 */
export default function SourceBadge({
    entries,
    scoutReliabilities = {},
    variant = "full",
    className,
}: SourceBadgeProps) {
    const [expanded, setExpanded] = useState(false);

    const summary = useMemo(() => {
        if (entries.length === 0) {
            return {
                entryCount: 0,
                orgCount: 0,
                scoutCount: 0,
                orgIds: [] as string[],
                flaggedFieldCount: 0,
                totalFieldCount: 0,
            };
        }
        // Group by (match, team) and aggregate each group separately, then sum
        // up the per-group flag counts. This handles cases where the badge is
        // showing data spanning multiple matches (e.g., team-level aggregate).
        const groups = new Map<string, BaseMatchScouting[]>();
        for (const e of entries) {
            const key = `${e.matchNumber}__${e.teamNumber}`;
            const bucket = groups.get(key) ?? [];
            bucket.push(e);
            groups.set(key, bucket);
        }
        let flaggedFieldCount = 0;
        let totalFieldCount = 0;
        const orgIds = new Set<string>();
        const scoutIds = new Set<string>();
        for (const group of groups.values()) {
            const agg = aggregateMatchTeam(group, scoutReliabilities);
            if (!agg) continue;
            for (const oid of agg.sourceSummary.orgIds) orgIds.add(oid);
            for (const e of group) scoutIds.add(scoutIdOf(e));
            for (const [, cons] of Object.entries(agg.fields)) {
                if (isFlaggable(cons)) {
                    totalFieldCount++;
                    if (isFlagged(cons)) flaggedFieldCount++;
                }
            }
        }
        return {
            entryCount: entries.length,
            orgCount: orgIds.size,
            scoutCount: scoutIds.size,
            orgIds: Array.from(orgIds),
            flaggedFieldCount,
            totalFieldCount,
        };
    }, [entries, scoutReliabilities]);

    if (summary.entryCount === 0) {
        return (
            <div
                className={clsx(
                    "inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted text-muted-foreground text-[10px] font-bold uppercase tracking-wider",
                    className,
                )}
                title="No hay observaciones de scouting para este equipo en este match"
            >
                <Users size={11} />
                Sin scouting
            </div>
        );
    }

    const hasFlags = summary.flaggedFieldCount > 0;

    const chipColor = hasFlags
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-success/10 text-success border-success/20";

    return (
        <div className={clsx("relative inline-block", className)}>
            <button
                type="button"
                onClick={variant === "full" ? () => setExpanded(v => !v) : undefined}
                disabled={variant === "compact"}
                className={clsx(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[10px] font-bold uppercase tracking-wider transition-colors",
                    chipColor,
                    variant === "full" && "cursor-pointer hover:brightness-110",
                )}
                title={
                    hasFlags
                        ? `${summary.flaggedFieldCount} de ${summary.totalFieldCount} campos con desacuerdo entre scouts`
                        : "Consenso entre scouts"
                }
            >
                <Users size={11} />
                <span>
                    {summary.scoutCount} scout{summary.scoutCount === 1 ? "" : "s"} · {summary.orgCount} org
                    {summary.orgCount === 1 ? "" : "s"}
                </span>
                {hasFlags && (
                    <>
                        <span className="opacity-40">·</span>
                        <AlertTriangle size={11} />
                        <span>{summary.flaggedFieldCount}</span>
                    </>
                )}
                {variant === "full" && (
                    <ChevronDown
                        size={11}
                        className={clsx("opacity-60 transition-transform", expanded && "rotate-180")}
                    />
                )}
            </button>

            {variant === "full" && expanded && (
                <SourcePopover entries={entries} onClose={() => setExpanded(false)} />
            )}
        </div>
    );
}

function isFlaggable(c: FieldConsensus): boolean {
    return c.kind === "numeric" || c.kind === "categorical";
}

function isFlagged(c: FieldConsensus): boolean {
    if (c.kind === "numeric" || c.kind === "categorical") return c.flagged;
    return false;
}

// ---------------------------------------------------------------------------
// Detail popover — full per-scout breakdown when the badge is expanded.
// ---------------------------------------------------------------------------

function SourcePopover({
    entries,
    onClose,
}: {
    entries: BaseMatchScouting[];
    onClose: () => void;
}) {
    // Group by orgId for display.
    const byOrg = useMemo(() => {
        const m = new Map<string, BaseMatchScouting[]>();
        for (const e of entries) {
            const orgId = e.orgId ?? "unknown";
            const bucket = m.get(orgId) ?? [];
            bucket.push(e);
            m.set(orgId, bucket);
        }
        return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    }, [entries]);

    return (
        <>
            {/* Click-outside backdrop */}
            <div
                className="fixed inset-0 z-40"
                onClick={onClose}
                aria-hidden="true"
            />

            <div className="absolute top-full left-0 mt-1 z-50 min-w-[280px] max-w-sm bg-slate-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden">
                <div className="p-3 border-b border-white/10 bg-white/[0.02]">
                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                        Fuente del dato
                    </div>
                </div>
                <div className="p-3 space-y-3 max-h-[60vh] overflow-y-auto">
                    {byOrg.map(([orgId, orgEntries]) => (
                        <div key={orgId} className="space-y-1.5">
                            <div className="flex items-center gap-2">
                                <span className="px-1.5 py-0.5 bg-primary/20 text-primary text-[9px] font-black uppercase tracking-wider rounded">
                                    {orgId === "unknown" ? "Sin org" : `#${orgId}`}
                                </span>
                                <span className="text-[10px] text-gray-500 font-medium">
                                    {orgEntries.length} obs
                                </span>
                            </div>
                            <ul className="space-y-1 pl-1">
                                {orgEntries.map((e, i) => (
                                    <li
                                        key={i}
                                        className="flex items-center justify-between text-[11px] text-gray-300"
                                    >
                                        <span className="truncate">{scoutNameOf(e)}</span>
                                        <span className="flex items-center gap-1 text-gray-500 ml-2 flex-shrink-0">
                                            <ConfidenceDot confidence={e.confidence ?? "high"} />
                                            <span className="text-[10px]">
                                                M{e.matchNumber}
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </>
    );
}

function ConfidenceDot({ confidence }: { confidence: "high" | "medium" | "low" }) {
    const color =
        confidence === "high"
            ? "bg-success"
            : confidence === "medium"
                ? "bg-warning"
                : "bg-danger";
    return (
        <span
            className={clsx("inline-block w-1.5 h-1.5 rounded-full", color)}
            title={`Confianza: ${confidence}`}
        />
    );
}
