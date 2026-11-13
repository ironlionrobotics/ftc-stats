"use client";

import * as React from "react";
import clsx from "clsx";

const TabsContext = React.createContext<{
    value: string;
    onValueChange: (value: string) => void;
}>({ value: "", onValueChange: () => { } });

export function Tabs({ defaultValue, children, className }: { defaultValue: string, children: React.ReactNode, className?: string }) {
    const [value, setValue] = React.useState(defaultValue);
    // Fase 0 · View Transitions API — cross-fade tab panels natively, no motion
    // library. Progressive enhancement: falls back to an instant switch (plus the
    // existing animate-in on TabsContent) where startViewTransition is absent.
    const onValueChange = React.useCallback((next: string) => {
        const doc = document as Document & {
            startViewTransition?: (cb: () => void) => void;
        };
        if (typeof doc.startViewTransition === "function") {
            doc.startViewTransition(() => setValue(next));
        } else {
            setValue(next);
        }
    }, []);
    return (
        <TabsContext.Provider value={{ value, onValueChange }}>
            <div className={className}>{children}</div>
        </TabsContext.Provider>
    );
}

export function TabsList({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <div
            role="tablist"
            className={clsx(
                "flex p-1 bg-muted rounded-lg border border-border overflow-x-auto",
                className,
            )}
        >
            {children}
        </div>
    );
}

export function TabsTrigger({ value, children, className }: { value: string, children: React.ReactNode, className?: string }) {
    const { value: activeValue, onValueChange } = React.useContext(TabsContext);
    const isActive = activeValue === value;
    return (
        <button
            type="button"
            role="tab"
            aria-selected={isActive}
            data-state={isActive ? "active" : "inactive"}
            onClick={() => onValueChange(value)}
            className={clsx(
                // WCAG 2.1 AA touch target: 44px min height for tablet/mobile use.
                // shrink-0: inside the scrollable TabsList, triggers must keep
                // their width so the list scrolls instead of crushing labels.
                "min-h-[44px] shrink-0 px-4 py-2 rounded-md text-sm font-bold transition-all whitespace-nowrap",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                isActive
                    ? "bg-primary text-primary-foreground shadow-lg"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted active:bg-muted",
                className,
            )}
        >
            {children}
        </button>
    );
}

export function TabsContent({ value, children, className }: { value: string, children: React.ReactNode, className?: string }) {
    const { value: activeValue } = React.useContext(TabsContext);
    if (activeValue !== value) return null;
    return (
        <div
            role="tabpanel"
            // Fade-in keyframe defined in app/globals.css via tw `animate-in fade-in`.
            // Slight upward motion adds perceived snappiness without distracting.
            className={clsx(
                "mt-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-200",
                className,
            )}
        >
            {children}
        </div>
    );
}
