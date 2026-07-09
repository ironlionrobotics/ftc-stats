"use client";

import { useState, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FTCEvent } from "@/types/scouting";
import clsx from "clsx";
import { Calendar, MapPin, Search, CheckSquare, Square } from "lucide-react";

interface EventFilterProps {
    currentSeason: number;
    allEvents: FTCEvent[];
    latestAvailableSeason: number;
}

export default function EventFilter({ currentSeason, allEvents, latestAvailableSeason }: EventFilterProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Mode: 'criteria' (Region/Type/Date) or 'selection' (Specific Events)
    const initialMode = searchParams.get("events") ? "selection" : "criteria";
    const [mode, setMode] = useState<"criteria" | "selection">(initialMode);

    // Criteria Stats
    const [season, setSeason] = useState(currentSeason);
    const [region, setRegion] = useState(searchParams.get("region") || "MX");
    const [eventType, setEventType] = useState(searchParams.get("eventType") || "All");
    const [dateStart, setDateStart] = useState(searchParams.get("dateStart") || "");
    const [dateEnd, setDateEnd] = useState(searchParams.get("dateEnd") || "");

    // Selection Stats
    const initialSelected = searchParams.get("events")?.split(",") || [];
    const [selectedEvents, setSelectedEvents] = useState<string[]>(initialSelected);
    const [eventSearch, setEventSearch] = useState("");

    // Dynamic seasons list based on server-provided latest season (to avoid hydration mismatch)
    const seasons = Array.from({ length: latestAvailableSeason - 2022 + 1 }, (_, i) => latestAvailableSeason - i);

    // Derive Dynamic Options from allEvents
    const uniqueRegions = useMemo(() => {
        const regions = new Set<string>();
        allEvents.forEach(e => {
            if (e.stateProv) regions.add(e.stateProv);
            else if (e.country) regions.add(e.country);
        });
        return Array.from(regions).sort();
    }, [allEvents]);

    const uniqueEventTypes = useMemo(() => {
        const types = new Set<string>();
        allEvents.forEach(e => {
            if (e.typeName) types.add(e.typeName);
        });
        return Array.from(types).sort();
    }, [allEvents]);

    // Filtered list for the "Selection" tab
    const visibleEventsForSelection = useMemo(() => {
        return allEvents.filter(e =>
            e.name.toLowerCase().includes(eventSearch.toLowerCase()) ||
            e.code.toLowerCase().includes(eventSearch.toLowerCase())
        );
    }, [allEvents, eventSearch]);

    const handleApply = () => {
        const params = new URLSearchParams();
        params.set("season", season.toString());

        if (mode === "criteria") {
            if (region && region !== "All") params.set("region", region);
            if (eventType && eventType !== "All") params.set("eventType", eventType);
            if (dateStart) params.set("dateStart", dateStart);
            if (dateEnd) params.set("dateEnd", dateEnd);
        } else {
            if (selectedEvents.length > 0) {
                params.set("events", selectedEvents.join(","));
            }
        }

        document.cookie = `ftc_season=${season}; path=/; max-age=31536000`; // 1 year
        router.push(`/?${params.toString()}`);
    };

    const toggleEventSelection = (code: string) => {
        setSelectedEvents(prev =>
            prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
        );
    };

    const toggleSelectAll = () => {
        if (selectedEvents.length === visibleEventsForSelection.length) {
            setSelectedEvents([]);
        } else {
            setSelectedEvents(visibleEventsForSelection.map(e => e.code));
        }
    };

    return (
        <div className="bg-card p-6 rounded-xl shadow-sm mb-8 border border-border/50 backdrop-blur-sm relative z-20">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <h3 className="text-lg font-semibold text-foreground">Filter Data Source</h3>

                {/* Mode Toggle */}
                <div className="bg-muted p-1 rounded-lg flex items-center">
                    <button
                        onClick={() => setMode("criteria")}
                        className={clsx(
                            "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                            mode === "criteria" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        By Criteria
                    </button>
                    <button
                        onClick={() => setMode("selection")}
                        className={clsx(
                            "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                            mode === "selection" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                        )}
                    >
                        Specific Events
                    </button>
                </div>
            </div>

            {/* Common Season Selector */}
            <div className="mb-6">
                <label className="text-sm font-medium text-muted-foreground block mb-2">Season</label>
                <select
                    value={season}
                    onChange={(e) => setSeason(Number(e.target.value))}
                    className="w-full md:w-64 p-2.5 rounded-md bg-background border border-input focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                >
                    {seasons.map(s => <option key={s} value={s}>{s} - {getGameName(s)}</option>)}
                </select>
            </div>

            {mode === "criteria" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-top-2 duration-300">
                    {/* Region Selector */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Region</label>
                        <select
                            value={region}
                            onChange={(e) => setRegion(e.target.value)}
                            className="w-full p-2.5 rounded-md bg-background border border-input focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        >
                            <option value="All">All Regions</option>
                            <option value="MX">Mexico (Default)</option>
                            <option value="US">USA (Generic)</option>
                            <optgroup label="Detected Regions">
                                {uniqueRegions.map(r => <option key={r} value={r}>{r}</option>)}
                            </optgroup>
                        </select>
                    </div>

                    {/* Event Type Selector */}
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-muted-foreground">Event Type</label>
                        <select
                            value={eventType}
                            onChange={(e) => setEventType(e.target.value)}
                            className="w-full p-2.5 rounded-md bg-background border border-input focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                        >
                            <option value="All">All Types</option>
                            {uniqueEventTypes.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                    </div>

                    {/* Date Range */}
                    <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium text-muted-foreground">Date Range</label>
                        <div className="flex gap-2">
                            <input
                                type="date"
                                className="w-full p-2.5 rounded-md bg-background border border-input focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                                value={dateStart}
                                onChange={e => setDateStart(e.target.value)}
                            />
                            <input
                                type="date"
                                className="w-full p-2.5 rounded-md bg-background border border-input focus:ring-2 focus:ring-primary/20 outline-none transition-all text-sm"
                                value={dateEnd}
                                onChange={e => setDateEnd(e.target.value)}
                            />
                        </div>
                    </div>
                </div>
            ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search events by name or code..."
                            className="w-full pl-9 pr-4 py-2 bg-background border border-input rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/20"
                            value={eventSearch}
                            onChange={(e) => setEventSearch(e.target.value)}
                        />
                    </div>

                    <div className="border border-border rounded-lg bg-background/50 h-64 overflow-y-auto p-2 space-y-1">
                        {visibleEventsForSelection.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-sm">No events found matching your search.</div>
                        ) : (
                            <>
                                <div className="flex justify-between items-center px-2 py-1 mb-2 border-b border-border/50 pb-2">
                                    <span className="text-xs font-bold text-muted-foreground">{selectedEvents.length} selected</span>
                                    <button onClick={toggleSelectAll} className="text-xs text-primary hover:underline">
                                        {selectedEvents.length === visibleEventsForSelection.length ? "Deselect All" : "Select All Visible"}
                                    </button>
                                </div>
                                {visibleEventsForSelection.map(event => (
                                    <div
                                        key={event.code}
                                        className={clsx(
                                            "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors border",
                                            selectedEvents.includes(event.code)
                                                ? "bg-primary/10 border-primary/30"
                                                : "hover:bg-muted border-transparent"
                                        )}
                                        onClick={() => toggleEventSelection(event.code)}
                                    >
                                        <div className={clsx("flex-shrink-0", selectedEvents.includes(event.code) ? "text-primary" : "text-muted-foreground")}>
                                            {selectedEvents.includes(event.code) ? <CheckSquare size={18} /> : <Square size={18} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium text-sm truncate">{event.name}</div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-3">
                                                <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] font-mono">{event.code}</span>
                                                <span className="flex items-center gap-1"><MapPin size={10} /> {event.stateProv || event.country}</span>
                                                <span className="flex items-center gap-1"><Calendar size={10} /> {new Date(event.dateStart).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground italic text-center">
                        Select specific events to aggregate data solely from them, ignoring other filters.
                    </p>
                </div>
            )}

            <div className="mt-6 flex justify-end">
                <button
                    onClick={handleApply}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-medium px-6 py-2.5 rounded-md transition-colors shadow-lg shadow-primary/20"
                >
                    Apply Filters
                </button>
            </div>
        </div>
    );
}

function getGameName(season: number) {
    switch (season) {
        case 2025: return "Decode";
        case 2024: return "Into The Deep";
        case 2023: return "CenterStage";
        case 2022: return "PowerPlay";
        default: return "";
    }
}
