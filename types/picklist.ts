import type { FirestoreTimestamp } from "./orgs";

/**
 * Picklist for live alliance selection. One document per (org, event) at
 * `picklists/{orgId}_{eventCode}`. Real-time-synced via Firestore listener
 * so multiple strategy leads of the same org can collaborate.
 *
 * The shape is intentionally small — picklists are operationally simple
 * (rank, DNP, selected, declined). All scoring/weighting lives in the UI
 * which is computed from the live AggregatedTeamStats + scouting consensus.
 */
export interface Picklist {
    id: string;                  // `${orgId}_${eventCode}`
    orgId: string;
    eventCode: string;
    season: number;

    /** Ordered list of team numbers. Index 0 = first pick priority. */
    teams: number[];

    /** Teams that should NOT be picked under any circumstance. */
    doNotPick: number[];

    /** Teams already selected by SOME alliance during live selection. */
    selected: number[];

    /** Teams that declined an offer (they're a captain themselves). */
    declined: number[];

    createdBy: string;
    createdAt: FirestoreTimestamp;
    updatedAt: FirestoreTimestamp;
    updatedBy: string;
}

/** Where a team currently lives in the picklist UI. */
export type PicklistBucket = "ranked" | "doNotPick" | "available";

/** Resolves the bucket for a given team number against a picklist snapshot. */
export function bucketOf(teamNumber: number, picklist: Picklist): PicklistBucket {
    if (picklist.doNotPick.includes(teamNumber)) return "doNotPick";
    if (picklist.teams.includes(teamNumber)) return "ranked";
    return "available";
}
