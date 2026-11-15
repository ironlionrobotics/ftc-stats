"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet on phones, centered card on wider screens (decision #116).
 * Rendered in a portal on <body> so no stacking context (sticky header, tab
 * bar) can paint over it. Closes on backdrop tap, the close button and Escape;
 * traps Tab inside while open and returns focus to the trigger on close.
 */
export function Sheet({ open, onClose, title, closeLabel, children }: {
    open: boolean;
    onClose: () => void;
    title: string;
    closeLabel: string;
    children: ReactNode;
}) {
    const panel = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
    const titleId = useId();

    useEffect(() => {
        if (!open) return;
        const trigger = document.activeElement as HTMLElement | null;
        // Keep an autoFocus'ed field inside the sheet; otherwise focus the panel.
        const raf = requestAnimationFrame(() => {
            if (panel.current && !panel.current.contains(document.activeElement)) panel.current.focus();
        });
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { onCloseRef.current(); return; }
            if (e.key !== "Tab" || !panel.current) return;
            const items = Array.from(panel.current.querySelectorAll<HTMLElement>(FOCUSABLE));
            if (items.length === 0) return;
            const first = items[0], last = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        };
        window.addEventListener("keydown", onKey);
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener("keydown", onKey);
            trigger?.focus?.();
        };
    }, [open]);

    if (!open || typeof document === "undefined") return null;
    return createPortal(
        <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <button type="button" tabIndex={-1} className="absolute inset-0 bg-black/60" aria-label={closeLabel} onClick={onClose} />
            <div
                ref={panel}
                tabIndex={-1}
                className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] outline-none md:inset-x-auto md:bottom-auto md:left-1/2 md:top-[10vh] md:w-[440px] md:-translate-x-1/2 md:rounded-xl md:border"
            >
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 id={titleId} className="text-base font-bold text-foreground">{title}</h2>
                    <button type="button" onClick={onClose} aria-label={closeLabel} className="-mr-2 flex h-11 w-11 items-center justify-center text-muted-foreground hover:text-foreground">
                        <X className="h-5 w-5" />
                    </button>
                </div>
                {children}
            </div>
        </div>,
        document.body,
    );
}
