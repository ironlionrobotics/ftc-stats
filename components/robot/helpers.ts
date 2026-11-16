import type { Finding, RobotLogDoc } from "@/types/robot-log";

/** Findings that put a match at risk (reset or battery), vs. maintenance hints. */
export function isCritical(f: Finding): boolean {
    return f.code === "brownout" || f.code === "lowVoltage";
}

/** `encoderSilent` is a hint (the port may simply have no encoder): not counted in badges. */
export function countFindings(findings: Finding[] | undefined): { critical: number; warn: number } {
    const list = (findings ?? []).filter(f => f.code !== "encoderSilent");
    const critical = list.filter(isCritical).length;
    return { critical, warn: list.length - critical };
}

/** "1:05" for 65 s. */
export function formatDuration(s: number): string {
    const total = Math.max(0, Math.round(s));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export const round1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/** Numeric team number of an org id, or null for non-FTC ids ("FRC-…"). */
export function teamNumberOf(orgId: string): number | null {
    return /^\d{1,6}$/.test(orgId) ? Number(orgId) : null;
}

export function matchCode(m: NonNullable<RobotLogDoc["match"]>, levelLabel: string | undefined): string {
    return `${levelLabel ?? m.level}${m.number}`;
}

/** Same level labels as the kind badge; unknown levels fall back to the raw value. */
export const KNOWN_LEVELS = ["QUALIFICATION", "PLAYOFF"] as const;
export const isKnownLevel = (l: string): l is (typeof KNOWN_LEVELS)[number] => (KNOWN_LEVELS as readonly string[]).includes(l);
