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
        <div className={clsx("flex p-1 bg-white/5 rounded-lg border border-white/10", className)}>
            {children}
        </div>
    );
}

export function TabsTrigger({ value, children, className }: { value: string, children: React.ReactNode, className?: string }) {
    const { value: activeValue, onValueChange } = React.useContext(TabsContext);
    const isActive = activeValue === value;
    return (
        <button
            onClick={() => onValueChange(value)}
            className={clsx(
                "px-4 py-2 rounded-md text-sm font-bold transition-all",
                isActive ? "bg-primary text-white shadow-lg" : "text-gray-400 hover:text-white hover:bg-white/5",
                className
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
        <div className={clsx("mt-4", className)}>
            {children}
        </div>
    );
}
