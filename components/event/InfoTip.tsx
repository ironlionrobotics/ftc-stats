"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import clsx from "clsx";
import { Info } from "lucide-react";

/**
 * Explanation that works by tap AND hover (decision #116: no hover-only
 * information). A "?" button with a 44px hit area toggles a short popover;
 * hover still opens it on a mouse. Escape or a second tap closes it.
 */
export default function InfoTip({ children, align = "center", className, label }: {
    children: ReactNode;
    align?: "start" | "center" | "end";
    className?: string;
    /** What is explained (e.g. the column name), read with the button label. */
    label?: string;
}) {
    const t = useTranslations("EventInfoTip");
    const [open, setOpen] = useState(false);
    const root = useRef<HTMLSpanElement>(null);
    // One open tip at a time: a tap anywhere else closes it.
    useEffect(() => {
        if (!open) return;
        const close = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
        document.addEventListener("pointerdown", close);
        return () => document.removeEventListener("pointerdown", close);
    }, [open]);
    return (
        <span ref={root} className={clsx("group/tip relative inline-flex normal-case tracking-normal", className)}>
            <button
                type="button"
                aria-label={label ? `${t("label")}: ${label}` : t("label")}
                aria-expanded={open}
                onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
                onKeyDown={e => { if (e.key === "Escape") setOpen(false); }}
                className="-m-3 grid min-h-11 min-w-11 place-items-center rounded-full text-muted-foreground hover:text-foreground"
            >
                <Info size={14} aria-hidden />
            </button>
            <span
                role="note"
                onClick={e => e.stopPropagation()}
                className={clsx(
                    "absolute top-full z-50 mt-1 w-56 rounded-xl border border-border bg-card p-3 text-left text-xs font-normal leading-relaxed text-foreground shadow-sm",
                    align === "start" && "left-0",
                    align === "center" && "left-1/2 -translate-x-1/2",
                    align === "end" && "right-0",
                    open ? "block" : "hidden group-hover/tip:block",
                )}
            >
                {children}
            </span>
        </span>
    );
}
