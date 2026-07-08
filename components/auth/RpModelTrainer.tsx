"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { useProgram } from "@/lib/stores/program-store";
import { trainRpModelsAction } from "@/app/actions/train-rp-models";
import { Brain, Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

/**
 * Admin/lead panel for triggering per-RP logistic-regression training.
 * Pulls the season's full match history from the FTC API (cached), trains
 * 3 models (movement, artifact, pattern-via-artifact), caches in Redis 30d.
 *
 * Cost-aware: the operation is heavy enough (~10-30 cached event fetches +
 * 2 training passes) that we don't auto-run it. Strategy lead runs manually,
 * ideally weekly during season and again before each validation event.
 *
 * Sin Redis configurado: el server action retorna error claro y este componente
 * lo surface. No bloquea la app — el resto sigue usando heurística empírica.
 */
export default function RpModelTrainer() {
    const { user, userDoc } = useAuth();
    const { season } = useProgram();
    const [busy, setBusy] = useState(false);
    const [report, setReport] = useState<null | {
        models: Array<{
            target: string;
            sampleSize: number;
            finalLoss: number;
            trainedAt: number;
        }>;
        eventsProcessed: number;
    }>(null);

    const canTrain = userDoc?.role === "admin" || userDoc?.role === "lead";
    if (!user || !canTrain) return null;

    const train = async () => {
        setBusy(true);
        try {
            const idToken = await user.getIdToken();
            const res = await trainRpModelsAction({ idToken, season });
            if (!res.ok) {
                toast.error("No se pudo entrenar", { description: res.error });
                return;
            }
            setReport(res.report);
            if (res.report.models.length === 0) {
                toast.warning("Datos insuficientes para entrenar", {
                    description: "Necesitas más matches con outcomes RP en la temporada.",
                });
            } else {
                toast.success(`Entrenados ${res.report.models.length} modelos`);
            }
        } catch (e) {
            toast.error("Error de red durante entrenamiento", {
                description: e instanceof Error ? e.message : undefined,
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] text-gray-400 uppercase tracking-wider font-bold">
                <Brain size={11} />
                Modelos RP
            </div>
            <p className="text-[10px] text-gray-500 leading-relaxed">
                Entrena predicción logística para Movement / Artifact / Pattern
                RP usando datos de la temporada {season}.
            </p>
            <button
                type="button"
                onClick={train}
                disabled={busy}
                className="w-full min-h-[36px] px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-40 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
            >
                {busy ? <Loader2 size={12} className="animate-spin" /> : <Brain size={12} />}
                {busy ? "Entrenando..." : "Entrenar modelos"}
            </button>

            {report && (
                <div className="space-y-1.5 pt-1 border-t border-white/5">
                    <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
                        <CheckCircle2 size={11} />
                        <span>{report.eventsProcessed} eventos procesados</span>
                    </div>
                    {report.models.length === 0 ? (
                        <div className="flex items-start gap-1.5 text-[10px] text-amber-400">
                            <AlertCircle size={11} className="flex-shrink-0 mt-0.5" />
                            <span>Sin datos suficientes (necesita 10+ pos y 10+ neg per RP).</span>
                        </div>
                    ) : (
                        <ul className="space-y-0.5">
                            {report.models.map(m => (
                                <li
                                    key={m.target}
                                    className="flex items-center justify-between text-[10px]"
                                >
                                    <span className="text-gray-400 capitalize">{m.target}</span>
                                    <span className="font-mono text-gray-500">
                                        n={m.sampleSize} · loss {m.finalLoss.toFixed(3)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}
