/**
 * Component OPR: per-team least-squares contribution to ONE alliance-level
 * quantity (e.g. BIOBUZZ HIVE TIPS), solved with ridge shrinkage toward a
 * prior so teams with few matches don't get wild estimates.
 *
 *   minimize  Σ_rows (Σ_{t∈row} x_t − y_row)²  +  λ Σ_t (x_t − μ0)²
 *   ⇒ (AᵀA + λI) x = Aᵀy + λ μ0
 *
 * μ0 defaults to mean(y) / teamsPerRow (the "average robot"). λ = 1 means
 * the prior weighs like one extra match. Small dense system (≤ ~80 teams per
 * event) solved with Gaussian elimination + partial pivoting.
 */

export interface OprRow {
    teams: number[];
    value: number;
}

export interface ComponentOprOptions {
    /** Ridge strength (prior weight in "matches"). Default 1. */
    lambda?: number;
    /** Prior per-team value. Default mean(row value) / mean(row size). */
    prior?: number;
}

export function componentOpr(rows: OprRow[], opts: ComponentOprOptions = {}): Map<number, number> {
    const out = new Map<number, number>();
    if (rows.length === 0) return out;

    const teams = Array.from(new Set(rows.flatMap(r => r.teams))).sort((a, b) => a - b);
    const idx = new Map(teams.map((t, i) => [t, i]));
    const n = teams.length;
    const lambda = opts.lambda ?? 1;
    const meanRowSize = rows.reduce((s, r) => s + r.teams.length, 0) / rows.length;
    const prior = opts.prior ?? rows.reduce((s, r) => s + r.value, 0) / rows.length / Math.max(meanRowSize, 1);

    // Normal equations, augmented matrix [M | b].
    const M: number[][] = Array.from({ length: n }, () => new Array(n + 1).fill(0));
    for (const r of rows) {
        const ids = r.teams.map(t => idx.get(t)!);
        for (const i of ids) {
            for (const j of ids) M[i][j] += 1;
            M[i][n] += r.value;
        }
    }
    for (let i = 0; i < n; i++) {
        M[i][i] += lambda;
        M[i][n] += lambda * prior;
    }

    // Gaussian elimination with partial pivoting.
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        [M[c], M[p]] = [M[p], M[c]];
        const piv = M[c][c];
        if (Math.abs(piv) < 1e-12) continue; // cannot happen with lambda > 0
        for (let r = c + 1; r < n; r++) {
            const f = M[r][c] / piv;
            if (f === 0) continue;
            for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
        }
    }
    const x = new Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
        let s = M[i][n];
        for (let k = i + 1; k < n; k++) s -= M[i][k] * x[k];
        x[i] = Math.abs(M[i][i]) < 1e-12 ? prior : s / M[i][i];
    }
    teams.forEach((t, i) => out.set(t, x[i]));
    return out;
}
