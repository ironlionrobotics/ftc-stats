"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { createInvite } from "@/lib/orgs";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import type { OrgInvite } from "@/types/orgs";
import { Copy, Plus, Loader2, KeyRound, Check } from "lucide-react";

/**
 * Mini panel for generating an invite code. Intended to be embedded in the
 * sidebar's user section so admins/leads can create codes without leaving the
 * page they're on. Non-admin users (and unauthenticated) get a disabled state
 * with a tooltip explaining why.
 */
export default function InviteGenerator() {
    const { user, userDoc, orgId } = useAuth();
    const tErr = useTranslations("Errors");
    const [busy, setBusy] = useState(false);
    const [invite, setInvite] = useState<OrgInvite | null>(null);
    const [copied, setCopied] = useState(false);
    const [error, setError] = useState<ErrorCode | null>(null);

    if (!user || !userDoc || !orgId) return null;

    const canGenerate = userDoc.role === "admin" || userDoc.role === "lead";

    const handleGenerate = async () => {
        if (!canGenerate) return;
        setBusy(true);
        setError(null);
        try {
            const result = await createInvite(user, orgId);
            setInvite(result);
            setCopied(false);
        } catch (e) {
            // The message was rendered verbatim before: a raw Firestore
            // permission error is not something the user can act on.
            setError(toErrorCode(e));
        } finally {
            setBusy(false);
        }
    };

    const handleCopy = async () => {
        if (!invite) return;
        await navigator.clipboard.writeText(invite.code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="rounded-lg border border-border bg-muted p-3 space-y-2">
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                <KeyRound size={11} />
                Invitar a otro equipo
            </div>

            {!canGenerate && (
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Solo admins/leads pueden generar códigos.
                </p>
            )}

            {canGenerate && !invite && (
                <button
                    onClick={handleGenerate}
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 py-2 px-3 bg-muted hover:bg-muted/80 disabled:opacity-50 rounded-lg text-xs font-bold text-foreground transition-colors"
                >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                    Generar código
                </button>
            )}

            {invite && (
                <div className="space-y-2">
                    <div className="flex items-center gap-2 bg-muted border border-border rounded-lg p-2">
                        <code className="flex-1 text-center text-lg font-mono font-black text-primary tracking-widest">
                            {invite.code}
                        </code>
                        <button
                            onClick={handleCopy}
                            className="p-1.5 hover:bg-muted rounded text-muted-foreground hover:text-foreground transition-colors"
                            title="Copiar"
                        >
                            {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
                        </button>
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                        Expira en 7 días. Compártelo con el scout o lead del otro equipo.
                    </p>
                    <button
                        onClick={handleGenerate}
                        disabled={busy}
                        className="text-[10px] text-muted-foreground hover:text-foreground underline"
                    >
                        Generar otro código
                    </button>
                </div>
            )}

            {error && (
                <p className="text-[10px] text-danger">{tErr(error)}</p>
            )}
        </div>
    );
}
