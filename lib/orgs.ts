import type { User } from "firebase/auth";
import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { CodedError } from "@/lib/errors";
import type { Org, AppUser, OrgInvite, OrgProgram } from "@/types/orgs";

// Until the user document is loaded from Firestore we fall back to this org.
// Production users always have a real orgId via users/{uid}.orgId; this
// default exists for (a) non-React server contexts that don't carry a user
// doc, and (b) brand-new auth states that haven't completed onboarding yet
// (in which case writes should be blocked at the UI layer, but the cache
// would otherwise return undefined).
// Defined in lib/constants so that modules needing only this string do not
// pull the Firebase SDK through this module. Imported here for internal use
// and re-exported so existing importers keep working.
import { DEFAULT_ORG_ID } from "@/lib/constants";
export { DEFAULT_ORG_ID };

// Email → orgId overrides, useful in dev so multiple Gmail accounts can simulate
// distinct orgs without going through the onboarding flow. Keys are lowercased.
const EMAIL_ORG_OVERRIDES: Record<string, string> = {
    // populated as needed for testing federated scenarios
};

const USERS_COLLECTION = "users";
const ORGS_COLLECTION = "orgs";
const INVITES_COLLECTION = "org_invites";

// ---------------------------------------------------------------------------
// Synchronous helpers — operate on the Firebase Auth user object only.
// Forms in client components should prefer useAuth().orgId (Sprint 1.6+),
// but server actions and non-React code can use this as a fallback.
// ---------------------------------------------------------------------------

/**
 * Returns a best-effort org id derived from the Firebase Auth user only.
 * Used when no Firestore-loaded user doc is available (server actions,
 * pre-onboarding writes). Once the user has completed onboarding their
 * canonical orgId lives in users/{uid}.orgId — clients should read that
 * via useAuth() instead of this helper.
 */
export function getCurrentOrgId(user: User | null | undefined): string {
    if (!user) return DEFAULT_ORG_ID;
    const email = user.email?.toLowerCase();
    if (email && EMAIL_ORG_OVERRIDES[email]) return EMAIL_ORG_OVERRIDES[email];
    return DEFAULT_ORG_ID;
}

export function scoutIdFromUser(user: User): string {
    return user.uid;
}

export function scoutNameFromUser(user: User): string {
    return user.displayName || user.email || "Anonymous";
}

// ---------------------------------------------------------------------------
// User document lifecycle
// ---------------------------------------------------------------------------

/**
 * Reads users/{uid}, creating the doc on first sight. The created doc has
 * `orgId: null` so the AuthContext can trigger onboarding.
 *
 * This function is idempotent — calling it on every auth state change is safe
 * and only writes when the doc doesn't already exist.
 */
export async function loadOrCreateUserDoc(user: User): Promise<AppUser> {
    const ref = doc(db, USERS_COLLECTION, user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        return { id: user.uid, ...(snap.data() as Omit<AppUser, "id">) };
    }
    // First-time login — create the bare doc.
    const seed: Omit<AppUser, "id"> = {
        email: user.email ?? "",
        displayName: user.displayName ?? user.email ?? "Anonymous",
        orgId: null,
        role: "scout",
        reliability: 1.0,
        matchesScouted: 0,
        createdAt: Timestamp.now(),
    };
    await setDoc(ref, seed);
    return { id: user.uid, ...seed };
}

/** Re-reads the user doc from Firestore. Used after onboarding mutations. */
export async function refreshUserDoc(uid: string): Promise<AppUser | null> {
    const snap = await getDoc(doc(db, USERS_COLLECTION, uid));
    if (!snap.exists()) return null;
    return { id: uid, ...(snap.data() as Omit<AppUser, "id">) };
}

// ---------------------------------------------------------------------------
// Org creation / membership
// ---------------------------------------------------------------------------

export interface CreateOrgInput {
    teamNumber: number;
    displayName: string;
    program: OrgProgram;
    region?: string;
}

/**
 * Creates a NEW org for the given team number and makes the caller its `admin`.
 * Org ids are the team number stringified, so lookups are intuitive and two
 * competing "Iron Lions" orgs can't form.
 *
 * M4: this function only CREATES. Joining an *existing* org must go through an
 * invite code (redeemInvite), never a bare team number — otherwise anyone could
 * enroll into a rival team's org and read its private strategy (picklists, pit
 * notes). The Firestore rule on users/{uid} is the real boundary (a client
 * can't self-elevate role there); this keeps the UI aligned with that model.
 */
export async function createOrJoinOrgByTeamNumber(
    user: User,
    input: CreateOrgInput,
): Promise<Org> {
    const orgId = String(input.teamNumber);
    const orgRef = doc(db, ORGS_COLLECTION, orgId);
    const existing = await getDoc(orgRef);

    // Prose lives in messages/{en,es}.json under Errors.org.alreadyExists —
    // it tells the user to ask for an invite code, so it must stay translated.
    if (existing.exists()) throw new CodedError("org.alreadyExists");

    const org: Omit<Org, "id"> = {
        teamNumber: input.teamNumber,
        displayName: input.displayName,
        program: input.program,
        region: input.region,
        createdAt: Timestamp.now(),
        createdBy: user.uid,
    };
    await setDoc(orgRef, org);
    await setUserOrg(user.uid, orgId, "admin");
    return { id: orgId, ...org };
}

/** Assigns the user to an org with a specific role. */
export async function setUserOrg(uid: string, orgId: string, role: AppUser["role"]): Promise<void> {
    const userRef = doc(db, USERS_COLLECTION, uid);
    await updateDoc(userRef, { orgId, role });
}

// ---------------------------------------------------------------------------
// Invites
// ---------------------------------------------------------------------------

// 6-char alphanumeric code, omitting visually ambiguous characters (0/O, 1/I/L).
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;

function generateCode(): string {
    let out = "";
    for (let i = 0; i < CODE_LENGTH; i++) {
        out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
    }
    return out;
}

export interface CreateInviteInput {
    /** Days until the invite expires. Defaults to 7. */
    expiresInDays?: number;
    /** Max number of uses. Null = unlimited. Defaults to null. */
    maxUses?: number | null;
}

/**
 * Generates a short-code invite for an org. Retries a few times on the
 * astronomically unlikely event of a collision with an existing code.
 */
export async function createInvite(
    user: User,
    orgId: string,
    input: CreateInviteInput = {},
): Promise<OrgInvite> {
    const days = input.expiresInDays ?? 7;
    const maxUses = input.maxUses ?? null;
    const expiresAt = Timestamp.fromMillis(Date.now() + days * 24 * 60 * 60 * 1000);

    for (let attempt = 0; attempt < 5; attempt++) {
        const code = generateCode();
        const ref = doc(db, INVITES_COLLECTION, code);
        const existing = await getDoc(ref);
        if (existing.exists()) continue;
        const invite: Omit<OrgInvite, "code"> = {
            orgId,
            createdBy: user.uid,
            createdAt: Timestamp.now(),
            expiresAt,
            uses: 0,
            maxUses,
        };
        await setDoc(ref, invite);
        return { code, ...invite };
    }
    throw new CodedError("org.codeGeneration");
}

// Invite REDEMPTION lives server-side in app/actions/redeem-invite.ts
// (redeemInviteAction), NOT here. Joining an existing org sets
// users/{uid}.orgId to an org the caller didn't create; the Firestore rule
// forbids a client from doing that (it would let a scout self-join a rival org
// and read its strategy — M4 vector 2), so the write must go through the Admin
// SDK. Only invite *creation* (createInvite, above) stays client-side, since a
// lead/admin generating a code for their OWN org is not a cross-tenant risk.
