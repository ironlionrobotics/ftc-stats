/**
 * Curated season retrospective for FTC #30311 "Iron Lion" — DECODE 2025-2026.
 *
 * This is a hand-verified analytical dataset, NOT a live feed. Every number was
 * pulled from FTCScout's public GraphQL API (https://api.ftcscout.org/graphql,
 * schema-introspected, queried live) during the July 2026 season review and is
 * cited in SOURCES below. A finished season is a fixed record, so curating it as
 * static data is deliberate: it is fast, print-friendly for sponsor decks, and
 * every figure is defensible.
 *
 * Scope: intentionally 30311-only for now (see docs/PENDING / team profile page).
 * The shape is generic enough to extend to other teams later if we wire a live
 * FTCScout integration, but that is out of scope today.
 *
 * i18n NOTE (docs/architecture/i18n.md): every prose field below (award
 * descriptions, takeaways, learnings, source citations, category labels,
 * country names) is a translation KEY + already-rounded PARAMS, never formed
 * Spanish text — same rule as the rest of the analysis layer. The catalog
 * lives under the "TeamReport" namespace in messages/{en,es}.json. Proper
 * nouns that are identical across locales (team names, city names inside
 * Mexico, event codes, award short-names like "Inspire"/"Winner") are left as
 * plain data — only country names, category labels and full sentences route
 * through translation.
 */

export interface SeasonEventLine {
    name: string;
    code: string;
    type: "Qualifier" | "Championship" | "Premier";
    dates: string;
    fieldSize: number;
    rank: number;
    record: string; // W-L-T
    rp: number;
    totOpr: number;
    autoOpr: number;
    dcOpr: number;
    awards: EventAward[];
}

/**
 * An award/result badge for the season-per-event table. Rendered via the
 * "TeamReport.eventAward" namespace: `{key}` selects the message, the rest of
 * the object is its params.
 */
export type EventAward =
    | { key: "award"; name: string; place: number }
    | { key: "winningAlliancePick"; pick: number }
    | { key: "playoffsPick"; allianceNum: number; captain: number };

export interface SkillLine {
    /** Semantic key — the UI translates the phase name via "TeamReport.skill". */
    key: "tot" | "auto" | "dc" | "eg";
    value: number;
    worldRank: number;
    /** 0-100, where 100 = best in the world. */
    percentile: number;
}

/** Country/region code for TeamReport.country lookups (ISO-ish, not exhaustive). */
export type CountryCode = "US" | "KZ" | "GB" | "MX" | "TW" | "NL" | "CZ" | "FR" | "AU" | "KG" | "DE" | "LY" | "CN" | "UZ" | "RO";

export interface CohortTeam {
    number: number;
    name: string;
    location: string;
    rookieYear: number;
    seasons: number;
    totOpr: number;
    worldRank: number;
    self?: boolean;
}

/**
 * A rookie/badge in a rookie-comparison row. Rendered via the
 * "TeamReport.rookieAward" namespace, same key+params contract as EventAward
 * (a separate union because the compact table format reads differently: "X
 * 1°" instead of "X Award — 1° lugar").
 */
export type RookieAward =
    | { key: "award"; name: string; place: number }
    | { key: "bare"; name: string }
    | { key: "multiplier"; name: string; count: number }
    | { key: "winningAlliance" };

// A rookie-cohort row (national or international). `place` is the city (MX,
// left untranslated — proper noun) or a CountryCode (international, resolved
// via "TeamReport.country"); `awards` are this season's badges.
export interface RookieRow {
    number: number;
    name: string;
    place: string;
    totOpr: number;
    worldRank: number;
    awards: RookieAward[];
    self?: boolean;
}

/** One entry of the "why the data says grow here" section — key + params. */
export type Learning =
    | { key: "autoTeleopLevers"; autoTopPct: number; teleopEndgameTopPct: string; autoSlope: number; teleopNoise: number }
    | { key: "publicNumberLag"; seasonOpr: number; gap: number; currentForm: number }
    | { key: "nextTier"; veteranFloor: number; veteranCeiling: number; eliteTeamNumber: number; eliteWorldRank: number }
    | { key: "rpAndSeed"; correct: number; total: number };

/** One sponsor-deck headline sentence — key + params. */
export type Takeaway =
    | { key: "rookieVeteranTier"; seasonOpr: number }
    | { key: "worldStanding"; totTopPct: number; activeTeams: string; worldRank: string; teleopEndgameTopPct: string }
    | { key: "inspireDebut" }
    | { key: "champRecord"; record: string; fieldSize: number; rank: number }
    | { key: "premierPick"; fieldSize: number; captain: number; reachPlace: number }
    | { key: "growthArc"; oprArc: string }
    | { key: "soleNationalInspire"; nationalTotal: number; otherCount: number }
    | { key: "soleWorldInspire"; worldPct: number; inspireCohort: number; inspireTotal: string };

/** A citation — key + params, rendered via "TeamReport.source". */
export type SourceRef =
    | { key: "teamProfile"; teamNumber: number; url: string }
    | { key: "graphqlApi"; url: string }
    | { key: "events"; codes: string; season: number; url: string };

export const TEAM_30311_DECODE = {
    meta: {
        season: 2025,
        seasonLabel: "DECODE 2025-2026",
        teamNumber: 30311,
        name: "Iron Lion",
        org: "Museo del Acero A.C. / horno3",
        location: "Monterrey, Nuevo León, México",
        website: "https://ironlionrobotics.com",
        rookieYear: 2025,
        seasonsActive: 1,
        activeTeamsWorld: 8866,
    },

    /** Season-blended quickStats with world ranks (of 8,866 active teams). */
    skills: [
        { key: "tot", value: 63.4, worldRank: 1686, percentile: 81.0 },
        { key: "dc", value: 55.14, worldRank: 1232, percentile: 86.1 },
        { key: "eg", value: 10.28, worldRank: 1182, percentile: 86.7 },
        { key: "auto", value: 15.07, worldRank: 2286, percentile: 74.2 },
    ] as SkillLine[],

    /** Chronological — the growth arc runs across the `totOpr` column. */
    events: [
        {
            name: "Torneo Regional FTC Guadalajara",
            code: "MXSTQ",
            type: "Qualifier",
            dates: "12-13 dic 2025",
            fieldSize: 17,
            rank: 2,
            record: "5-1-0",
            rp: 3.67,
            totOpr: 50.94,
            autoOpr: 9.45,
            dcOpr: 41.63,
            awards: [
                { key: "award", name: "Inspire", place: 1 },
                { key: "winningAlliancePick", pick: 2 },
            ],
        },
        {
            name: "Torneo Regional FTC Monterrey",
            code: "MXMOQ",
            type: "Qualifier",
            dates: "16-17 ene 2026",
            fieldSize: 32,
            rank: 8,
            record: "3-2-0",
            rp: 3.0,
            totOpr: 68.9,
            autoOpr: 8.25,
            dcOpr: 55.14,
            awards: [
                { key: "award", name: "Think", place: 1 },
            ],
        },
        {
            name: "Mexico Championship",
            code: "MXCMP",
            type: "Championship",
            dates: "6-7 feb 2026",
            fieldSize: 52,
            rank: 5,
            record: "5-0-0",
            rp: 4.0,
            totOpr: 63.44,
            autoOpr: 10.16,
            dcOpr: 49.39,
            awards: [],
        },
        {
            name: "México Premier Event (FPEMX)",
            code: "FPEMX",
            type: "Premier",
            dates: "23-25 jul 2026",
            fieldSize: 68,
            rank: 7,
            record: "4-2-0",
            rp: 2.5,
            totOpr: 80.76,
            autoOpr: 15.07,
            dcOpr: 44.88,
            awards: [
                { key: "award", name: "Reach", place: 2 },
                { key: "playoffsPick", allianceNum: 5, captain: 31546 },
            ],
        },
    ] as SeasonEventLine[],

    /** Mexico's most competitive DECODE programs by season-aggregate total OPR. */
    mexicoCohort: [
        { number: 12887, name: "Devolt Phobos", location: "Chihuahua", rookieYear: 2017, seasons: 9, totOpr: 139.13, worldRank: 224 },
        { number: 23619, name: "PrepaTec — OVERTURE Purple", location: "Monterrey", rookieYear: 2023, seasons: 3, totOpr: 137.79, worldRank: 242 },
        { number: 17755, name: "CERBOTICS — BLUE", location: "Torreón", rookieYear: 2019, seasons: 7, totOpr: 126.77, worldRank: 322 },
        { number: 23481, name: "PrepaTec — VOLTEC Vortex", location: "Monterrey", rookieYear: 2023, seasons: 3, totOpr: 121.47, worldRank: 368 },
        { number: 13531, name: "Botbusters Black", location: "Monterrey", rookieYear: 2017, seasons: 9, totOpr: 112.75, worldRank: 468 },
        { number: 15909, name: "Devolt Deimos", location: "Chihuahua", rookieYear: 2018, seasons: 8, totOpr: 98.92, worldRank: 649 },
        { number: 21612, name: "AZTROBOTS — EROS", location: "León", rookieYear: 2022, seasons: 4, totOpr: 94.61, worldRank: 728 },
        { number: 15600, name: "CERBOTICS — RED", location: "Torreón", rookieYear: 2018, seasons: 8, totOpr: 90.99, worldRank: 805 },
        { number: 30311, name: "Iron Lion", location: "Monterrey", rookieYear: 2025, seasons: 1, totOpr: 63.4, worldRank: 1686, self: true },
    ] as CohortTeam[],

    /**
     * Rookie cohort comparison (rookieYear 2025), two levels + an awards lens.
     * Both cohorts are provably exhaustive against FTCScout's registry:
     * Mexico = 31 rookies (region MX, 189 teams total, none truncated);
     * world = 1,319 rookies (US 846 + International 473, neither list truncated).
     * `oprRank` is 30311's position among that cohort by season tot OPR.
     */
    rookies: {
        national: {
            total: 31,
            oprRank: 5,
            // 30311 is the sole Mexican rookie with an Inspire Award / Winning Alliance.
            awardsRank: 1,
            rows: [
                { number: 32867, name: "Adelitas STEAMex", place: "Chihuahua", totOpr: 77.22, worldRank: 1170, awards: [{ key: "award", name: "Reach", place: 1 }, { key: "award", name: "Connect", place: 1 }] },
                { number: 30670, name: "Botbusters Grey", place: "Monterrey", totOpr: 71.97, worldRank: 1356, awards: [{ key: "award", name: "Design", place: 1 }, { key: "award", name: "Innovate", place: 1 }] },
                { number: 31546, name: "Next Gen Rhinos", place: "Benito Juárez", totOpr: 68.07, worldRank: 1483, awards: [{ key: "award", name: "Finalist", place: 1 }, { key: "award", name: "Innovate", place: 1 }] },
                { number: 31983, name: "Lobos Negros Delta", place: "CDMX", totOpr: 65.48, worldRank: 1578, awards: [] },
                { number: 30311, name: "Iron Lion", place: "Monterrey", totOpr: 63.40, worldRank: 1686, awards: [{ key: "award", name: "Inspire", place: 1 }, { key: "winningAlliance" }, { key: "award", name: "Think", place: 1 }, { key: "award", name: "Reach", place: 2 }], self: true },
                { number: 30813, name: "ThundeRoar", place: "Monterrey", totOpr: 45.66, worldRank: 2774, awards: [{ key: "award", name: "Connect", place: 1 }, { key: "award", name: "Sustain", place: 2 }] },
                { number: 30767, name: "MinerZ Jr", place: "Guadalupe, ZAC", totOpr: 39.75, worldRank: 3382, awards: [{ key: "award", name: "Design", place: 1 }] },
                { number: 32943, name: "PrepaTec Purple Spark", place: "Saltillo", totOpr: 34.43, worldRank: 4053, awards: [{ key: "award", name: "Innovate", place: 2 }] },
            ] as RookieRow[],
        },
        international: {
            total: 1317,
            oprRank: 178,
            oprTopPct: 13.5,      // top % of world rookies by OPR
            inspireCohort: 36,    // rookies worldwide that won an Inspire (1st) this season
            inspireTotal: 1319,
            inspireTopPct: 2.7,   // top % → 36 / 1319
            mexicoIsSoleInspire: true,
            /**
             * Country breakdown of the 36 Inspire-winning rookies worldwide.
             * `top` are the countries with 2+ winners; `others` had exactly 1
             * each. Rendered by the consumer (list-joining is UI logic, not
             * prose) via "TeamReport.country" + "TeamReport.inspireCountriesGlue".
             */
            inspireCountries: {
                top: [
                    { code: "US" as CountryCode, count: 19 },
                    { code: "KZ" as CountryCode, count: 5 },
                    { code: "GB" as CountryCode, count: 4 },
                ],
                others: ["MX", "TW", "NL", "CZ", "FR", "AU", "KG", "DE", "LY"] as CountryCode[],
            },
            rows: [
                { number: 30030, name: "Exodus", place: "US" as CountryCode, totOpr: 236.52, worldRank: 6, awards: [{ key: "multiplier", name: "Winner", count: 5 }, { key: "bare", name: "Innovate" }] },
                { number: 30784, name: "ITKAN Lunar Jr", place: "US" as CountryCode, totOpr: 205.25, worldRank: 24, awards: [{ key: "award", name: "Winner", place: 2 }, { key: "award", name: "Innovate", place: 1 }] },
                { number: 30435, name: "Klutch Robotics", place: "US" as CountryCode, totOpr: 202.88, worldRank: 27, awards: [{ key: "bare", name: "Winner" }, { key: "bare", name: "Innovate" }] },
                { number: 33033, name: "TGJ", place: "KZ" as CountryCode, totOpr: 183.08, worldRank: 55, awards: [{ key: "multiplier", name: "Winner", count: 2 }, { key: "bare", name: "Reach" }] },
                { number: 32896, name: "Droid Squad", place: "US" as CountryCode, totOpr: 179.49, worldRank: 66, awards: [{ key: "award", name: "Winner", place: 1 }, { key: "award", name: "Design", place: 1 }] },
                { number: 31596, name: "Absolute Zero", place: "CN" as CountryCode, totOpr: 175.72, worldRank: 73, awards: [{ key: "award", name: "Innovate", place: 2 }, { key: "award", name: "Finalist", place: 2 }] },
                { number: 30579, name: "PUNISHERS", place: "US" as CountryCode, totOpr: 165.49, worldRank: 102, awards: [{ key: "award", name: "Inspire", place: 1 }, { key: "multiplier", name: "Winner", count: 3 }, { key: "award", name: "Think", place: 1 }] },
                { number: 32602, name: "We Don't Byte", place: "TW" as CountryCode, totOpr: 162.34, worldRank: 113, awards: [{ key: "award", name: "Inspire", place: 3 }] },
                { number: 32728, name: "Celestial", place: "KZ" as CountryCode, totOpr: 160.53, worldRank: 118, awards: [{ key: "award", name: "Inspire", place: 1 }, { key: "award", name: "Control", place: 1 }] },
                { number: 34241, name: "NazarX", place: "UZ" as CountryCode, totOpr: 157.19, worldRank: 136, awards: [] },
            ] as RookieRow[],
            self: { number: 30311, name: "Iron Lion", place: "MX" as CountryCode, totOpr: 63.40, worldRank: 1686, awards: [{ key: "award", name: "Inspire", place: 1 }, { key: "winningAlliance" }, { key: "award", name: "Think", place: 1 }, { key: "award", name: "Reach", place: 2 }], self: true } as RookieRow,
        },
    },

    /** World top 5 — aspirational reference for where the program can grow. */
    worldTop5: [
        { number: 20265, name: "Heart of RoBots", country: "RO" as CountryCode, totOpr: 267.09, worldRank: 1 },
        { number: 9879, name: "Root Negative One", country: "US" as CountryCode, totOpr: 253.08, worldRank: 2 },
        { number: 23521, name: "DeSoto Technix", country: "US" as CountryCode, totOpr: 251.64, worldRank: 3 },
        { number: 12808, name: "RevAmped Robotics", country: "US" as CountryCode, totOpr: 250.88, worldRank: 4 },
        { number: 14270, name: "Quantum Robotics", country: "RO" as CountryCode, totOpr: 238.1, worldRank: 5 },
    ],

    /** Sponsor-deck headlines — key + params, rendered via "TeamReport.takeaway". */
    takeaways: [
        { key: "rookieVeteranTier", seasonOpr: 63.4 },
        { key: "worldStanding", totTopPct: 19, activeTeams: "8,866", worldRank: "1,686", teleopEndgameTopPct: "13-14" },
        { key: "inspireDebut" },
        { key: "champRecord", record: "5-0", fieldSize: 52, rank: 5 },
        { key: "premierPick", fieldSize: 68, captain: 31546, reachPlace: 2 },
        { key: "growthArc", oprArc: "50.9 → 68.9 → 63.4 → 80.8" },
        { key: "soleNationalInspire", nationalTotal: 31, otherCount: 30 },
        { key: "soleWorldInspire", worldPct: 3, inspireCohort: 36, inspireTotal: "1,319" },
    ] as Takeaway[],

    /** Learnings — key + params, rendered via "TeamReport.learning". */
    learnings: [
        { key: "autoTeleopLevers", autoTopPct: 26, teleopEndgameTopPct: "13-14", autoSlope: 1.9, teleopNoise: 5.1 },
        { key: "publicNumberLag", seasonOpr: 63.4, gap: 15.2, currentForm: 78.6 },
        { key: "nextTier", veteranFloor: 91, veteranCeiling: 139, eliteTeamNumber: 12887, eliteWorldRank: 224 },
        { key: "rpAndSeed", correct: 9, total: 10 },
    ] as Learning[],

    sources: [
        { key: "teamProfile", teamNumber: 30311, url: "https://ftcscout.org/teams/30311" },
        { key: "graphqlApi", url: "https://api.ftcscout.org/graphql" },
        { key: "events", codes: "MXSTQ · MXMOQ · MXCMP · FPEMX", season: 2025, url: "https://ftcscout.org/events/2025/FPEMX" },
    ] as SourceRef[],
} as const;

export type Team30311Report = typeof TEAM_30311_DECODE;
