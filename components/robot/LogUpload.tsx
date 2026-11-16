"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations, useFormatter } from "next-intl";
import { toast } from "sonner";
import clsx from "clsx";
import { FileUp, X } from "lucide-react";
import { CsvError } from "@/lib/robot-logs/csv";
import { FormatError, parseRobotLog } from "@/lib/robot-logs/formats";
import { summarizeRun } from "@/lib/robot-logs/analysis";
import { recordedAtFromName } from "@/lib/robot-logs/series";
import { MAX_LOG_BYTES, storageFileName } from "@/lib/robot-logs/paths";
import { newRobotLogId, uploadRobotLog, RobotLogUploadError } from "@/lib/robot-log-service";
import { listenPracticeRuns } from "@/lib/practice-service";
import type { PracticeRun } from "@/types/practice";
import type { RobotLogDoc, RobotLogFormat, RobotLogKind, RunSummary, RobotLog } from "@/types/robot-log";
import type { ScheduleLite } from "./RobotHealthClient";
import { formatDuration, isKnownLevel, matchCode, round1, teamNumberOf } from "./helpers";

type Status = "pending" | "uploading" | "done" | "error";

interface Item {
    id: string;
    file: File;
    /** Present when the file parsed; absent files are never uploaded. */
    parsed?: { format: RobotLogFormat; log: RobotLog; summary: RunSummary };
    /** i18n key under RobotHealth for a parse/size error. */
    errorKey?: string;
    status: Status;
    /** i18n key under RobotHealth.uploadFailed. */
    failKey?: "offline" | "upload" | "save";
}

const FIELD = "w-full rounded-lg border border-border bg-background px-3 py-2 min-h-[44px]";
const LABEL = "mb-1 block text-xs font-semibold uppercase text-muted-foreground";

/**
 * Parses CSV files in the browser and uploads them (with their summary) to the
 * team's private storage (#120). Files that fail to parse are never uploaded.
 */
export default function LogUpload({ season, orgId, uid, activeEvent, schedule, onUploaded }: {
    season: number; orgId: string; uid: string; activeEvent: string | null; schedule: ScheduleLite[]; onUploaded: () => void;
}) {
    const t = useTranslations("RobotHealth");
    const format = useFormatter();
    const team = teamNumberOf(orgId);
    const [items, setItems] = useState<Item[]>([]);
    const [busy, setBusy] = useState(false);
    const [dragging, setDragging] = useState(false);
    const [kind, setKind] = useState<RobotLogKind>("match");
    const [picked, setPicked] = useState(""); // "LEVEL|number" from the schedule
    const [freeLevel, setFreeLevel] = useState("QUALIFICATION");
    const [freeNumber, setFreeNumber] = useState("");
    const [practiceId, setPracticeId] = useState("");
    const [label, setLabel] = useState("");
    const [practices, setPractices] = useState<PracticeRun[]>([]);
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => listenPracticeRuns(orgId, season, setPractices), [orgId, season]);

    const myMatches = useMemo(
        () => (team === null ? [] : schedule.filter(m => m.teams.includes(team))),
        [schedule, team],
    );
    const sortedPractices = useMemo(() => [...practices].sort((a, b) => b.runAtMs - a.runAtMs).slice(0, 50), [practices]);

    const addFiles = async (list: FileList | File[]) => {
        const files = Array.from(list);
        const next: Item[] = [];
        for (const file of files) {
            const base = { id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`, file, status: "pending" as Status };
            if (file.size > MAX_LOG_BYTES) { next.push({ ...base, errorKey: "uploadTooBig" }); continue; }
            try {
                const log = parseRobotLog(await file.text());
                next.push({ ...base, parsed: { format: log.format, log, summary: summarizeRun(log) } });
            } catch (e) {
                next.push({
                    ...base,
                    errorKey: e instanceof CsvError || e instanceof FormatError ? `uploadErrors.${e.code}` : "uploadUnreadable",
                });
            }
        }
        setItems(prev => [...prev, ...next]);
    };

    const currentMatch = (): { level: string; number: number } | null => {
        if (picked) {
            const [level, n] = picked.split("|");
            return { level, number: Number(n) };
        }
        const n = Math.floor(Number(freeNumber));
        return Number.isFinite(n) && n > 0 && n < 10000 ? { level: freeLevel, number: n } : null;
    };

    const upload = async () => {
        if (team === null) return;
        const match = kind === "match" ? currentMatch() : null;
        const cleanLabel = label.trim().slice(0, 60);
        setBusy(true);
        let failed = 0;
        let ok = 0;
        const patch = (id: string, p: Partial<Item>) => setItems(prev => prev.map(i => (i.id === id ? { ...i, ...p } : i)));
        for (const item of items) {
            if (!item.parsed || item.status === "done") continue;
            patch(item.id, { status: "uploading", failKey: undefined });
            const { log, summary } = item.parsed;
            const doc: RobotLogDoc = {
                id: newRobotLogId(),
                orgId, season, teamNumber: team, createdBy: uid,
                uploadedAt: Date.now(),
                recordedAt: recordedAtFromName(item.file.name) ?? item.file.lastModified,
                kind,
                eventCode: kind === "match" ? activeEvent : null,
                match,
                practiceRunId: kind === "practice" && practiceId ? practiceId : null,
                label: cleanLabel,
                format: log.format,
                files: [storageFileName(item.file.name)],
                channels: log.channels.map(({ key, device, quantity, unit }) => ({ key, device, quantity, unit })).slice(0, 64),
                summary,
            };
            try {
                await uploadRobotLog(doc, item.file);
                ok++;
                patch(item.id, { status: "done" });
            } catch (e) {
                failed++;
                patch(item.id, { status: "error", failKey: e instanceof RobotLogUploadError ? e.code : "upload" });
            }
        }
        setBusy(false);
        if (ok > 0) toast.success(t("uploadDone", { n: ok }));
        if (failed === 0 && ok > 0) { setItems([]); onUploaded(); }
    };

    if (team === null) return null;
    const uploadable = items.filter(i => i.parsed && i.status !== "done").length;
    const levelName = (l: string) => (isKnownLevel(l) ? t(`levels.${l}`) : undefined);

    return (
        <div className="space-y-4">
            <label
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); if (!busy) void addFiles(e.dataTransfer.files); }}
                aria-disabled={busy}
                className={clsx("flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-6 text-center",
                    dragging ? "border-primary bg-primary/10" : "border-border bg-card")}>
                <FileUp className="text-primary" />
                <span className="font-semibold">{t("uploadDropTitle")}</span>
                <span className="text-xs text-muted-foreground">{t("uploadDropHint")}</span>
                <span className="mt-1 inline-flex min-h-[44px] items-center rounded-xl border border-border px-4 text-sm font-semibold">{t("uploadChoose")}</span>
                <input ref={inputRef} type="file" multiple accept=".csv,text/csv" className="sr-only" disabled={busy}
                    onChange={e => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
            </label>

            {items.length > 0 && (
                <ul className="space-y-2">
                    {items.map(i => (
                        <li key={i.id} className="rounded-xl border border-border bg-card p-3 text-sm">
                            <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate font-semibold">{i.file.name}</div>
                                    {i.parsed ? (
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {t(`formats.${i.parsed.format}`)} · {t("previewLine", {
                                                duration: formatDuration(i.parsed.summary.durationS),
                                                samples: i.parsed.summary.samples,
                                                hz: round1(i.parsed.summary.hz),
                                            })}
                                            {i.parsed.summary.vMin !== null && <> · {t("previewVmin", { v: (Math.round(i.parsed.summary.vMin * 100) / 100).toString() })}</>}
                                            {" · "}{t("previewFindings", { n: i.parsed.summary.findings.length })}
                                        </div>
                                    ) : (
                                        <div className="mt-1 text-xs font-semibold text-error">{t(i.errorKey ?? "uploadUnreadable")}</div>
                                    )}
                                    {i.parsed && (
                                        <div className={clsx("mt-1 text-xs font-semibold", i.status === "error" ? "text-error" : i.status === "done" ? "text-success" : "text-muted-foreground")}>
                                            {i.status === "error" && i.failKey ? t(`uploadFailed.${i.failKey}`) : t(`uploadStatus.${i.status}`)}
                                        </div>
                                    )}
                                </div>
                                {i.status !== "uploading" && (
                                    <button type="button" aria-label={t("previewRemove")} onClick={() => setItems(prev => prev.filter(x => x.id !== i.id))}
                                        className="grid h-11 w-11 shrink-0 place-items-center rounded-md text-muted-foreground hover:text-foreground"><X size={16} /></button>
                                )}
                            </div>
                        </li>
                    ))}
                </ul>
            )}

            {uploadable > 0 && (
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
                        <div className="space-y-2">
                            {activeEvent && <p className="text-xs text-muted-foreground">{t("formEvent", { code: activeEvent })}</p>}
                            {activeEvent && myMatches.length > 0 ? (
                                <label className="block text-sm"><span className={LABEL}>{t("formMatch")}</span>
                                    <select value={picked} onChange={e => setPicked(e.target.value)} className={FIELD}>
                                        <option value="">{t("formMatchPick")}</option>
                                        {myMatches.map(m => (
                                            <option key={`${m.level}|${m.number}`} value={`${m.level}|${m.number}`}>
                                                {matchCode({ level: m.level, number: m.number }, levelName(m.level))}
                                            </option>
                                        ))}
                                    </select></label>
                            ) : (
                                <div className="grid grid-cols-2 gap-2">
                                    <label className="block text-sm"><span className={LABEL}>{t("formMatchLevel")}</span>
                                        <select value={freeLevel} onChange={e => setFreeLevel(e.target.value)} className={FIELD}>
                                            <option value="QUALIFICATION">{t("formMatchLevels.QUALIFICATION")}</option>
                                            <option value="PLAYOFF">{t("formMatchLevels.PLAYOFF")}</option>
                                        </select></label>
                                    <label className="block text-sm"><span className={LABEL}>{t("formMatchNumber")}</span>
                                        <input type="number" inputMode="numeric" min={1} max={9999} value={freeNumber} onChange={e => setFreeNumber(e.target.value)} className={FIELD} /></label>
                                </div>
                            )}
                        </div>
                    )}

                    {kind === "practice" && sortedPractices.length > 0 && (
                        <label className="block text-sm"><span className={LABEL}>{t("formPractice")}</span>
                            <select value={practiceId} onChange={e => setPracticeId(e.target.value)} className={FIELD}>
                                <option value="">{t("formPracticeNone")}</option>
                                {sortedPractices.map(p => (
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

                    <button type="button" disabled={busy} onClick={() => void upload()}
                        className="inline-flex min-h-[52px] w-full items-center justify-center gap-2 rounded-xl bg-primary text-lg font-bold text-primary-foreground disabled:opacity-50">
                        <FileUp size={20} /> {t("uploadN", { n: uploadable })}
                    </button>
                </div>
            )}
            <p className="text-xs text-muted-foreground">{t("privacy")}</p>
        </div>
    );
}
