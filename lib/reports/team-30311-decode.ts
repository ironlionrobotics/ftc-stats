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
    awards: string[];
}

export interface SkillLine {
    key: "tot" | "auto" | "dc" | "eg";
    label: string;
    value: number;
    worldRank: number;
    /** 0-100, where 100 = best in the world. */
    percentile: number;
}

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
        { key: "tot", label: "OPR total", value: 63.4, worldRank: 1686, percentile: 81.0 },
        { key: "dc", label: "Teleoperado", value: 55.14, worldRank: 1232, percentile: 86.1 },
        { key: "eg", label: "Endgame", value: 10.28, worldRank: 1182, percentile: 86.7 },
        { key: "auto", label: "Autónomo", value: 15.07, worldRank: 2286, percentile: 74.2 },
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
            awards: ["Inspire Award — 1° lugar", "Ganadores (alianza 2)"],
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
            awards: ["Think Award — 1° lugar"],
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
            awards: ["Reach Award — 2° lugar", "Playoffs · pick alianza 5 (cap. 31546)"],
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

    /** Same-registration-cohort rookies (rookieYear 2025, numbers 30290-30440). */
    rookieCohort: {
        median: 16,
        beat: 6,
        of: 7,
        note: "de 7 rookies del mismo cohorte que sí compitieron (varios registrados nunca compitieron)",
        sample: [
            { number: 30380, name: "Bitflip", totOpr: 75.51, worldRank: 1229 },
            { number: 30311, name: "Iron Lion", totOpr: 63.4, worldRank: 1686, self: true },
            { number: 30420, name: "Bearbotics", totOpr: 60.12, worldRank: 1850 },
            { number: 30308, name: "Significant Figures", totOpr: 32.18, worldRank: 4338 },
            { number: 30350, name: "SHAM-ROCK-BOTICS GREEN", totOpr: 15.69, worldRank: 6886 },
            { number: 30400, name: "Merced Robotics", totOpr: 15.67, worldRank: 6890 },
            { number: 30315, name: "Cornerstone Cooperators", totOpr: 14.06, worldRank: 7143 },
            { number: 30325, name: "ASTRO-APOLLO", totOpr: 2.78, worldRank: 8207 },
        ] as CohortTeam[],
    },

    /** World top 5 — aspirational reference for where the program can grow. */
    worldTop5: [
        { number: 20265, name: "Heart of RoBots", country: "Rumania", totOpr: 267.09, worldRank: 1 },
        { number: 9879, name: "Root Negative One", country: "EE.UU.", totOpr: 253.08, worldRank: 2 },
        { number: 23521, name: "DeSoto Technix", country: "EE.UU.", totOpr: 251.64, worldRank: 3 },
        { number: 12808, name: "RevAmped Robotics", country: "EE.UU.", totOpr: 250.88, worldRank: 4 },
        { number: 14270, name: "Quantum Robotics", country: "Rumania", totOpr: 238.1, worldRank: 5 },
    ],

    takeaways: [
        "Temporada rookie, rendimiento de tier veterano: en su primer año de competencia, su OPR de temporada (63.4) ya supera a todos menos un rookie de su mismo cohorte y se acerca a los programas mexicanos de varios años.",
        "Top ~19% de los 8,866 equipos activos del mundo por OPR total (rank 1,686), y top 13-14% global en teleoperado y endgame.",
        "Ganaron el Inspire Award — el máximo honor de un evento FTC — en apenas su 2° competencia (Guadalajara, dic 2025), más la alianza ganadora ese mismo fin de semana.",
        "5-0 en clasificatorias del Mexico Championship (feb 2026, 52 equipos), rank 5.",
        "Seleccionados a playoffs en el México Premier Event (68 equipos, el evento clasificatorio continental del país) como pick del capitán 31546, más un Reach Award 2° lugar por vinculación comunitaria.",
        "Arco de mejora claro en OPR total: 50.9 → 68.9 → 63.4 → 80.8 a lo largo de sus cuatro eventos, con su mejor actuación en su evento más importante.",
    ],

    learnings: [
        {
            title: "El autónomo es la palanca de crecimiento",
            body: "Su punto relativamente más débil (top 26% mundial vs. top 13-14% en teleop/endgame). Subir el auto es donde más rank mundial pueden ganar por unidad de esfuerzo.",
        },
        {
            title: "El siguiente escalón es el tier veterano (91+ OPR)",
            body: "Los programas mexicanos consolidados corren 91-139 OPR. La referencia de élite es Devolt Phobos (12887), rank mundial 224 — el mapa de a dónde puede crecer el programa.",
        },
        {
            title: "Los RP bonus y el seed valen oro",
            body: "En doble eliminación, el top-4 de seed vale desproporcionadamente por los byes. Ser 'pickeable' para capitanes top (auto consistente y visible) superó dos lugares de ranking en FPEMX — el modelo PRIDE acertó 9 de 10 playoffs.",
        },
    ],

    sources: [
        { label: "FTCScout — perfil de equipo 30311", url: "https://ftcscout.org/teams/30311" },
        { label: "FTCScout GraphQL API (datos cuantitativos, consultados en vivo)", url: "https://api.ftcscout.org/graphql" },
        { label: "FTCScout — eventos MXSTQ · MXMOQ · MXCMP · FPEMX (temporada 2025)", url: "https://ftcscout.org/events/2025/FPEMX" },
    ],
} as const;

export type Team30311Report = typeof TEAM_30311_DECODE;
