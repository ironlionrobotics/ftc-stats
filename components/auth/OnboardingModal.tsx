"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { createOrJoinOrgByTeamNumber } from "@/lib/orgs";
import { redeemInviteAction } from "@/app/actions/redeem-invite";
import { toErrorCode, type ErrorCode } from "@/lib/errors";
import type { OrgProgram } from "@/types/orgs";
import { Users, KeyRound, Loader2, X, AlertCircle } from "lucide-react";
import clsx from "clsx";

/**
 * Shown after sign-in when the user has no orgId yet. The user picks one of:
 *
 *   1. **Crear / unirme a equipo** — type a team number; if it already exists
 *      you join as a scout, otherwise the org is created and you become admin.
 *   2. **Tengo un código** — paste a 6-char invite code from an existing org.
 *
 * Renders nothing when the user is unauthenticated, still loading, or already
 * onboarded. Mounted globally in app/layout.tsx.
 */
export default function OnboardingModal() {
    const { user, userDoc, userDocLoading, orgId, reloadUserDoc, logout } = useAuth();
    const tErr = useTranslations("Errors");
    const [tab, setTab] = useState<"create" | "code">("create");

    // Form state
    const [teamNumber, setTeamNumber] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [program, setProgram] = useState<OrgProgram>("FTC");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    // Errors are held as codes, not prose: the producers (lib/orgs,
    // redeemInviteAction) have no locale, so translation happens at render.
    const [error, setError] = useState<ErrorCode | null>(null);

    // Show only when authed + user doc loaded + missing orgId.
    if (!user || userDocLoading || !userDoc || orgId) return null;

    const handleCreate = async () => {
        setError(null);
        const n = parseInt(teamNumber, 10);
        if (!n || n <= 0) {
            setError("validation.teamNumber");
            return;
        }
        if (!displayName.trim()) {
            setError("validation.teamName");
            return;
        }
        setBusy(true);
        try {
            await createOrJoinOrgByTeamNumber(user, {
                teamNumber: n,
                displayName: displayName.trim(),
                program,
            });
            await reloadUserDoc();
        } catch (e) {
            setError(toErrorCode(e));
        } finally {
            setBusy(false);
        }
    };

    const handleRedeem = async () => {
        setError(null);
        if (code.trim().length < 4) {
            setError("invite.tooShort");
            return;
        }
        setBusy(true);
        try {
            // Redemption runs server-side (Admin SDK): the client is not allowed
            // to set its own orgId to an org it didn't create (M4 vector 2).
            const idToken = await user.getIdToken();
            const result = await redeemInviteAction({ idToken, code });
            if (!result.ok) {
                setError(result.code);
                return;
            }
            await reloadUserDoc();
        } catch (e) {
            setError(toErrorCode(e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80">
            <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-border flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-black text-foreground mb-1">Bienvenido a PRIDE</h2>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Para empezar, dinos a qué equipo perteneces. Tu scouting se atribuye a ese
                            equipo y puede compartirse con otros equipos en eventos en los que estén
                            inscritos.
                        </p>
                    </div>
                    <button
                        onClick={() => logout()}
                        className="p-1.5 text-muted-foreground hover:text-foreground"
                        title="Cerrar sesión"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-border">
                    <TabButton active={tab === "create"} onClick={() => setTab("create")}>
                        <Users size={14} /> Crear / unirme
                    </TabButton>
                    <TabButton active={tab === "code"} onClick={() => setTab("code")}>
                        <KeyRound size={14} /> Tengo un código
                    </TabButton>
                </div>

                {/* Body */}
                <div className="p-6 space-y-4">
                    {tab === "create" ? (
                        <>
                            <Field label="Número de equipo">
                                <input
                                    type="number"
                                    value={teamNumber}
                                    onChange={e => setTeamNumber(e.target.value)}
                                    placeholder="30311"
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground font-mono"
                                />
                            </Field>
                            <Field label="Nombre del equipo">
                                <input
                                    value={displayName}
                                    onChange={e => setDisplayName(e.target.value)}
                                    placeholder="Iron Lions"
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground"
                                />
                            </Field>
                            <Field label="Programa">
                                <div className="flex gap-2">
                                    {(["FTC", "FRC"] as const).map(p => (
                                        <button
                                            key={p}
                                            onClick={() => setProgram(p)}
                                            className={clsx(
                                                "flex-1 py-2 rounded-lg border font-bold text-sm",
                                                program === p
                                                    ? "bg-primary/20 border-primary/50 text-primary"
                                                    : "bg-muted border-border text-muted-foreground",
                                            )}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </Field>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                                Si el equipo ya existe te unirás como <strong>scout</strong>. Si no
                                existe lo creas y quedas como <strong>admin</strong>.
                            </p>
                            <ActionButton busy={busy} onClick={handleCreate}>
                                Continuar
                            </ActionButton>
                        </>
                    ) : (
                        <>
                            <Field label="Código de invitación">
                                <input
                                    value={code}
                                    onChange={e => setCode(e.target.value.toUpperCase())}
                                    placeholder="ABC234"
                                    maxLength={8}
                                    className="w-full px-3 py-2 bg-muted border border-border rounded-lg text-foreground font-mono tracking-widest text-center text-lg uppercase"
                                />
                            </Field>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                                Pídele al admin de tu equipo que genere un código de invitación desde su sesión.
                            </p>
                            <ActionButton busy={busy} onClick={handleRedeem}>
                                Unirme al equipo
                            </ActionButton>
                        </>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 p-3 bg-danger/10 border border-danger/30 rounded-lg text-danger text-xs">
                            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                            <span>{tErr(error)}</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function TabButton({
    active,
    onClick,
    children,
}: {
    active: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            className={clsx(
                "flex-1 py-3 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors",
                active
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground",
            )}
        >
            {children}
        </button>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                {label}
            </label>
            {children}
        </div>
    );
}

function ActionButton({
    busy,
    onClick,
    children,
}: {
    busy: boolean;
    onClick: () => void;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            disabled={busy}
            className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {children}
        </button>
    );
}
