import type { ErrorCode } from "@/lib/errors";
import type { OrgProgram } from "@/types/orgs";

/**
 * Team claims — how a user becomes admin of a team's workspace (decision #90).
 *
 * Before: any signed-in user could create `orgs/{teamNumber}` from the browser
 * and became its admin, so the first person to type "30311" owned team 30311.
 * Now a claim is a request (`team_claims/{teamNumber}`) that a superadmin
 * approves; only the server (Admin SDK) creates orgs. Joining an existing team
 * still goes through invite codes (redeemInviteAction).
 *
 * Pure module: validation and state rules, unit-tested. I/O lives in
 * app/actions/team-claims.ts.
 */

export type ClaimStatus = "pending" | "approved" | "rejected";

export interface ClaimInput {
    teamNumber: number;
    displayName: string;
    program: OrgProgram;
}

export interface TeamClaimDoc extends ClaimInput {
    status: ClaimStatus;
    requestedBy: string;
    /** Shown only to superadmins in the review queue. */
    requestedEmail: string;
    requestedName: string;
    requestedAtMs: number;
    decidedAtMs?: number;
    decidedBy?: string;
}

/** FTC and FRC team numbers are positive and (today) at most 5 digits. */
export const MAX_TEAM_NUMBER = 99_999;
export const MAX_TEAM_NAME = 60;

export type ValidationResult = { ok: true; value: ClaimInput } | { ok: false; code: ErrorCode };

/** Normalizes and validates untrusted claim input from the client. */
export function validateClaimInput(raw: unknown): ValidationResult {
    const r = (raw ?? {}) as Record<string, unknown>;
    const n = typeof r.teamNumber === "string" ? Number(r.teamNumber) : r.teamNumber;
    if (typeof n !== "number" || !Number.isInteger(n) || n < 1 || n > MAX_TEAM_NUMBER) {
        return { ok: false, code: "validation.teamNumber" };
    }
    // Collapse whitespace, strip control characters, cap length.
    const name = typeof r.displayName === "string"
        ? r.displayName.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim()
        : "";
    if (!name || name.length > MAX_TEAM_NAME) return { ok: false, code: "validation.teamName" };
    const program: OrgProgram = r.program === "FRC" ? "FRC" : "FTC";
    return { ok: true, value: { teamNumber: n, displayName: name, program } };
}

/**
 * Whether `uid` may file a claim for a team, given what already exists.
 * - an org for the team exists → join by invite instead
 * - someone else's claim is pending → wait for review
 * - the same user re-submitting a pending claim → idempotent (allowed)
 * - a rejected claim can be re-filed by anyone
 */
export function canFileClaim(
    uid: string,
    orgExists: boolean,
    existing: Pick<TeamClaimDoc, "status" | "requestedBy"> | null,
): { ok: true } | { ok: false; code: ErrorCode } {
    if (orgExists) return { ok: false, code: "org.alreadyExists" };
    if (existing?.status === "pending" && existing.requestedBy !== uid) {
        return { ok: false, code: "claim.pendingOther" };
    }
    // An approved claim whose org was later deleted can be claimed again
    // (orgExists is checked first, so "approved" alone never blocks).
    return { ok: true };
}

/**
 * A user may have at most one open claim at a time. `openClaimTeam` lives on
 * users/{uid} and is written inside the claim transaction (clients can't
 * change it — firestore.rules), so parallel requests can't open several.
 */
export function canUserOpenAnotherClaim(openClaimTeam: number | null, teamNumber: number): boolean {
    return openClaimTeam === null || openClaimTeam === teamNumber;
}

/** Whether a superadmin decision applies to this claim (only pending claims are decided). */
export function canDecide(claim: Pick<TeamClaimDoc, "status"> | null, orgExists: boolean): { ok: true } | { ok: false; code: ErrorCode } {
    if (!claim) return { ok: false, code: "claim.notFound" };
    if (claim.status !== "pending") return { ok: false, code: "claim.notPending" };
    if (orgExists) return { ok: false, code: "org.alreadyExists" };
    return { ok: true };
}
