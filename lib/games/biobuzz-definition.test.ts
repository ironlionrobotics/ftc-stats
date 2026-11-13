import { describe, it, expect } from "vitest";
import { z } from "zod";
import en from "@/messages/en.json";
import es from "@/messages/es.json";
import { FTC_BIOBUZZ_2026 } from "./ftc-biobuzz-2026";
import { FTC_DECODE_2025 } from "./ftc-decode-2025";
import { gameDefinitionFor, ALL_GAME_DEFINITIONS } from "./registry";
import { seasonRulesFor, rpThresholdsFor, RP_THRESHOLD_OVERRIDES } from "./season-rules";
import { zodSchemaFromDefinition } from "./zod-from-definition";
import { buildEntryGameFields } from "./build-entry";
import { inputsFromEntry, inputsFromConsensus } from "./score-inputs";
import { totalOf, type GameDefinition } from "@/types/game-definition";
import { fieldMapFromDefinition, fieldsFor, type FieldConsensus } from "@/lib/scouting-aggregation";

const scoreOf = (def: GameDefinition, entry: Record<string, unknown>) =>
    def.score!(inputsFromEntry(entry));

describe("FTC_BIOBUZZ_2026 scoring (Competition Manual TU09, Table 10-2)", () => {
    it("auto: LEAVE 3 + AUTO PARK 5 + 1 TIP 20 = 28", () => {
        expect(scoreOf(FTC_BIOBUZZ_2026, { autoLeave: true, autoPark: true, autoHiveTips: 1 }))
            .toEqual({ auto: 28, teleop: 0, endgame: 0 });
    });

    it("teleop: TIPs 20 each + GARDEN 1 each", () => {
        expect(scoreOf(FTC_BIOBUZZ_2026, { teleopHiveTips: 2, teleopGardenElements: 3 }).teleop).toBe(43);
    });

    it("last minute: FLOWER 2 each + bottom NECTAR 5 + final PARK 5", () => {
        expect(scoreOf(FTC_BIOBUZZ_2026, { flowerElementsPlaced: 4, bottomNectarBonuses: 1, teleopPark: true }).endgame)
            .toBe(18);
    });

    it("launches, misses, fouls and subjective fields never add points", () => {
        const p = scoreOf(FTC_BIOBUZZ_2026, {
            autoCellLaunches: 9, autoCellMisses: 4, teleopCellLaunches: 30, teleopCellMisses: 10,
            minorFouls: 3, majorFouls: 1, driverSkill: 5, flowersClaimed: 2,
        });
        expect(totalOf(p)).toBe(0);
    });

    it("scores a consensus the same way as a raw entry", () => {
        const fields = {
            autoLeave: { kind: "categorical", value: true },
            autoHiveTips: { kind: "numeric", value: 1 },
            teleopHiveTips: { kind: "numeric", value: 2 },
            teleopPark: { kind: "categorical", value: true },
        } as unknown as Record<string, FieldConsensus>;
        expect(FTC_BIOBUZZ_2026.score!(inputsFromConsensus(fields)))
            .toEqual(scoreOf(FTC_BIOBUZZ_2026, { autoLeave: true, autoHiveTips: 1, teleopHiveTips: 2, teleopPark: true }));
    });
});

describe("FTC_BIOBUZZ_2026 form engine", () => {
    it("generated schema accepts a representative observation and builds the entry", () => {
        const schema = zodSchemaFromDefinition(FTC_BIOBUZZ_2026).extend({ matchNumber: z.coerce.number().int().positive() });
        const parsed = schema.parse({
            matchNumber: "4", autoLeave: true, autoCellLaunches: "3", autoCellMisses: "1", autoHiveTips: "1",
            autoPark: true, teleopCellLaunches: "12", teleopCellMisses: "4", teleopHiveTips: "1",
            teleopGardenElements: "2", driverSkill: "4", flowerElementsPlaced: "0", flowersClaimed: "0",
            bottomNectarBonuses: "0", teleopPark: false, defense: "Some", robotIssue: "None",
            minorFouls: "0", majorFouls: "0", notes: "",
        });
        const entry = buildEntryGameFields(FTC_BIOBUZZ_2026, parsed);
        expect(entry.autoParked).toBe(true);
        expect(entry.autoHiveTips).toBe(1);
        expect(entry).not.toHaveProperty("matchNumber");
    });

    it("does not capture Ranking Points by hand (they come from /scores)", () => {
        const ids = Object.keys(fieldMapFromDefinition(FTC_BIOBUZZ_2026));
        expect(ids.some(id => /RP$/i.test(id))).toBe(false);
    });

    it("persists schema version 3", () => {
        expect(FTC_BIOBUZZ_2026.schemaVersion).toBe(3);
    });
});

describe("gameDefinitionFor (season routing)", () => {
    it("routes FTC by season", () => {
        expect(gameDefinitionFor("FTC", 2025)).toBe(FTC_DECODE_2025);
        expect(gameDefinitionFor("FTC", 2026)).toBe(FTC_BIOBUZZ_2026);
        expect(gameDefinitionFor("FTC", 2027)).toBe(FTC_BIOBUZZ_2026);
    });
    it("falls back to the oldest FTC game for a malformed season", () => {
        expect(gameDefinitionFor("FTC", NaN)).toBe(FTC_DECODE_2025);
        expect(gameDefinitionFor("FTC", undefined as unknown as number)).toBe(FTC_DECODE_2025);
    });
    it("has no definition for FRC (hand-written form)", () => {
        expect(gameDefinitionFor("FRC", 2026)).toBeUndefined();
    });
});

describe("aggregation field map derived from the definition", () => {
    it("DECODE derived map equals the former literal FTC map (no consensus drift)", () => {
        // Verbatim copy of the literal map removed in the BIOBUZZ migration.
        const formerLiteral = {
            autoParked: "categorical", autoLaunchLine: "categorical", autoPurpleArtifacts: "numeric",
            autoGreenArtifacts: "numeric", autoMotifStarted: "categorical", movementRP: "categorical",
            autoPoints: "numeric", teleopPurpleArtifacts: "numeric", teleopGreenArtifacts: "numeric",
            patternsCompleted: "numeric", gatesUsed: "categorical", driverSkill: "subjective",
            defenseRating: "subjective", reliability: "subjective", wouldPick: "categorical",
            endgameBaseParking: "categorical", dualParking: "categorical", motifCompleted: "categorical",
            goalRP: "categorical", patternRP: "categorical",
        };
        const derived = Object.fromEntries(
            Object.entries(fieldsFor("FTC", 2025)).map(([k, v]) => [k, v.kind]),
        );
        expect(derived).toEqual(formerLiteral);
    });

    it("BIOBUZZ map covers every scored field", () => {
        const map = fieldsFor("FTC", 2026);
        for (const id of ["autoHiveTips", "teleopHiveTips", "teleopGardenElements", "flowerElementsPlaced", "bottomNectarBonuses"]) {
            expect(map[id]?.kind).toBe("numeric");
        }
        for (const id of ["autoLeave", "autoPark", "teleopPark", "autoParked"]) {
            expect(map[id]?.kind).toBe("categorical");
        }
        expect(map.driverSkill?.kind).toBe("subjective");
    });
});

describe("season rules", () => {
    it("BIOBUZZ major foul is 20, DECODE stays 15", () => {
        expect(seasonRulesFor(2026).fouls).toEqual({ minor: 5, major: 20 });
        expect(seasonRulesFor(2025).fouls).toEqual({ minor: 5, major: 15 });
    });
    it("BIOBUZZ default RP thresholds (Table 10-3)", () => {
        expect(rpThresholdsFor(2026)).toEqual({ swarm: 16, pollinator1: 4, pollinator2: 7 });
    });
    it("per-event overrides win over defaults", () => {
        RP_THRESHOLD_OVERRIDES["2026:TESTEV"] = { swarm: 18 };
        try {
            expect(rpThresholdsFor(2026, "testev")).toEqual({ swarm: 18, pollinator1: 4, pollinator2: 7 });
        } finally {
            delete RP_THRESHOLD_OVERRIDES["2026:TESTEV"];
        }
    });
});

describe("i18n: every definition label key exists in en and es", () => {
    const has = (catalog: Record<string, unknown>, path: string) =>
        path.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], catalog) !== undefined;

    for (const def of ALL_GAME_DEFINITIONS) {
        it(def.id, () => {
            const keys: string[] = [];
            for (const s of def.sections) {
                keys.push(s.label);
                for (const f of s.fields) {
                    keys.push(f.label);
                    if (f.helpText) keys.push(f.helpText);
                    if ((f.kind === "text" || f.kind === "textarea") && f.placeholder) keys.push(f.placeholder);
                    if (f.kind === "enum") keys.push(...f.options.map(o => o.label));
                }
            }
            for (const catalog of [en.Games, es.Games]) {
                const missing = keys.filter(k => !has(catalog as Record<string, unknown>, k));
                expect(missing).toEqual([]);
            }
        });
    }

    it("every RP target label exists", () => {
        for (const season of [2025, 2026]) {
            for (const t of seasonRulesFor(season).rpTargets) {
                expect(has(en.Games as Record<string, unknown>, t.labelKey)).toBe(true);
                expect(has(es.Games as Record<string, unknown>, t.labelKey)).toBe(true);
            }
        }
    });
});

describe("DECODE score() parity", () => {
    // Verbatim copy of the formula formerly duplicated in lib/projections.ts
    // and lib/ground-truth-validation.ts.
    function legacy(m: Record<string, unknown>) {
        const n = (k: string) => (m[k] as number | undefined) ?? 0;
        const auto = n("autoPurpleArtifacts") * 3 + n("autoGreenArtifacts") * 3 + n("autoPoints");
        const teleop = n("teleopPurpleArtifacts") * 2 + n("teleopGreenArtifacts") * 2 + n("patternsCompleted") * 10;
        const park = m.endgameBaseParking === "Full" ? 10 : m.endgameBaseParking === "Partial" ? 5 : 0;
        return { auto, teleop, endgame: (m.dualParking ? 20 : 0) + park };
    }

    it("matches the legacy formula on 2000 pseudo-random entries", () => {
        let seed = 42;
        const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
        const maybe = (v: unknown) => (rnd() < 0.2 ? undefined : v);
        for (let i = 0; i < 2000; i++) {
            const m = {
                autoPurpleArtifacts: maybe(Math.floor(rnd() * 10)),
                autoGreenArtifacts: maybe(Math.floor(rnd() * 10)),
                autoPoints: maybe(rnd() < 0.5 ? 0 : Math.floor(rnd() * 5)),
                teleopPurpleArtifacts: maybe(Math.floor(rnd() * 40)),
                teleopGreenArtifacts: maybe(Math.floor(rnd() * 40)),
                patternsCompleted: maybe(Math.floor(rnd() * 5)),
                endgameBaseParking: maybe(["None", "Partial", "Full"][Math.floor(rnd() * 3)]),
                dualParking: maybe(rnd() < 0.5),
            };
            expect(scoreOf(FTC_DECODE_2025, m)).toEqual(legacy(m));
        }
    });
});

describe("season game names", () => {
    it("names every season the selector offers, including the current one", async () => {
        const { seasonGameName } = await import("./season-names");
        expect(seasonGameName(2026)).toBe("Biobuzz");
        expect(seasonGameName(2025)).toBe("Decode");
        for (const s of [2022, 2023, 2024, 2025, 2026]) expect(seasonGameName(s)).toBeTruthy();
        expect(seasonGameName(1999)).toBeUndefined();
    });
});
