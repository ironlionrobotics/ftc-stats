"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import {
    hasDiscordWebhookAction,
    setDiscordWebhookAction,
    notifyDiscordAction,
} from "@/app/actions/notify-discord";
import { type ErrorCode } from "@/lib/errors";
import { Bell, Loader2, AlertCircle, Check, X as XIcon } from "lucide-react";
import { toast } from "sonner";

/**
 * Mini panel for org admin/lead to configure the Discord webhook URL used
 * for sync-error notifications. The URL never travels back to the client
 * after it's saved — we only display a "configured / not configured" state.
 *
 * Test button posts a sample message so the admin can verify the channel
 * receives the bot output before relying on it during an event.
 */
export default function DiscordSettings() {
    const { user, userDoc, orgId } = useAuth();
    const tErr = useTranslations("Errors");
    const [configured, setConfigured] = useState<boolean | null>(null);
    const [showInput, setShowInput] = useState(false);
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);
    // Errors are held as codes, not prose — the producers (notify-discord
    // actions) have no locale, so translation happens at render.
    const [error, setError] = useState<ErrorCode | null>(null);

    const canEdit = userDoc?.role === "admin" || userDoc?.role === "lead";

    useEffect(() => {
        if (!user || !orgId) {
            setConfigured(null);
            return;
        }
        (async () => {
            try {
                const idToken = await user.getIdToken();
                const res = await hasDiscordWebhookAction({ idToken });
                if (res.ok) setConfigured(res.configured);
            } catch {
                // ignore
            }
        })();
    }, [user, orgId]);

    if (!user || !orgId || !canEdit) return null;

    const handleSave = async () => {
        if (!user) return;
        setError(null);
        setBusy(true);
        try {
            const idToken = await user.getIdToken();
            const res = await setDiscordWebhookAction({ idToken, webhookUrl: url.trim() });
            if (!res.ok) {
                setError(res.code);
                return;
            }
            setConfigured(true);
            setShowInput(false);
            setUrl("");
            toast.success("Webhook de Discord guardado");
        } finally {
            setBusy(false);
        }
    };

    const handleClear = async () => {
        if (!user) return;
        setError(null);
        setBusy(true);
        try {
            const idToken = await user.getIdToken();
            const res = await setDiscordWebhookAction({ idToken, webhookUrl: null });
            if (!res.ok) {
                setError(res.code);
                return;
            }
            setConfigured(false);
            toast.success("Webhook eliminado");
        } finally {
            setBusy(false);
        }
    };

    const handleTest = async () => {
        if (!user) return;
        setBusy(true);
        try {
            const idToken = await user.getIdToken();
            const res = await notifyDiscordAction({
                idToken,
                title: "Prueba de webhook",
                description: "Si ves este mensaje, el bot de PRIDE está configurado correctamente.",
                severity: "info",
                rateLimitSeconds: 0,
            });
            if (res.ok) {
                toast.success("Mensaje de prueba enviado");
            } else if (res.code === "discord.rateLimited") {
                toast.warning("Espera unos segundos entre pruebas");
            } else {
                toast.error("No se pudo enviar el mensaje", {
                    description: tErr(res.code),
                });
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="rounded-lg border border-border bg-muted p-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                <Bell size={11} />
                Discord
            </div>

            {configured === null ? (
                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                    <Loader2 size={10} className="animate-spin" /> Cargando...
                </div>
            ) : configured ? (
                <>
                    <div className="text-[10px] text-success flex items-center gap-1.5">
                        <Check size={11} /> Webhook configurado
                    </div>
                    <div className="flex gap-1">
                        <button
                            type="button"
                            onClick={handleTest}
                            disabled={busy}
                            className="flex-1 px-2 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-[10px] font-bold rounded disabled:opacity-50"
                        >
                            Probar
                        </button>
                        <button
                            type="button"
                            onClick={handleClear}
                            disabled={busy}
                            className="px-2 py-1.5 bg-muted hover:bg-danger/20 text-muted-foreground hover:text-danger text-[10px] font-bold rounded disabled:opacity-50"
                            title="Eliminar webhook"
                        >
                            <XIcon size={10} />
                        </button>
                    </div>
                </>
            ) : showInput ? (
                <div className="space-y-1.5">
                    <input
                        type="url"
                        value={url}
                        onChange={e => setUrl(e.target.value)}
                        placeholder="https://discord.com/api/webhooks/..."
                        className="w-full px-2 py-1.5 bg-muted border border-border rounded text-foreground text-[10px] font-mono"
                    />
                    <div className="flex gap-1">
                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={busy || !url.trim()}
                            className="flex-1 px-2 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-[10px] font-bold rounded disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                            {busy && <Loader2 size={10} className="animate-spin" />} Guardar
                        </button>
                        <button
                            type="button"
                            onClick={() => { setShowInput(false); setUrl(""); setError(null); }}
                            className="px-2 py-1.5 bg-muted hover:bg-muted/80 text-muted-foreground text-[10px] font-bold rounded"
                        >
                            Cancelar
                        </button>
                    </div>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => setShowInput(true)}
                    className="w-full px-2 py-1.5 bg-muted hover:bg-muted/80 text-foreground text-[10px] font-bold rounded"
                >
                    Configurar webhook
                </button>
            )}

            {error && (
                <div className="flex items-start gap-1.5 text-[10px] text-danger">
                    <AlertCircle size={10} className="flex-shrink-0 mt-0.5" />
                    <span>{tErr(error)}</span>
                </div>
            )}
        </div>
    );
}
