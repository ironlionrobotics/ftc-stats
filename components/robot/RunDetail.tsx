"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import clsx from "clsx";
import { ArrowLeft, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useConfirm } from "@/components/ui/ConfirmDialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { deleteRobotLog, listenRobotLog, readRobotLogCsv, updateRobotLogLabels } from "@/lib/robot-log-service";
import { listenPracticeRuns } from "@/lib/practice-service";
import { parseRobotLog } from "@/lib/robot-logs/formats";
import type { PracticeRun } from "@/types/practice";
import type { Finding, RobotLog, RobotLogDoc, RobotLogKind } from "@/types/robot-log";
import { formatDuration, isCritical, isKnownLevel, matchCode, round1 } from "./helpers";

// Recharts only loads once the run is open.
const RunCharts = dynamic(() => import("./RunCharts"), { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> });

type Parsed = { key: string; log: RobotLog | null };

/** One uploaded run: summary tiles, charts, findings and editable labels (#120). */
export default function RunDetail({ logId }: { logId: string }) {
    const t = useTranslations("RobotHealth");
    const { user, loading } = useAuth();
    const [doc, setDoc] = useState<RobotLogDoc | null | undefined>(undefined);
    // The file only changes when the doc id does, not on label edits.
    const [source, setSource] = useState<RobotLogDoc | null>(null);
    const [parsed, setParsed] = useState<Parsed | null>(null);

    useEffect(() => {
        if (loading || !user) return;
        return listenRobotLog(logId, d => {
            setDoc(d);
            setSource(prev => (d && prev?.id === d.id ? prev : d));
        });
    }, [logId, loading, user]);

    useEffect(() => {
        if (!source) return;
        let live = true;
        readRobotLogCsv(source)
            .then(text => parseRobotLog(text))
            .then(log => { if (live) setParsed({ key: source.id, log }); })
            .catch(() => { if (live) setParsed({ key: source.id, log: null }); });
        return () => { live = false; };
    }, [source]);

    const back = (
        <Link href="/robot" className="mb-4 inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground">
            <ArrowLeft size={16} /> {t("back")}
        </Link>
    );

    if (loading) return null;
    if (!user || doc === null) return <div>{back}<p className="rounded-xl border border-border bg-muted p-6 text-muted-foreground">{t("notFound")}</p></div>;
    if (doc === undefined) return <div>{back}<Skeleton className="h-48 w-full" /></div>;

    const mine = parsed && parsed.key === doc.id ? parsed : null;
    return (
        <div className="space-y-6">
            {back}
            <Header doc={doc} />
            <Tiles doc={doc} />
            {mine === null ? <Skeleton className="h-64 w-full" /> : mine.log ? <RunCharts log={mine.log} /> : (
                <p className="rounded-xl border border-border bg-muted p-4 text-sm text-muted-foreground">{t("chartError")}</p>
            )}
            <Motors doc={doc} />
            <Findings findings={doc.summary?.findings ?? []} />
        </div>
    );
}

function Header({ doc }: { doc: RobotLogDoc }) {
    const t = useTranslations("RobotHealth");
    const format = useFormatter();
    const router = useRouter();
    const confirm = useConfirm();
    const [editing, setEditing] = useState(false);
    const kind = doc.kind === "match" && doc.match
        ? t("matchBadge", { code: matchCode(doc.match, isKnownLevel(doc.match.level) ? t(`levels.${doc.match.level}`) : undefined) })
        : t(`kinds.${doc.kind}`);

    const remove = async () => {
        const ok = await confirm({ title: t("deleteTitle"), description: t("deleteBody"), confirmText: t("deleteConfirm"), cancelText: t("cancel"), variant: "danger" });
        if (!ok) return;
        try {
            await deleteRobotLog(doc);
            toast.success(t("deleted"));
            router.push("/robot");
        } catch {
            toast.error(t("deleteError"));
        }
    };

    return (
        <header className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-md bg-primary/15 px-2 py-0.5 text-xs font-bold text-brand-ink">{kind}</span>
                <h1 className="text-2xl font-black tracking-tight">{doc.label || kind}</h1>
            </div>
            <p className="text-sm text-muted-foreground" suppressHydrationWarning>
                {format.dateTime(new Date(doc.recordedAt), { dateStyle: "medium", timeStyle: "short" })}
                {" · "}{t(`formats.${doc.format}`)}
                {doc.eventCode && <> · {doc.eventCode}</>}
            </p>
            {editing ? <EditForm doc={doc} onDone={() => setEditing(false)} /> : (
                <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(true)}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold"><Pencil size={16} /> {t("edit")}</button>
                    <button type="button" onClick={() => void remove()}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-error"><Trash2 size={16} /> {t("delete")}</button>
                </div>
            )}
        </header>
    );
}

const FIELD = "w-full rounded-lg border border-border bg-background px-3 py-2 min-h-[44px]";
const LABEL = "mb-1 block text-xs font-semibold uppercase text-muted-foreground";

function EditForm({ doc, onDone }: { doc: RobotLogDoc; onDone: () => void }) {
    const t = useTranslations("RobotHealth");
    const format = useFormatter();
    const [kind, setKind] = useState<RobotLogKind>(doc.kind);
    const [label, setLabel] = useState(doc.label);
    const [level, setLevel] = useState(doc.match?.level ?? "QUALIFICATION");
    const [number, setNumber] = useState(doc.match ? String(doc.match.number) : "");
    const [practiceId, setPracticeId] = useState(doc.practiceRunId ?? "");
    const [practices, setPractices] = useState<PracticeRun[]>([]);
    const [saving, setSaving] = useState(false);

    useEffect(() => listenPracticeRuns(doc.orgId, doc.season, setPractices), [doc.orgId, doc.season]);
    const sorted = useMemo(() => [...practices].sort((a, b) => b.runAtMs - a.runAtMs).slice(0, 50), [practices]);

    const save = async () => {
        const n = Math.floor(Number(number));
        const match = kind === "match" && Number.isFinite(n) && n > 0 && n < 10000 ? { level, number: n } : null;
        setSaving(true);
        try {
            await updateRobotLogLabels(doc.id, {
                label: label.trim().slice(0, 60),
                kind,
                eventCode: kind === "match" ? doc.eventCode : null,
                match,
                practiceRunId: kind === "practice" && practiceId ? practiceId : null,
            });
            toast.success(t("saved"));
            onDone();
        } catch {
            toast.error(t("saveError"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div role="radiogroup" aria-label={t("formKind")} className="flex gap-1">
                {(["match", "practice", "test"] as const).map(k => (
                    <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                        className={clsx("min-h-[44px] flex-1 rounded-lg border px-2 text-sm font-semibold", kind === k ? "border-primary bg-primary text-primary-foreground" : "border-border")}>
                        {t(`kinds.${k}`)}
                    </button>
                ))}
            </div>
            {kind === "match" && (
                <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm"><span className={LABEL}>{t("formMatchLevel")}</span>
                        <select value={level} onChange={e => setLevel(e.target.value)} className={FIELD}>
                            <option value="QUALIFICATION">{t("formMatchLevels.QUALIFICATION")}</option>
                            <option value="PLAYOFF">{t("formMatchLevels.PLAYOFF")}</option>
                            {!isKnownLevel(level) && <option value={level}>{level}</option>}
                        </select></label>
                    <label className="block text-sm"><span className={LABEL}>{t("formMatchNumber")}</span>
                        <input type="number" inputMode="numeric" min={1} max={9999} value={number} onChange={e => setNumber(e.target.value)} className={FIELD} /></label>
                </div>
            )}
            {kind === "practice" && (
                <label className="block text-sm"><span className={LABEL}>{t("formPractice")}</span>
                    <select value={practiceId} onChange={e => setPracticeId(e.target.value)} className={FIELD}>
                        <option value="">{t("formPracticeNone")}</option>
                        {sorted.map(p => (
                            <option key={p.id} value={p.id}>
                                {t("formPracticeOption", {
                                    date: format.dateTime(new Date(p.runAtMs), { dateStyle: "short", timeStyle: "short" }),
                                    version: p.robotVersion || t("formPracticeNoVersion"),
                                    total: p.total,
                                })}
                            </option>
                        ))}
                    </select></label>
            )}
            <label className="block text-sm"><span className={LABEL}>{t("formLabel")}</span>
                <input value={label} maxLength={60} onChange={e => setLabel(e.target.value)} placeholder={t("formLabelPh")} className={FIELD} /></label>
            <div className="flex gap-2">
                <button type="button" disabled={saving} onClick={() => void save()}
                    className="min-h-[44px] flex-1 rounded-xl bg-primary font-bold text-primary-foreground disabled:opacity-50">{t("save")}</button>
                <button type="button" disabled={saving} onClick={onDone}
                    className="min-h-[44px] flex-1 rounded-xl border border-border font-semibold">{t("cancel")}</button>
            </div>
        </div>
    );
}

function Tiles({ doc }: { doc: RobotLogDoc }) {
    const t = useTranslations("RobotHealth");
    const s = doc.summary;
    const tiles: [string, string][] = [
        [t("tileDuration"), formatDuration(s.durationS)],
        ...(s.vMin !== null ? [[t("tileVmin"), `${Math.round(s.vMin * 100) / 100} V`] as [string, string]] : []),
        ...(s.totalPeakA !== null ? [[t("tilePeak"), `${round1(s.totalPeakA)} A`] as [string, string]] : []),
        ...(s.loopAvgMs !== null && s.loopMaxMs !== null ? [[t("tileLoop"), `${round1(s.loopAvgMs)} / ${round1(s.loopMaxMs)} ms`] as [string, string]] : []),
    ];
    return (
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {tiles.map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-border bg-card p-3">
                    <div className="text-xs font-semibold uppercase text-muted-foreground">{k}</div>
                    <div className="font-mono text-xl font-black tabular-nums">{v}</div>
                </div>
            ))}
        </div>
    );
}

function Motors({ doc }: { doc: RobotLogDoc }) {
    const t = useTranslations("RobotHealth");
    const motors = doc.summary.motors;
    if (motors.length === 0) return null;
    return (
        <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase text-muted-foreground">{t("motorsTitle")}</h2>
            <div className="overflow-x-auto rounded-2xl border border-border">
                <table className="w-full text-sm">
                    <thead className="bg-muted text-left text-xs uppercase text-muted-foreground">
                        <tr><th className="px-3 py-2">{t("motorDevice")}</th><th className="px-3 py-2">{t("motorPeak")}</th>
                            <th className="px-3 py-2">{t("motorMean")}</th><th className="px-3 py-2">{t("motorP95")}</th><th className="px-3 py-2">{t("motorEncoder")}</th></tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {motors.map(m => (
                            <tr key={m.device}>
                                <td className="px-3 py-2 font-semibold">{m.device}</td>
                                <td className="px-3 py-2 tabular-nums">{round1(m.peakA)}</td>
                                <td className="px-3 py-2 tabular-nums">{round1(m.meanA)}</td>
                                <td className="px-3 py-2 tabular-nums">{round1(m.p95A)}</td>
                                <td className="px-3 py-2">{!m.hasEncoder ? t("encoderNo") : m.encoderMoved ? t("encoderYes") : <span className="text-warning">{t("encoderStill")}</span>}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
}

function Findings({ findings }: { findings: Finding[] }) {
    const t = useTranslations("RobotHealth");
    return (
        <section className="space-y-2">
            <h2 className="text-sm font-bold uppercase text-muted-foreground">{t("findingsTitle")}</h2>
            {findings.length === 0 ? <p className="rounded-xl bg-success-tint p-3 text-sm text-success">{t("findingsEmpty")}</p> : (
                <ul className="space-y-2">
                    {findings.map((f, i) => (
                        <li key={i} className={clsx("rounded-xl p-3 text-sm", isCritical(f) ? "bg-error-tint text-error" : "bg-warning-tint text-warning")}>
                            {t(`findings.${f.code}`, {
                                device: f.device,
                                value: f.code === "brownout" || f.code === "lowVoltage" ? (Math.round(f.value * 100) / 100).toString() : round1(f.value),
                                at: round1(f.atS),
                                dur: round1(f.durationS),
                            })}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
