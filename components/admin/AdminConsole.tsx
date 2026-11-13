"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAdminOverview, updateAppConfig, AdminOverview } from "@/app/actions/admin-config";
import { CheckCircle2, XCircle, Lock, Save, Bot, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import clsx from "clsx";

/**
 * Superadmin console body. All data + writes go through the superadmin server
 * actions (ID-token verified against SUPERADMIN_EMAILS). Non-superadmins get
 * the access-denied state and nothing else.
 */
export default function AdminConsole() {
    const { user } = useAuth();
    const [overview, setOverview] = useState<AdminOverview | null>(null);
    const [denied, setDenied] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Editable fields (mirrors of overview.config)
    const [aiEnabled, setAiEnabled] = useState(true);
    const [rateMax, setRateMax] = useState(15);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const idToken = await user.getIdToken();
            const res = await getAdminOverview(idToken);
            if (res.ok) {
                setOverview(res);
                setDenied(null);
                setAiEnabled(res.config.features.aiAssistant);
                setRateMax(res.config.ai.rateMaxPerWindow);
            } else {
                setDenied(res.error);
            }
        } catch {
            setDenied("No se pudo cargar la consola.");
        } finally {
            setLoading(false);
        }
    }, [user]);

    useEffect(() => { load(); }, [load]);

    const save = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const idToken = await user.getIdToken();
            const res = await updateAppConfig(idToken, {
                features: { aiAssistant: aiEnabled },
                ai: { rateMaxPerWindow: rateMax },
            });
            if (res.ok) {
                setOverview(res);
                toast.success("Configuración guardada (efectiva en ≤60s por caché).");
            } else {
                toast.error(res.error);
            }
        } catch {
            toast.error("Error al guardar.");
        } finally {
            setSaving(false);
        }
    };

    if (!user) {
        return <Denied msg="Inicia sesión para acceder a la consola." />;
    }
    if (loading) {
        return <p className="text-muted-foreground text-sm animate-pulse">Verificando permisos…</p>;
    }
    if (denied) {
        return <Denied msg={denied} />;
    }
    if (!overview) return null;

    return (
        <div className="space-y-8">
            {/* Integrations status */}
            <section>
                <h2 className="text-lg font-bold text-foreground mb-1">Integraciones</h2>
                <p className="text-xs text-muted-foreground mb-4">
                    Estado de credenciales del servidor. Se gestionan en Secret Manager / variables de
                    entorno — nunca desde esta UI.
                </p>
                <div className="grid sm:grid-cols-2 gap-2.5">
                    {overview.integrations.map((i) => (
                        <div key={i.key} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
                            {i.configured
                                ? <CheckCircle2 size={18} className="text-success shrink-0" />
                                : <XCircle size={18} className="text-danger shrink-0" />}
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-foreground">{i.label}</div>
                                <div className="text-[11px] text-muted-foreground font-mono truncate">{i.managedIn}</div>
                            </div>
                            <span className={clsx(
                                "ml-auto text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0",
                                i.configured ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                            )}>
                                {i.configured ? "OK" : "Falta"}
                            </span>
                        </div>
                    ))}
                </div>
            </section>

            {/* Runtime config */}
            <section className="bg-card border border-border rounded-2xl p-5 md:p-6">
                <h2 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
                    <Bot size={18} className="text-primary" /> Asistente de IA
                </h2>
                <p className="text-xs text-muted-foreground mb-5">
                    Configuración runtime (Firestore <code className="font-mono">app_config/global</code>).
                    Cambios efectivos en ≤60s sin redeploy.
                </p>

                <div className="space-y-5 max-w-md">
                    <label className="flex items-center justify-between gap-4 cursor-pointer">
                        <div>
                            <div className="text-sm font-bold text-foreground">Asistente activado</div>
                            <div className="text-[11px] text-muted-foreground">Apaga el chat y la acción del servidor (corta el gasto de Gemini).</div>
                        </div>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={aiEnabled}
                            onClick={() => setAiEnabled(v => !v)}
                            className={clsx(
                                "w-11 h-6 rounded-full transition-colors relative shrink-0",
                                aiEnabled ? "bg-primary" : "bg-muted border border-border",
                            )}
                        >
                            <span className={clsx(
                                "absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform",
                                aiEnabled ? "translate-x-[22px]" : "translate-x-0.5",
                            )} />
                        </button>
                    </label>

                    <label className="block">
                        <div className="text-sm font-bold text-foreground">Límite de consultas por usuario</div>
                        <div className="text-[11px] text-muted-foreground mb-1.5">Por ventana de 60s (1–120). Protege el presupuesto de Gemini.</div>
                        <input
                            type="number"
                            min={1}
                            max={120}
                            value={rateMax}
                            onChange={(e) => setRateMax(Number(e.target.value))}
                            className="w-28 px-3 py-2 bg-muted border border-border rounded-lg font-mono text-sm text-foreground"
                        />
                    </label>

                    <button
                        onClick={save}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                    >
                        {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                        Guardar cambios
                    </button>
                </div>
            </section>

            {/* Superadmins (read-only) */}
            <section className="text-xs text-muted-foreground">
                <span className="font-bold uppercase tracking-wider">Superadmins (env, solo lectura):</span>{" "}
                <span className="font-mono">{overview.superadmins.join(", ") || "—"}</span>
            </section>
        </div>
    );
}

function Denied({ msg }: { msg: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-muted/30 border border-dashed border-border rounded-2xl">
            <Lock size={36} className="text-muted-foreground mb-3 opacity-40" />
            <p className="text-foreground font-bold">{msg}</p>
            <p className="text-xs text-muted-foreground mt-1">El acceso se define en la variable de entorno SUPERADMIN_EMAILS.</p>
        </div>
    );
}
