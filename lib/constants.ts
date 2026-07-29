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

/**
 * FIRST World Championship (Houston) divisions + Finals, and the Premier
 * Events, for the DECODE 2025 season. Codes verified against FTCScout
 * (2026-07-28). Used for quick navigation — nobody memorizes FTCCMP1FRAN.
 * All render natively: the event page auto-detects 3-robot alliances (§15.3).
 */
export const CHAMPIONSHIP_EVENTS_2025 = [
    { code: "FTCCMP1FRAN", abbr: "FRA", name: "Franklin" },
    { code: "FTCCMP1JACK", abbr: "JAC", name: "Jackson" },
    { code: "FTCCMP1ROSS", abbr: "ROS", name: "Ross" },
    { code: "FTCCMP1EDIS", abbr: "EDI", name: "Edison" },
    { code: "FTCCMP1GOOD", abbr: "GOO", name: "Goodall" },
    { code: "FTCCMP1LOVE", abbr: "LOV", name: "Lovelace" },
    { code: "FTCCMP1", abbr: "FIN", name: "Finals" },
];

export const PREMIER_EVENTS_2025 = [
    { code: "FPEMX", abbr: "MEX", name: "México" },
    { code: "FPEEUR", abbr: "EUR", name: "Europa" },
    { code: "FPEIST", abbr: "IST", name: "İstanbul" },
    { code: "FPENE", abbr: "NE", name: "New England" },
    { code: "FPEWE", abbr: "WE", name: "Western Edge" },
    { code: "FPERR", abbr: "RR", name: "Run for the Robots" },
    { code: "FPECAR", abbr: "CAR", name: "Carolinas" },
];

export function getCurrentSeason(): number {
    const now = new Date();
    // Similar to FIRST: Season is usually defined by the start year.
    // E.g. 2024-2025 season is "2024". Season starts around Sept (month 8).
    // If we are in Jan-Aug (months 0-7), the season started in the previous year.
    return now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
}

export const SEASON = getCurrentSeason();

/**
 * Fallback org for data written before the federated model existed, and for
 * anonymous capture. Iron Lion (FTC #30311) is the app's home team.
 *
 * Lives here rather than in lib/orgs so that modules needing only this string —
 * lib/localDatabase and lib/scouting-service — don't transitively import
 * lib/firebase, which initializes the whole Firebase client SDK at module
 * scope. That one edge was enough to put ~380 KB of Firestore into the offline
 * layer's chunk, and from there onto every page that touches offline storage.
 */
export const DEFAULT_ORG_ID = "30311";
