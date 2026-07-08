// Federated org model — see docs/architecture/collaborative-scouting-model.md
// §2.1 (Org), §2.2 (User), and Sprint 1.6 implementation notes.

export type OrgProgram = "FTC" | "FRC";
export type OrgRole = "scout" | "lead" | "admin";

/** Firestore Timestamp shape as seen by the Web SDK. */
export type FirestoreTimestamp = { seconds: number; nanoseconds: number } | null;

export interface Org {
    id: string;                     // typically `${teamNumber}` but not enforced
    teamNumber: number;
    displayName: string;
    program: OrgProgram;
    region?: string;
    createdAt: FirestoreTimestamp;
    createdBy: string;              // Firebase Auth uid
}

/**
 * Sensitive per-org configuration. Lives in a SEPARATE collection
 * `org_secrets/{orgId}` because Firestore rules can't field-mask reads on
 * the public `orgs/{orgId}` doc — putting secrets there would leak them to
 * any authed user. This collection is admin/lead-only.
 */
export interface OrgSecrets {
    orgId: string;
    /**
     * Discord incoming-webhook URL. Server-only at the rules layer; clients
     * see a boolean "configured" indicator via the hasDiscordWebhookAction.
     * Empty string or missing = no notifications.
     */
    discordWebhookUrl?: string;
}

export interface AppUser {
    id: string;                     // Firebase Auth uid
    email: string;
    displayName: string;
    orgId: string | null;           // null = pending onboarding
    role: OrgRole;
    reliability: number;            // 0–1, updated by ground-truth validation (Sprint 1.7)
    matchesScouted: number;
    createdAt: FirestoreTimestamp;
}

/**
 * Short-code invite. The document id IS the code, lowercased. Lookups are
 * O(1). The code is short (6 chars) and human-friendly so it can be shared
 * verbally at an event ("our invite is RJN284") without copy-paste.
 */
export interface OrgInvite {
    code: string;
    orgId: string;
    createdBy: string;
    createdAt: FirestoreTimestamp;
    expiresAt: FirestoreTimestamp;
    uses: number;
    maxUses: number | null;         // null = unlimited
}
