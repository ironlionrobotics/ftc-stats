import { describe, it, expect } from "vitest";
import { zodSchemaFromDefinition } from "./zod-from-definition";
import type { GameDefinition } from "@/types/game-definition";

const SAMPLE: GameDefinition = {
    id: "test-game",
    label: "Test Game",
    program: "FTC",
    season: 2025,
    sections: [
        {
            id: "auto",
            label: "Auto",
            fields: [
                { id: "leave", kind: "boolean", label: "Left start" },
                { id: "score", kind: "counter", label: "Score", min: 0, max: 50 },
                { id: "skill", kind: "stars", label: "Driver", max: 5 },
            ],
        },
        {
            id: "endgame",
            label: "Endgame",
            fields: [
                {
                    id: "climb",
                    kind: "enum",
                    label: "Climb",
                    options: [
                        { value: "None", label: "None" },
                        { value: "Park", label: "Park" },
                        { value: "Climb", label: "Climb" },
                    ],
                },
                { id: "notes", kind: "textarea", label: "Notes", maxLength: 500 },
            ],
        },
    ],
};

describe("zodSchemaFromDefinition", () => {
    it("parses a fully-populated valid form", () => {
        const schema = zodSchemaFromDefinition(SAMPLE);
        const parsed = schema.parse({
            leave: true,
            score: 10,
            skill: 4,
            climb: "Park",
            notes: "good run",
        });
        expect(parsed).toEqual({ leave: true, score: 10, skill: 4, climb: "Park", notes: "good run" });
    });

    it("applies defaults when fields are missing", () => {
        const schema = zodSchemaFromDefinition(SAMPLE);
        // All field defaults: leave=false, score=0, skill=3, climb="None", notes=""
        const parsed = schema.parse({});
        expect(parsed).toEqual({ leave: false, score: 0, skill: 3, climb: "None", notes: "" });
    });

    it("coerces stringified counters from HTML inputs", () => {
        const schema = zodSchemaFromDefinition(SAMPLE);
        const parsed = schema.parse({ score: "12", skill: "5" });
        expect(parsed.score).toBe(12);
        expect(parsed.skill).toBe(5);
    });

    it("rejects counter values above max", () => {
        const schema = zodSchemaFromDefinition(SAMPLE);
        expect(() => schema.parse({ score: 999 })).toThrow();
    });

    it("rejects stars out of range", () => {
        const schema = zodSchemaFromDefinition(SAMPLE);
        expect(() => schema.parse({ skill: 7 })).toThrow();
    });

    it("rejects enum values outside the allowed set", () => {
        const schema = zodSchemaFromDefinition(SAMPLE);
        expect(() => schema.parse({ climb: "Teleport" })).toThrow();
    });

    it("rejects text over maxLength", () => {
        const schema = zodSchemaFromDefinition(SAMPLE);
        expect(() => schema.parse({ notes: "x".repeat(501) })).toThrow();
    });

    it("throws if an enum has no options (definition bug)", () => {
        expect(() =>
            zodSchemaFromDefinition({
                ...SAMPLE,
                sections: [
                    {
                        id: "bad",
                        label: "Bad",
                        fields: [{ id: "empty", kind: "enum", label: "Empty", options: [] }],
                    },
                ],
            }),
        ).toThrow();
    });
});
