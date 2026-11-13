import { describe, it, expect } from "vitest";
import {
    AI_LIMITS,
    MODELS,
    DEFAULT_TIER,
    resolveModel,
    validateMessage,
    sanitizeHistory,
    capContext,
} from "./ai-guards";

describe("resolveModel — allow-list (C3: no client-controlled model)", () => {
    it("resolves a known tier to its concrete id", () => {
        expect(resolveModel("pro")).toBe(MODELS.pro);
    });

    it("falls back to the default tier for unknown / missing keys", () => {
        expect(resolveModel(undefined)).toBe(MODELS[DEFAULT_TIER]);
        expect(resolveModel("flash")).toBe(MODELS[DEFAULT_TIER]);
        expect(resolveModel("")).toBe(MODELS[DEFAULT_TIER]);
    });

    it("never lets a path-injection payload through — always a known id", () => {
        // The whole point: an attacker-controlled string can't reach the URL.
        const evil = "../../../../models/anything:generateContent?key=stolen#";
        expect(resolveModel(evil)).toBe(MODELS[DEFAULT_TIER]);
        // The resolved value is always one of the allow-listed ids.
        expect(Object.values(MODELS)).toContain(resolveModel(evil));
    });
});

describe("validateMessage", () => {
    it("rejects empty / whitespace / non-string", () => {
        expect(validateMessage("")).toEqual({ ok: false, reason: "empty" });
        expect(validateMessage("   ")).toEqual({ ok: false, reason: "empty" });
        expect(validateMessage(null)).toEqual({ ok: false, reason: "empty" });
        expect(validateMessage(123)).toEqual({ ok: false, reason: "empty" });
    });

    it("trims and accepts a normal message", () => {
        expect(validateMessage("  hola  ")).toEqual({ ok: true, value: "hola" });
    });

    it("rejects messages over the char cap", () => {
        const long = "a".repeat(AI_LIMITS.maxMessageChars + 1);
        expect(validateMessage(long)).toEqual({ ok: false, reason: "too-long" });
    });

    it("accepts a message exactly at the cap", () => {
        const atCap = "a".repeat(AI_LIMITS.maxMessageChars);
        expect(validateMessage(atCap)).toEqual({ ok: true, value: atCap });
    });
});

describe("sanitizeHistory", () => {
    it("returns [] for non-array input", () => {
        expect(sanitizeHistory(undefined)).toEqual([]);
        expect(sanitizeHistory("nope")).toEqual([]);
        expect(sanitizeHistory({ role: "user", content: "x" })).toEqual([]);
    });

    it("drops malformed turns (bad role, non-string content, junk)", () => {
        const mixed = [
            { role: "user", content: "keep" },
            { role: "system", content: "drop — bad role" },
            { role: "assistant", content: 42 },
            null,
            "string",
            { role: "assistant", content: "keep2" },
        ];
        expect(sanitizeHistory(mixed)).toEqual([
            { role: "user", content: "keep" },
            { role: "assistant", content: "keep2" },
        ]);
    });

    it("keeps only the most recent maxHistoryTurns", () => {
        const many = Array.from({ length: AI_LIMITS.maxHistoryTurns + 5 }, (_, i) => ({
            role: "user" as const,
            content: `m${i}`,
        }));
        const out = sanitizeHistory(many);
        expect(out).toHaveLength(AI_LIMITS.maxHistoryTurns);
        // Kept the tail, not the head.
        expect(out[out.length - 1].content).toBe(`m${AI_LIMITS.maxHistoryTurns + 4}`);
        expect(out[0].content).toBe("m5");
    });

    it("trims from the front until under the total-chars budget", () => {
        // Three turns of ~9k chars each (27k) → budget 20k drops the oldest,
        // leaving the last 2 (~18k, under budget).
        const big = Array.from({ length: 3 }, (_, i) => ({
            role: "user" as const,
            content: "x".repeat(9000) + i,
        }));
        const out = sanitizeHistory(big);
        expect(out).toHaveLength(2);
        const total = out.reduce((n, t) => n + t.content.length, 0);
        expect(total).toBeLessThanOrEqual(AI_LIMITS.maxHistoryTotalChars);
        // Kept the newest turns.
        expect(out[out.length - 1].content.endsWith("2")).toBe(true);
    });
});

describe("capContext", () => {
    it("serializes an object to JSON", () => {
        expect(capContext({ page: "/x", n: 2 })).toBe('{"page":"/x","n":2}');
    });

    it("returns {} for undefined/null", () => {
        expect(capContext(undefined)).toBe("{}");
        expect(capContext(null)).toBe("{}");
    });

    it("survives a circular structure without throwing", () => {
        const a: Record<string, unknown> = {};
        a.self = a;
        expect(capContext(a)).toBe("{}");
    });

    it("truncates oversized context", () => {
        const huge = { blob: "z".repeat(AI_LIMITS.maxContextChars * 2) };
        const out = capContext(huge);
        expect(out.length).toBeLessThanOrEqual(AI_LIMITS.maxContextChars + "…(truncado)".length);
        expect(out.endsWith("…(truncado)")).toBe(true);
    });
});
