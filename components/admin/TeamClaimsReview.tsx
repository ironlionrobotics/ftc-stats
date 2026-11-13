"use client";

import { useCallback, useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { useAuth } from "@/context/AuthContext";
import { decideTeamClaimAction, listTeamClaimsAction, type ClaimForReview } from "@/app/actions/team-claims";
import { Check, X, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

/**
 * Superadmin queue of pending team claims (decision #90). Approving creates
 * the team's workspace and makes the requester its admin; rejecting lets
 * anyone file again. Verify the requester belongs to the team (e.g. the
 * team's public contact, a known coach email) before approving.
 */
export default function TeamClaimsReview() {
    const { user } = useAuth();
    const t = useTranslations("AdminClaims");
    const tErr = useTranslations("Errors");
    const format = useFormatter();
    const [claims, setClaims] = useState<ClaimForReview[] | null>(null);
    const [busyTeam, setBusyTeam] = useState<number | null>(null);

    const load = useCallback(async () => {
        if (!user) return;
        const res = await listTeamClaimsAction(await user.getIdToken());
        if (res.ok) setClaims(res.claims);
        else toast.error(tErr(res.code));
    }, [user, tErr]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!user) return;
            const res = await listTeamClaimsAction(await user.getIdToken());
            if (cancelled) return;
            if (res.ok) setClaims(res.claims);
            else toast.error(tErr(res.code));
        })();
        return () => { cancelled = true; };
    }, [user, tErr]);

    const decide = async (teamNumber: number, approve: boolean) => {
        if (!user) return;
        setBusyTeam(teamNumber);
        try {
            const res = await decideTeamClaimAction({ idToken: await user.getIdToken(), teamNumber, approve });
            if (res.ok) {
                toast.success(t(approve ? "approved" : "rejected", { team: teamNumber }));
                await load();
            } else {
                toast.error(tErr(res.code));
            }
        } finally {
            setBusyTeam(null);
        }
    };

    return (
        <section className="bg-card border border-border rounded-2xl p-5 md:p-6">
            <div className="flex items-center justify-between gap-4 mb-1">
                <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
                    <ShieldCheck size={18} className="text-primary" /> {t("title")}
                </h2>
                <button onClick={() => load()} className="p-1.5 text-muted-foreground hover:text-foreground" title={t("refresh")}>
                    <RefreshCw size={16} />
                </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">{t("help")}</p>

            {claims === null ? (
                <p className="text-sm text-muted-foreground">{t("loading")}</p>
            ) : claims.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("empty")}</p>
            ) : (
                <ul className="divide-y divide-border">
                    {claims.map(c => (
                        <li key={c.teamNumber} className="py-3 flex flex-wrap items-center gap-3">
                            <div className="min-w-0 flex-1">
                                <div className="text-sm font-bold text-foreground">
                                    <span className="font-mono">{c.program} {c.teamNumber}</span> · {c.displayName}
                                </div>
                                <div className="text-xs text-muted-foreground truncate">
                                    {c.requestedName || "—"} · {c.requestedEmail || "—"} · {format.dateTime(new Date(c.requestedAtMs), { dateStyle: "medium", timeStyle: "short" })}
                                </div>
                            </div>
                            <button
                                disabled={busyTeam !== null}
                                onClick={() => decide(c.teamNumber, true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-bold disabled:opacity-50"
                            >
                                <Check size={14} /> {t("approve")}
                            </button>
                            <button
                                disabled={busyTeam !== null}
                                onClick={() => decide(c.teamNumber, false)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted border border-border text-foreground rounded-lg text-xs font-bold disabled:opacity-50"
                            >
                                <X size={14} /> {t("reject")}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
