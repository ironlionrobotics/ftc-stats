import { describe, it, expect } from "vitest";
import { profileToForm, formToProfile, normalizeProfile } from "./team-profile-service";
import { emptyTeamProfile, type TeamProfile } from "@/types/team-profile";

const SAMPLE: TeamProfile = {
    teamNumber: 30311,
    season: 2025,
    capabilities: {
        canClimb: true,
        climbLevel: "Deep",
        scoresNear: true,
        scoresFar: false,
        groundIntake: true,
        sourceIntake: false,
        drivetrain: "Mecanum",
    },
    points: {
        auto: { low: 5, high: 12 },
        teleop: { low: 40, high: 90 },
        endgame: { low: 0, high: 20 },
    },
    descriptions: { robot: "fast", autonomous: "3 samples", strategy: "cycle" },
    photoUrl: "https://example.com/robot.png",
    updatedAt: null,
};

describe("team profile form mapping", () => {
    it("round-trips profile → form → profile without loss", () => {
        const back = formToProfile(profileToForm(SAMPLE), SAMPLE.teamNumber, SAMPLE.season);
        // updatedAt is not a form field; compare the rest.
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { updatedAt: _a, ...expected } = SAMPLE;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { updatedAt: _b, ...actual } = back;
        expect(actual).toEqual(expected);
    });

    it("empty profile maps to zeroed form values", () => {
        const form = profileToForm(emptyTeamProfile(30311, 2025));
        expect(form.autoLow).toBe(0);
        expect(form.canClimb).toBe(false);
        expect(form.drivetrain).toBe("");
    });
});

describe("normalizeProfile (#106 review)", () => {
    it("a partial doc (photo chosen before publishing) renders as a full profile", () => {
        const p = normalizeProfile({ teamNumber: 111, season: 2026, profileMediaId: "AAAAAAAAAAAAAAAAAAA1" } as Partial<TeamProfile>, 111, 2026);
        expect(p.capabilities.canClimb).toBe(false);
        expect(p.points.teleop).toEqual({ low: 0, high: 0 });
        expect(p.descriptions.robot).toBe("");
        expect(p.profileMediaId).toBe("AAAAAAAAAAAAAAAAAAA1");
        expect(() => profileToForm(p)).not.toThrow();
    });
});
