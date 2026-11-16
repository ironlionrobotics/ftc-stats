"use client";

import { useState } from "react";
import { Save, RefreshCw, Flag } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { updateAppConfig, type AdminOverview } from "@/app/actions/admin-config";
import { BANNER_MAX, BOOLEAN_FLAGS, type BooleanFlag, type FlagSource } from "@/lib/app-config-schema";

function Switch({
    checked,
    onChange,
    disabled,
    label,
}: {
    checked: boolean;
    onChange: () => void;
    disabled?: boolean;
    label: string;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            aria-label={label}
            disabled={disabled}
            onClick={onChange}
            className="min-w-11 min-h-11 flex items-center justify-center shrink-0 disabled:opacity-50"
        >
            <span className={clsx(
                "w-11 h-6 rounded-full transition-colors relative block",
                checked ? "bg-primary" : "bg-muted border border-border",
            )}>
                <span className={clsx(
                    "absolute top-0.5 w-5 h-5 rounded-full bg-card shadow transition-transform",
                    checked ? "translate-x-[22px]" : "translate-x-0.5",
                )} />
            </span>
        </button>
    );
}

/** Feature flags, maintenance banner and AI rate limit, saved with a single patch. */
export default function FeatureFlagsPanel({
    overview,
    getToken,
    onSaved,
}: {
    overview: AdminOverview;
    getToken: () => Promise<string>;
    onSaved: (o: AdminOverview) => void;
}) {
    const t = useTranslations("AdminConsole");
    const [saving, setSaving] = useState(false);
    const [flags, setFlags] = useState<Record<BooleanFlag, boolean>>(
        () => Object.fromEntries(BOOLEAN_FLAGS.map(f => [f, overview.config.features[f]])) as Record<BooleanFlag, boolean>,
    );
    const [banner, setBanner] = useState(overview.config.features.maintenanceBanner);
    const [rateMax, setRateMax] = useState(overview.config.ai.rateMaxPerWindow);

    const sync = (o: AdminOverview) => {
        setFlags(Object.fromEntries(BOOLEAN_FLAGS.map(f => [f, o.config.features[f]])) as Record<BooleanFlag, boolean>);
        setBanner(o.config.features.maintenanceBanner);
        setRateMax(o.config.ai.rateMaxPerWindow);
    };

    const save = async () => {
        setSaving(true);
        try {
            const res = await updateAppConfig(await getToken(), {
                features: { ...flags, maintenanceBanner: banner },
                ai: { rateMaxPerWindow: rateMax },
            });
            if (res.ok) {
                sync(res);
                onSaved(res);
                toast.success(t("saved"));
            } else {
                toast.error(res.error);
            }
        } catch {
            toast.error(t("saveFailed"));
        } finally {
            setSaving(false);
        }
    };

    const sourceLabel = (s: FlagSource) => t(`source.${s}`);
    const inputCls = "w-full px-3 py-2 min-h-11 bg-muted border border-border rounded-lg text-sm text-foreground";

    return (
        <section className="bg-card border border-border rounded-2xl p-5 md:p-6">
            <h2 className="text-lg font-bold text-foreground mb-1 flex items-center gap-2">
                <Flag size={18} className="text-primary" /> {t("flagsTitle")}
            </h2>
            <p className="text-xs text-muted-foreground mb-5">
                {t.rich("aiConfigHint", { code: (chunks) => <code className="font-mono">{chunks}</code> })}
            </p>

            <div className="space-y-4 max-w-xl">
                {BOOLEAN_FLAGS.map((k) => {
                    const eff = overview.flags[k];
                    const forced = eff.source === "env";
                    const checked = forced ? eff.value : flags[k];
                    return (
                        <div key={k} className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <div className="text-sm font-bold text-foreground">{t(`flag.${k}.title`)}</div>
                                <div className="text-xs text-muted-foreground">{t(`flag.${k}.hint`)}</div>
                                <span className={clsx(
                                    "inline-block mt-1 text-xs font-black uppercase tracking-wider px-2 py-0.5 rounded-full",
                                    forced ? "bg-danger/10 text-danger" : "bg-muted text-muted-foreground",
                                )}>
                                    {sourceLabel(eff.source)}
                                </span>
                            </div>
                            <Switch
                                checked={checked}
                                disabled={forced}
                                label={t(`flag.${k}.title`)}
                                onChange={() => setFlags(f => ({ ...f, [k]: !f[k] }))}
                            />
                        </div>
                    );
                })}

                <div className="pt-2 border-t border-border space-y-3">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <div className="text-sm font-bold text-foreground">{t("banner.title")}</div>
                            <div className="text-xs text-muted-foreground">{t("banner.hint")}</div>
                        </div>
                        <Switch
                            checked={banner.enabled}
                            label={t("banner.title")}
                            onChange={() => setBanner(b => ({ ...b, enabled: !b.enabled }))}
                        />
                    </div>
                    {(["es", "en"] as const).map((lng) => (
                        <label key={lng} className="block">
                            <div className="text-xs font-bold text-foreground mb-1 flex justify-between">
                                <span>{t(`banner.${lng}`)}</span>
                                <span className="font-mono text-muted-foreground">{banner[lng].length}/{BANNER_MAX}</span>
                            </div>
                            <input
                                type="text"
                                maxLength={BANNER_MAX}
                                value={banner[lng]}
                                onChange={(e) => setBanner(b => ({ ...b, [lng]: e.target.value }))}
                                className={inputCls}
                            />
                        </label>
                    ))}
                    <div className="text-xs text-muted-foreground">
                        <span className="font-bold uppercase tracking-wider">{t("banner.preview")}</span>{" "}
                        <span className="text-foreground break-words">{banner.es || banner.en || "—"}</span>
                    </div>
                </div>

                <label className="block">
                    <div className="text-sm font-bold text-foreground">{t("rateLimit")}</div>
                    <div className="text-xs text-muted-foreground mb-1.5">{t("rateLimitHint")}</div>
                    <input
                        type="number"
                        min={1}
                        max={120}
                        value={rateMax}
                        onChange={(e) => setRateMax(Number(e.target.value))}
                        className="w-28 px-3 py-2 min-h-11 bg-muted border border-border rounded-lg font-mono text-sm text-foreground"
                    />
                </label>

                <p className="text-xs text-muted-foreground">{t("propagationNote")}</p>

                <button
                    type="button"
                    onClick={save}
                    disabled={saving}
                    className="flex items-center gap-2 px-5 min-h-11 bg-primary text-primary-foreground rounded-xl text-sm font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                    {saving ? <RefreshCw size={16} className="animate-spin" /> : <Save size={16} />}
                    {t("saveChanges")}
                </button>
            </div>
        </section>
    );
}
