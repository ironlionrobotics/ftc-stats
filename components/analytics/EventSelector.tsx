"use client";

import { FTCEvent } from "@/types/ftc";
import { Check, Calendar } from "lucide-react";
import clsx from "clsx";

interface EventSelectorProps {
    events: FTCEvent[];
    selectedCodes: string[];
    onToggle: (code: string) => void;
}

export default function EventSelector({ events, selectedCodes, onToggle }: EventSelectorProps) {
    const formatDate = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return dateStr;
            const day = String(d.getUTCDate()).padStart(2, '0');
            const month = String(d.getUTCMonth() + 1).padStart(2, '0');
            const year = d.getUTCFullYear();
            return `${day}/${month}/${year}`;
        } catch (e) {
            return dateStr;
        }
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {events.map((event) => {
                const isSelected = selectedCodes.includes(event.code);
                return (
                    <button
                        key={event.code}
                        onClick={() => onToggle(event.code)}
                        className={clsx(
                            "flex items-start gap-3 p-4 rounded-xl border text-left transition-all group relative overflow-hidden",
                            isSelected
                                ? "bg-primary/20 border-primary shadow-[0_0_15px_rgba(var(--primary-rgb),0.2)]"
                                : "bg-muted/50 border-border hover:bg-muted"
                        )}
                    >
                        <div className={clsx(
                            "w-5 h-5 rounded-md border flex items-center justify-center mt-0.5 transition-colors",
                            isSelected ? "bg-primary border-primary text-white" : "border-muted-foreground/30 group-hover:border-primary/50"
                        )}>
                            {isSelected && <Check size={12} strokeWidth={4} />}
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3 className={clsx("font-bold text-sm truncate pr-2", isSelected ? "text-primary dark:text-white" : "text-muted-foreground group-hover:text-foreground")}>
                                {event.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-mono bg-background/50 border border-border px-1.5 py-0.5 rounded text-muted-foreground">
                                    {event.code}
                                </span>
                                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                                    <Calendar size={10} /> {formatDate(event.dateStart)}
                                </span>
                            </div>
                        </div>

                        {isSelected && (
                            <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-primary/10 to-transparent pointer-events-none" />
                        )}
                    </button>
                );
            })}
        </div>
    );
}
