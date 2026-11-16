/**
 * FTC season archive from the OFFICIAL FIRST Events API (replaces FTCScout
 * as the source of history — plan docs/plan-first-api-y-frc.md, Fase A).
 *
 * Per published competitive event of a season: matches (all levels), score
 * breakdowns (qual + playoff), rankings, alliances, awards; plus the season's
 * team list (rookieYear) and award dictionary. Written gzipped to
 * data/first-archive/ftc/<season>/ (gitignored). Resumable: events already
 * archived after they ended are skipped.
 *
 * FIRST quirks handled: no bulk endpoint (one call per event and resource);
 * an empty result is HTTP 200 with a tiny body, not an error; pure remote
 * events (2020/21) have no playoffs/alliances; awards are keyed by awardId
 * + series (names drift by season and sponsor).
 *
 * Run (credentials from .env.local, never printed):
 *   set -a; . ./.env.local; set +a; node scripts/run-ts.mjs scripts/first-archive-pull.ts 2025 [2024 …]
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync, gzipSync } from "node:zlib";

const BASE = "https://ftc-api.firstinspires.org/v2.0";
const ROOT = join(process.cwd(), "data", "first-archive", "ftc");
const CONCURRENCY = 3;
/** Competitive event types (FIRST codes): non-advancement, league meet, qualifier, league tournament, championship, other, FIRST Championship, super qualifier, premier. */
const COMPETITIVE = new Set(["0", "1", "2", "3", "4", "5", "6", "7", "17"]);
const auth = "Basic " + Buffer.from(`${process.env.FTC_API_USERNAME}:${process.env.FTC_API_KEY}`).toString("base64");
let calls = 0;

async function get<T>(path: string): Promise<T | null> {
    for (let attempt = 0; attempt < 5; attempt++) {
        calls++;
        const r = await fetch(`${BASE}${path}`, { headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(60_000) }).catch(() => null);
        if (r?.ok) return (await r.json()) as T;
        if (r && (r.status === 400 || r.status === 404)) return null;
        await new Promise(res => setTimeout(res, 1500 * 2 ** attempt));
    }
    throw new Error(`FIRST API failed: ${path}`);
}

const save = (f: string, data: unknown) => writeFileSync(f, gzipSync(JSON.stringify(data)));
const load = <T>(f: string): T => JSON.parse(gunzipSync(readFileSync(f)).toString("utf8")) as T;

interface ApiEvent { code: string; type: string; published?: boolean; remote?: boolean; dateStart: string; dateEnd: string }

async function season(s: number) {
    const dir = join(ROOT, String(s));
    mkdirSync(dir, { recursive: true });
    const events = (await get<{ events: ApiEvent[] }>(`/${s}/events`))?.events ?? [];
    save(join(dir, "_events.json.gz"), events);
    save(join(dir, "_awards-list.json.gz"), await get(`/${s}/awards/list`));
    if (!existsSync(join(dir, "_teams.json.gz"))) {
        const teams: unknown[] = [];
        for (let page = 1; page < 400; page++) {
            const p = await get<{ teams: unknown[]; pageTotal: number }>(`/${s}/teams?page=${page}`);
            teams.push(...(p?.teams ?? []));
            if (!p || page >= p.pageTotal) break;
        }
        save(join(dir, "_teams.json.gz"), teams);
    }
    const now = Date.now();
    const todo = events.filter(e => COMPETITIVE.has(String(e.type)) && e.published !== false && Date.parse(e.dateStart) <= now);
    let done = 0, withMatches = 0;
    const failed: string[] = [];
    for (let i = 0; i < todo.length; i += CONCURRENCY) {
        await Promise.all(todo.slice(i, i + CONCURRENCY).map(e => archiveEvent(e).catch(err => {
            // Persistent FIRST error on one resource: skip the event (not saved ⇒ retried next run).
            failed.push(`${e.code}: ${err instanceof Error ? err.message : err}`);
        })));
        process.stderr.write(`\r${s}: ${done}/${todo.length} events (${withMatches} with matches, ${calls} calls, ${failed.length} failed)`);
    }
    process.stderr.write("\n");
    if (failed.length) console.error(`${s}: failed events (re-run to retry):\n  ${failed.join("\n  ")}`);

    async function archiveEvent(e: ApiEvent) {
            const f = join(dir, `${e.code}.json.gz`);
            if (existsSync(f) && Date.parse(e.dateEnd) + 3 * 86400_000 < load<{ pulledAt: number }>(f).pulledAt) { done++; return; }
            const matches = (await get<{ matches: { tournamentLevel: string }[] }>(`/${s}/matches/${e.code}`))?.matches ?? [];
            const hasPlayoff = matches.some(m => m.tournamentLevel === "PLAYOFF");
            const out: Record<string, unknown> = { event: e, matches, pulledAt: Date.now() };
            if (matches.length) {
                withMatches++;
                const [sq, sp, rk, al, aw] = await Promise.all([
                    get<{ matchScores: unknown[] }>(`/${s}/scores/${e.code}/qual`),
                    hasPlayoff ? get<{ matchScores: unknown[] }>(`/${s}/scores/${e.code}/playoff`) : Promise.resolve(null),
                    get<{ rankings: unknown[] }>(`/${s}/rankings/${e.code}`),
                    hasPlayoff ? get<{ alliances: unknown[] }>(`/${s}/alliances/${e.code}`) : Promise.resolve(null),
                    get<{ awards: unknown[] }>(`/${s}/awards/${e.code}`),
                ]);
                Object.assign(out, { scores: [...(sq?.matchScores ?? []), ...(sp?.matchScores ?? [])], rankings: rk?.rankings ?? [], alliances: al?.alliances ?? [], awards: aw?.awards ?? [] });
            }
            save(f, out);
            done++;
    }
}

async function main() {
    if (!process.env.FTC_API_USERNAME || !process.env.FTC_API_KEY) throw new Error("FTC_API_USERNAME/FTC_API_KEY missing (load .env.local)");
    for (const s of process.argv.slice(2).map(Number).filter(Boolean)) await season(s);
}

main().catch(e => { console.error(e); process.exit(1); });
