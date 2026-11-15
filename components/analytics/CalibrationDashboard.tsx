"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import {
    fetchCalibrationAction,
    type CalibrationSnapshot,
} from "@/app/actions/calibration";
import { fetchOrgReliabilityAction } from "@/app/actions/validate-ground-truth";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import { Card } from "@/components/ui/Card";
import Tip from "@/components/ui/Tip";
import {
    Target,
    TrendingUp,
    AlertCircle,
    Loader2,
    Award,
    HelpCircle,
    RefreshCw,
} from "lucide-react";
import clsx from "clsx";

interface CalibrationDashboardProps {
    /** Optional initial event filter. */
    initialEventCode?: string;
}

/**
 * Calibration dashboard. Admin/lead-only.
 *
 * Three sections:
 *   1. Headline metrics (Brier, log loss, accuracy, sample size)
 *   2. Reliability diagram — visual check that predicted N% wins ~N% of time
 *   3. Scout leaderboard — per-scout reliability ranking
 *
 * Empty states are explicit because calibration only works once:
 *   - firebase-admin is configured
 *   - logPredictionAction has been called (MatchBriefingCard does this auto)
 *   - settleOutcome has been called for those matches (Sprint 1.7 ground-truth job)
 *
 * Without those, the dashboard shows a "no data yet" panel that links the
 * user to the relevant setup step.
 */
export default function CalibrationDashboard({ initialEventCode }: CalibrationDashboardProps) {
    const { user, userDoc } = useAuth();
    const { season } = useProgram();
    const tErr = useTranslations("Errors");
    const t = useTranslations("CalibrationDashboard");
    const [snapshot, setSnapshot] = useState<CalibrationSnapshot | null>(null);
    const [scouts, setScouts] = useState<Array<{
        scoutId: string;
        displayName: string;
        reliability: number;
        matchesScouted: number;
    }>>([]);
    const [eventCode, setEventCode] = useState(initialEventCode ?? "");
    const [loading, setLoading] = useState(false);
    // Errors are held as codes, not prose — the producers (calibration +
    // validate-ground-truth actions) have no locale, so translation happens
    // at render (OnboardingModal pattern).
    const [error, setError] = useState<ErrorCode | null>(null);

    const canView = userDoc?.role === "admin" || userDoc?.role === "lead";

    const refresh = async () => {
        if (!user) return;
        setLoading(true);
        setError(null);
        try {
            const idToken = await user.getIdToken();
            const [calibration, reliability] = await Promise.all([
                fetchCalibrationAction({
                    idToken,
                    season,
                    eventCode: eventCode || undefined,
                }),
                fetchOrgReliabilityAction({ idToken }),
            ]);
            if (!calibration.ok) {
                setError(calibration.code);
                setSnapshot(null);
            } else {
                setSnapshot(calibration.snapshot);
            }
            // Reliability failing isn't fatal to the page (calibration metrics
            // still render), but it shouldn't be silently swallowed either —
            // surface it unless the (more specific) calibration error already
            // has something to show.
            if (reliability.ok) {
                setScouts(reliability.scouts.sort((a, b) => b.reliability - a.reliability));
            } else if (calibration.ok) {
                setError(reliability.code);
            }
        } catch (e) {
            // Distinguish "loaded, but empty" (handled above via ok:false
            // results) from "failed to load at all" (network error, thrown
            // rejection, etc.) — both must surface a message instead of
            // silently falling through to the empty state.
            setError(toErrorCode(e));
            setSnapshot(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Deferred one microtask: refresh() sets state synchronously.
        if (canView) void Promise.resolve().then(refresh);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canView, season, eventCode]);

    if (!user) {
        return (
            <Card className="p-8 text-center text-muted-foreground">
                {t("signIn")}
            </Card>
        );
    }

    if (!canView) {
        return (
            <Card className="p-8 text-center text-muted-foreground">
                {t("adminOnly")}
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Tip id="calibration-intro-v1" title={t("tipTitle")}>
                {t("tipBody")}
            </Tip>
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Target className="text-primary" size={22} />
                        {t("title")}
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        {t("subtitle")}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        value={eventCode}
                        onChange={e => setEventCode(e.target.value.toUpperCase())}
                        placeholder={t("allEvents")}
                        className="px-3 py-1.5 bg-muted border border-border rounded-lg text-foreground text-xs font-mono uppercase w-40"
                    />
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-xs font-bold rounded-lg"
                    >
                        {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        {t("refresh")}
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>{tErr(error)}</span>
                </div>
            )}

            {/* Metrics */}
            {snapshot && (
                <>
                    {snapshot.sampleSize === 0 ? (
                        <EmptyState />
                    ) : (
                        <>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <MetricCard
                                    label={t("sampleSize")}
                                    value={String(snapshot.sampleSize)}
                                    sub={t("predictions")}
                                    icon={<TrendingUp size={14} />}
                                />
                                <MetricCard
                                    label="Brier score"
                                    value={snapshot.brier !== null ? snapshot.brier.toFixed(3) : "—"}
                                    sub={t("brierSub")}
                                    icon={<Target size={14} />}
                                    accent={brierAccent(snapshot.brier)}
                                />
                                <MetricCard
                                    label="Log loss"
                                    value={snapshot.logLoss !== null ? snapshot.logLoss.toFixed(3) : "—"}
                                    sub={t("logLossSub")}
                                    icon={<Target size={14} />}
                                />
                                <MetricCard
                                    label="Accuracy"
                                    value={snapshot.accuracy !== null ? `${(snapshot.accuracy * 100).toFixed(0)}%` : "—"}
                                    sub={t("accuracySub")}
                                    icon={<Award size={14} />}
                                    accent={accuracyAccent(snapshot.accuracy)}
                                />
                            </div>

                            <ReliabilityDiagram bins={snapshot.bins} />
                        </>
                    )}
                </>
            )}

            {/* Scout reliability leaderboard */}
            {scouts.length > 0 && (
                <Card className="p-0 bg-muted/30 border-border overflow-hidden">
                    <div className="p-4 border-b border-border">
                        <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                            <Award className="text-warning" size={16} />
                            {t("scoutReliability")}
                        </h3>
                        <p className="text-xs text-muted-foreground mt-1">
                            {t("scoutReliabilityHint")}
                        </p>
                    </div>
                    <ul className="divide-y divide-border">
                        {scouts.map(s => (
                            <li key={s.scoutId} className="flex items-center justify-between px-4 py-2 text-sm">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-foreground truncate">{s.displayName}</span>
                                    <span className="text-xs text-muted-foreground">{t("obs", { count: s.matchesScouted })}</span>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
                                        <div
                                            className={clsx(
                                                "h-full transition-all",
                                                s.reliability > 0.8 ? "bg-success" : s.reliability > 0.5 ? "bg-warning" : "bg-danger",
                                            )}
                                            style={{ width: `${s.reliability * 100}%` }}
                                        />
                                    </div>
                                    <span className={clsx(
                                        "text-xs font-mono font-bold w-12 text-right",
                                        s.reliability > 0.8 ? "text-success" : s.reliability > 0.5 ? "text-warning" : "text-danger",
                                    )}>
                                        {(s.reliability * 100).toFixed(0)}%
                                    </span>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            <Explainer />
        </div>
    );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function MetricCard({
    label,
    value,
    sub,
    icon,
    accent = "neutral",
}: {
    label: string;
    value: string;
    sub: string;
    icon: React.ReactNode;
    accent?: "good" | "warning" | "bad" | "neutral";
}) {
    const accentMap = {
        good: "border-success/30 bg-success/5",
        warning: "border-warning/30 bg-warning/5",
        bad: "border-danger/30 bg-danger/5",
        neutral: "border-border bg-muted/30",
    };
    return (
        <Card className={clsx("p-4", accentMap[accent])}>
            <div className="text-xs uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                {icon}
                {label}
            </div>
            <div className="text-2xl font-black font-mono text-foreground mt-1">{value}</div>
            <div className="text-xs text-muted-foreground mt-0.5 leading-tight">{sub}</div>
        </Card>
    );
}

function brierAccent(brier: number | null): "good" | "warning" | "bad" | "neutral" {
    if (brier === null) return "neutral";
    if (brier < 0.15) return "good";
    if (brier < 0.22) return "warning";
    return "bad";
}

function accuracyAccent(accuracy: number | null): "good" | "warning" | "bad" | "neutral" {
    if (accuracy === null) return "neutral";
    if (accuracy > 0.7) return "good";
    if (accuracy > 0.55) return "warning";
    return "bad";
}

function ReliabilityDiagram({ bins }: { bins: CalibrationSnapshot["bins"] }) {
    const t = useTranslations("CalibrationDashboard");
    const populatedBins = bins.filter(b => b.count > 0);
    if (populatedBins.length === 0) {
        return null;
    }
    return (
        <Card className="p-4 bg-muted/30 border-border">
            <h3 className="text-sm font-bold text-foreground mb-1">{t("diagramTitle")}</h3>
            <p className="text-xs text-muted-foreground mb-3">
                {t("diagramHint")}
            </p>
            <div className="relative h-48 flex items-end gap-1 px-2 border-l border-b border-border">
                {bins.map(b => {
                    const empiricalHeight = b.empirical * 100;
                    const predictedHeight = b.predicted * 100;
                    const populated = b.count > 0;
                    return (
                        <div key={b.binLow} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                            <div
                                title={populated ? t("binTitle", { count: b.count, predicted: (b.predicted * 100).toFixed(0), empirical: (b.empirical * 100).toFixed(0) }) : t("noData")}
                                className={clsx(
                                    "w-full rounded-t transition-all relative",
                                    populated ? "bg-primary/40 hover:bg-primary/60" : "bg-muted",
                                )}
                                style={{ height: `${empiricalHeight}%` }}
                            >
                                {/* Predicted marker (small dash) */}
                                {populated && (
                                    <div
                                        className="absolute left-0 right-0 h-0.5 bg-foreground"
                                        style={{ bottom: `${predictedHeight - b.empirical * 100}%` }}
                                    />
                                )}
                            </div>
                            <div className="text-xs text-muted-foreground font-mono">
                                {Math.round(b.binLow * 100)}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="text-xs text-muted-foreground mt-2 flex items-center gap-3">
                <span className="flex items-center gap-1">
                    <span className="w-3 h-2 bg-primary/40 rounded-sm" /> {t("empirical")}
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-foreground" /> {t("predicted")}
                </span>
            </div>
        </Card>
    );
}

function EmptyState() {
    const t = useTranslations("CalibrationDashboard");
    return (
        <Card className="p-8 text-center text-muted-foreground space-y-2">
            <div className="text-sm font-bold text-foreground">{t("emptyTitle")}</div>
            <p className="text-xs leading-relaxed max-w-md mx-auto">
                {t("emptyIntro")}
            </p>
            <ol className="text-xs text-left max-w-md mx-auto space-y-1 list-decimal pl-6">
                <li>{t("emptyStep1")}</li>
                <li>{t("emptyStep2")}</li>
                <li>{t("emptyStep3")}</li>
            </ol>
        </Card>
    );
}

function Explainer() {
    const t = useTranslations("CalibrationDashboard");
    const rich = { b: (chunks: React.ReactNode) => <strong className="text-foreground">{chunks}</strong> };
    const [open, setOpen] = useState(false);
    return (
        <Card className="p-3 bg-muted/30 border-border">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
                <HelpCircle size={12} />
                {t("explainerTitle")}
                <span className="ml-auto text-xs">{open ? "▼" : "▶"}</span>
            </button>
            {open && (
                <div className="mt-3 space-y-2 text-xs text-muted-foreground leading-relaxed">
                    <p>
                        {t.rich("explainBrier", rich)}
                    </p>
                    <p>
                        {t.rich("explainLogLoss", rich)}
                    </p>
                    <p>
                        {t.rich("explainAccuracy", rich)}
                    </p>
                    <p>
                        {t.rich("explainDiagram", rich)}
                    </p>
                </div>
            )}
        </Card>
    );
}
