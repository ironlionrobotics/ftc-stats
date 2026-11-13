"use server";

import { isValidSeason } from "@/lib/input-guards";
import { getCurrentSeason } from "@/lib/constants";
import { serverCache } from "@/lib/server-cache";
import { fetchEvents, fetchMatches, fetchMatchScores } from "@/lib/ftc-api";
import { trainLogistic, type LogisticModel } from "@/lib/logistic-regression";
import {
    extractTrainingSet,
    rpModelCacheKey,
    withRpObservations,
    type RPTarget,
    type RpLabeledMatch,
} from "@/lib/rp-inference";
import { seasonRulesFor } from "@/lib/games/season-rules";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import type { ErrorCode } from "@/lib/errors";

/**
 * Trains per-RP logistic-regression models from a full season of FTC API
 * match data. Admin/lead-only. Models persist in the server cache under
 * `rp-model:{season}:{target}:vN` (see rpModelCacheKey for version history)
 * so inference (during predictions, briefings, etc.) reads them with one
 * round-trip.
 *
 * Cost: pulls every event's matches in a season (sequential to avoid burst
 * API limits). Expected: ~10-30 events × cached fetchMatches per event.
 * Run weekly during the season; daily during championships if needed.
 */
export async function trainRpModelsAction(input: {
    idToken: string;
    season: number;
}): Promise<
    | {
          ok: true;
          report: {
              season: number;
              models: Array<{
                  target: RPTarget;
                  sampleSize: number;
                  finalLoss: number;
                  trainedAt: number;
              }>;
              eventsProcessed: number;
              /** True when the season's RPs use count models (no training). */
              countModel?: boolean;
          };
      }
    | { ok: false; code: ErrorCode }
> {
    if (!input.idToken) return { ok: false, code: "auth.missingToken" };
    let uid: string;
    try {
        const decoded = await getAdminAuth().verifyIdToken(input.idToken);
        uid = decoded.uid;
    } catch {
        return { ok: false, code: "auth.invalidToken" };
    }
    let userSnap;
    try {
        userSnap = await getAdminDb().collection("users").doc(uid).get();
    } catch {
        return { ok: false, code: "admin.firestoreUnavailable" };
    }
    if (!userSnap.exists) return { ok: false, code: "auth.userNotFound" };
    const role = userSnap.data()?.role;
    if (role !== "admin" && role !== "lead") {
        return { ok: false, code: "auth.notAdmin" };
    }

    if (!serverCache.remoteEnabled) {
        return { ok: false, code: "rpModel.notConfigured" };
    }

    // Pull the season's MEXICAN events, then their matches. fetchEvents
    // returns the world catalog (~1,850 events); iterating all of them meant
    // tens of minutes of sequential API fan-out from one admin click. MX
    // events (~12/season) match the "~10-30 events" budget documented above,
    // and RP models are used for Mexican-event predictions anyway.
    const events = (await fetchEvents(input.season)).filter(
        (e) => e.country === "Mexico" || e.countryCode === "MX" || e.code.startsWith("MX"),
    );
    // Sequential to stay polite to the FTC API + the cached fetchMatches
    // already deduplicates within a single request, so this is cheap on
    // warm cache.
    // Count-model seasons (BIOBUZZ) need no training — their RPs are modeled
    // directly from counts (lib/rp-counts.ts).
    const targets: RPTarget[] = seasonRulesFor(input.season).rpTargets
        .filter(t => t.kind === "logistic")
        .map(t => t.id);
    if (targets.length === 0) {
        return { ok: true, report: { season: input.season, models: [], eventsProcessed: 0, countModel: true } };
    }

    // Labels come from the official /scores breakdown attached per match.
    const allMatches: RpLabeledMatch[] = [];
    for (const event of events) {
        try {
            const [matches, scores] = await Promise.all([
                fetchMatches(input.season, event.code),
                fetchMatchScores(input.season, event.code),
            ]);
            allMatches.push(...withRpObservations(input.season, matches, scores));
        } catch (e) {
            // Skip events with broken data — better than failing the whole train.
            console.warn(`[train-rp] skipping ${event.code}:`, e instanceof Error ? e.message : e);
        }
    }

    const reports: Array<{
        target: RPTarget;
        sampleSize: number;
        finalLoss: number;
        trainedAt: number;
    }> = [];

    for (const target of targets) {
        const { features, labels } = extractTrainingSet(allMatches, target);
        // Need at least a handful of positives AND negatives to train. Skip if
        // one class is completely absent (would produce a degenerate model).
        const positives = labels.filter(l => l === 1).length;
        const negatives = labels.length - positives;
        if (positives < 10 || negatives < 10) {
            console.warn(
                `[train-rp] not enough labeled data for ${target}: pos=${positives}, neg=${negatives}`,
            );
            continue;
        }

        const model = trainLogistic(features, labels, {
            maxIter: 2000,
            l2: 0.01,
        });

        const cached: LogisticModel = model;
        // 30-day TTL so stale models don't haunt the next season.
        const modelKey = rpModelCacheKey(input.season, target);
        const saved = await serverCache.set(modelKey, cached, 30 * 24 * 60 * 60);
        if (!saved) {
            // Don't let this instance serve a model nobody else can see.
            serverCache.forgetLocal(modelKey);
            return { ok: false, code: "rpModel.notConfigured" };
        }

        reports.push({
            target,
            sampleSize: model.sampleSize,
            finalLoss: model.finalLoss,
            trainedAt: model.trainedAt,
        });
    }

    return {
        ok: true,
        report: {
            season: input.season,
            models: reports,
            eventsProcessed: events.length,
        },
    };
}

/**
 * Fetches a cached RP model from the server cache. Returns null when the model isn't
 * trained yet — callers fall back to the heuristic via inferTeamRpProbability.
 */
export async function getRpModelAction(input: {
    season: number;
    target: RPTarget;
}): Promise<LogisticModel | null> {
    // Public action: only well-formed seasons/targets reach the cache.
    if (!isValidSeason(input?.season, getCurrentSeason()) || typeof input?.target !== "string" || !/^[a-z0-9]{1,20}$/i.test(input.target)) return null;
    return serverCache.get<LogisticModel>(rpModelCacheKey(input.season, input.target));
}
