"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import {
    fetchCalibrationAction,
    type CalibrationSnapshot,
} from "@/app/actions/calibration";
import { fetchOrgReliabilityAction } from "@/app/actions/validate-ground-truth";
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
    const [snapshot, setSnapshot] = useState<CalibrationSnapshot | null>(null);
    const [scouts, setScouts] = useState<Array<{
        scoutId: string;
        displayName: string;
        reliability: number;
        matchesScouted: number;
    }>>([]);
    const [eventCode, setEventCode] = useState(initialEventCode ?? "");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

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
                setError(calibration.error);
                setSnapshot(null);
            } else {
                setSnapshot(calibration.snapshot);
            }
            if (reliability.ok) {
                setScouts(reliability.scouts.sort((a, b) => b.reliability - a.reliability));
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (canView) refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [canView, season, eventCode]);

    if (!user) {
        return (
            <Card className="p-8 text-center text-muted-foreground">
                Inicia sesión para ver métricas de calibración.
            </Card>
        );
    }

    if (!canView) {
        return (
            <Card className="p-8 text-center text-muted-foreground">
                Sección visible solo para admins/leads del equipo.
            </Card>
        );
    }

    return (
        <div className="space-y-4">
            <Tip id="calibration-intro-v1" title="¿Qué tan bueno es el modelo?">
                Brier mide error cuadrático medio: lower = better, 0.25 = adivinanza, &lt;0.15 = excelente. El reliability diagram muestra si &quot;70% prob&quot; realmente acierta ~70% del tiempo. Necesita predicciones generadas (briefings) + matches jugados + ground-truth validation corriendo.
            </Tip>
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                        <Target className="text-primary" size={22} />
                        Calibración del modelo
                    </h2>
                    <p className="text-xs text-muted-foreground mt-1">
                        Qué tan confiables son las predicciones del simulador y los scouts.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <input
                        value={eventCode}
                        onChange={e => setEventCode(e.target.value.toUpperCase())}
                        placeholder="Todos los eventos"
                        className="px-3 py-1.5 bg-muted border border-border rounded-lg text-foreground text-xs font-mono uppercase w-40"
                    />
                    <button
                        type="button"
                        onClick={refresh}
                        disabled={loading}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-primary-foreground text-xs font-bold rounded-lg"
                    >
                        {loading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        Actualizar
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">
                    <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                    <span>{error}</span>
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
                                    label="Sample size"
                                    value={String(snapshot.sampleSize)}
                                    sub="predicciones"
                                    icon={<TrendingUp size={14} />}
                                />
                                <MetricCard
                                    label="Brier score"
                                    value={snapshot.brier !== null ? snapshot.brier.toFixed(3) : "—"}
                                    sub="lower = better (0=perfect, 0.25=guessing)"
                                    icon={<Target size={14} />}
                                    accent={brierAccent(snapshot.brier)}
                                />
                                <MetricCard
                                    label="Log loss"
                                    value={snapshot.logLoss !== null ? snapshot.logLoss.toFixed(3) : "—"}
                                    sub="penaliza overconfidence"
                                    icon={<Target size={14} />}
                                />
                                <MetricCard
                                    label="Accuracy"
                                    value={snapshot.accuracy !== null ? `${(snapshot.accuracy * 100).toFixed(0)}%` : "—"}
                                    sub="aciertos (≥50% prob)"
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
                            Confiabilidad de scouts (org)
                        </h3>
                        <p className="text-[10px] text-muted-foreground mt-1">
                            Calculada por ground-truth validation contra scores oficiales.
                            Actualizar corriendo el validador en sidebar.
                        </p>
                    </div>
                    <ul className="divide-y divide-border">
                        {scouts.map(s => (
                            <li key={s.scoutId} className="flex items-center justify-between px-4 py-2 text-sm">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="text-foreground truncate">{s.displayName}</span>
                                    <span className="text-[10px] text-muted-foreground">{s.matchesScouted} obs</span>
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
            <div className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground flex items-center gap-1.5">
                {icon}
                {label}
            </div>
            <div className="text-2xl font-black font-mono text-foreground mt-1">{value}</div>
            <div className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{sub}</div>
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
    const populatedBins = bins.filter(b => b.count > 0);
    if (populatedBins.length === 0) {
        return null;
    }
    return (
        <Card className="p-4 bg-muted/30 border-border">
            <h3 className="text-sm font-bold text-foreground mb-1">Reliability diagram</h3>
            <p className="text-[10px] text-muted-foreground mb-3">
                Cada barra = bucket de predicciones. La altura empírica debe acercarse a la línea diagonal &quot;perfecta&quot;.
            </p>
            <div className="relative h-48 flex items-end gap-1 px-2 border-l border-b border-border">
                {bins.map(b => {
                    const empiricalHeight = b.empirical * 100;
                    const predictedHeight = b.predicted * 100;
                    const populated = b.count > 0;
                    return (
                        <div key={b.binLow} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                            <div
                                title={populated ? `${b.count} preds · pred ${(b.predicted * 100).toFixed(0)}% · real ${(b.empirical * 100).toFixed(0)}%` : "Sin datos"}
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
                            <div className="text-[8px] text-muted-foreground font-mono">
                                {Math.round(b.binLow * 100)}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-3">
                <span className="flex items-center gap-1">
                    <span className="w-3 h-2 bg-primary/40 rounded-sm" /> Empírico
                </span>
                <span className="flex items-center gap-1">
                    <span className="w-3 h-0.5 bg-foreground" /> Predicho
                </span>
            </div>
        </Card>
    );
}

function EmptyState() {
    return (
        <Card className="p-8 text-center text-muted-foreground space-y-2">
            <div className="text-sm font-bold text-foreground">Sin predicciones registradas todavía</div>
            <p className="text-xs leading-relaxed max-w-md mx-auto">
                Las métricas de calibración aparecen cuando:
            </p>
            <ol className="text-xs text-left max-w-md mx-auto space-y-1 list-decimal pl-6">
                <li>Generas briefings de match (cada uno se loggea automáticamente)</li>
                <li>Los matches se juegan y los scores oficiales aparecen en FTC API</li>
                <li>Corres el validator de ground-truth desde el sidebar</li>
            </ol>
        </Card>
    );
}

function Explainer() {
    const [open, setOpen] = useState(false);
    return (
        <Card className="p-3 bg-muted/30 border-border">
            <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
            >
                <HelpCircle size={12} />
                ¿Qué significan estas métricas?
                <span className="ml-auto text-[10px]">{open ? "▼" : "▶"}</span>
            </button>
            {open && (
                <div className="mt-3 space-y-2 text-[11px] text-muted-foreground leading-relaxed">
                    <p>
                        <strong className="text-foreground">Brier score</strong> = error cuadrático promedio entre probabilidad predicha y resultado (0/1). Un modelo que siempre predice 0.5 obtiene 0.25; un modelo perfecto obtiene 0. Statbotics reporta ~0.18 para FRC.
                    </p>
                    <p>
                        <strong className="text-foreground">Log loss</strong> = penalización por confianza en respuestas equivocadas. Más sensible que Brier a &quot;100% seguro pero perdió&quot;. Menor = mejor.
                    </p>
                    <p>
                        <strong className="text-foreground">Accuracy</strong> = % de matches donde la alianza con probabilidad ≥50% efectivamente ganó. Mide poder predictivo binario; ignora confianza.
                    </p>
                    <p>
                        <strong className="text-foreground">Reliability diagram</strong> = si dices &quot;70% prob&quot;, deberías acertar ~70% de las veces. Barras altas en buckets bajos = subconfianza; barras bajas en buckets altos = sobreconfianza.
                    </p>
                </div>
            )}
        </Card>
    );
}
