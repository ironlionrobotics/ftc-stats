/**
 * Fits HISTORY_COEFS (decision #117) on the official FIRST archive: OLS of a
 * team's within-event OPR z at its FIRST official event of season S on
 * historyFeatures() from seasons S-1..S-3. Reports held-out R² (leave one
 * target season out) and prints the coefficients to paste into
 * lib/starting-points.ts (then rebuild the table with build-history-table.ts).
 *
 * Run: node scripts/run-ts.mjs scripts/fit-history-coefs.ts 2024 2025 [2026]
 */
import { HISTORY_COEFS, historyFeatures, maxTeamWithEvents, teamSeasonProfiles, type ScoutEvent, type TeamSeason } from "@/lib/starting-points";
import { scoutSeasonFromArchive } from "./first-archive";

const OFFICIAL = new Set(["Qualifier", "LeagueMeet", "LeagueTournament", "Championship", "SuperQualifier", "Premier", "FIRSTChampionship"]);
const cache = new Map<number, ScoutEvent[]>();
const season = (s: number) => { if (!cache.has(s)) cache.set(s, scoutSeasonFromArchive(s)); return cache.get(s)!; };
const profiles = new Map<number, Map<number, TeamSeason>>();
const prof = (s: number) => { if (!profiles.has(s)) profiles.set(s, teamSeasonProfiles(season(s))); return profiles.get(s)!; };

/** z of each team at its first official event of the season. */
function firstEventZ(s: number): Map<number, number> {
    const out = new Map<number, number>();
    for (const e of [...season(s)].filter(e => OFFICIAL.has(e.type)).sort((a, b) => a.start.localeCompare(b.start))) {
        const rows = e.teams.filter(t => (t.stats?.qualMatchesPlayed ?? 0) >= 3);
        if (rows.length < 6) continue;
        const xs = rows.map(r => r.stats!.opr!.totalPointsNp!);
        const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
        const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1)) || 1;
        for (const r of rows) if (!out.has(r.teamNumber)) out.set(r.teamNumber, (r.stats!.opr!.totalPointsNp! - mean) / sd);
    }
    return out;
}

function rows(S: number) {
    const [s1, s2, s3] = [prof(S - 1), prof(S - 2), prof(S - 3)];
    const rookieAbove = maxTeamWithEvents(s2, s3);
    return [...firstEventZ(S)].map(([t, y]) => ({ y, x: historyFeatures(t, s1.get(t), s2.get(t), s3.get(t), rookieAbove) }));
}

function ols(X: number[][], y: number[]): number[] {
    const k = X[0].length, M = Array.from({ length: k }, () => new Array(k + 1).fill(0));
    for (let i = 0; i < X.length; i++) for (let a = 0; a < k; a++) { M[a][k] += X[i][a] * y[i]; for (let b = 0; b < k; b++) M[a][b] += X[i][a] * X[i][b]; }
    for (let a = 1; a < k; a++) M[a][a] += 1e-3 * X.length;
    for (let c = 0; c < k; c++) {
        let p = c; for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        [M[c], M[p]] = [M[p], M[c]];
        for (let r = 0; r < k; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let j = c; j <= k; j++) M[r][j] -= f * M[c][j]; }
    }
    return M.map((r, i) => r[k] / r[i]);
}
const r2 = (w: readonly number[], data: { y: number; x: number[] }[]) => {
    const yb = data.reduce((s, d) => s + d.y, 0) / data.length;
    const sse = data.reduce((s, d) => s + (d.y - d.x.reduce((a, v, i) => a + v * w[i], 0)) ** 2, 0);
    return 1 - sse / data.reduce((s, d) => s + (d.y - yb) ** 2, 0);
};

const targets = process.argv.slice(2).map(Number).filter(Boolean);
const data = new Map(targets.map(S => [S, rows(S)]));
for (const S of targets) {
    const train = targets.filter(t => t !== S).flatMap(t => data.get(t)!);
    const w = ols(train.map(d => d.x), train.map(d => d.y));
    console.log(`${S}: n=${data.get(S)!.length} held-out R² refit ${r2(w, data.get(S)!).toFixed(4)} · current HISTORY_COEFS ${r2(HISTORY_COEFS, data.get(S)!).toFixed(4)}`);
}
const all = targets.flatMap(t => data.get(t)!);
const w = ols(all.map(d => d.x), all.map(d => d.y));
console.log(`\nHISTORY_COEFS (all ${targets.join("+")}, n=${all.length}):\n[${w.map(x => x.toFixed(3)).join(", ")}]`);
