import { describe, it, expect } from "vitest";
import {
    validateClaimInput,
    canFileClaim,
    canUserOpenAnotherClaim,
    canDecide,
    MAX_TEAM_NAME,
} from "./team-claims";

describe("validateClaimInput", () => {
    it("accepts a normal claim and normalizes the name", () => {
        const r = validateClaimInput({ teamNumber: "30311", displayName: "  Iron \n Lions  ", program: "FTC" });
        expect(r).toEqual({ ok: true, value: { teamNumber: 30311, displayName: "Iron Lions", program: "FTC" } });
    });
    it("rejects bad team numbers", () => {
        for (const n of [0, -1, 1.5, 100_000, "abc", "", null, NaN, Infinity]) {
            expect(validateClaimInput({ teamNumber: n, displayName: "X" })).toEqual({ ok: false, code: "validation.teamNumber" });
        }
    });
    it("rejects empty, control-only or overlong names", () => {
        for (const name of ["", "   ", "\u0000\u0007", "x".repeat(MAX_TEAM_NAME + 1), 42]) {
            expect(validateClaimInput({ teamNumber: 1, displayName: name })).toEqual({ ok: false, code: "validation.teamName" });
        }
    });
    it("defaults unknown programs to FTC", () => {
        const r = validateClaimInput({ teamNumber: 1, displayName: "A", program: "VEX" });
        expect(r.ok && r.value.program).toBe("FTC");
    });
    it("tolerates garbage input without throwing", () => {
        expect(validateClaimInput(undefined).ok).toBe(false);
        expect(validateClaimInput("nope").ok).toBe(false);
    });
});

describe("canFileClaim", () => {
    it("blocks when the team already has a workspace", () => {
        expect(canFileClaim("u1", true, null)).toEqual({ ok: false, code: "org.alreadyExists" });
    });
    it("blocks a second person while a claim is under review", () => {
        expect(canFileClaim("u2", false, { status: "pending", requestedBy: "u1" })).toEqual({ ok: false, code: "claim.pendingOther" });
    });
    it("lets the same person re-submit (idempotent) and anyone re-file after a rejection", () => {
        expect(canFileClaim("u1", false, { status: "pending", requestedBy: "u1" })).toEqual({ ok: true });
        expect(canFileClaim("u2", false, { status: "rejected", requestedBy: "u1" })).toEqual({ ok: true });
    });
    it("an approved claim blocks only while its org exists", () => {
        expect(canFileClaim("u2", true, { status: "approved", requestedBy: "u1" })).toEqual({ ok: false, code: "org.alreadyExists" });
        expect(canFileClaim("u2", false, { status: "approved", requestedBy: "u1" })).toEqual({ ok: true });
    });
});

describe("one open claim per user", () => {
    it("allows a first claim or re-submitting the same team, blocks a different one", () => {
        expect(canUserOpenAnotherClaim(null, 1)).toBe(true);
        expect(canUserOpenAnotherClaim(1, 1)).toBe(true);
        expect(canUserOpenAnotherClaim(1, 2)).toBe(false);
    });
});

describe("canDecide", () => {
    it("only pending claims for teams without a workspace", () => {
        expect(canDecide(null, false)).toEqual({ ok: false, code: "claim.notFound" });
        expect(canDecide({ status: "approved" }, false)).toEqual({ ok: false, code: "claim.notPending" });
        expect(canDecide({ status: "pending" }, true)).toEqual({ ok: false, code: "org.alreadyExists" });
        expect(canDecide({ status: "pending" }, false)).toEqual({ ok: true });
    });
});
