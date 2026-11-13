import { describe, it, expect } from "vitest";
import {
    allianceScoreComponents,
    extractObservations,
    extractTrainingSet,
    inferTeamRpProbability,
    RP_FEATURE_COUNT,
    rpModelCacheKey,
    withRpObservations,
    type RpLabeledMatch,
} from "./rp-inference";
import { trainLogistic } from "./logistic-regression";
import { flattenMatchScores } from "./score-breakdown";
import scores2026 from "@/lib/__fixtures__/scores-2026-AUBRQ1-qual.json";
import matches2026 from "@/lib/__fixtures__/matches-2026-AUBRQ1-qual.json";
import type { FTCMatch } from "@/types/scouting";

const rp = (movement: boolean, goal = false, pattern = false) => ({ rp: { movement, goal, pattern } });

function ftcMatch(overrides: Partial<RpLabeledMatch> = {}): RpLabeledMatch {
    return {
        description: "Q1",
        matchNumber: 1,
        tournamentLevel: "QUALIFICATION",
        scoreRedFinal: 100,
        scoreBlueFinal: 80,
        scoreRedAuto: 20,
        scoreBlueAuto: 15,
        scoreRedFoul: 0,
        scoreBlueFoul: 0,
        redRp: rp(true, false),
        blueRp: rp(false, true),
        teams: [],
        postResultTime: new Date().toISOString(),
        ...overrides,
    } as RpLabeledMatch;
}

describe("extractObservations", () => {
    it("returns 2 observations (red + blue) for a played match", () => {
        const obs = extractObservations(ftcMatch(), "movement");
        expect(obs).toHaveLength(2);
        // Red won movement RP, blue didn't
        expect(obs[0].label).toBe(1);
        expect(obs[1].label).toBe(0);
        // Features have expected length
        for (const o of obs) {
            expect(o.features).toHaveLength(RP_FEATURE_COUNT);
        }
    });

    it("returns empty for unplayed matches", () => {
        const obs = extractObservations(
            ftcMatch({ scoreRedFinal: 0, scoreBlueFinal: 0, postResultTime: undefined }),
            "movement",
        );
        expect(obs).toHaveLength(0);
    });

    it("labels come from the official breakdown observation per target", () => {
        const m = ftcMatch({ redRp: rp(true, false, true), blueRp: rp(false, true, false) });
        expect(extractObservations(m, "movement").map(o => o.label)).toEqual([1, 0]);
        expect(extractObservations(m, "goal").map(o => o.label)).toEqual([0, 1]);
        expect(extractObservations(m, "pattern").map(o => o.label)).toEqual([1, 0]);
    });

    it("skips alliances without a breakdown instead of labeling them 0", () => {
        // REGRESSION: labels used to come from /matches scoreXRp1/Rp2, which the
        // API never returns → every label was 0 and no model ever trained.
        const m = ftcMatch({ redRp: undefined, blueRp: rp(true) });
        const obs = extractObservations(m, "movement");
        expect(obs).toHaveLength(1);
        expect(obs[0].label).toBe(1);
        expect(extractObservations(ftcMatch({ redRp: undefined, blueRp: undefined }), "movement")).toEqual([]);
    });

    it("backs out tele from total - auto - foul when scoreTeleOp is absent", () => {
        // total 100, auto 20, foul 5 → tele = 75
        const obs = extractObservations(
            ftcMatch({ scoreRedFinal: 100, scoreRedAuto: 20, scoreBlueFoul: 5 }),
            "movement",
        );
        // Feature [1] is tele
        expect(obs[0].features[1]).toBe(75);
    });
});

describe("allianceScoreComponents — train-serve parity (M8 regression)", () => {
    it("subtracts endgame from the tele fallback when scoreEndgame is present", () => {
        // REGRESSION: the old training-side fallback computed
        // tele = final − auto − foul (WITHOUT subtracting endgame), so when
        // the API broke out scoreRedEndgame but not scoreRedTeleOp, endgame
        // was double-counted (inside tele AND as its own feature) while
        // inference-side profiles subtracted it — train-serve skew.
        const match = ftcMatch({
            scoreRedFinal: 100,
            scoreRedAuto: 20,
            scoreBlueFoul: 5,
            ...( { scoreRedEndgame: 25 } as object ),
        });
        const red = allianceScoreComponents(match, "red");
        expect(red.auto).toBe(20);
        expect(red.end).toBe(25);
        expect(red.tele).toBe(50); // 100 − 20 − 5 − 25, NOT 75
        // Invariant: components + foul reconstruct the final score.
        expect(red.auto + red.tele + red.end + 5).toBe(100);
    });

    it("passes through scoreTeleOp/scoreEndgame verbatim when both are present", () => {
        const match = ftcMatch({
            scoreRedFinal: 100,
            scoreRedAuto: 20,
            ...( { scoreRedTeleOp: 55, scoreRedEndgame: 25 } as object ),
        });
        const red = allianceScoreComponents(match, "red");
        expect(red).toEqual({ auto: 20, tele: 55, end: 25 });
    });

    it("treats endgame as 0 when the API provides no component breakdown", () => {
        const match = ftcMatch({ scoreBlueFinal: 80, scoreBlueAuto: 15, scoreBlueFoul: 0 });
        const blue = allianceScoreComponents(match, "blue");
        expect(blue).toEqual({ auto: 15, tele: 65, end: 0 });
    });

    it("clamps the tele fallback at 0 for foul-heavy degenerate scores", () => {
        const match = ftcMatch({ scoreRedFinal: 10, scoreRedAuto: 5, scoreBlueFoul: 20 });
        expect(allianceScoreComponents(match, "red").tele).toBe(0);
    });

    it("training rows equal a profile built from the same decomposition", () => {
        // The property that matters: the exact vector the model trains on is
        // the exact vector inference builds (analytics.ts uses this same
        // function). One match ⇒ single-match averages equal the raw
        // components.
        const match = ftcMatch({
            scoreRedFinal: 100,
            scoreRedAuto: 20,
            scoreBlueFoul: 5,
            ...( { scoreRedEndgame: 25 } as object ),
        });
        const trainingRow = extractObservations(match, "movement")[0].features;
        const c = allianceScoreComponents(match, "red");
        const servedVector = [c.auto, c.tele, c.end]; // what inferTeamRpProbability receives
        expect(trainingRow).toEqual(servedVector);
    });
});

describe("extractTrainingSet", () => {
    it("aggregates observations across many matches", () => {
        const matches = [
            ftcMatch({ matchNumber: 1, redRp: rp(true) }),
            ftcMatch({ matchNumber: 2, redRp: rp(false) }),
            ftcMatch({ matchNumber: 3, redRp: rp(true) }),
        ];
        const { features, labels } = extractTrainingSet(matches, "movement");
        expect(features).toHaveLength(6); // 3 matches × 2 alliances
        expect(labels).toHaveLength(6);
    });
});

describe("inferTeamRpProbability — fallback path", () => {
    it("returns the empirical rate for the target when no model is provided", () => {
        const profile = { avgAuto: 20, avgTele: 50, avgEnd: 10, heuristic: { movement: 0.6, pattern: 0.3 } };
        expect(inferTeamRpProbability(profile, "movement", null)).toBe(0.6);
        // No more 0.7 dampening: pattern has its own official label.
        expect(inferTeamRpProbability(profile, "pattern", null)).toBe(0.3);
    });

    it("returns 0 when no heuristic is provided either", () => {
        const p = inferTeamRpProbability(
            { avgAuto: 20, avgTele: 50, avgEnd: 10 },
            "movement",
            null,
        );
        expect(p).toBe(0);
    });
});

describe("inferTeamRpProbability — trained model path", () => {
    // Build a tiny labeled dataset where high tele → high RP probability.
    const trainingFeatures: number[][] = [];
    const trainingLabels: number[] = [];
    for (let i = 0; i < 40; i++) {
        const auto = 10;
        const tele = i * 3; // ranges 0..120
        const end = 5;
        trainingFeatures.push([auto, tele, end]);
        trainingLabels.push(tele > 60 ? 1 : 0);
    }
    const model = trainLogistic(trainingFeatures, trainingLabels, { maxIter: 2000 });

    it("returns high prob for teams above the learned threshold", () => {
        const pHigh = inferTeamRpProbability(
            { avgAuto: 10, avgTele: 100, avgEnd: 5 },
            "movement",
            model,
        );
        expect(pHigh).toBeGreaterThan(0.7);
    });

    it("returns low prob for teams below the learned threshold", () => {
        const pLow = inferTeamRpProbability(
            { avgAuto: 10, avgTele: 10, avgEnd: 5 },
            "movement",
            model,
        );
        expect(pLow).toBeLessThan(0.3);
    });

});

describe("rpModelCacheKey", () => {
    it("formats stably per (season, target) at the current feature version", () => {
        // v3 = labels from the official /scores breakdown. v2 never trained.
        expect(rpModelCacheKey(2025, "movement")).toBe("rp-model:2025:movement:v3");
        expect(rpModelCacheKey(2025, "goal")).toBe("rp-model:2025:goal:v3");
    });
});

describe("withRpObservations (real 2026 fixture)", () => {
    const labeled = withRpObservations(2026, matches2026.matches as unknown as FTCMatch[], flattenMatchScores(scores2026));

    it("attaches SWARM/POLLINATOR labels, tips and per-robot outcomes", () => {
        const q16 = labeled.find(m => m.matchNumber === 16)!;
        expect(q16.redRp?.rp).toEqual({ swarm: true, pollinator1: true, pollinator2: false }); // 6 tips ≥ 4
        expect(q16.redRp?.tips).toBe(6);
        expect(q16.redRp?.robots?.map(r => r.teamNumber)).toEqual([32874, 26000]);
        // Blue1 12993 was off the field in Q16.
        expect(q16.blueRp?.robots?.[0]).toEqual({ teamNumber: 12993, leave: false, autoPark: false, teleopPark: false });
    });

    it("leaves matches without a breakdown unlabeled", () => {
        const none = withRpObservations(2026, matches2026.matches as unknown as FTCMatch[], []);
        expect(none.every(m => m.redRp === undefined && m.blueRp === undefined)).toBe(true);
    });
});
