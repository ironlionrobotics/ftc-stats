"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useTranslations, useFormatter } from "next-intl";
import { useForm, useWatch, type Control } from "react-hook-form";
import { toast } from "sonner";
import clsx from "clsx";
import { Save, Trash2, CloudOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import DynamicGameForm from "@/components/scouting/games/DynamicGameForm";
import MatchTimer from "./MatchTimer";
import { gameDefinitionFor } from "@/lib/games/registry";
import { seasonRulesFor } from "@/lib/games/season-rules";
import { zodSchemaFromDefinition } from "@/lib/games/zod-from-definition";
import { inputsFromEntry } from "@/lib/games/score-inputs";
import { defaultsForDefinition, totalOf, type GameDefinition } from "@/types/game-definition";
import { groupStats } from "@/lib/practice-stats";
import {
    newPracticeId, savePracticeRun, drainPracticeQueue, pendingPracticeRuns, listenPracticeRuns, deletePracticeRun,
} from "@/lib/practice-service";
import type { PracticeRun } from "@/types/practice";
import type { ClockMode } from "@/lib/match-clock";

// Recharts only loads when the Progress tab is opened.
const ProgressChart = dynamic(() => import("./ProgressChart"), { ssr: false });

const META_KEY = "pride.workshop.meta";

/** Wall-clock time of a saved run (event-handler only). */
function practiceTimestamp(): number {
    return Date.now();
}

interface Meta { robotVersion: string; drivers: string; location: "workshop" | "event" }

function loadMeta(): Meta {
    try {
        const raw = localStorage.getItem(META_KEY);
        if (raw) return { robotVersion: "", drivers: "", location: "workshop", ...JSON.parse(raw) };
    } catch { /* storage blocked */ }
    return { robotVersion: "", drivers: "", location: "workshop" };
}

/**
 * Workshop (#105): practice matches with a competition-style clock, scored
 * with the season's own rules, and a private log of progress. Nothing here is
 * shared with other teams.
 */
export default function WorkshopClient({ season }: { season: number }) {
    const t = useTranslations("Workshop");
    const { user, orgId, loading } = useAuth();
    const def = gameDefinitionFor("FTC", season);

    if (loading) return null;
    if (!user) return <Notice>{t("signIn")}</Notice>;
    if (!orgId) return <Notice>{t("needTeam")}</Notice>;
    if (!def) return <Notice>{t("noGame")}</Notice>;
    return <Workshop season={season} orgId={orgId} uid={user.uid} def={def} />;
}

function Notice({ children }: { children: React.ReactNode }) {
    return <p className="rounded-xl border border-border bg-muted p-6 text-muted-foreground">{children}</p>;
}

function Workshop({ season, orgId, uid, def }: { season: number; orgId: string; uid: string; def: GameDefinition }) {
    const t = useTranslations("Workshop");
    const timing = seasonRulesFor(season).matchTiming;
    const [cloudRuns, setCloudRuns] = useState<PracticeRun[]>([]);
    const [localRuns, setLocalRuns] = useState<PracticeRun[]>([]);
    const [lastMode, setLastMode] = useState<ClockMode>("full");

    const refreshLocal = useCallback(async () => {
        try {
            await drainPracticeQueue(orgId, uid);
            setLocalRuns(await pendingPracticeRuns(orgId, uid));
        } catch { /* IndexedDB unavailable */ }
    }, [orgId, uid]);

    useEffect(() => listenPracticeRuns(orgId, season, setCloudRuns), [orgId, season]);
    useEffect(() => {
        // Initial drain plus whenever connectivity returns.
        const kick = () => { void refreshLocal(); };
        const id = setTimeout(kick, 0);
        window.addEventListener("online", kick);
        return () => { clearTimeout(id); window.removeEventListener("online", kick); };
    }, [refreshLocal]);

    const runs = useMemo(() => {
        const ids = new Set(cloudRuns.map(r => r.id));
        return [...cloudRuns, ...localRuns.filter(r => !ids.has(r.id))].sort((a, b) => b.runAtMs - a.runAtMs);
    }, [cloudRuns, localRuns]);
    const pendingIds = useMemo(() => new Set(localRuns.map(r => r.id).filter(id => !cloudRuns.some(c => c.id === id))), [localRuns, cloudRuns]);

    return (
        <Tabs defaultValue="match" className="space-y-4">
            <TabsList className="flex w-full gap-1 border border-border bg-muted p-1 md:w-fit">
                <TabsTrigger value="match">{t("tabMatch")}</TabsTrigger>
                <TabsTrigger value="history">{t("tabHistory", { n: runs.length })}</TabsTrigger>
                <TabsTrigger value="progress">{t("tabProgress")}</TabsTrigger>
            </TabsList>
            <TabsContent value="match" className="space-y-4">
                <MatchTimer timing={timing} onFinished={setLastMode} />
                <Scorer def={def} season={season} orgId={orgId} uid={uid} mode={lastMode} setMode={setLastMode} onSaved={refreshLocal} />
            </TabsContent>
            <TabsContent value="history">
                <History runs={runs} pendingIds={pendingIds} uid={uid} />
            </TabsContent>
            <TabsContent value="progress">
                <Progress runs={runs} />
            </TabsContent>
        </Tabs>
    );
}

function Scorer({ def, season, orgId, uid, mode, setMode, onSaved }: {
    def: GameDefinition; season: number; orgId: string; uid: string; mode: ClockMode; setMode: (m: ClockMode) => void; onSaved: () => void;
}) {
    const t = useTranslations("Workshop");
    const schema = useMemo(() => zodSchemaFromDefinition(def), [def]);
    const defaults = useMemo(() => defaultsForDefinition(def), [def]);
    const form = useForm<Record<string, unknown>>({ defaultValues: defaults });
    const [meta, setMeta] = useState<Meta>(loadMeta);
    const [saving, setSaving] = useState(false);
    const values = useWatch({ control: form.control });
    const parsed = schema.safeParse(values);
    const live = def.score && parsed.success ? def.score(inputsFromEntry(parsed.data)) : { auto: 0, teleop: 0, endgame: 0 };
    // Partial modes only count their own phases.
    const score = mode === "auto" ? { auto: live.auto, teleop: 0, endgame: 0 } : mode === "teleop" ? { auto: 0, teleop: live.teleop, endgame: live.endgame } : live;

    const save = async () => {
        const p = schema.safeParse(form.getValues());
        if (!p.success) { toast.error(t("invalid")); return; }
        setSaving(true);
        try { localStorage.setItem(META_KEY, JSON.stringify(meta)); } catch { /* storage blocked */ }
        const run: PracticeRun = {
            id: newPracticeId(),
            orgId, season, definitionId: def.id, createdBy: uid, runAtMs: practiceTimestamp(), mode,
            location: meta.location,
            robotVersion: meta.robotVersion.trim().slice(0, 40),
            drivers: meta.drivers.trim().slice(0, 40),
            fields: p.data as Record<string, number | boolean | string>,
            score, total: totalOf(score),
            notes: typeof p.data.notes === "string" ? p.data.notes : "",
        };
        try {
            const where = await savePracticeRun(run);
            toast.success(where === "cloud" ? t("saved", { total: run.total }) : t("savedOffline", { total: run.total }));
            form.reset(defaults);
            onSaved();
        } catch {
            toast.error(t("saveError"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">{t("robotVersion")}</span>
                    <input value={meta.robotVersion} maxLength={40} onChange={e => setMeta({ ...meta, robotVersion: e.target.value })} placeholder={t("robotVersionPh")}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
                <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">{t("drivers")}</span>
                    <input value={meta.drivers} maxLength={40} onChange={e => setMeta({ ...meta, drivers: e.target.value })} placeholder={t("driversPh")}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2" /></label>
                <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">{t("location")}</span>
                    <select value={meta.location} onChange={e => setMeta({ ...meta, location: e.target.value as Meta["location"] })} className="w-full rounded-lg border border-border bg-background px-3 py-2">
                        <option value="workshop">{t("locations.workshop")}</option>
                        <option value="event">{t("locations.event")}</option>
                    </select></label>
                <label className="text-sm"><span className="mb-1 block text-xs font-semibold uppercase text-muted-foreground">{t("mode")}</span>
                    <select value={mode} onChange={e => setMode(e.target.value as ClockMode)} className="w-full rounded-lg border border-border bg-background px-3 py-2">
                        {(["full", "auto", "teleop"] as const).map(m => <option key={m} value={m}>{t(`modes.${m}`)}</option>)}
                    </select></label>
            </div>

            <div className="sticky top-0 z-10 grid grid-cols-4 gap-2 rounded-2xl border border-border bg-card/95 p-3 text-center backdrop-blur-none">
                {(["auto", "teleop", "endgame"] as const).map(ph => (
                    <div key={ph}><div className="text-[11px] font-semibold uppercase text-muted-foreground">{t(`phaseShort.${ph}`)}</div>
                        <div className="font-mono text-2xl font-black tabular-nums">{score[ph]}</div></div>
                ))}
                <div><div className="text-[11px] font-semibold uppercase text-muted-foreground">{t("total")}</div>
                    <div className="font-mono text-2xl font-black tabular-nums text-primary">{totalOf(score)}</div></div>
            </div>

            <DynamicGameForm definition={def} control={form.control as unknown as Control<Record<string, unknown>>} />

            <button type="button" disabled={saving} onClick={save}
                className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-lg font-bold text-primary-foreground disabled:opacity-50">
                <Save size={20} /> {t("saveRun")}
            </button>
            <p className="text-xs text-muted-foreground">{t("privacy")}</p>
        </div>
    );
}

function History({ runs, pendingIds, uid }: { runs: PracticeRun[]; pendingIds: Set<string>; uid: string }) {
    const t = useTranslations("Workshop");
    const format = useFormatter();
    if (runs.length === 0) return <Notice>{t("noRuns")}</Notice>;
    return (
        <ul className="divide-y divide-border rounded-2xl border border-border">
            {runs.map(r => (
                <li key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="font-mono text-2xl font-black tabular-nums">{r.total}</div>
                    <div className="min-w-0 flex-1 text-sm">
                        <div className="font-semibold">{t(`modes.${r.mode}`)} · {r.score.auto}/{r.score.teleop}/{r.score.endgame}</div>
                        <div className="text-xs text-muted-foreground">
                            {format.dateTime(new Date(r.runAtMs), { dateStyle: "medium", timeStyle: "short" })}
                            {r.drivers && ` · ${r.drivers}`}{r.robotVersion && ` · ${r.robotVersion}`} · {t(`locations.${r.location}`)}
                        </div>
                        {r.notes && <div className="text-xs text-muted-foreground">{r.notes}</div>}
                    </div>
                    {pendingIds.has(r.id) && <span className="inline-flex items-center gap-1 text-xs text-warning"><CloudOff size={14} /> {t("pending")}</span>}
                    {r.createdBy === uid && !pendingIds.has(r.id) && (
                        <button type="button" aria-label={t("delete")} onClick={() => deletePracticeRun(r.id).catch(() => toast.error(t("saveError")))}
                            className="rounded-md p-2 text-muted-foreground hover:text-danger"><Trash2 size={16} /></button>
                    )}
                </li>
            ))}
        </ul>
    );
}

function Progress({ runs }: { runs: PracticeRun[] }) {
    const t = useTranslations("Workshop");
    const [by, setBy] = useState<"all" | "drivers" | "robotVersion">("all");
    const groups = useMemo(() => groupStats(runs, by), [runs, by]);
    if (runs.length === 0) return <Notice>{t("noRuns")}</Notice>;
    return (
        <div className="space-y-4">
            <div role="radiogroup" aria-label={t("groupBy")} className="flex gap-1">
                {(["all", "drivers", "robotVersion"] as const).map(k => (
                    <button key={k} type="button" role="radio" aria-checked={by === k} onClick={() => setBy(k)}
                        className={clsx("min-h-[40px] flex-1 rounded-lg border px-2 text-sm font-semibold", by === k ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                        {t(`groupBys.${k}`)}
                    </button>
                ))}
            </div>
            <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full text-sm">
                    <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                        <tr><th className="px-3 py-2">{by === "all" ? "" : t(`groupBys.${by}`)}</th>
                            <th className="px-3 py-2">{t("total")}</th><th className="px-3 py-2">{t("phaseShort.auto")}</th>
                            <th className="px-3 py-2">{t("phaseShort.teleop")}</th><th className="px-3 py-2">{t("phaseShort.endgame")}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {groups.map(g => (
                            <tr key={g.key}>
                                <td className="px-3 py-2 font-semibold">{g.key || t("allRuns")}</td>
                                {([g.total, g.auto, g.teleop, g.endgame]).map((s, i) => (
                                    <td key={i} className="px-3 py-2 tabular-nums">
                                        {s.n === 0 ? "—" : <>{s.avg} <span className="text-xs text-muted-foreground">±{s.sd} · {t("best", { best: s.best })} · n={s.n}</span></>}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-xs text-muted-foreground">{t("progressLegend")}</p>
            <ProgressChart runs={runs} />
        </div>
    );
}
