"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createOrJoinOrgByTeamNumber, redeemInvite } from "@/lib/orgs";
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
    const [tab, setTab] = useState<"create" | "code">("create");

    // Form state
    const [teamNumber, setTeamNumber] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [program, setProgram] = useState<OrgProgram>("FTC");
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Show only when authed + user doc loaded + missing orgId.
    if (!user || userDocLoading || !userDoc || orgId) return null;

    const handleCreate = async () => {
        setError(null);
        const n = parseInt(teamNumber, 10);
        if (!n || n <= 0) {
            setError("Ingresa un número de equipo válido");
            return;
        }
        if (!displayName.trim()) {
            setError("Ingresa el nombre del equipo");
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
            setError(e instanceof Error ? e.message : "Error al crear el equipo");
        } finally {
            setBusy(false);
        }
    };

    const handleRedeem = async () => {
        setError(null);
        if (code.trim().length < 4) {
            setError("Código demasiado corto");
            return;
        }
        setBusy(true);
        try {
            await redeemInvite(user, code);
            await reloadUserDoc();
        } catch (e) {
            setError(e instanceof Error ? e.message : "Error al usar el código");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <div className="w-full max-w-md bg-slate-900 border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
                {/* Header */}
                <div className="px-6 py-5 border-b border-white/10 flex items-start justify-between gap-4">
                    <div>
                        <h2 className="text-xl font-black text-white mb-1">Bienvenido a FTC Stats</h2>
                        <p className="text-xs text-gray-400 leading-relaxed">
                            Para empezar, dinos a qué equipo perteneces. Tu scouting se atribuye a ese
                            equipo y puede compartirse con otros equipos en eventos en los que estén
                            inscritos.
                        </p>
                    </div>
                    <button
                        onClick={() => logout()}
                        className="p-1.5 text-gray-500 hover:text-gray-300"
                        title="Cerrar sesión"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-white/10">
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
                                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white font-mono"
                                />
                            </Field>
                            <Field label="Nombre del equipo">
                                <input
                                    value={displayName}
                                    onChange={e => setDisplayName(e.target.value)}
                                    placeholder="Iron Lions"
                                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white"
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
                                                    : "bg-black/20 border-white/10 text-gray-500",
                                            )}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </Field>
                            <p className="text-[10px] text-gray-500 leading-relaxed">
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
                                    className="w-full px-3 py-2 bg-black/40 border border-white/10 rounded-lg text-white font-mono tracking-widest text-center text-lg uppercase"
                                />
                            </Field>
                            <p className="text-[10px] text-gray-500 leading-relaxed">
                                Pídele al admin de tu equipo que genere un código de invitación desde su sesión.
                            </p>
                            <ActionButton busy={busy} onClick={handleRedeem}>
                                Unirme al equipo
                            </ActionButton>
                        </>
                    )}

                    {error && (
                        <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-300 text-xs">
                            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                            <span>{error}</span>
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
                    : "text-gray-500 hover:text-gray-300",
            )}
        >
            {children}
        </button>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <label className="block text-[10px] text-gray-400 uppercase font-bold tracking-wider">
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
            className="w-full py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-colors"
        >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {children}
        </button>
    );
}
