"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";

/**
 * Collapsed behind a button on phones, always open from `md` up (#116):
 * secondary controls (e.g. filters) stop taking the first phone screen.
 */
export function MobileCollapsible({ label, children }: { label: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    return (
        <div>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-expanded={open}
                aria-controls={id}
                className="flex min-h-[44px] w-full items-center justify-between rounded-lg border border-border bg-card px-3 text-sm font-semibold text-foreground md:hidden"
            >
                {label}
                <ChevronDown className={clsx("h-4 w-4 transition-transform", open && "rotate-180")} aria-hidden />
            </button>
            <div id={id} className={clsx(open ? "mt-3 block" : "hidden", "md:mt-0 md:block")}>{children}</div>
        </div>
    );
}
