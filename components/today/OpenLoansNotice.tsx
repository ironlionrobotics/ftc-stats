"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Wrench } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { isOpenLoan } from "@/lib/lending";

/**
 * "You still have N loans open" on Hoy (#104). Renders nothing for visitors
 * without a team; the lending listener (and Firestore) loads only for members.
 */
export default function OpenLoansNotice() {
    const t = useTranslations("Lending");
    const { orgId } = useAuth();
    const [open, setOpen] = useState(0);

    useEffect(() => {
        if (!orgId) return;
        let unsub: (() => void) | undefined;
        let cancelled = false;
        import("@/lib/lending-service").then(({ listenMyLoans }) => {
            if (cancelled) return;
            unsub = listenMyLoans(orgId, rows => setOpen(rows.filter(isOpenLoan).length));
        }).catch(() => {});
        return () => { cancelled = true; unsub?.(); };
    }, [orgId]);

    if (!orgId || open === 0) return null;
    return (
        <Link href="/lending" className="mb-6 flex items-center gap-2 rounded-xl border border-warning/50 bg-warning/10 p-3 text-sm font-semibold hover:bg-warning/20">
            <Wrench size={16} /> {t("openLoans", { n: open })}
        </Link>
    );
}
