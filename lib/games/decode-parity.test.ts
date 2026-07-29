import { describe, it, expect } from "vitest";
import { z } from "zod";
import { FTC_DECODE_2025 } from "./ftc-decode-2025";
import { zodSchemaFromDefinition } from "./zod-from-definition";
import { buildEntryGameFields } from "./build-entry";
import { ftcDecodeFormSchema, type FTCDecodeFormValues } from "@/lib/schemas/scouting";

/**
 * Parity proof: the declarative DECODE path (definition + generated schema +
 * buildEntryGameFields) must produce the SAME persisted entry as the retired
 * hand-written FTC_DecodeForm. Federation, aggregation and reporting all key
 * off these exact field ids, so drift here is silent data corruption.
 */

// The generated schema plus the universal matchNumber the wrapper adds.
const generatedSchema = zodSchemaFromDefinition(FTC_DECODE_2025).extend({
    matchNumber: z.coerce.number().int().positive(),
});

// A representative, in-range observation as strings (what HTML inputs yield).
const RAW_INPUT: Record<string, unknown> = {
    matchNumber: "12",
    autoLaunchLine: true,
    autoMotifStarted: false,
    autoPurpleArtifacts: "3",
    autoGreenArtifacts: "2",
    movementRP: true,
    teleopPurpleArtifacts: "9",
    teleopGreenArtifacts: "7",
    patternsCompleted: "2",
    gatesUsed: true,
    driverSkill: "4",
    endgameBaseParking: "Full",
    dualParking: true,
    motifCompleted: false,
    goalRP: true,
    patternRP: false,
    notes: "defensa agresiva",
};

/**
 * The exact game-specific fields FTC_DecodeForm.onSubmit built (base
 * attribution fields excluded). Hand-transcribed from the component so the
 * test breaks if either side drifts.
 */
function handWrittenGameFields(values: FTCDecodeFormValues): Record<string, unknown> {
    return {
        autoLaunchLine: values.autoLaunchLine,
        autoPurpleArtifacts: values.autoPurpleArtifacts,
        autoGreenArtifacts: values.autoGreenArtifacts,
        autoMotifStarted: values.autoMotifStarted,
        movementRP: values.movementRP,
        autoParked: values.endgameBaseParking !== "None",
        autoPoints: 0,
        teleopPurpleArtifacts: values.teleopPurpleArtifacts,
        teleopGreenArtifacts: values.teleopGreenArtifacts,
        patternsCompleted: values.patternsCompleted,
        gatesUsed: values.gatesUsed,
        driverSkill: values.driverSkill,
        endgameBaseParking: values.endgameBaseParking,
        dualParking: values.dualParking,
        motifCompleted: values.motifCompleted,
        goalRP: values.goalRP,
        patternRP: values.patternRP,
        notes: values.notes,
    };
}

describe("DECODE declarative parity", () => {
    it("generated schema has the same fields as the hand-written schema", () => {
        const generatedKeys = Object.keys(generatedSchema.shape).sort();
        const handKeys = Object.keys(ftcDecodeFormSchema.shape).sort();
        expect(generatedKeys).toEqual(handKeys);
    });

    it("both schemas parse an in-range observation to the same values", () => {
        const fromGenerated = generatedSchema.parse(RAW_INPUT);
        const fromHand = ftcDecodeFormSchema.parse(RAW_INPUT);
        expect(fromGenerated).toEqual(fromHand);
    });

    it("produces the exact same game-specific entry fields as FTC_DecodeForm", () => {
        const values = ftcDecodeFormSchema.parse(RAW_INPUT);
        const generated = buildEntryGameFields(FTC_DECODE_2025, values);
        const expected = handWrittenGameFields(values);
        expect(generated).toEqual(expected);
    });

    it("derives autoParked from endgameBaseParking (true unless None)", () => {
        expect(FTC_DECODE_2025.toEntry?.({ endgameBaseParking: "None" })).toEqual({
            autoParked: false,
            autoPoints: 0,
        });
        expect(FTC_DECODE_2025.toEntry?.({ endgameBaseParking: "Partial" })).toEqual({
            autoParked: true,
            autoPoints: 0,
        });
        expect(FTC_DECODE_2025.toEntry?.({ endgameBaseParking: "Full" })).toEqual({
            autoParked: true,
            autoPoints: 0,
        });
    });

    it("definition bounds are stricter than the shared counter (intentional)", () => {
        // The shared `counter` primitive is min0/max999; the definition caps
        // autoPurpleArtifacts at 50. Real inputs are unaffected, but the
        // declarative path rejects absurd values the old form accepted.
        expect(() => ftcDecodeFormSchema.parse({ ...RAW_INPUT, autoPurpleArtifacts: "100" })).not.toThrow();
        expect(() => generatedSchema.parse({ ...RAW_INPUT, autoPurpleArtifacts: "100" })).toThrow();
    });
});
