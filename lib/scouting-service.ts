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
    limit,
} from "firebase/firestore";
import { PitScouting, MatchScouting, PublicPitSummary, CURRENT_GAME_SCHEMA } from "@/types/scouting";
import { DEFAULT_ORG_ID, pitRecordId } from "@/lib/constants";

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

// Shared with lib/localDatabase's offline queue — see lib/constants.
const pitDocId = pitRecordId;

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
 * Cross-org public pit summaries for a team — the "summaries from other orgs"
 * feature.
 *
 * DISABLED under the Phase 1 read lockdown. It queried `pit_scouting` across
 * orgs and read each full doc (including the private `notes`) before stripping
 * fields in JS — but the private note had already crossed the wire, and the
 * new own-org read rule rejects the cross-org query outright. Phase 2 rebuilds
 * this against a dedicated `public_pit_summaries` collection that holds ONLY the
 * shared summary, so notes can never ride along. Until then there are no
 * cross-org summaries to show (only 30311 exists), so returning [] is correct.
 *
 * Kept (rather than deleted) as the Phase 2 seam. Phase 2 restores the
 * `(season, teamNumber)` parameters and queries `public_pit_summaries`; for now
 * there are no callers and nothing cross-org to return, so it takes none.
 */
export async function getPublicPitSummaries(): Promise<PublicPitSummary[]> {
    return [];
}

// Stable per-capture id used as the Firestore document id (see below). Same
// shape localDatabase generates, so an entry keeps one id from capture through
// sync. Not content-derived on purpose: a legitimate re-scout of the same
// (team, match) must be a distinct document (audit trail), and only a *re-send
// of the same capture* should collapse to one doc.
function generateEntryId(): string {
    return `local_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

// Match Scouting — federated model. Multiple entries per (match, team) are
// expected: each scout's observation is its own document. Aggregation rules
// for resolving conflicts live in docs/architecture/collaborative-scouting-model.md §3.
//
// This function backfills required federated fields (orgId, scoutId aliases,
// gameSchemaVersion, appVersion, confidence default) so callers that haven't
// migrated yet still produce well-formed documents. New form components should
// set these explicitly; the defaults are a safety net, not the intended path.
//
// IDEMPOTENCY (C5). The write uses a DETERMINISTIC document id (the entry's own
// stable id — the Dexie local id for offline captures, or a QR-exported id) via
// create-if-not-exists. `match_scouting` is immutable (Firestore rules forbid
// update/delete: "re-scout = new entry"), so re-writing the same id must be a
// no-op, never an overwrite. This makes an interrupted offline drain (write
// committed but markAsSynced never ran), a retried mutation, or a re-scanned QR
// converge to exactly ONE document instead of duplicating.
//
// Pass an explicit `docId` to force the id; otherwise `data.id` is used, or a
// fresh id is generated for callers that supply none.
export async function saveMatchScouting(data: MatchScouting, docId?: string) {
    // Never store the client id inside the doc body — the id lives as the doc's
    // key, and readers reconstruct it as `{ id: snap.id, ...snap.data() }`.
    const { id: incomingId, ...rest } = data;
    const id = docId ?? incomingId ?? generateEntryId();

    const enriched = {
        ...rest,
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

    const ref = doc(db, MATCH_COLLECTION, id);
    // Create-if-not-exists: a prior (possibly interrupted) attempt that already
    // committed this id leaves the doc in place untouched. The existence check
    // — rather than a bare setDoc — is required because the immutability rules
    // would reject a setDoc that resolves to an update.
    const existing = await getDoc(ref);
    if (existing.exists()) return;
    await setDoc(ref, enriched);
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
    orgId: string,
    callback: (data: MatchScouting[]) => void,
    options?: { maxEntries?: number },
) {
    const maxEntries = options?.maxEntries ?? DEFAULT_LISTENER_LIMIT;
    const colRef = collection(db, MATCH_COLLECTION);
    // PHASE 1 read lockdown: scope to the caller's own org. The Firestore rule
    // (match_scouting) requires resource.data.orgId == myOrgId(), and rules
    // aren't filters — without this where() the whole query is rejected.
    const q = query(
        colRef,
        where("orgId", "==", orgId),
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
    }, (error) => {
        // Without this handler a permission-denied / missing-index error kills
        // the listener silently and the UI reads as "no scouting data".
        console.error(`[scouting] listenToMatchScouting failed for ${eventCode}:`, error);
        callback([]);
    });
}

/**
 * One-shot fetch of an event's match scouting (no listener). Used by the AI
 * assistant to build a notes digest on demand — a live subscription would be
 * wasted cost for a chat that reads the notes at most a few times per event.
 */
export async function getMatchScoutingOnce(
    season: number,
    eventCode: string,
    orgId: string,
    options?: { maxEntries?: number },
): Promise<MatchScouting[]> {
    const maxEntries = options?.maxEntries ?? DEFAULT_LISTENER_LIMIT;
    const colRef = collection(db, MATCH_COLLECTION);
    // PHASE 1 read lockdown: own-org scope (see listenToMatchScouting).
    const q = query(
        colRef,
        where("orgId", "==", orgId),
        where("season", "==", season),
        where("eventCode", "==", eventCode),
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

export async function getMatchScoutingForTeam(
    season: number,
    teamNumber: number,
    orgId: string,
    options?: { maxEntries?: number },
): Promise<MatchScouting[]> {
    const maxEntries = options?.maxEntries ?? DEFAULT_LISTENER_LIMIT;
    const colRef = collection(db, MATCH_COLLECTION);
    // PHASE 1 read lockdown: own-org scope (see listenToMatchScouting).
    const q = query(
        colRef,
        where("orgId", "==", orgId),
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
