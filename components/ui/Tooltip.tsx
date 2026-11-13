"use client";

import * as RadixTooltip from "@radix-ui/react-tooltip";
import { type ReactNode } from "react";

/**
 * Accessible tooltip wrapper around Radix. Wraps the children as the trigger
 * and shows the label on hover/focus. Use sparingly — primary content should
 * always be visible; tooltips are for clarifying icon-only buttons.
 *
 * Mount <TooltipProvider /> once at the root if you want delay coordination
 * across many tooltips, otherwise the default 700ms hover delay applies per
 * Tooltip.Root instance.
 */
export function Tooltip({
    children,
    content,
    side = "top",
}: {
    children: ReactNode;
    content: ReactNode;
    side?: "top" | "right" | "bottom" | "left";
}) {
    return (
        <RadixTooltip.Provider delayDuration={400}>
            <RadixTooltip.Root>
                <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
                <RadixTooltip.Portal>
                    <RadixTooltip.Content
                        side={side}
                        sideOffset={4}
                        className="z-50 px-2 py-1 text-[11px] font-medium bg-slate-800 text-white rounded shadow-lg border border-white/10 data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95"
                    >
                        {content}
                        <RadixTooltip.Arrow className="fill-slate-800" />
                    </RadixTooltip.Content>
                </RadixTooltip.Portal>
            </RadixTooltip.Root>
        </RadixTooltip.Provider>
    );
}
