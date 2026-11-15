/**
 * Pulls every played match of a season from the official FIRST FTC Events API
 * (matches + per-alliance score breakdowns, quals and playoffs) into
 * data/season-pull/<season>/<event>.json for offline analysis.
 *
 * The breakdowns are the same data ftc-events.firstinspires.org shows under
 * /<season>/<event>/qualifications/<n> and /playoff/<series>/<n>.
 *
 * Run (credentials from .env.local, never printed):
 *   set -a; . ./.env.local; set +a; node scripts/run-ts.mjs scripts/biobuzz-season-pull.ts 2026
 * Re-running skips events already pulled unless they were unfinished.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SEASON = Number(process.argv[2] ?? 2026);
const BASE = "https://ftc-api.firstinspires.org/v2.0";
const DIR = join(process.cwd(), "data", "season-pull", String(SEASON));
const auth = "Basic " + Buffer.from(`${process.env.FTC_API_USERNAME}:${process.env.FTC_API_KEY}`).toString("base64");

async function get<T>(path: string): Promise<T | null> {
    for (let attempt = 0; attempt < 4; attempt++) {
        const r = await fetch(`${BASE}${path}`, { headers: { Authorization: auth, Accept: "application/json" } });
        if (r.status === 404 || r.status === 400) return null;
        if (r.ok) return (await r.json()) as T;
        await new Promise(res => setTimeout(res, 2000 * (attempt + 1)));
    }
    throw new Error(`FIRST API failed: ${path}`);
}

interface ApiEvent { code: string; name: string; type: string; typeName: string; dateStart: string; dateEnd: string; country: string; stateprov: string; city: string; regionCode?: string; leagueCode?: string | null }

async function main() {
    if (!process.env.FTC_API_USERNAME || !process.env.FTC_API_KEY) throw new Error("FTC_API_USERNAME/FTC_API_KEY missing (load .env.local)");
    mkdirSync(DIR, { recursive: true });
    const events = (await get<{ events: ApiEvent[] }>(`/${SEASON}/events`))?.events ?? [];
    const now = Date.now();
    const started = events.filter(e => Date.parse(e.dateStart) <= now);
    writeFileSync(join(DIR, "_events.json"), JSON.stringify(events));
    let done = 0, withMatches = 0;
    for (let i = 0; i < started.length; i += 4) {
        await Promise.all(started.slice(i, i + 4).map(async e => {
            const file = join(DIR, `${e.code}.json`);
            if (existsSync(file)) {
                const prev = JSON.parse(readFileSync(file, "utf8"));
                if (Date.parse(e.dateEnd) + 2 * 86400_000 < prev.pulledAt) { done++; if (prev.matches.length) withMatches++; return; }
            }
            const [mq, mp, sq, sp] = await Promise.all([
                get<{ matches: unknown[] }>(`/${SEASON}/matches/${e.code}?tournamentLevel=qual`),
                get<{ matches: unknown[] }>(`/${SEASON}/matches/${e.code}?tournamentLevel=playoff`),
                get<{ matchScores: unknown[] }>(`/${SEASON}/scores/${e.code}/Qual`),
                get<{ matchScores: unknown[] }>(`/${SEASON}/scores/${e.code}/Playoff`),
            ]);
            const matches = [...(mq?.matches ?? []), ...(mp?.matches ?? [])];
            const scores = [...(sq?.matchScores ?? []), ...(sp?.matchScores ?? [])];
            writeFileSync(file, JSON.stringify({ event: e, matches, scores, pulledAt: Date.now() }));
            done++;
            if (matches.length) withMatches++;
        }));
        process.stderr.write(`\r${done}/${started.length} events (${withMatches} with matches)`);
    }
    process.stderr.write("\n");
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
