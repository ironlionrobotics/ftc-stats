"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { getAdminOverview, AdminOverview } from "@/app/actions/admin-config";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import TeamClaimsReview from "./TeamClaimsReview";
import MediaReportsReview from "./MediaReportsReview";
import IntegrationsPanel from "./IntegrationsPanel";
import FeatureFlagsPanel from "./FeatureFlagsPanel";
import AuditLogPanel from "./AuditLogPanel";

/**
 * Superadmin console body. All data + writes go through the superadmin server
 * actions (ID-token verified against SUPERADMIN_EMAILS). Non-superadmins get
 * the access-denied state and nothing else.
 */
export default function AdminConsole() {
    const t = useTranslations("AdminConsole");
    const { user } = useAuth();
    const [overview, setOverview] = useState<AdminOverview | null>(null);
    const [denied, setDenied] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [auditKey, setAuditKey] = useState(0);

    const load = useCallback(async () => {
        if (!user) return;
        setLoading(true);
        try {
            const idToken = await user.getIdToken();
            const res = await getAdminOverview(idToken);
            if (res.ok) {
                setOverview(res);
                setDenied(null);
            } else {
                setDenied(res.error);
            }
        } catch {
            setDenied(t("loadFailed"));
        } finally {
            setLoading(false);
        }
    }, [user, t]);

    // Deferred one microtask so load()'s setLoading(true) never runs
    // synchronously in the effect body.
    useEffect(() => { void Promise.resolve().then(load); }, [load]);

    const getToken = useCallback(async () => {
        if (!user) throw new Error("no user");
        return user.getIdToken();
    }, [user]);

    if (!user) {
        return <Denied msg={t("signIn")} hint={t("accessHint")} />;
    }
    if (loading) {
        return <p className="text-muted-foreground text-sm animate-pulse">{t("verifying")}</p>;
    }
    if (denied) {
        return <Denied msg={denied} hint={t("accessHint")} />;
    }
    if (!overview) return null;

    return (
        <div className="space-y-8">
            {/* Team claims awaiting review (decision #90) */}
            <TeamClaimsReview />
            <MediaReportsReview />

            <IntegrationsPanel integrations={overview.integrations} getToken={getToken} />

            <FeatureFlagsPanel
                overview={overview}
                getToken={getToken}
                onSaved={(o) => { setOverview(o); setAuditKey(k => k + 1); }}
            />

            <AuditLogPanel getToken={getToken} refreshKey={auditKey} />

            {/* Superadmins (read-only) */}
            <section className="text-xs text-muted-foreground">
                <span className="font-bold uppercase tracking-wider">{t("superadmins")}</span>{" "}
                <span className="font-mono">{overview.superadmins.join(", ") || "—"}</span>
            </section>
        </div>
    );
}

function Denied({ msg, hint }: { msg: string; hint: string }) {
    return (
        <div className="flex flex-col items-center justify-center py-16 text-center bg-muted/30 border border-dashed border-border rounded-2xl">
            <Lock size={36} className="text-muted-foreground mb-3 opacity-40" />
            <p className="text-foreground font-bold">{msg}</p>
            <p className="text-xs text-muted-foreground mt-1">{hint}</p>
        </div>
    );
}
