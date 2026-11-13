import { describe, it, expect } from "vitest";
import { clockAt, eventsBetween, totalMs, formatClock } from "./match-clock";
import { seasonRulesFor } from "@/lib/games/season-rules";

const T = seasonRulesFor(2026).matchTiming;

describe("match clock (#105)", () => {
    it("full match lasts AUTO + transition + TELEOP (2:38)", () => {
        expect(totalMs(T, "full")).toBe(158_000);
        expect(totalMs(T, "auto")).toBe(30_000);
        expect(totalMs(T, "teleop")).toBe(120_000);
    });

    it("shows the field clock: 2:30→2:00 in AUTO, 0:08 transition, 2:00→0:00 TELEOP", () => {
        expect(clockAt(T, "full", 0)).toMatchObject({ phase: "auto", display: 150 });
        expect(clockAt(T, "full", 29_999)).toMatchObject({ phase: "auto", display: 121 });
        expect(clockAt(T, "full", 30_000)).toMatchObject({ phase: "transition", display: 8 });
        expect(clockAt(T, "full", 38_000)).toMatchObject({ phase: "teleop", display: 120 });
        expect(clockAt(T, "full", 157_500)).toMatchObject({ phase: "teleop", display: 1 });
        expect(clockAt(T, "full", 158_000)).toMatchObject({ phase: "done", display: 0 });
        expect(clockAt(T, "auto", 0)).toMatchObject({ phase: "auto", display: 30 });
    });

    it("fires every event exactly once across frames", () => {
        const seen: string[] = [];
        let prev = -1;
        for (let now = 0; now <= 160_000; now += 16) {
            seen.push(...eventsBetween(T, "full", prev, now));
            prev = now;
        }
        expect(seen.filter(e => e === "countdown")).toHaveLength(7);
        expect(seen.filter(e => e !== "countdown")).toEqual(["start", "autoEnd", "teleopStart", "flowerUnlocked", "final20", "end"]);
    });

    it("teleop-only mode has no AUTO events", () => {
        const all = eventsBetween(T, "teleop", -1, 120_000);
        expect(all).toEqual(["start", "flowerUnlocked", "final20", "end"]);
    });

    it("formats m:ss", () => {
        expect(formatClock(150)).toBe("2:30");
        expect(formatClock(8)).toBe("0:08");
        expect(formatClock(-3)).toBe("0:00");
    });
});
