"use client";

import * as React from "react";
import clsx from "clsx";

const TabsContext = React.createContext<{
    value: string;
    onValueChange: (value: string) => void;
}>({ value: "", onValueChange: () => { } });

export function Tabs({ defaultValue, children, className }: { defaultValue: string, children: React.ReactNode, className?: string }) {
    const [value, setValue] = React.useState(defaultValue);
    return (
        <TabsContext.Provider value={{ value, onValueChange: setValue }}>
            <div className={className}>{children}</div>
        </TabsContext.Provider>
    );
}

export function TabsList({ children, className }: { children: React.ReactNode, className?: string }) {
    return (
        <div
            role="tablist"
            className={clsx(
                "flex p-1 bg-white/5 rounded-lg border border-white/10 overflow-x-auto",
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
                "min-h-[44px] px-4 py-2 rounded-md text-sm font-bold transition-all whitespace-nowrap",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                isActive
                    ? "bg-primary text-white shadow-lg"
                    : "text-gray-400 hover:text-white hover:bg-white/5 active:bg-white/10",
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
