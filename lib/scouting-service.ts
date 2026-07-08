import { db } from "./firebase";
import {
    collection,
    doc,
    setDoc,
    getDoc,
    getDocs,
    query,
    where,
    orderBy,
    onSnapshot,
    Timestamp,
    addDoc,
    limit,
} from "firebase/firestore";
import { PitScouting, MatchScouting, PublicPitSummary, CURRENT_GAME_SCHEMA } from "@/types/scouting";
import { DEFAULT_ORG_ID } from "./orgs";

// Default cap for match-scouting listeners. At ~80 matches × 6 robots × 3 scouts
// × 4 orgs federated, an event can produce ~5760 entries — way more than any
// UI needs to show or any browser can hold in memory. 500 covers the most
// recent N for a typical strategy lead view.
const DEFAULT_LISTENER_LIMIT = 500;

const PIT_COLLECTION = "pit_scouting";
const MATCH_COLLECTION = "match_scouting";

// App version is denormalized into every match_scouting entry so we can
// diagnose bug reports tied to a specific shipped version.
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";

// Federated pit scouting: docId is ${season}_${teamNumber}_${orgId}, so each
// org owns its own version of the same team's pit data. Strategic notes stay
// private to the org; only `publicSummary` is exposed cross-org via
// getPublicPitSummaries (see design doc §2.5 + §4.2).

function pitDocId(season: number, teamNumber: number, orgId: string): string {
    return `${season}_${teamNumber}_${orgId}`;
}

/**
 * Legacy docId used before Sprint 1.4 added orgId scoping. Reads still fall
 * back to this when the new-format doc doesn't exist, so historical pit data
 * captured before the migration remains visible.
 */
function legacyPitDocId(season: number, teamNumber: number): string {
    return `${season}_${teamNumber}`;
}

export async function savePitScouting(data: PitScouting) {
    const orgId = data.orgId ?? DEFAULT_ORG_ID;
    const docRef = doc(db, PIT_COLLECTION, pitDocId(data.season, data.teamNumber, orgId));
    await setDoc(
        docRef,
        {
            ...data,
            orgId,
            lastUpdatedAt: Timestamp.now(),
        },
        { merge: true },
    );
}

/**
 * Reads the pit scouting record owned by `orgId` (defaults to the current
 * default org). Falls back to the pre-1.4 legacy doc if the new-format doc
 * doesn't exist — that legacy data is implicitly attributed to DEFAULT_ORG_ID.
 */
export async function getPitScouting(
    season: number,
    teamNumber: number,
    orgId: string = DEFAULT_ORG_ID,
): Promise<PitScouting | null> {
    const primaryRef = doc(db, PIT_COLLECTION, pitDocId(season, teamNumber, orgId));
    const primarySnap = await getDoc(primaryRef);
    if (primarySnap.exists()) {
        return primarySnap.data() as PitScouting;
    }
    // Backward-compat: pre-Sprint 1.4 docs lack orgId in their id. We only
    // surface those when the caller is asking for DEFAULT_ORG_ID, since older
    // data implicitly belongs to FTC 30311 (the only writer before federation).
    if (orgId === DEFAULT_ORG_ID) {
        const legacyRef = doc(db, PIT_COLLECTION, legacyPitDocId(season, teamNumber));
        const legacySnap = await getDoc(legacyRef);
        if (legacySnap.exists()) {
            return legacySnap.data() as PitScouting;
        }
    }
    return null;
}

/**
 * Fetches public pit summaries published by any org for a given team. Used by
 * the pit form's "Public summaries from other orgs" section so scouts can see
 * what other teams have shared instead of re-interviewing the same team.
 *
 * Strips private fields (notes, scoutedBy uid) before returning. Sprint 1.6
 * will additionally gate this on event subscription membership.
 */
export async function getPublicPitSummaries(
    season: number,
    teamNumber: number,
): Promise<PublicPitSummary[]> {
    const colRef = collection(db, PIT_COLLECTION);
    const q = query(
        colRef,
        where("season", "==", season),
        where("teamNumber", "==", teamNumber),
    );
    const snap = await getDocs(q);
    const out: PublicPitSummary[] = [];
    snap.forEach(d => {
        const data = d.data() as PitScouting;
        if (!data.publicSummary || data.publicSummary.trim().length === 0) return;
        out.push({
            teamNumber: data.teamNumber,
            season: data.season,
            orgId: data.orgId ?? DEFAULT_ORG_ID,
            summary: data.publicSummary,
            sharedAt: data.publicSummarySharedAt ?? null,
        });
    });
    return out;
}

// Match Scouting — federated model. Multiple entries per (match, team) are
// expected: each scout's observation is its own document. Aggregation rules
// for resolving conflicts live in docs/architecture/collaborative-scouting-model.md §3.
//
// This function backfills required federated fields (orgId, scoutId aliases,
// gameSchemaVersion, appVersion, confidence default) so callers that haven't
// migrated yet still produce well-formed documents. New form components should
// set these explicitly; the defaults are a safety net, not the intended path.
export async function saveMatchScouting(data: MatchScouting) {
    const colRef = collection(db, MATCH_COLLECTION);

    const enriched = {
        ...data,
        // Federation defaults
        orgId: data.orgId ?? DEFAULT_ORG_ID,
        scoutId: data.scoutId ?? data.scouterId,
        scoutName: data.scoutName ?? data.scouterName,
        // Self-assessment defaults to "high"; the form should override when
        // the scout actively flags lower confidence.
        confidence: data.confidence ?? "high",
        // Provenance
        gameSchemaVersion: data.gameSchemaVersion ?? CURRENT_GAME_SCHEMA[data.program],
        appVersion: data.appVersion ?? APP_VERSION,
        // Server timestamp overrides any client-supplied one
        timestamp: Timestamp.now(),
    };

    await addDoc(colRef, enriched);
}

/**
 * Subscribes to match scouting for an event. The result is capped at
 * `maxEntries` most-recent documents to prevent unbounded payloads in the
 * federated model where many orgs may be writing simultaneously.
 *
 * Callers needing the FULL history (e.g., post-event analysis exports) should
 * page through with getMatchScoutingForTeam or build a dedicated paginated
 * query.
 */
export function listenToMatchScouting(
    season: number,
    eventCode: string,
    callback: (data: MatchScouting[]) => void,
    options?: { maxEntries?: number },
) {
    const maxEntries = options?.maxEntries ?? DEFAULT_LISTENER_LIMIT;
    const colRef = collection(db, MATCH_COLLECTION);
    const q = query(
        colRef,
        where("season", "==", season),
        where("eventCode", "==", eventCode),
        orderBy("timestamp", "desc"),
        limit(maxEntries),
    );

    return onSnapshot(q, (snapshot) => {
        const matches: MatchScouting[] = [];
        snapshot.forEach((doc) => {
            matches.push({ id: doc.id, ...doc.data() } as MatchScouting);
        });
        if (matches.length >= maxEntries) {
            console.warn(
                `[scouting] listenToMatchScouting hit limit (${maxEntries}) for ${eventCode}. ` +
                "Older entries are not loaded — pass options.maxEntries to override.",
            );
        }
        callback(matches);
    });
}

export async function getMatchScoutingForTeam(
    season: number,
    teamNumber: number,
    options?: { maxEntries?: number },
): Promise<MatchScouting[]> {
    const maxEntries = options?.maxEntries ?? DEFAULT_LISTENER_LIMIT;
    const colRef = collection(db, MATCH_COLLECTION);
    const q = query(
        colRef,
        where("season", "==", season),
        where("teamNumber", "==", teamNumber),
        orderBy("timestamp", "desc"),
        limit(maxEntries),
    );
    const querySnapshot = await getDocs(q);
    const results: MatchScouting[] = [];
    querySnapshot.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() } as MatchScouting);
    });
    return results;
}
