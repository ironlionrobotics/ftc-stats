import { describe, it, expect } from "vitest";
import { profileToForm, formToProfile } from "./team-profile-service";
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
        const { updatedAt: _a, ...expected } = SAMPLE;
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
