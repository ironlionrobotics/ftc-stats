export const MEXICAN_EVENTS = [
    { code: "MXCIQ", abbr: "CTN", name: "Regional Cuautitlán" },
    { code: "MXCAQ", abbr: "CUN", name: "Regional Cancún" },
    { code: "MXTLQ", abbr: "CDMX", name: "Regional CDMX" },
    { code: "MXSTQ", abbr: "GDL", name: "Regional Guadalajara" },
    { code: "MXTOQ2", abbr: "TRN", name: "Regional Torreón" },
    { code: "MXMOQ", abbr: "MTY", name: "Regional Monterrey" },
    { code: "MXTOQ", abbr: "TOL", name: "Regional Toluca" },
    { code: "MXSPQ", abbr: "SLP", name: "Regional San Luis Potosí" },
    { code: "MXCMP", abbr: "CMP", name: "Championship Nacional" },
];

export function getCurrentSeason(): number {
    const now = new Date();
    // Similar to FIRST: Season is usually defined by the start year.
    // E.g. 2024-2025 season is "2024". Season starts around Sept (month 8).
    // If we are in Jan-Aug (months 0-7), the season started in the previous year.
    return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

export const SEASON = getCurrentSeason();
