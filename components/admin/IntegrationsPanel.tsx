"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Copy, Play, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { testIntegration, type IntegrationStatus, type PingResult } from "@/app/actions/admin-config";

const REASONS = ["missing", "unauthorized", "timeout", "network", "http", "invalidKey", "notTestable"] as const;
type Reason = (typeof REASONS)[number];

/** Integrations status: badge, fingerprint, live test and rotation commands. Never renders a credential. */
export default function IntegrationsPanel({
    integrations,
    getToken,
}: {
    integrations: IntegrationStatus[];
    getToken: () => Promise<string>;
}) {
    const t = useTranslations("AdminConsole");
    return (
        <section>
            <h2 className="text-lg font-bold text-foreground mb-1">{t("integrations")}</h2>
            <p className="text-xs text-muted-foreground mb-4">{t("integrationsHint")}</p>
            <div className="grid sm:grid-cols-2 gap-2.5">
                {integrations.map((i) => (
                    <IntegrationCard key={i.key} integration={i} getToken={getToken} />
                ))}
            </div>
        </section>
    );
}

function IntegrationCard({
    integration: i,
    getToken,
}: {
    integration: IntegrationStatus;
    getToken: () => Promise<string>;
}) {
    const t = useTranslations("AdminConsole");
    const [testing, setTesting] = useState(false);
    const [result, setResult] = useState<PingResult | null>(null);

    const runTest = async () => {
        setTesting(true);
        setResult(null);
        try {
            const res = await testIntegration(await getToken(), i.key);
            if (res.ok) setResult(res.result);
            else toast.error(res.error);
        } catch {
            toast.error(t("testFailed"));
        } finally {
            setTesting(false);
        }
    };

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(i.rotate.join("\n"));
            toast.success(t("copied"));
        } catch {
            toast.error(t("copyFailed"));
        }
    };

    const reasonLabel = (r?: string) => {
        const key: Reason = (REASONS as readonly string[]).includes(r ?? "") ? (r as Reason) : "http";
        return t(`reason.${key}`);
    };

    return (
        <div className="bg-card border border-border rounded-xl px-4 py-3 space-y-2 min-w-0">
            <div className="flex items-start gap-3">
                {i.configured
                    ? <CheckCircle2 size={18} className="text-success shrink-0 mt-0.5" />
                    : <XCircle size={18} className="text-danger shrink-0 mt-0.5" />}
                <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-foreground">{i.label}</div>
                    <div className="text-xs text-muted-foreground font-mono break-all">{i.managedIn}</div>
                    {i.fingerprint && (
                        <div className="text-xs text-muted-foreground font-mono break-all">
                            {t("fingerprint", { value: i.fingerprint })}
                        </div>
                    )}
                    {i.note && <div className="text-xs text-muted-foreground break-all">{i.note}</div>}
                </div>
                <span className={clsx(
                    "text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full shrink-0",
                    i.configured ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
                )}>
                    {i.configured ? t("ok") : t("missing")}
                </span>
            </div>

            {i.testable && (
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={runTest}
                        disabled={testing}
                        className="flex items-center gap-2 min-h-11 px-4 border border-border rounded-lg text-sm font-bold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        {testing ? <RefreshCw size={14} className="animate-spin" /> : <Play size={14} />}
                        {t("test")}
                    </button>
                    {result && (
                        <span
                            role="status"
                            className={clsx("text-xs font-mono break-all", result.ok ? "text-success" : "text-danger")}
                        >
                            {result.ok
                                ? `✓ ${t("ok")} · ${result.status} · ${result.ms} ms`
                                : `✗ ${reasonLabel(result.reason)}${result.status > 0 ? ` · ${result.status}` : ""} · ${result.ms} ms`}
                        </span>
                    )}
                </div>
            )}

            {i.rotate.length > 0 && (
                <details className="group">
                    <summary className="cursor-pointer min-h-11 flex items-center text-xs font-bold text-primary select-none">
                        {t("howToRotate")}
                    </summary>
                    <div className="space-y-2">
                        <pre className="text-xs font-mono bg-muted border border-border rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-all">
                            {i.rotate.map((line, idx) => (
                                <span
                                    key={idx}
                                    className={clsx("block", line.startsWith("#") && "text-muted-foreground")}
                                >
                                    {line}
                                </span>
                            ))}
                        </pre>
                        <button
                            type="button"
                            onClick={copy}
                            className="flex items-center gap-2 min-h-11 px-4 border border-border rounded-lg text-sm font-bold text-foreground hover:bg-muted transition-colors"
                        >
                            <Copy size={14} /> {t("copy")}
                        </button>
                    </div>
                </details>
            )}
        </div>
    );
}
