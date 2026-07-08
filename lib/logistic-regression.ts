/**
 * Minimal logistic-regression implementation, pure TypeScript. No external
 * deps. Designed for small-to-medium training sets (hundreds to low thousands
 * of observations) — perfectly adequate for a season's worth of FTC matches
 * (~50-500 alliance-matches per event × ~10 events).
 *
 * Optimizer: batch gradient descent with L2 regularization. Convergence is
 * checked by relative change in negative-log-likelihood. Not stochastic —
 * predictable, deterministic, easy to reason about for small data.
 *
 * Features must be numeric vectors of the same length; the model adds an
 * intercept term automatically. Standardization is the caller's responsibility
 * — see standardize() below for a helper.
 */

export interface LogisticModel {
    /** Coefficients for each input feature (same length as feature vectors). */
    weights: number[];
    /** Intercept (bias) term. */
    bias: number;
    /**
     * Per-feature mean/stddev used for standardization at training time.
     * Must be applied to inputs at prediction time so model expects the same
     * feature scale it was trained on.
     */
    standardization: {
        means: number[];
        stddevs: number[];
    };
    /** Diagnostic metadata so caller can show "trained on N samples, last week". */
    trainedAt: number;       // epoch ms
    sampleSize: number;
    finalLoss: number;
}

export interface TrainOptions {
    /** Learning rate. Default 0.1 — works well for standardized features. */
    learningRate?: number;
    /** Max iterations. Default 1000. */
    maxIter?: number;
    /** L2 regularization strength. Default 0.01. */
    l2?: number;
    /** Convergence tolerance — stop when relative loss change < this. Default 1e-6. */
    tolerance?: number;
}

const DEFAULTS: Required<TrainOptions> = {
    learningRate: 0.1,
    maxIter: 1000,
    l2: 0.01,
    tolerance: 1e-6,
};

function sigmoid(x: number): number {
    // Numerically stable: avoid overflow on very negative x.
    if (x >= 0) {
        const z = Math.exp(-x);
        return 1 / (1 + z);
    }
    const z = Math.exp(x);
    return z / (1 + z);
}

/**
 * Standardizes columns of a 2D feature matrix to zero-mean unit-variance.
 * Returns standardized features + the means and stddevs used so the same
 * transform can be applied at prediction time.
 *
 * Degenerate columns (stddev = 0) are passed through with stddev = 1 to
 * avoid divide-by-zero — they end up contributing nothing.
 */
export function standardize(features: number[][]): { x: number[][]; means: number[]; stddevs: number[] } {
    if (features.length === 0) return { x: [], means: [], stddevs: [] };
    const nFeatures = features[0].length;
    const means = Array(nFeatures).fill(0);
    const stddevs = Array(nFeatures).fill(0);

    for (let j = 0; j < nFeatures; j++) {
        let sum = 0;
        for (let i = 0; i < features.length; i++) sum += features[i][j];
        means[j] = sum / features.length;
    }
    for (let j = 0; j < nFeatures; j++) {
        let sumSq = 0;
        for (let i = 0; i < features.length; i++) {
            sumSq += (features[i][j] - means[j]) ** 2;
        }
        const variance = sumSq / features.length;
        stddevs[j] = variance > 0 ? Math.sqrt(variance) : 1;
    }

    const x = features.map(row =>
        row.map((v, j) => (v - means[j]) / stddevs[j]),
    );
    return { x, means, stddevs };
}

/**
 * Trains a binary logistic regression. Throws on malformed inputs.
 *
 * Labels must be 0 or 1. Features must be same-length rows of finite numbers.
 */
export function trainLogistic(
    features: number[][],
    labels: number[],
    options: TrainOptions = {},
): LogisticModel {
    const opts = { ...DEFAULTS, ...options };

    if (features.length === 0) throw new Error("Cannot train on empty features");
    if (features.length !== labels.length) {
        throw new Error("features.length must equal labels.length");
    }
    for (const y of labels) {
        if (y !== 0 && y !== 1) throw new Error("Labels must be 0 or 1");
    }

    const nFeatures = features[0].length;
    for (const row of features) {
        if (row.length !== nFeatures) {
            throw new Error("All feature rows must have the same length");
        }
        for (const v of row) {
            if (!Number.isFinite(v)) throw new Error("Feature contains non-finite value");
        }
    }

    const { x, means, stddevs } = standardize(features);

    let weights = Array(nFeatures).fill(0);
    let bias = 0;
    let prevLoss = Infinity;
    let loss = 0;

    for (let iter = 0; iter < opts.maxIter; iter++) {
        // Forward pass: compute predictions + gradient
        const gradW = Array(nFeatures).fill(0);
        let gradB = 0;
        loss = 0;

        for (let i = 0; i < x.length; i++) {
            const xi = x[i];
            let z = bias;
            for (let j = 0; j < nFeatures; j++) z += weights[j] * xi[j];
            const p = sigmoid(z);
            const err = p - labels[i];
            for (let j = 0; j < nFeatures; j++) gradW[j] += err * xi[j];
            gradB += err;
            // Negative log-likelihood per sample (clipped to avoid log(0))
            const pClipped = Math.min(1 - 1e-12, Math.max(1e-12, p));
            loss -= labels[i] * Math.log(pClipped) + (1 - labels[i]) * Math.log(1 - pClipped);
        }

        // Mean + L2 penalty
        loss /= x.length;
        for (let j = 0; j < nFeatures; j++) loss += (opts.l2 / 2) * weights[j] ** 2;

        // Gradient descent step
        for (let j = 0; j < nFeatures; j++) {
            const grad = gradW[j] / x.length + opts.l2 * weights[j];
            weights[j] -= opts.learningRate * grad;
        }
        bias -= opts.learningRate * (gradB / x.length);

        // Convergence check
        if (Math.abs(prevLoss - loss) / Math.max(prevLoss, 1e-12) < opts.tolerance) {
            break;
        }
        prevLoss = loss;
    }

    return {
        weights,
        bias,
        standardization: { means, stddevs },
        trainedAt: Date.now(),
        sampleSize: features.length,
        finalLoss: loss,
    };
}

/**
 * Returns the predicted P(y=1) for a feature vector. Applies the same
 * standardization used at training time.
 */
export function predictLogistic(model: LogisticModel, features: number[]): number {
    if (features.length !== model.weights.length) {
        throw new Error("Feature vector length doesn't match model");
    }
    let z = model.bias;
    for (let j = 0; j < features.length; j++) {
        const standardized = (features[j] - model.standardization.means[j]) / model.standardization.stddevs[j];
        z += model.weights[j] * standardized;
    }
    return sigmoid(z);
}
