import { clsx } from "clsx";
import { ReactNode } from "react";

interface CardProps {
    children: ReactNode;
    className?: string;
    /**
     * @deprecated Framer-motion-driven stagger delay was removed for bundle
     * weight. Kept in the API so existing call sites compile; ignored at
     * render time. Replace with CSS animation-delay if a stagger effect
     * is genuinely needed.
     */
    delay?: number;
}

/**
 * Card primitive. Plain div with a fade-in animation expressed via Tailwind
 * v4's animate-in utilities — same visual effect as the previous
 * framer-motion implementation, ~150 KB lighter at runtime.
 */
export function Card({ children, className }: CardProps) {
    return (
        <div
            className={clsx(
                "bg-card border border-border rounded-xl p-6 shadow-sm",
                "animate-in fade-in slide-in-from-bottom-1 duration-300",
                className,
            )}
        >
            {children}
        </div>
    );
}
