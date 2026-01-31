"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface SeasonContextType {
    season: number;
    setSeason: (season: number) => void;
}

const DEFAULT_SEASON = 2024;

const SeasonContext = createContext<SeasonContextType>({
    season: DEFAULT_SEASON,
    setSeason: () => { },
});

export function SeasonProvider({ children }: { children: ReactNode }) {
    const [season, setSeasonState] = useState<number>(DEFAULT_SEASON);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        const stored = localStorage.getItem("ftc_season");
        if (stored) {
            setSeasonState(parseInt(stored, 10));
        }
        setMounted(true);
    }, []);

    const setSeason = (newSeason: number) => {
        setSeasonState(newSeason);
        localStorage.setItem("ftc_season", newSeason.toString());
        document.cookie = `ftc_season=${newSeason}; path=/; max-age=31536000`; // 1 year

        // Reload page to refresh all server components
        window.location.reload();
    };

    if (!mounted) {
        return <>{children}</>;
    }

    return (
        <SeasonContext.Provider value={{ season, setSeason }}>
            {children}
        </SeasonContext.Provider>
    );
}

export const useSeason = () => useContext(SeasonContext);
