import { AggregatedTeamStats, MatchScouting, PitScouting } from "@/types/scouting";
import { winProbabilityFromProjections } from "@/lib/win-probability";

/**
 * Model constants. The weights below are calibrated against the DECODE 2025-2026
 * season. After enough calibration_log entries accumulate (Sprint 5+), these
 * should be re-fit from observed Brier score on real predictions.
 *
 * Win-probability slope lives in lib/win-probability.ts (WIN_PROB_LOGISTIC_K)
 * — the shared module is the single source of truth for that model.
 */
const MODEL = {
    // Prior variance assumption for API base score (coefficient of variation).
    // ~20% CV is consistent with FTC OPR noise reported in community analyses.
    apiPriorCV: 0.20,
    // Driver skill swing — capped to ±7.5% of projected score.
    driverSkillImpact: 0.15,
    // Mechanical risk multiplier applied if pit notes flag a known issue.
    mechanicalRiskPenalty: 0.4,
};

// Sample variance helper.
function variance(xs: number[]): number {
    if (xs.length < 2) return Infinity;
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sse = xs.reduce((acc, x) => acc + (x - mean) ** 2, 0);
    return sse / (xs.length - 1);
}

/**
 * Red flags emitted by the projection layer (and, in the briefing composer,
 * by the "no data on this team" fallbacks) — as a translation KEY, not
 * prose. Rendered via next-intl, namespace "Projections". See
 * docs/architecture/i18n.md.
 */
export type RedFlag =
    | { key: "mechanicalRisk" }
    | { key: "noAggregatedData" }
    | { key: "noData" };

/**
 * Strategic insights from `predictMatch` — translation KEY plus params,
 * NOT formed prose. Rendered via next-intl, namespace "Projections".
 */
export type ProjectionInsight =
    | { key: "redAutoAdvantage" }
    | { key: "blueAutoAdvantage" }
    | { key: "highConfidence" }
    | { key: "technicalTie" };

export interface TeamProjection {
    teamNumber: number;
    projectedPoints: number;
    breakdown: {
        auto: number;
        teleop: number;
        endgame: number;
    };
    confidence: number; // 0-1
    reliability: "high" | "medium" | "low";
    redFlags: RedFlag[];
}

export interface MatchProjection {
    redAlliance: {
        score: number;
        teams: TeamProjection[];
    };
    blueAlliance: {
        score: number;
        teams: TeamProjection[];
    };
    winProbability: number; // For Red Alliance (0-1)
    insights: ProjectionInsight[];
}

/**
 * Hybrid Projection Engine (V3)
 *
 * Blends API-derived base score with live scouting observations using a
 * principled Bayesian posterior (inverse-variance weighting) instead of the
 * previous fixed 60/40 split.
 *
 * Intuition: the API base is a prior with variance σ²_prior. Each scouting
 * match is an observation with noise σ²_scout. With n scouting matches the
 * weight on scout data is proportional to n / σ²_scout, and the weight on
 * the prior is proportional to 1 / σ²_prior. So at n=0 the prior dominates,
 * at n=5+ the scout data dominates if observations are consistent (low σ²).
 *
 * This automatically handles early-season cold start (no scouting → trust API)
 * and late-season high-confidence scouting (lots of consistent data → trust
 * scouts), without arbitrary hand-tuned weights.
 *
 * Component breakdown (auto/teleop/endgame) is computed from observed shares
 * when scouting data is available, falling back to API averages or a sensible
 * default split when not.
 */
export function calculateTeamProjection(
    team: AggregatedTeamStats,
    scoutingEntries: MatchScouting[],
    pitData: PitScouting | null
): TeamProjection {
    const redFlags: RedFlag[] = [];
    // Total entry count INCLUDING super-scouting entries. Only valid for the
    // subjective driver-skill modifier below — every objective statistic must
    // use scoredCount instead (super entries carry no counter data).
    const n = scoutingEntries.length;

    // 1. Prior from API: assume CV of ~20% on observed average score.
    const apiBase = team.averageMatchPoints;
    const priorVar = Math.pow(Math.max(apiBase, 1) * MODEL.apiPriorCV, 2);

    // 2. Per-match scouted scores and per-phase breakdowns.
    const scoutedScores: number[] = [];
    const scoutedAutos: number[] = [];
    const scoutedTeles: number[] = [];
    const scoutedEnds: number[] = [];

    for (const item of scoutingEntries) {
        const match = item as import("@/types/scouting").FTCMatchScouting;
        // Skip super-scouting entries: they only carry subjective fields and
        // would contribute zeros to the per-phase totals.
        if ((match.scoutingMode ?? "match") === "super") continue;
        const auto =
            ((match.autoPurpleArtifacts ?? 0) * 3) +
            ((match.autoGreenArtifacts ?? 0) * 3) +
            (match.autoPoints ?? 0);
        const tele =
            ((match.teleopPurpleArtifacts ?? 0) * 2) +
            ((match.teleopGreenArtifacts ?? 0) * 2) +
            ((match.patternsCompleted ?? 0) * 10);
        const parkingPoints = match.endgameBaseParking === 'Full' ? 10 : match.endgameBaseParking === 'Partial' ? 5 : 0;
        const end = (match.dualParking ? 20 : 0) + parkingPoints;

        scoutedAutos.push(auto);
        scoutedTeles.push(tele);
        scoutedEnds.push(end);
        scoutedScores.push(auto + tele + end);
    }

    // Objective observation count. Distinct from n: the loop above skips
    // super-scouting entries, so every statistic over scoutedScores must
    // divide by scoredCount. (Dividing by n understated the mean whenever
    // super entries were present, and with e.g. 1 match + 2 super entries the
    // n>=2 guard let variance() see a single-element array → Infinity → the
    // real observation was silently discarded.)
    const scoredCount = scoutedScores.length;
    const scoutMean = scoredCount > 0
        ? scoutedScores.reduce((a, b) => a + b, 0) / scoredCount
        : apiBase;

    // 3. Bayesian posterior (inverse-variance weighting).
    // Per-observation variance estimated from the sample; with a single
    // scored match we fall back to the prior variance to avoid trusting a
    // single point.
    let hybridBase: number;
    let posteriorVar: number;
    if (scoredCount === 0) {
        hybridBase = apiBase;
        posteriorVar = priorVar;
    } else {
        const scoutVar = scoredCount >= 2 ? Math.max(variance(scoutedScores), 1) : priorVar;
        const scoutVarMean = scoutVar / scoredCount;  // variance of the sample mean
        const priorPrecision = 1 / priorVar;
        const scoutPrecision = 1 / scoutVarMean;
        const totalPrecision = priorPrecision + scoutPrecision;
        hybridBase = (apiBase * priorPrecision + scoutMean * scoutPrecision) / totalPrecision;
        posteriorVar = 1 / totalPrecision;
    }

    // 4. Qualitative modifiers (multiplicative on hybrid base).
    let multiplier = 1.0;

    if (n > 0) {
        // driverSkill legitimately comes from BOTH match and super entries
        // (super-scouting exists precisely to capture it), so this modifier
        // deliberately averages over all n entries, not just scored ones.
        // Use 3 (neutral) as default for entries that don't report driverSkill.
        const avgSkill = scoutingEntries.reduce((acc, e) => acc + (e.driverSkill ?? 3), 0) / n;
        // Swing from -7.5% to +7.5% based on skill (1-5 Likert centered on 3).
        multiplier += (avgSkill - 3) * (MODEL.driverSkillImpact / 2);
    }

    if (pitData?.notes?.toLowerCase().includes("fallo") || pitData?.notes?.toLowerCase().includes("broken")) {
        redFlags.push({ key: "mechanicalRisk" });
        multiplier *= (1 - MODEL.mechanicalRiskPenalty);
    }

    const projectedTotal = hybridBase * multiplier;

    // 5. Component breakdown — observed shares when we have scored scouting
    // data, otherwise API averages, otherwise the historical FTC default
    // split. Shares are ratios, so raw sums work — no per-entry mean needed.
    // When every scored observation totals 0 we fall through to the API/
    // default branches so the breakdown always sums to projectedPoints
    // (previously the `|| 1` guard produced an all-zero breakdown alongside
    // a non-zero projection).
    const obsAuto = scoutedAutos.reduce((a, b) => a + b, 0);
    const obsTele = scoutedTeles.reduce((a, b) => a + b, 0);
    const obsEnd = scoutedEnds.reduce((a, b) => a + b, 0);
    const observedTotal = obsAuto + obsTele + obsEnd;
    let autoComp: number, teleComp: number, endComp: number;
    if (scoredCount > 0 && observedTotal > 0) {
        autoComp = projectedTotal * (obsAuto / observedTotal);
        teleComp = projectedTotal * (obsTele / observedTotal);
        endComp = projectedTotal * (obsEnd / observedTotal);
    } else if (team.averageAutoPoints && team.averageMatchPoints) {
        const autoShare = team.averageAutoPoints / team.averageMatchPoints;
        const remaining = projectedTotal * (1 - autoShare);
        autoComp = projectedTotal * autoShare;
        // 80/20 teleop/endgame split of the remainder is the historical FTC default.
        teleComp = remaining * 0.8;
        endComp = remaining * 0.2;
    } else {
        autoComp = projectedTotal * 0.25;
        teleComp = projectedTotal * 0.60;
        endComp = projectedTotal * 0.15;
    }

    // 6. Confidence as 1 - (posterior CV). Bounded to [0.1, 0.99] so it's
    // never absurdly low or falsely perfect.
    // posteriorVar describes hybridBase (pre-multiplier), and a multiplicative
    // modifier scales mean and sd equally — so the CV divides by hybridBase.
    // Dividing by projectedTotal (post-multiplier) wrongly deflated confidence
    // whenever the mechanical-risk penalty was active.
    const posteriorCV = Math.sqrt(posteriorVar) / Math.max(hybridBase, 1);
    const confidence = Math.min(0.99, Math.max(0.1, 1 - posteriorCV));

    return {
        teamNumber: team.teamNumber,
        projectedPoints: Math.round(projectedTotal),
        breakdown: {
            auto: autoComp,
            teleop: teleComp,
            endgame: endComp,
        },
        confidence,
        // Keyed off OBJECTIVE observations: a pile of super-scouting entries
        // alone says nothing about scoring, so it must not claim medium/high.
        reliability: scoredCount >= 4 ? "high" : scoredCount > 0 ? "medium" : "low",
        redFlags,
    };
}

/**
 * Win Probability Engine.
 *
 * Delegates to the shared model in lib/win-probability.ts (projection-only
 * entry point: logistic on the score difference normalized by average score).
 * Replaces the previous piecewise-linear pseudo-logistic which over-saturated
 * at the tails (a 50-point lead would clamp to 0.98 when the calibrated
 * probability should be ~0.85). The logistic is the standard model used by
 * Statbotics, TBA Insights, and Caleb Sykes' Elo work.
 */
export function predictMatch(
    redTeams: TeamProjection[],
    blueTeams: TeamProjection[]
): MatchProjection {
    const redScore = redTeams.reduce((a, b) => a + b.projectedPoints, 0);
    const blueScore = blueTeams.reduce((a, b) => a + b.projectedPoints, 0);

    // diff/avgScore also drive the strategic insights below.
    const diff = redScore - blueScore;
    const avgScore = Math.max((redScore + blueScore) / 2, 1);

    const winProbability = winProbabilityFromProjections(redScore, blueScore);

    const insights: ProjectionInsight[] = [];

    // Strategic Insights
    const redAuto = redTeams.reduce((a, b) => a + b.breakdown.auto, 0);
    const blueAuto = blueTeams.reduce((a, b) => a + b.breakdown.auto, 0);

    if (redAuto > blueAuto * 1.25) insights.push({ key: "redAutoAdvantage" });
    if (blueAuto > redAuto * 1.25) insights.push({ key: "blueAutoAdvantage" });

    const highConfidence = redTeams.every(t => t.reliability === "high") && blueTeams.every(t => t.reliability === "high");
    if (highConfidence) insights.push({ key: "highConfidence" });

    if (Math.abs(diff) < avgScore * 0.05) insights.push({ key: "technicalTie" });

    return {
        redAlliance: { score: redScore, teams: redTeams },
        blueAlliance: { score: blueScore, teams: blueTeams },
        winProbability,
        insights
    };
}
