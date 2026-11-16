/**
 * Program-level capabilities (decision #118). Pure and client-safe: the event
 * views read what differs between FTC and FRC (alliance size, how many robots
 * play a match, finals format, route base) from here instead of hardcoding it.
 */
export type Program = "FTC" | "FRC";

export interface ProgramCapabilities {
    /** Robots per playoff alliance (captain + picks). */
    allianceSize: 2 | 3;
    /** Robots that actually play each playoff match. */
    fieldSize: 2 | 3;
    /** Finals format: 1 = single match, 3 = best of three. */
    finalsBestOf: 1 | 3;
    /** Route prefix of the event pages. */
    eventBase: "/event" | "/frc/event";
}

export function programCapabilities(p: Program): ProgramCapabilities {
    if (p === "FRC") return { allianceSize: 3, fieldSize: 3, finalsBestOf: 3, eventBase: "/frc/event" };
    return { allianceSize: 2, fieldSize: 2, finalsBestOf: 1, eventBase: "/event" };
}
