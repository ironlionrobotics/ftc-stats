/**
 * One-shot structural check of the FRC Events API v3 against what
 * lib/frc-api.ts assumes (decision #118). Prints SHAPES and a few numbers,
 * never credentials:
 *  1. auth works (season summary);
 *  2. top-level keys of /events, /matches, /scores;
 *  3. foul convention: match `scoreRedFoul` vs the breakdown's per-alliance
 *     `foulPoints` (points AWARDED to that alliance) — decides the swap;
 *  4. REBUILT breakdown keys: which RP booleans / `rp` exist.
 *
 * Usage: set -a; . ./.env.local; set +a; node scripts/frc-verify.mjs [season] [eventCode]
 */
const [season = "2026", code = "MXMO"] = process.argv.slice(2);
const u = process.env.FRC_API_USERNAME, k = process.env.FRC_API_KEY;
if (!u || !k) { console.error("FRC_API_USERNAME / FRC_API_KEY missing in env"); process.exit(1); }
const auth = "Basic " + Buffer.from(`${u}:${k}`).toString("base64");
const BASE = "https://frc-api.firstinspires.org/v3.0";

async function get(path) {
    const r = await fetch(BASE + path, { headers: { Authorization: auth, Accept: "application/json" }, signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`${path} → HTTP ${r.status}`);
    return r.json();
}

const s = await get(`/${season}`);
console.log(`1. auth OK · season ${season}: keys ${Object.keys(s).join(", ")}`);

const ev = await get(`/${season}/events?eventCode=${code}`);
console.log(`2. /events keys: ${Object.keys(ev).join(", ")} · event: ${JSON.stringify((ev.Events ?? [])[0] ? { code: ev.Events[0].code, type: ev.Events[0].type, dateStart: ev.Events[0].dateStart } : null)}`);

const m = await get(`/${season}/matches/${code}?tournamentLevel=Qualification`);
const matches = m.Matches ?? m.matches ?? [];
console.log(`   /matches keys: ${Object.keys(m).join(", ")} · ${matches.length} quals · match fields: ${Object.keys(matches[0] ?? {}).join(", ")}`);
console.log(`   team fields: ${Object.keys(matches[0]?.teams?.[0] ?? {}).join(", ")}`);

const sc = await get(`/${season}/scores/${code}/Qualification`);
const scores = sc.MatchScores ?? sc.matchScores ?? [];
console.log(`   /scores keys: ${Object.keys(sc).join(", ")} · ${scores.length} breakdowns · entry fields: ${Object.keys(scores[0] ?? {}).join(", ")}`);
const al = scores[0]?.alliances?.[0] ?? {};
console.log(`4. alliance breakdown keys (${Object.keys(al).length}): ${Object.keys(al).join(", ")}`);
const bool = Object.entries(al).filter(([, v]) => typeof v === "boolean").map(([key]) => key);
console.log(`   boolean keys: ${bool.join(", ") || "(none)"} · has rp: ${"rp" in al}`);

console.log("3. foul convention (first 8 quals with fouls):");
const byNum = new Map(scores.map(x => [x.matchNumber, x]));
let shown = 0;
for (const mt of matches) {
    const b = byNum.get(mt.matchNumber);
    if (!b) continue;
    const red = b.alliances.find(a => /red/i.test(a.alliance)), blue = b.alliances.find(a => /blue/i.test(a.alliance));
    if (!red || !blue || (!red.foulPoints && !blue.foulPoints)) continue;
    console.log(`   Q${mt.matchNumber}: match scoreRedFoul=${mt.scoreRedFoul} scoreBlueFoul=${mt.scoreBlueFoul} | breakdown red.foulPoints=${red.foulPoints} blue.foulPoints=${blue.foulPoints} | final R${mt.scoreRedFinal} B${mt.scoreBlueFinal} | rp R${red.rp} B${blue.rp}`);
    if (++shown >= 8) break;
}
if (!shown) console.log("   (no qual with fouls found in this event)");
