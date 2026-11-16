"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useTranslations, useFormatter } from "next-intl";
import clsx from "clsx";
import { ChevronRight, Upload } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Skeleton } from "@/components/ui/Skeleton";
import { listenRobotLogs } from "@/lib/robot-log-service";
import type { RobotLogDoc } from "@/types/robot-log";
import LogUpload from "./LogUpload";
import { countFindings, formatDuration, isKnownLevel, matchCode, teamNumberOf } from "./helpers";

// Recharts only loads when the Trends tab is opened.
const TrendsView = dynamic(() => import("./TrendsView"), { ssr: false });

/** Minimal, serializable schedule row used to pick the match of an upload. */
export interface ScheduleLite { level: string; number: number; teams: number[] }

type TabId = "runs" | "trends" | "upload";

/**
 * Robot health (#120): CSV logs the team exported from its robot, analyzed in
 * the browser and stored privately for the team.
 */
export default function RobotHealthClient({ season, activeEvent, schedule }: {
    season: number; activeEvent: string | null; schedule: ScheduleLite[];
}) {
    const t = useTranslations("RobotHealth");
    const { user, orgId, loading } = useAuth();
    if (loading) return null;
    if (!user) return <Notice>{t("signIn")}</Notice>;
    if (!orgId) return <Notice>{t("needTeam")}</Notice>;
    if (teamNumberOf(orgId) === null) return <Notice>{t("notSupported")}</Notice>;
    return <RobotHealth season={season} orgId={orgId} uid={user.uid} activeEvent={activeEvent} schedule={schedule} />;
}

function Notice({ children }: { children: React.ReactNode }) {
    return <p className="rounded-xl border border-border bg-muted p-6 text-muted-foreground">{children}</p>;
}

function RobotHealth({ season, orgId, uid, activeEvent, schedule }: {
    season: number; orgId: string; uid: string; activeEvent: string | null; schedule: ScheduleLite[];
}) {
    const t = useTranslations("RobotHealth");
    const [logs, setLogs] = useState<RobotLogDoc[] | null>(null);
    const [tab, setTab] = useState<TabId>("runs");

    useEffect(() => listenRobotLogs(orgId, season, setLogs), [orgId, season]);

    const tabs: { id: TabId; label: string }[] = [
        { id: "runs", label: t("tabRuns", { n: logs?.length ?? 0 }) },
        { id: "trends", label: t("tabTrends") },
        { id: "upload", label: t("tabUpload") },
    ];

    return (
        <div className="space-y-4">
            <div role="tablist" className="flex w-full gap-1 rounded-xl border border-border bg-muted p-1 md:w-fit">
                {tabs.map(x => (
                    <button key={x.id} type="button" role="tab" aria-selected={tab === x.id} onClick={() => setTab(x.id)}
                        className={clsx("min-h-[44px] flex-1 rounded-lg px-4 text-sm font-semibold md:flex-none",
                            tab === x.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground")}>
                        {x.label}
                    </button>
                ))}
            </div>
            {tab === "runs" && <Runs logs={logs} onUpload={() => setTab("upload")} />}
            {tab === "trends" && (logs === null ? <Skeleton className="h-48 w-full" /> : <TrendsView logs={logs} />)}
            {tab === "upload" && (
                <LogUpload season={season} orgId={orgId} uid={uid} activeEvent={activeEvent} schedule={schedule} onUploaded={() => setTab("runs")} />
            )}
        </div>
    );
}

function Runs({ logs, onUpload }: { logs: RobotLogDoc[] | null; onUpload: () => void }) {
    const t = useTranslations("RobotHealth");
    const format = useFormatter();
    if (logs === null) return <Skeleton className="h-48 w-full" />;
    if (logs.length === 0) {
        return (
            <div className="space-y-3 rounded-2xl border border-border bg-card p-5">
                <h2 className="text-lg font-bold">{t("emptyTitle")}</h2>
                <p className="text-sm">{t("emptyBody")}</p>
                <p className="text-sm text-muted-foreground">{t("emptyHow")}</p>
                <p className="text-sm text-muted-foreground">{t("emptyFormat")}</p>
                <button type="button" onClick={onUpload}
                    className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-primary px-4 font-bold text-primary-foreground">
                    <Upload size={18} /> {t("emptyCta")}
                </button>
            </div>
        );
    }
    const sorted = [...logs].sort((a, b) => b.recordedAt - a.recordedAt);
    return (
        <ul className="divide-y divide-border rounded-2xl border border-border">
            {sorted.map(r => {
                const f = countFindings(r.summary?.findings);
                const kind = r.kind === "match" && r.match
                    ? t("matchBadge", { code: matchCode(r.match, isKnownLevel(r.match.level) ? t(`levels.${r.match.level}`) : undefined) })
                    : t(`kinds.${r.kind}`);
                return (
                    <li key={r.id}>
                        <Link href={`/robot/${r.id}`} className="flex min-h-[56px] items-center gap-3 p-3 hover:bg-muted">
                            <div className="min-w-0 flex-1 text-sm">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-bold text-brand-ink">{kind}</span>
                                    {r.label && <span className="truncate font-semibold">{r.label}</span>}
                                </div>
                                <div className="mt-1 text-xs text-muted-foreground" suppressHydrationWarning>
                                    {format.dateTime(new Date(r.recordedAt), { dateStyle: "medium", timeStyle: "short" })}
                                    {" · "}{formatDuration(r.summary.durationS)}
                                    {r.summary.vMin !== null && <> · {t("vminShort", { v: (Math.round(r.summary.vMin * 100) / 100).toString() })}</>}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-2 text-xs font-semibold">
                                    {f.critical === 0 && f.warn === 0 && <span className="text-success">{t("findingsNone")}</span>}
                                    {f.critical > 0 && <span className="text-error">{t("findingsCritical", { n: f.critical })}</span>}
                                    {f.warn > 0 && <span className="text-warning">{t("findingsWarn", { n: f.warn })}</span>}
                                </div>
                            </div>
                            <ChevronRight size={18} className="shrink-0 text-muted-foreground" />
                        </Link>
                    </li>
                );
            })}
        </ul>
    );
}
