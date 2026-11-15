"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, X } from "lucide-react";
import { useTranslations } from "next-intl";

/**
 * PWA install (Chrome/Edge/Android `beforeinstallprompt`). Decision #116: no
 * floating banner over the content any more. `PWAInstallCapture` (mounted
 * once in the root layout) keeps the browser's event whatever page the visit
 * starts on; `PWAInstallCard` shows an inline, dismissible card on Hoy.
 * Dismissed → hidden for 7 days (localStorage `pwa-install-dismissed`).
 * iOS Safari never fires the event (install is Share → Add to Home Screen).
 */

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach(l => l());
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Mount once (root layout): captures the install event for later. Renders nothing. */
export function PWAInstallCapture() {
    useEffect(() => {
        const handler = (e: Event) => {
            e.preventDefault(); // suppress Chrome's mini-infobar; we offer our own card
            deferred = e as BeforeInstallPromptEvent;
            emit();
        };
        window.addEventListener("beforeinstallprompt", handler);
        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, []);
    return null;
}

function recentlyDismissed(): boolean {
    try {
        const at = Number(localStorage.getItem(DISMISS_KEY) || 0);
        return at > 0 && Date.now() - at < DISMISS_TTL_MS;
    } catch {
        return false;
    }
}

/** Inline install card (Hoy). Nothing when installed, unsupported or dismissed. */
export default function PWAInstallCard() {
    const t = useTranslations("PwaInstall");
    const prompt = useSyncExternalStore(subscribe, () => deferred, () => null);
    const [hidden, setHidden] = useState(false);

    if (!prompt || hidden || recentlyDismissed()) return null;
    if (window.matchMedia("(display-mode: standalone)").matches) return null;

    const install = async () => {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === "accepted") { deferred = null; emit(); }
    };
    const dismiss = () => {
        try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* private mode */ }
        setHidden(true);
    };

    return (
        <section className="flex items-start gap-3 rounded-xl border border-border bg-card p-3" aria-label={t("regionLabel")}>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand-ink">
                <Download size={18} />
            </span>
            <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-foreground">{t("title")}</p>
                <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{t("body")}</p>
                <div className="mt-2 flex gap-2">
                    <button type="button" onClick={install} className="min-h-[44px] rounded-lg bg-brand px-4 text-sm font-bold text-brand-foreground">
                        {t("install")}
                    </button>
                    <button type="button" onClick={dismiss} className="min-h-[44px] rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:text-foreground">
                        {t("later")}
                    </button>
                </div>
            </div>
            <button type="button" onClick={dismiss} aria-label={t("close")} className="-mr-1 -mt-1 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground">
                <X size={16} />
            </button>
        </section>
    );
}
