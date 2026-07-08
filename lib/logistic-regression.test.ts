import { describe, it, expect } from "vitest";
import { trainLogistic, predictLogistic, standardize } from "./logistic-regression";

describe("standardize", () => {
    it("centers each column at 0 mean with unit stddev", () => {
        const { x, means, stddevs } = standardize([
            [10, 100],
            [20, 200],
            [30, 300],
        ]);
        expect(means).toEqual([20, 200]);
        // Population stddev: sqrt(200/3) ≈ 8.165, sqrt(20000/3) ≈ 81.65
        expect(stddevs[0]).toBeCloseTo(Math.sqrt(200 / 3), 3);
        expect(stddevs[1]).toBeCloseTo(Math.sqrt(20000 / 3), 3);
        // Center column means should now be 0
        const colMean = (col: number) => x.reduce((s, row) => s + row[col], 0) / x.length;
        expect(colMean(0)).toBeCloseTo(0, 5);
        expect(colMean(1)).toBeCloseTo(0, 5);
    });

    it("handles degenerate columns (all same value) without NaN", () => {
        const { x, stddevs } = standardize([[5, 1], [5, 2], [5, 3]]);
        expect(stddevs[0]).toBe(1);
        // Column 0 should be all zeros (x - mean = 0)
        expect(x.every(row => row[0] === 0)).toBe(true);
    });
});

describe("trainLogistic", () => {
    it("rejects mismatched features/labels", () => {
        expect(() => trainLogistic([[1, 2]], [0, 1])).toThrow();
    });

    it("rejects non-binary labels", () => {
        expect(() => trainLogistic([[1], [2]], [0, 0.5])).toThrow();
    });

    it("rejects non-finite features", () => {
        expect(() => trainLogistic([[NaN]], [1])).toThrow();
    });

    it("converges on a linearly separable dataset", () => {
        // y = 1 when x[0] > 0, else 0
        const features = [
            [-2], [-1], [-0.5], [0.5], [1], [2],
        ];
        const labels = [0, 0, 0, 1, 1, 1];
        const model = trainLogistic(features, labels, { maxIter: 2000 });

        // Predictions should be near 0 for negatives and near 1 for positives
        const pNeg = predictLogistic(model, [-2]);
        const pPos = predictLogistic(model, [2]);
        expect(pNeg).toBeLessThan(0.1);
        expect(pPos).toBeGreaterThan(0.9);
    });

    it("learns a single-feature relationship and predicts monotonically", () => {
        // P(y=1) increases with x. Generate data and verify monotonicity.
        const features: number[][] = [];
        const labels: number[] = [];
        for (let i = 0; i < 100; i++) {
            const x = i / 100; // 0..1
            features.push([x]);
            // Threshold at 0.5: deterministic for simplicity
            labels.push(x > 0.5 ? 1 : 0);
        }
        const model = trainLogistic(features, labels);

        const ps = [0, 0.25, 0.5, 0.75, 1].map(x => predictLogistic(model, [x]));
        // Should be monotonically increasing
        for (let i = 1; i < ps.length; i++) {
            expect(ps[i]).toBeGreaterThan(ps[i - 1]);
        }
    });

    it("returns mid-probability for fully ambiguous data", () => {
        // 50/50 labels with no signal → predictions cluster around 0.5
        const features = [[1], [1], [1], [1]];
        const labels = [1, 0, 1, 0];
        const model = trainLogistic(features, labels);
        const p = predictLogistic(model, [1]);
        expect(p).toBeCloseTo(0.5, 1);
    });

    it("L2 regularization shrinks weights toward zero", () => {
        const features = [
            [1, 100],
            [2, 200],
            [3, 300],
            [-1, -100],
            [-2, -200],
            [-3, -300],
        ];
        const labels = [1, 1, 1, 0, 0, 0];
        const weak = trainLogistic(features, labels, { l2: 0.001, maxIter: 2000 });
        const strong = trainLogistic(features, labels, { l2: 10, maxIter: 2000 });

        // Strong regularization → smaller weight magnitudes
        const weakMag = Math.abs(weak.weights[0]) + Math.abs(weak.weights[1]);
        const strongMag = Math.abs(strong.weights[0]) + Math.abs(strong.weights[1]);
        expect(strongMag).toBeLessThan(weakMag);
    });

    it("records sample size and trained-at timestamp", () => {
        const model = trainLogistic([[1], [2], [3]], [0, 0, 1]);
        expect(model.sampleSize).toBe(3);
        expect(model.trainedAt).toBeGreaterThan(0);
        expect(model.trainedAt).toBeLessThanOrEqual(Date.now());
    });
});

describe("predictLogistic", () => {
    it("rejects feature vectors with wrong length", () => {
        const model = trainLogistic([[1, 2], [3, 4]], [0, 1]);
        expect(() => predictLogistic(model, [1])).toThrow();
    });

    it("returns values in [0, 1] (clamped to floating-point extremes at the tails)", () => {
        const model = trainLogistic([[1], [2], [3]], [0, 0, 1]);
        for (let x = -100; x <= 100; x += 10) {
            const p = predictLogistic(model, [x]);
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(1);
        }
    });

    it("preserves standardization at predict time", () => {
        // Same prediction should result regardless of input scale, as long
        // as the model was trained on the same distribution.
        const features = [[10], [20], [30], [40], [50]];
        const labels = [0, 0, 1, 1, 1];
        const model = trainLogistic(features, labels);
        // Predicting at the mean (30) should give ~0.5 to 0.6 (just above
        // the decision boundary).
        const p = predictLogistic(model, [30]);
        expect(p).toBeGreaterThan(0.3);
        expect(p).toBeLessThan(0.8);
    });
});
