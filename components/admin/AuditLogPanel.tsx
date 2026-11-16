"use client";

import { useEffect, useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { getAuditLog, type AuditEntry } from "@/app/actions/admin-config";

const MAX_VALUE = 60;

function fmtValue(v: unknown): string {
    const s = typeof v === "string" ? v : (JSON.stringify(v) ?? "undefined");
    return s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE)}…` : s;
}

/** Last config changes. Reloads whenever `refreshKey` changes. */
export default function AuditLogPanel({
    getToken,
    refreshKey,
}: {
    getToken: () => Promise<string>;
    refreshKey: number;
}) {
    const t = useTranslations("AdminConsole");
    const format = useFormatter();
    const [entries, setEntries] = useState<AuditEntry[] | null>(null);
    const [failed, setFailed] = useState(false);

    // Deferred one microtask so no setState runs synchronously in the effect body.
    useEffect(() => {
        let cancelled = false;
        void Promise.resolve().then(async () => {
            try {
                const res = await getAuditLog(await getToken());
                if (cancelled) return;
                if (res.ok) {
                    setEntries(res.entries.slice(0, 20));
                    setFailed(false);
                } else {
                    setFailed(true);
                }
            } catch {
                if (!cancelled) setFailed(true);
            }
        });
        return () => { cancelled = true; };
    }, [getToken, refreshKey]);

    return (
        <section>
            <h2 className="text-lg font-bold text-foreground mb-1">{t("auditTitle")}</h2>
            <p className="text-xs text-muted-foreground mb-4">{t("auditHint")}</p>
            {failed ? (
                <p className="text-sm text-danger">{t("auditError")}</p>
            ) : entries === null ? (
                <p className="text-sm text-muted-foreground animate-pulse">{t("auditLoading")}</p>
            ) : entries.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("auditEmpty")}</p>
            ) : (
                <ul className="space-y-2">
                    {entries.map((e) => (
                        <li key={e.id} className="bg-card border border-border rounded-xl px-4 py-3 min-w-0">
                            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
                                <span className="font-bold text-foreground">
                                    {format.dateTime(new Date(e.at), { dateStyle: "medium", timeStyle: "short" })}
                                </span>
                                <span className="font-mono break-all">{e.by}</span>
                            </div>
                            <ul className="mt-1.5 space-y-0.5">
                                {e.changes.map((c, idx) => (
                                    <li key={idx} className="text-xs font-mono text-foreground break-all">
                                        {c.path}: {fmtValue(c.before)} → {fmtValue(c.after)}
                                    </li>
                                ))}
                            </ul>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
