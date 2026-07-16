// Pure, framework-free validation for invite redemption. Extracted from the
// Admin-SDK server action (app/actions/redeem-invite.ts) so the security-
// relevant checks (expiry, use cap, org existence) are unit-testable without a
// Firestore emulator. `nowMs` is injected rather than read from Date.now() so
// expiry can be tested deterministically.

/** Shape of an org_invites document, as far as redemption cares. */
export interface InviteDoc {
    orgId: string;
    uses?: number;
    maxUses?: number | null;
    // Firestore Timestamp — only `.seconds` is used here.
    expiresAt?: { seconds?: number } | null;
}

export type InviteValidation = { ok: true } | { ok: false; error: string };

/**
 * Validates an invite for redemption. Order (expiry → use cap → org exists)
 * mirrors the original client-side redeemInvite so error messages are stable.
 *
 * @param invite    the invite doc, or null if the code wasn't found
 * @param orgExists whether the org the invite points at still exists
 * @param nowMs     current time in epoch ms (injected for testability)
 */
export function validateInvite(
    invite: InviteDoc | null,
    orgExists: boolean,
    nowMs: number,
): InviteValidation {
    if (!invite) return { ok: false, error: "Código de invitación no encontrado" };

    const expiresAtSeconds = invite.expiresAt?.seconds ?? 0;
    if (expiresAtSeconds > 0 && expiresAtSeconds * 1000 < nowMs) {
        return { ok: false, error: "Este código de invitación ya expiró" };
    }

    const maxUses = invite.maxUses ?? null;
    if (maxUses !== null && (invite.uses ?? 0) >= maxUses) {
        return { ok: false, error: "Este código de invitación alcanzó el límite de usos" };
    }

    if (!orgExists) {
        return { ok: false, error: "El equipo asociado a esta invitación ya no existe" };
    }

    return { ok: true };
}

/** Normalizes a raw invite code for document lookup (trim + uppercase). */
export function normalizeInviteCode(raw: string): string {
    return raw.trim().toUpperCase();
}
