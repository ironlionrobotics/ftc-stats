/**
 * Playoff in-event update backtest (decision #113).
 *
 * Question: once an alliance has played playoff matches, should its forecast
 * keep using ONLY the quals model (what PRIDE does today), or learn from the
 * playoff scores it already put up (robot broke, strategy change, a pick that
 * clicks better than quals suggested)?
 *
 * Model under test: prior = Σ ridge OPR (λ=1, non-penalty, all quals) of the
 * fielded robots — the same strength the ledger and Oracle use. Each alliance
 * gets an offset from its earlier playoff matches, shrunk toward 0:
 *     offset_A = Σ (np_score − prior) / (k + n_A)
 * k = ∞ is today's quals-only model. Also re-tunes the playoff σ inflation
 * jointly (the offset removes part of the error the inflation was covering).
 * Fit on even-indexed events, reported on odd-indexed ones (held out).
 *
 * Run: node scripts/run-ts.mjs scripts/playoff-update-backtest.ts 2026 [2025 ...]
 * Cache: data/playoff-backtest/season-<S>.json (delete to refetch).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { componentOpr } from "@/lib/component-opr";
import { winProbabilityFromNormalModel } from "@/lib/win-probability";

const SEASONS = process.argv.slice(2).map(Number).filter(Boolean);
const DIR = join(process.cwd(), "data", "playoff-backtest");

interface GqlTeam { teamNumber: number; alliance: "Red" | "Blue"; onField?: boolean | null }
interface GqlSide { totalPointsNp: number | null; totalPoints: number | null }
interface GqlMatch {
    matchNum: number; series: number; tournamentLevel: string; actualStartTime: string | null;
    scores: { red?: GqlSide; blue?: GqlSide } | null; teams: GqlTeam[];
}
interface M { t: number; s: number; red: number[]; blue: number[]; redNp: number; blueNp: number; redTot: number; blueTot: number }
interface Ev { code: string; quals: M[]; playoffs: M[] }

async function gql<T>(query: string): Promise<T> {
    for (let attempt = 0; attempt < 4; attempt++) {
        try {
            const r = await fetch("https://api.ftcscout.org/graphql", {
                method: "POST",
                headers: { "Content-Type": "application/json", "User-Agent": "PRIDE-playoff-backtest" },
                body: JSON.stringify({ query }),
            });
            if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`);
            const j = await r.json();
            if (j.errors) throw new Error(j.errors[0].message);
            return j.data as T;
        } catch (e) {
            if (attempt === 3) throw e;
            await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
        }
    }
    throw new Error("unreachable");
}

const usable = (m: M) => m.red.length > 0 && m.blue.length > 0
    && [m.redNp, m.blueNp, m.redTot, m.blueTot].every(v => typeof v === "number" && Number.isFinite(v));

async function load(season: number): Promise<Ev[]> {
    const cache = join(DIR, `season-${season}.json`);
    let events: Ev[];
    if (existsSync(cache)) {
        events = JSON.parse(readFileSync(cache, "utf8"));
    } else {
        const list = (await gql<{ eventsSearch: { code: string; finished: boolean; hasMatches: boolean }[] }>(
            `query{ eventsSearch(season:${season}, limit:5000){ code finished hasMatches } }`)).eventsSearch
            .filter(e => e.finished && e.hasMatches).map(e => e.code);
        events = [];
        for (let i = 0; i < list.length; i += 4) {
            const batch = await Promise.all(list.slice(i, i + 4).map(async code => {
                const d = await gql<{ eventByCode: { matches: GqlMatch[] } | null }>(`query{ eventByCode(season:${season}, code:"${code}"){ matches { matchNum series tournamentLevel actualStartTime scores { ... on MatchScores${season} { red { totalPointsNp totalPoints } blue { totalPointsNp totalPoints } } } teams { teamNumber alliance onField } } } }`);
                const conv = (m: GqlMatch): M => ({
                    t: Date.parse(m.actualStartTime ?? "") || 0,
                    s: m.series * 1000 + m.matchNum,
                    red: m.teams.filter(x => x.alliance === "Red" && x.onField !== false).map(x => x.teamNumber),
                    blue: m.teams.filter(x => x.alliance === "Blue" && x.onField !== false).map(x => x.teamNumber),
                    redNp: m.scores!.red!.totalPointsNp as number, blueNp: m.scores!.blue!.totalPointsNp as number,
                    redTot: m.scores!.red!.totalPoints as number, blueTot: m.scores!.blue!.totalPoints as number,
                });
                const all = (d.eventByCode?.matches ?? []).filter(m => m.scores?.red && m.scores?.blue);
                return {
                    code,
                    quals: all.filter(m => m.tournamentLevel === "Quals").map(conv),
                    playoffs: all.filter(m => m.tournamentLevel !== "Quals").map(conv).sort((a, b) => (a.t - b.t) || (a.s - b.s)),
                };
            }));
            events.push(...batch);
            process.stderr.write(`\r${season}: ${Math.min(i + 4, list.length)}/${list.length}`);
        }
        process.stderr.write("\n");
        mkdirSync(DIR, { recursive: true });
        writeFileSync(cache, JSON.stringify(events));
    }
    return events
        .map(e => ({ ...e, quals: e.quals.filter(usable), playoffs: e.playoffs.filter(usable) }))
        .filter(e => e.quals.length >= 6 && e.playoffs.length >= 3);
}

/** Alliance id per team: teams that ever share a playoff side are one alliance (3-robot alliances rotate). */
function allianceIds(playoffs: M[]): Map<number, number> {
    const parent = new Map<number, number>();
    const find = (x: number): number => {
        if (!parent.has(x)) parent.set(x, x);
        const p = parent.get(x)!;
        if (p === x) return x;
        const r = find(p); parent.set(x, r); return r;
    };
    for (const m of playoffs) for (const side of [m.red, m.blue]) for (const t of side.slice(1)) parent.set(find(t), find(side[0]));
    const out = new Map<number, number>();
    for (const t of parent.keys()) out.set(t, find(t));
    return out;
}

interface Pred { p: number; y: number; hasHistory: boolean }

/** Every playoff prediction of one event under (k, inflation). */
function replay(e: Ev, k: number, infl: number): Pred[] {
    const rows = e.quals.flatMap(m => [{ teams: m.red, value: m.redNp }, { teams: m.blue, value: m.blueNp }]);
    const opr = componentOpr(rows, { lambda: 1 });
    const meanSize = rows.reduce((s, r) => s + r.teams.length, 0) / rows.length;
    const meanScore = rows.reduce((s, r) => s + r.value, 0) / rows.length;
    const strength = (t: number) => opr.get(t) ?? meanScore / meanSize;
    const mu = (a: number[]) => a.reduce((s, t) => s + strength(t), 0);
    const rms = Math.sqrt(rows.reduce((s, r) => s + (r.value - mu(r.teams)) ** 2, 0) / rows.length);
    const sigmaDiff = Math.SQRT2 * Math.max(rms, 0.2 * meanScore, 1);

    const ids = allianceIds(e.playoffs);
    const hist = new Map<number, { sum: number; n: number }>();
    const offset = (side: number[]) => {
        const h = hist.get(ids.get(side[0])!);
        return h && Number.isFinite(k) ? h.sum / (k + h.n) : 0;
    };
    const out: Pred[] = [];
    for (const m of e.playoffs) {
        const ra = ids.get(m.red[0])!, ba = ids.get(m.blue[0])!;
        const hasHistory = hist.has(ra) || hist.has(ba);
        if (m.redTot !== m.blueTot) {
            const p = winProbabilityFromNormalModel(mu(m.red) + offset(m.red), mu(m.blue) + offset(m.blue), sigmaDiff * infl);
            out.push({ p, y: m.redTot > m.blueTot ? 1 : 0, hasHistory });
        }
        for (const [side, np, a] of [[m.red, m.redNp, ra], [m.blue, m.blueNp, ba]] as const) {
            const h = hist.get(a) ?? { sum: 0, n: 0 };
            h.sum += np - mu(side); h.n++;
            hist.set(a, h);
        }
    }
    return out;
}

function score(preds: Pred[]) {
    let ll = 0, brier = 0, hits = 0;
    for (const { p: raw, y } of preds) {
        const p = Math.min(0.99, Math.max(0.01, raw));
        ll -= Math.log(y ? p : 1 - p);
        brier += (p - y) ** 2;
        if ((p >= 0.5) === (y === 1)) hits++;
    }
    const n = preds.length || 1;
    return { n: preds.length, ll: ll / n, brier: brier / n, acc: hits / n };
}

const K = [Infinity, 16, 8, 5, 3, 2, 1, 0.5];
const INFL = [1.2, 1.6, 2.0, 2.4, 2.8];

async function main() {
    for (const season of SEASONS) {
        const events = await load(season);
        const fit = events.filter((_, i) => i % 2 === 0), held = events.filter((_, i) => i % 2 === 1);
        const run = (evs: Ev[], k: number, infl: number, onlyHist = false) =>
            score(evs.flatMap(e => replay(e, k, infl)).filter(p => !onlyHist || p.hasHistory));
        console.log(`\n=== Season ${season}: ${events.length} events with playoffs (fit ${fit.length} / held-out ${held.length}) ===`);
        let best = { k: Infinity, infl: 2.4, ll: Infinity };
        for (const k of K) for (const infl of INFL) {
            const r = run(fit, k, infl);
            if (r.ll < best.ll) best = { k, infl, ll: r.ll };
        }
        let bestInflQualsOnly = { infl: 2.4, ll: Infinity };
        for (const infl of INFL) { const r = run(fit, Infinity, infl); if (r.ll < bestInflQualsOnly.ll) bestInflQualsOnly = { infl, ll: r.ll }; }
        console.log(`fit: best k=${best.k} infl=${best.infl}; quals-only best infl=${bestInflQualsOnly.infl}`);
        const fmt = (label: string, r: ReturnType<typeof score>) =>
            console.log(`${label.padEnd(44)} n=${String(r.n).padStart(5)}  acc ${(r.acc * 100).toFixed(1)}%  brier ${r.brier.toFixed(4)}  logloss ${r.ll.toFixed(4)}`);
        for (const onlyHist of [false, true]) {
            console.log(onlyHist ? "-- held-out, matches where an alliance already played --" : "-- held-out, all playoff matches --");
            fmt("today (quals only, infl 2.4)", run(held, Infinity, 2.4, onlyHist));
            fmt(`quals only, infl ${bestInflQualsOnly.infl}`, run(held, Infinity, bestInflQualsOnly.infl, onlyHist));
            fmt(`with playoff update k=${best.k}, infl ${best.infl}`, run(held, best.k, best.infl, onlyHist));
        }
        console.log("-- held-out log loss by k (infl fixed at best) --");
        console.log(K.map(k => `k=${k}: ${run(held, k, best.infl).ll.toFixed(4)}`).join("  "));
    }
}

main().catch(e => { console.error(e); process.exit(1); });
