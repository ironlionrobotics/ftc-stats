import "server-only";
import { getAdminDb } from "@/lib/firebase-admin";
import { fetchMatches } from "@/lib/ftc-api";
import {
    aggregateMatchTeam,
    type FieldConsensus,
    type NumericConsensus,
    type CategoricalConsensus,
} from "@/lib/scouting-aggregation";
import type { MatchScouting, FTCMatch } from "@/types/scouting";

// EWMA learning rate for reliability updates. 0.2 means a single new error
// observation moves the reliability score by at most 20%; the prior 4
// observations together still account for ~67% of the running average.
// This makes the metric stable enough that one bad match doesn't wreck a
// careful scout's score, while still being responsive over a typical event.
const RELIABILITY_ALPHA = 0.2;

/** Clamp a value into the closed interval [0, 1]. */
function clamp01(x: number): number {
    return Math.max(0, Math.min(1, x));
}

// ---------------------------------------------------------------------------
// Score reconstruction from federated consensus
// ---------------------------------------------------------------------------

/**
 * Reconstructs the FTC IntoTheDeep point contribution of a single team from
 * the federated consensus over scout observations. Uses the official scoring
 * formula at a coarse level — the components we capture in scouting today
 * cover the bulk of the score but not RP-only bonuses (which don't add to the
 * scored total).
 *
 * Returns 0 if there's no consensus to work with.
 */
export function computeTeamPointsFromConsensus(
    fields: Record<string, FieldConsensus>,
    program: "FTC" | "FRC",
): number {
    const num = (name: string): number => {
        const c = fields[name];
        return c?.kind === "numeric" ? (c as NumericConsensus).value : 0;
    };
    const cat = <T>(name: string): T | undefined => {
        const c = fields[name];
        return c?.kind === "categorical" ? ((c as CategoricalConsensus<T>).value as T) : undefined;
    };

    if (program === "FTC") {
        const auto =
            num("autoPurpleArtifacts") * 3 +
            num("autoGreenArtifacts") * 3 +
            num("autoPoints");
        const tele =
            num("teleopPurpleArtifacts") * 2 +
            num("teleopGreenArtifacts") * 2 +
            num("patternsCompleted") * 10;
        const parking = cat<string>("endgameBaseParking");
        const parkingPts = parking === "Full" ? 10 : parking === "Partial" ? 5 : 0;
        const dualBonus = cat<boolean>("dualParking") ? 20 : 0;
        return auto + tele + parkingPts + dualBonus;
    }

    // FRC Reefscape — Coral auto: L1=3, L2=4, L3=6, L4=7; teleop: L1=2, L2=3,
    // L3=4, L4=5. Algae: processor 6, net 4. Climb: Deep 12, Shallow 6, park 2.
    if (program === "FRC") {
        const autoCoralPts =
            num("autoCoralL1") * 3 +
            num("autoCoralL2") * 4 +
            num("autoCoralL3") * 6 +
            num("autoCoralL4") * 7;
        const teleCoralPts =
            num("teleopCoralL1") * 2 +
            num("teleopCoralL2") * 3 +
            num("teleopCoralL3") * 4 +
            num("teleopCoralL4") * 5;
        const autoAlgae = num("autoAlgaeProcessor") * 6 + num("autoAlgaeNet") * 4;
        const teleAlgae = num("teleopAlgaeProcessor") * 6 + num("teleopAlgaeNet") * 4;
        const climb = cat<string>("endgameClimbState");
        const climbPts = climb === "Deep" ? 12 : climb === "Shallow" ? 6 : 0;
        const parked = cat<boolean>("endgameParked") ? 2 : 0;
        return autoCoralPts + teleCoralPts + autoAlgae + teleAlgae + climbPts + parked;
    }

    return 0;
}

/** A scout's per-event accuracy summary, written back to users/{uid}. */
export interface ScoutAccuracyDelta {
    scoutId: string;
    samplesAdded: number;
    avgError: number;
    /** New reliability after EWMA update. */
    reliabilityAfter: number;
    reliabilityBefore: number;
}

export interface ValidationReport {
    eventCode: string;
    season: number;
    /** Matches with an official score (auto + teleop completed). */
    eligibleMatches: number;
    /** Matches that had at least one alliance with scouting coverage. */
    coveredMatches: number;
    /** Scouts whose reliability got updated. */
    scoutsUpdated: number;
    /** Per-scout summary. */
    deltas: ScoutAccuracyDelta[];
    /** ISO timestamp of run. */
    ranAt: string;
}

// ---------------------------------------------------------------------------
// Validation runner
// ---------------------------------------------------------------------------

/** Per-scout reliability signal for one alliance of one played match. */
export interface AllianceScoutSignal {
    scoutId: string;
    /** Signal in [0,1]: accuracy of the scout's OWN entries vs the official score. */
    signal: number;
    /** Error of the full-pool consensus — kept for the report's avgError display. */
    consensusError: number;
}

/**
 * Computes per-scout reliability signals for one alliance of one played match.
 *
 * Reliability answers "how trustworthy is this scout's data?" because it is
 * consumed as a WEIGHT in the federated consensus (weight = reliability ×
 * confidence, see lib/scouting-aggregation.ts). So the signal is each scout's
 * own-entry reconstruction accuracy against the official score:
 *
 *     signal = 1 − reconstructAllianceError(scout's own entries)
 *
 * Design history (v3 — see decisions.md #24 and #30):
 *   - v1 pooled: every scout touching an alliance got the same pooled error —
 *     a careful scout in noisy company was punished for the pool.
 *   - v2 LOO marginal: fixed v1's fairness but measured *unique contribution*,
 *     not trustworthiness, on an incompatible scale vs its own single-scout
 *     fallback (`1 − error`): a perfect scout converged to 1.0 alone but to
 *     0.5 when redundant with an equally good partner, so reliability tracked
 *     coverage instead of skill. Worse: redundancy is the NORM in the
 *     federated model, so the better the coverage, the more every scout's
 *     marginal shrank toward 0 and all reliabilities decayed toward 0.5.
 *   - v3 own-entry accuracy (current): each scout is judged only on their own
 *     data, with one formula for solo and accompanied scouts alike. Keeps
 *     v2's fairness goal (pool noise can't hurt you) and matches the estimand
 *     reliability is actually used for.
 *
 * Edge cases:
 *   - Super-scouting entries are excluded entirely: they carry no objective
 *     counters, so reconstructing a score from them would register a fake
 *     ~100% error and punish super scouts for doing their job. Their
 *     reliability simply doesn't move here.
 *   - Anonymous entries (no scoutId) shape the consensus-error display but
 *     receive no signal.
 *   - A scout covering multiple teams of the alliance is evaluated on all
 *     their entries together (alliance-level reconstruction).
 *
 * Returns null when the alliance has no usable objective coverage.
 */
export function computeAllianceSignals(
    allianceEntries: MatchScouting[],
    allianceTeams: number[],
    officialScore: number,
): AllianceScoutSignal[] | null {
    // Objective entries only — mirrors aggregateMatchTeam's own filter.
    const objective = allianceEntries.filter(e => (e.scoutingMode ?? "match") !== "super");
    if (objective.length === 0) return null;

    const baseline = reconstructAllianceError(objective, allianceTeams, officialScore);
    if (baseline === null) return null;

    const scoutIds = Array.from(new Set(
        objective.map(e => e.scoutId ?? e.scouterId).filter((s): s is string => !!s),
    ));

    const signals: AllianceScoutSignal[] = [];
    for (const scoutId of scoutIds) {
        const ownEntries = objective.filter(e => (e.scoutId ?? e.scouterId) === scoutId);
        const ownError = reconstructAllianceError(ownEntries, allianceTeams, officialScore);
        if (ownError === null) continue;
        signals.push({
            scoutId,
            signal: clamp01(1 - ownError),
            consensusError: baseline,
        });
    }
    return signals;
}

/**
 * Runs ground-truth validation for an event using per-scout own-entry accuracy.
 *
 *   1. Pulls the caller org's match_scouting entries for (season, eventCode).
 *   2. Pulls official matches from the FTC API (via cached fetchMatches).
 *   3. For each played match × each alliance with objective scout coverage,
 *      computes each scout's own-entry reconstruction error vs the official
 *      score (see computeAllianceSignals for the full design rationale).
 *   4. Each scout's reliability is EWMA-updated toward `1 − ownError`.
 *      A scout whose observations track the official scores converges toward
 *      1.0; a scout whose observations are consistently off converges toward 0.
 *
 * SECURITY (C4). Scoped to a single `orgId` — the caller's own org. The query
 * is filtered by orgId so only that org's entries are read, and the user-doc
 * update is additionally gated on the target user's CURRENT orgId matching.
 * Without this, an admin/lead of one org could pass any eventCode and overwrite
 * the reliability of scouts in OTHER orgs (cross-tenant integrity / IDOR), since
 * reliability feeds every org's federated aggregation weighting. Because the M6
 * reliability signal is own-entry accuracy (independent of other orgs' data),
 * org-scoping changes no scout's computed signal — it only bounds who is read
 * and written.
 *
 * FTC scoring formula remains approximate (RP-only mechanics not counted).
 */
export async function runGroundTruthValidation(
    season: number,
    eventCode: string,
    orgId: string,
): Promise<ValidationReport> {
    const db = getAdminDb();

    // 1. Pull THIS ORG's scouting entries only. Equality-only multi-field
    // query — Firestore serves it via single-field index merge, no composite
    // index required. Entries missing orgId (pre-Sprint-1 legacy) are excluded
    // by the equality filter, which is the safe default: an un-attributed entry
    // must not let any org trigger reliability writes.
    const scoutingSnap = await db
        .collection("match_scouting")
        .where("season", "==", season)
        .where("eventCode", "==", eventCode)
        .where("orgId", "==", orgId)
        .get();
    const entries: MatchScouting[] = scoutingSnap.docs.map(
        d => ({ id: d.id, ...d.data() }) as MatchScouting,
    );

    // 2. Pull official matches.
    const matches = await fetchMatches(season, eventCode);

    // 3. Per match × alliance, compute per-scout own-entry accuracy signals.
    const obs: AllianceScoutSignal[] = [];
    let eligibleMatches = 0;
    let coveredMatches = 0;

    for (const match of matches) {
        if (!isMatchPlayed(match)) continue;
        eligibleMatches++;

        const redTeams = match.teams
            .filter(t => t.station.startsWith("Red"))
            .map(t => t.teamNumber);
        const blueTeams = match.teams
            .filter(t => t.station.startsWith("Blue"))
            .map(t => t.teamNumber);

        let matchHadCoverage = false;

        const alliances: Array<[number[], number]> = [
            [redTeams, match.scoreRedFinal],
            [blueTeams, match.scoreBlueFinal],
        ];

        for (const [allianceTeams, officialScore] of alliances) {
            // Collect all entries for this match × any team in this alliance.
            const allianceEntries = entries.filter(e =>
                e.matchNumber === match.matchNumber &&
                allianceTeams.includes(e.teamNumber),
            );
            if (allianceEntries.length === 0 || officialScore <= 0) continue;

            const signals = computeAllianceSignals(allianceEntries, allianceTeams, officialScore);
            if (signals === null) continue;
            matchHadCoverage = true;
            obs.push(...signals);
        }

        if (matchHadCoverage) coveredMatches++;
    }

    // 4. Group observations by scout and apply EWMA on the reliability signal.
    const byScout = new Map<string, { signals: number[]; errors: number[] }>();
    for (const o of obs) {
        const bucket = byScout.get(o.scoutId) ?? { signals: [], errors: [] };
        bucket.signals.push(o.signal);
        bucket.errors.push(o.consensusError);
        byScout.set(o.scoutId, bucket);
    }

    const deltas: ScoutAccuracyDelta[] = [];

    for (const [scoutId, { signals, errors }] of byScout) {
        const userRef = db.collection("users").doc(scoutId);
        const userSnap = await userRef.get();
        if (!userSnap.exists) continue;

        const data = userSnap.data() ?? {};
        // Defensive cross-tenant guard: never write a user doc whose CURRENT
        // org differs from the org being validated. The query already scopes
        // entries to `orgId`, but a scout who has since moved orgs would still
        // have old entries under this org — updating their now-foreign user doc
        // would be a cross-org write. Skip them.
        if (data.orgId !== orgId) continue;
        const reliabilityBefore = typeof data.reliability === "number" ? data.reliability : 1.0;
        const matchesScoutedBefore = typeof data.matchesScouted === "number" ? data.matchesScouted : 0;

        let reliability = reliabilityBefore;
        for (const signal of signals) {
            // EWMA toward the per-scout accuracy signal. Same α as before so
            // the convergence speed of reliability didn't suddenly change.
            reliability = (1 - RELIABILITY_ALPHA) * reliability + RELIABILITY_ALPHA * signal;
        }
        reliability = clamp01(reliability);

        await userRef.update({
            reliability,
            matchesScouted: matchesScoutedBefore + signals.length,
        });

        deltas.push({
            scoutId,
            samplesAdded: signals.length,
            // avgError = average consensus error of the alliances this scout
            // participated in. Useful for "is the scout in noisy company" lens.
            avgError: errors.reduce((a, b) => a + b, 0) / errors.length,
            reliabilityBefore,
            reliabilityAfter: reliability,
        });
    }

    return {
        eventCode,
        season,
        eligibleMatches,
        coveredMatches,
        scoutsUpdated: deltas.length,
        deltas,
        ranAt: new Date().toISOString(),
    };
}

/**
 * A match is considered "played" if there's a non-zero final score, or if the
 * postResultTime is set. Future and in-progress matches have null/0 scores.
 */
function isMatchPlayed(match: FTCMatch): boolean {
    if (match.postResultTime && match.postResultTime.length > 0) return true;
    return (match.scoreRedFinal ?? 0) + (match.scoreBlueFinal ?? 0) > 0;
}

/**
 * Reconstructs an alliance's predicted total from the given subset of entries,
 * then returns the relative error vs the official score. Scales the
 * reconstruction by per-team coverage so a single-team estimate isn't unfairly
 * penalized for the uncovered teams.
 *
 * Returns `null` when there's zero coverage — caller decides whether to skip
 * (LOO scout removal) or fall back (single-scout-only alliance).
 *
 * Exported so the LOO loop and any future test/audit code can share the
 * exact same reconstruction logic.
 */
export function reconstructAllianceError(
    entries: MatchScouting[],
    allianceTeams: number[],
    officialScore: number,
): number | null {
    let reconstruction = 0;
    let teamsCovered = 0;
    for (const teamNumber of allianceTeams) {
        const teamEntries = entries.filter(e => e.teamNumber === teamNumber);
        if (teamEntries.length === 0) continue;
        const agg = aggregateMatchTeam(teamEntries);
        if (!agg) continue;
        reconstruction += computeTeamPointsFromConsensus(agg.fields, agg.program);
        teamsCovered++;
    }
    if (teamsCovered === 0 || officialScore <= 0) return null;
    const scaled = reconstruction * (allianceTeams.length / teamsCovered);
    return clamp01(Math.abs(scaled - officialScore) / Math.max(officialScore, 1));
}

/**
 * Pulls every scout's current reliability for an org. Used by the validator UI
 * to display a "scout reliability dashboard" after a run.
 */
export async function fetchReliabilitiesForOrg(
    orgId: string,
): Promise<Array<{ scoutId: string; displayName: string; reliability: number; matchesScouted: number }>> {
    const db = getAdminDb();
    const snap = await db.collection("users").where("orgId", "==", orgId).get();
    return snap.docs.map(d => {
        const data = d.data();
        return {
            scoutId: d.id,
            displayName: data.displayName ?? "(sin nombre)",
            reliability: typeof data.reliability === "number" ? data.reliability : 1.0,
            matchesScouted: typeof data.matchesScouted === "number" ? data.matchesScouted : 0,
        };
    });
}
