"use client";

import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

/**
 * Detects the `beforeinstallprompt` event (Chrome/Edge/Android) and shows a
 * small pill in the bottom-left so the user can install the PWA without
 * digging through browser menus. Once dismissed it stays hidden for 7 days
 * (localStorage key `pwa-install-dismissed`).
 *
 * iOS Safari does NOT fire `beforeinstallprompt` — install on iOS is a manual
 * Share → "Add to Home Screen" step that we can't surface from JS. The pill
 * just won't appear there, which is the least-bad option.
 */

const DISMISS_KEY = "pwa-install-dismissed";
const DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export default function PWAInstallPrompt() {
    const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Already installed? Don't show.
        if (typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches) {
            return;
        }
        // Recently dismissed? Don't show.
        const dismissedAt = Number(localStorage.getItem(DISMISS_KEY) || 0);
        if (dismissedAt && Date.now() - dismissedAt < DISMISS_TTL_MS) {
            return;
        }

        const handler = (e: Event) => {
            // The default Chrome mini-infobar is suppressed by preventDefault
            // so we can show our own UI on our schedule.
            e.preventDefault();
            setDeferredPrompt(e as BeforeInstallPromptEvent);
            setVisible(true);
        };
        window.addEventListener("beforeinstallprompt", handler);
        return () => window.removeEventListener("beforeinstallprompt", handler);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt) return;
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
            setVisible(false);
            setDeferredPrompt(null);
        }
    };

    const handleDismiss = () => {
        localStorage.setItem(DISMISS_KEY, String(Date.now()));
        setVisible(false);
    };

    if (!visible || !deferredPrompt) return null;

    return (
        <div
            className="fixed bottom-4 left-4 md:bottom-6 md:left-6 z-40 max-w-sm bg-slate-900/95 backdrop-blur-md border border-primary/30 rounded-xl shadow-2xl p-3 flex items-start gap-3 animate-in slide-in-from-bottom-2 fade-in-0"
            role="region"
            aria-label="Instalar la app"
        >
            <div className="p-2 bg-primary/15 text-primary rounded-lg flex-shrink-0">
                <Download size={18} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white">Instala FTC Stats</p>
                <p className="text-[11px] text-gray-400 leading-snug mt-0.5">
                    Acceso rápido + funciona offline en venue.
                </p>
                <div className="mt-2 flex gap-2">
                    <button
                        type="button"
                        onClick={handleInstall}
                        className="px-3 py-1.5 bg-primary hover:bg-primary/90 active:scale-[0.98] text-white text-xs font-bold rounded-md transition-all"
                    >
                        Instalar
                    </button>
                    <button
                        type="button"
                        onClick={handleDismiss}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-200 text-xs font-bold rounded-md transition-all"
                    >
                        Después
                    </button>
                </div>
            </div>
            <button
                type="button"
                onClick={handleDismiss}
                aria-label="Cerrar"
                className="text-gray-500 hover:text-gray-300 p-1 -mr-1 -mt-1"
            >
                <X size={14} />
            </button>
        </div>
    );
}
