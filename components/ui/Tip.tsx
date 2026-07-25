"use client";

import { type ReactNode, type ComponentType } from "react";
import { useTipDismissed } from "@/lib/hooks/use-tip-dismissed";
import { Lightbulb, X } from "lucide-react";
import clsx from "clsx";

interface TipProps {
    /**
     * Stable id with a version suffix, e.g. "picklist-intro-v1". Bump the
     * suffix when the tip's content changes meaningfully so previously-
     * dismissed users see the new version.
     */
    id: string;
    title: ReactNode;
    children?: ReactNode;
    icon?: ComponentType<{ size?: number; className?: string }>;
    /** Visual intent. Defaults to "info" (blue). */
    variant?: "info" | "primary" | "warning";
    className?: string;
}

/**
 * First-run dismissible tip. Renders inline at the top of a section. The
 * dismiss is permanent for that id (until version is bumped). Designed to
 * be unobtrusive — does NOT take focus, does NOT block any UI underneath.
 *
 * Style: subtle border + tiny icon + 1-2 sentences. Heavier than a tooltip,
 * lighter than a modal. For more involved onboarding, point users to a
 * dedicated docs page from inside the tip.
 */
export default function Tip({ id, title, children, icon: Icon = Lightbulb, variant = "info", className }: TipProps) {
    const { dismissed, dismiss, ready } = useTipDismissed(id);
    if (!ready || dismissed) return null;

    const variantStyles = {
        info: "bg-secondary/5 border-secondary/20 text-secondary/90",
        primary: "bg-primary/5 border-primary/20 text-primary-foreground",
        warning: "bg-warning/5 border-warning/20 text-warning/90",
    } as const;
    const iconColor = {
        info: "text-secondary",
        primary: "text-primary",
        warning: "text-warning",
    } as const;

    return (
        <div
            role="note"
            className={clsx(
                "relative flex items-start gap-3 p-3 pr-9 rounded-xl border text-xs leading-relaxed",
                variantStyles[variant],
                className,
            )}
        >
            <Icon size={14} className={clsx("flex-shrink-0 mt-0.5", iconColor[variant])} />
            <div className="flex-1 min-w-0">
                {title && <div className="font-bold text-foreground mb-0.5">{title}</div>}
                {children && <div className="opacity-90">{children}</div>}
            </div>
            <button
                type="button"
                onClick={dismiss}
                aria-label="No mostrar de nuevo"
                className="absolute top-2 right-2 min-w-[28px] min-h-[28px] flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted rounded transition-colors"
            >
                <X size={12} />
            </button>
        </div>
    );
}
