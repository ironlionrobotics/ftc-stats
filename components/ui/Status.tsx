import clsx from "clsx";
import type { ReactNode } from "react";

/** Win / loss / tie without red or blue (decision #116): G in soft green, P outlined, E dashed. */
export function ResultChip({ result, label }: { result: "W" | "L" | "T"; label: string }) {
    return (
        <span
            title={label}
            aria-label={label}
            className={clsx(
                "inline-grid h-6 w-6 place-items-center rounded-md text-xs font-extrabold",
                result === "W" && "bg-success-tint text-success",
                result === "L" && "border-[1.5px] border-border text-muted-foreground",
                result === "T" && "border-[1.5px] border-dashed border-muted-foreground text-muted-foreground",
            )}
        >
            {label.slice(0, 1)}
        </span>
    );
}

/** One status message; each tone has a single meaning. Optional action. */
export function Notice({ tone = "info", children, action }: { tone?: "info" | "ok" | "warn" | "error"; children: ReactNode; action?: ReactNode }) {
    return (
        <div
            role={tone === "error" ? "alert" : "status"}
            className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                tone === "info" && "bg-muted text-foreground",
                tone === "ok" && "bg-success-tint text-success",
                tone === "warn" && "bg-warning-tint text-warning",
                tone === "error" && "bg-error-tint text-error",
            )}
        >
            <div className="min-w-0 flex-1">{children}</div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
    );
}

/** Compact number tile: label, value (28px), optional note. */
export function Stat({ label, value, note }: { label: ReactNode; value: ReactNode; note?: ReactNode }) {
    return (
        <div className="rounded-xl border border-border bg-card px-3 py-2.5">
            <div className="text-xs font-semibold text-muted-foreground">{label}</div>
            <div className="mt-0.5 font-mono text-[28px] font-extrabold leading-tight tabular-nums">{value}</div>
            {note && <div className="text-xs text-muted-foreground">{note}</div>}
        </div>
    );
}
