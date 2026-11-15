"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Bell, BellOff, Send } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { subscribePushAction, syncPushAction, testPushAction, unsubscribePushAction } from "@/app/actions/push";
import { currentSubscription, pushSupport, subscribeDevice, type PushSupport } from "@/lib/push-client";
import { DEFAULT_PREFS, type NotifyPrefs } from "@/lib/notify/compose";

/**
 * "Avisos" (decision #110): turn push on for this device and choose what
 * arrives. Permission is only requested from this button (a user gesture).
 * Prefs live on the server subscription; a local copy keeps the toggles
 * instant (per-device convenience only).
 */

const PREFS_KEY = "pride_push_prefs";
const CATEGORIES: Array<keyof NotifyPrefs> = ["soon", "results", "playoffs", "pride"];

function loadPrefs(): NotifyPrefs {
    try {
        const raw = localStorage.getItem(PREFS_KEY);
        return raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<NotifyPrefs>) } : DEFAULT_PREFS;
    } catch {
        return DEFAULT_PREFS;
    }
}
function savePrefs(p: NotifyPrefs) {
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

export default function NotifySettings() {
    const t = useTranslations("NotifySettings");
    const { user } = useAuth();
    const [support, setSupport] = useState<PushSupport | null>(null);
    const [endpoint, setEndpoint] = useState<string | null>(null);
    const [denied, setDenied] = useState(false);
    const [prefs, setPrefs] = useState<NotifyPrefs>(DEFAULT_PREFS);
    const [pending, start] = useTransition();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const s = pushSupport();
            let sub: PushSubscription | null = null;
            let sw = true;
            if (s === "ok") {
                sub = await currentSubscription().catch(() => null);
                sw = !!(await navigator.serviceWorker.getRegistration());
            }
            if (cancelled) return;
            setSupport(s === "ok" && !sw ? "no-sw" : s);
            setEndpoint(sub?.endpoint ?? null);
            setDenied(s === "ok" && Notification.permission === "denied");
            setPrefs(loadPrefs());
        })();
        return () => { cancelled = true; };
    }, []);

    const idToken = async () => (user ? user.getIdToken().catch(() => undefined) : undefined);

    const enable = () => start(async () => {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { setDenied(perm === "denied"); toast.error(t("permissionNeeded")); return; }
        const sub = await subscribeDevice().catch(() => null);
        if (!sub) { toast.error(t("failed")); return; }
        const res = await subscribePushAction({ subscription: sub.toJSON(), prefs, idToken: await idToken() });
        if (!res.ok) { toast.error(t("failed")); return; }
        setEndpoint(sub.endpoint);
        toast.success(t("enabled"));
    });

    const disable = () => start(async () => {
        const sub = await currentSubscription().catch(() => null);
        if (sub) {
            await unsubscribePushAction({ endpoint: sub.endpoint });
            await sub.unsubscribe().catch(() => undefined);
        }
        setEndpoint(null);
    });

    const toggle = (k: keyof NotifyPrefs) => {
        const next = { ...prefs, [k]: !prefs[k] };
        setPrefs(next);
        savePrefs(next);
        if (endpoint) start(async () => { await syncPushAction({ endpoint, prefs: next, idToken: await idToken() }); });
    };

    const test = () => start(async () => {
        if (!endpoint) return;
        const r = await testPushAction({ endpoint });
        if (r.ok) toast.success(t("testSent"));
        else toast.error(t("failed"));
    });

    // Without the VAPID public key (production secrets not set up yet) push
    // cannot work: hide the panel instead of offering a button that fails.
    if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return null;
    if (support === null) return null;

    return (
        <section aria-labelledby="notify-heading" className="mt-6 rounded-[4px] border border-border bg-card p-4">
            <h2 id="notify-heading" className="flex items-center gap-2 text-sm font-bold">
                <Bell size={16} className="text-primary" aria-hidden /> {t("title")}
            </h2>
            {support === "ios-install" && <p className="mt-2 text-sm text-muted-foreground">{t("iosInstall")}</p>}
            {support === "unsupported" && <p className="mt-2 text-sm text-muted-foreground">{t("unsupported")}</p>}
            {support === "no-sw" && <p className="mt-2 text-sm text-muted-foreground">{t("noServiceWorker")}</p>}
            {support === "ok" && (
                <>
                    <p className="mt-1 text-xs text-muted-foreground">{t("hint")}</p>
                    {denied && !endpoint && <p className="mt-2 text-sm text-warning">{t("denied")}</p>}
                    {!endpoint ? (
                        <button type="button" onClick={enable} disabled={pending || denied}
                            className="mt-3 inline-flex min-h-[44px] items-center gap-2 rounded-lg bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">
                            <Bell size={16} aria-hidden /> {t("enable")}
                        </button>
                    ) : (
                        <div className="mt-3 space-y-3">
                            <fieldset className="grid gap-2 sm:grid-cols-2">
                                <legend className="sr-only">{t("categories")}</legend>
                                {CATEGORIES.map(k => (
                                    <label key={k} className="flex min-h-[40px] cursor-pointer items-center gap-2 text-sm">
                                        <input type="checkbox" checked={prefs[k]} onChange={() => toggle(k)} className="h-5 w-5 accent-primary" />
                                        <span>{t(`cat.${k}`)}</span>
                                    </label>
                                ))}
                            </fieldset>
                            <div className="flex flex-wrap gap-2">
                                <button type="button" onClick={test} disabled={pending} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-border px-3 text-sm">
                                    <Send size={14} aria-hidden /> {t("test")}
                                </button>
                                <button type="button" onClick={disable} disabled={pending} className="inline-flex min-h-[40px] items-center gap-2 rounded-lg border border-border px-3 text-sm text-muted-foreground">
                                    <BellOff size={14} aria-hidden /> {t("disable")}
                                </button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </section>
    );
}
