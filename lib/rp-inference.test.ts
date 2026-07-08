import { describe, it, expect } from "vitest";
import {
    allianceScoreComponents,
    extractObservations,
    extractTrainingSet,
    inferTeamRpProbability,
    RP_FEATURE_COUNT,
    rpModelCacheKey,
} from "./rp-inference";
import { trainLogistic } from "./logistic-regression";
import type { FTCMatch } from "@/types/scouting";

function ftcMatch(overrides: Partial<FTCMatch> = {}): FTCMatch {
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
        scoreRedRp1: 1,
        scoreRedRp2: 0,
        scoreBlueRp1: 0,
        scoreBlueRp2: 1,
        teams: [],
        postResultTime: new Date().toISOString(),
        ...overrides,
    } as FTCMatch;
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

    it("maps movement target to scoreRpX_1", () => {
        const obs = extractObservations(ftcMatch({ scoreRedRp1: 1, scoreBlueRp1: 0 }), "movement");
        expect(obs[0].label).toBe(1);
        expect(obs[1].label).toBe(0);
    });

    it("maps artifact target to scoreRpX_2", () => {
        const obs = extractObservations(ftcMatch({ scoreRedRp2: 0, scoreBlueRp2: 1 }), "artifact");
        expect(obs[0].label).toBe(0);
        expect(obs[1].label).toBe(1);
    });

    it("pattern target shares labels with artifact (no separate RP slot)", () => {
        const artObs = extractObservations(ftcMatch({ scoreRedRp2: 1 }), "artifact");
        const patObs = extractObservations(ftcMatch({ scoreRedRp2: 1 }), "pattern");
        expect(artObs[0].label).toBe(patObs[0].label);
    });

    it("backs out tele from total - auto - foul when scoreTeleOp is absent", () => {
        // total 100, auto 20, foul 5 → tele = 75
        const obs = extractObservations(
            ftcMatch({ scoreRedFinal: 100, scoreRedAuto: 20, scoreRedFoul: 5 }),
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
            scoreRedFoul: 5,
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
        const match = ftcMatch({ scoreRedFinal: 10, scoreRedAuto: 5, scoreRedFoul: 20 });
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
            scoreRedFoul: 5,
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
            ftcMatch({ matchNumber: 1, scoreRedRp1: 1 }),
            ftcMatch({ matchNumber: 2, scoreRedRp1: 0 }),
            ftcMatch({ matchNumber: 3, scoreRedRp1: 1 }),
        ];
        const { features, labels } = extractTrainingSet(matches, "movement");
        expect(features).toHaveLength(6); // 3 matches × 2 alliances
        expect(labels).toHaveLength(6);
    });
});

describe("inferTeamRpProbability — fallback path", () => {
    it("returns heuristic prob when no model is provided (movement)", () => {
        const p = inferTeamRpProbability(
            { avgAuto: 20, avgTele: 50, avgEnd: 10, heuristicMovementProb: 0.6 },
            "movement",
            null,
        );
        expect(p).toBe(0.6);
    });

    it("returns 0.7x heuristic for pattern (legacy correlation factor)", () => {
        const p = inferTeamRpProbability(
            { avgAuto: 20, avgTele: 50, avgEnd: 10, heuristicArtifactProb: 0.8 },
            "pattern",
            null,
        );
        expect(p).toBeCloseTo(0.56, 2);
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

    it("pattern target dampens trained prediction by 0.7", () => {
        const profile = { avgAuto: 10, avgTele: 100, avgEnd: 5 };
        const pArt = inferTeamRpProbability(profile, "artifact", model);
        const pPat = inferTeamRpProbability(profile, "pattern", model);
        expect(pPat).toBeCloseTo(pArt * 0.7, 5);
    });
});

describe("rpModelCacheKey", () => {
    it("formats stably per (season, target) at the current feature version", () => {
        // v2 = M8 fix (tele fallback subtracts endgame). v1 models were
        // trained under the skewed decomposition and must never be served.
        expect(rpModelCacheKey(2025, "movement")).toBe("rp-model:2025:movement:v2");
        expect(rpModelCacheKey(2026, "artifact")).toBe("rp-model:2026:artifact:v2");
    });
});
