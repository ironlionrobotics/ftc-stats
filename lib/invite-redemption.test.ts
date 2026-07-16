import { describe, it, expect } from "vitest";
import { validateInvite, normalizeInviteCode, type InviteDoc } from "./invite-redemption";

const NOW = 1_700_000_000_000; // fixed epoch ms for deterministic expiry checks

function invite(overrides: Partial<InviteDoc> = {}): InviteDoc {
    return {
        orgId: "30311",
        uses: 0,
        maxUses: null,
        expiresAt: { seconds: Math.floor(NOW / 1000) + 86400 }, // +1 day
        ...overrides,
    };
}

describe("validateInvite", () => {
    it("accepts a fresh, unexpired, uncapped invite for an existing org", () => {
        expect(validateInvite(invite(), true, NOW)).toEqual({ ok: true });
    });

    it("rejects a missing invite (code not found)", () => {
        expect(validateInvite(null, true, NOW)).toEqual({
            ok: false,
            error: "Código de invitación no encontrado",
        });
    });

    it("rejects an expired invite", () => {
        const expired = invite({ expiresAt: { seconds: Math.floor(NOW / 1000) - 1 } });
        expect(validateInvite(expired, true, NOW)).toEqual({
            ok: false,
            error: "Este código de invitación ya expiró",
        });
    });

    it("treats expiresAt=0 / missing as no-expiry", () => {
        expect(validateInvite(invite({ expiresAt: null }), true, NOW)).toEqual({ ok: true });
        expect(validateInvite(invite({ expiresAt: { seconds: 0 } }), true, NOW)).toEqual({ ok: true });
    });

    it("rejects when the use cap is reached", () => {
        expect(validateInvite(invite({ uses: 5, maxUses: 5 }), true, NOW)).toEqual({
            ok: false,
            error: "Este código de invitación alcanzó el límite de usos",
        });
    });

    it("allows unlimited uses when maxUses is null", () => {
        expect(validateInvite(invite({ uses: 9999, maxUses: null }), true, NOW)).toEqual({ ok: true });
    });

    it("rejects when the target org no longer exists", () => {
        expect(validateInvite(invite(), false, NOW)).toEqual({
            ok: false,
            error: "El equipo asociado a esta invitación ya no existe",
        });
    });

    it("checks expiry before the use cap (stable error precedence)", () => {
        const both = invite({ expiresAt: { seconds: Math.floor(NOW / 1000) - 1 }, uses: 5, maxUses: 5 });
        expect(validateInvite(both, true, NOW)).toEqual({
            ok: false,
            error: "Este código de invitación ya expiró",
        });
    });
});

describe("normalizeInviteCode", () => {
    it("trims and uppercases", () => {
        expect(normalizeInviteCode("  abc234 ")).toBe("ABC234");
    });
});
