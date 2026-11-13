import { describe, it, expect } from "vitest";
import {
    DEFAULT_APP_CONFIG,
    mergeAppConfig,
    sanitizeConfigPatch,
    parseSuperadminEmails,
    isSuperadminEmail,
} from "./app-config-schema";

describe("mergeAppConfig", () => {
    it("returns defaults for missing/empty/garbage stored docs", () => {
        expect(mergeAppConfig(undefined)).toEqual(DEFAULT_APP_CONFIG);
        expect(mergeAppConfig({})).toEqual(DEFAULT_APP_CONFIG);
        expect(mergeAppConfig("nonsense")).toEqual(DEFAULT_APP_CONFIG);
        expect(mergeAppConfig(42)).toEqual(DEFAULT_APP_CONFIG);
    });

    it("keeps stored valid values and drops unknown keys", () => {
        const merged = mergeAppConfig({
            features: { aiAssistant: false, unknownFlag: true },
            ai: { rateMaxPerWindow: 30 },
            hacked: { admin: true },
        });
        expect(merged.features.aiAssistant).toBe(false);
        expect(merged.ai.rateMaxPerWindow).toBe(30);
        expect(merged.ai.modelTier).toBe("pro");
        expect((merged as unknown as Record<string, unknown>).hacked).toBeUndefined();
        expect((merged.features as unknown as Record<string, unknown>).unknownFlag).toBeUndefined();
    });

    it("clamps the rate limit into [1,120] and rejects non-numbers", () => {
        expect(mergeAppConfig({ ai: { rateMaxPerWindow: 0 } }).ai.rateMaxPerWindow).toBe(1);
        expect(mergeAppConfig({ ai: { rateMaxPerWindow: 9999 } }).ai.rateMaxPerWindow).toBe(120);
        expect(mergeAppConfig({ ai: { rateMaxPerWindow: "50" } }).ai.rateMaxPerWindow).toBe(15);
        expect(mergeAppConfig({ ai: { rateMaxPerWindow: NaN } }).ai.rateMaxPerWindow).toBe(15);
    });

    it("rejects model tiers outside the allow-list", () => {
        expect(mergeAppConfig({ ai: { modelTier: "gpt-4o" } }).ai.modelTier).toBe("pro");
        expect(mergeAppConfig({ ai: { modelTier: "../evil" } }).ai.modelTier).toBe("pro");
    });
});

describe("sanitizeConfigPatch", () => {
    it("applies a partial patch over the current config", () => {
        const next = sanitizeConfigPatch(DEFAULT_APP_CONFIG, { features: { aiAssistant: false } });
        expect(next.features.aiAssistant).toBe(false);
        expect(next.ai.rateMaxPerWindow).toBe(DEFAULT_APP_CONFIG.ai.rateMaxPerWindow);
    });

    it("throws on structurally hostile payloads", () => {
        expect(() => sanitizeConfigPatch(DEFAULT_APP_CONFIG, null)).toThrow();
        expect(() => sanitizeConfigPatch(DEFAULT_APP_CONFIG, [1, 2])).toThrow();
        expect(() => sanitizeConfigPatch(DEFAULT_APP_CONFIG, "x")).toThrow();
    });

    it("ignores invalid field values inside an otherwise valid patch", () => {
        const next = sanitizeConfigPatch(DEFAULT_APP_CONFIG, {
            ai: { rateMaxPerWindow: -5, modelTier: "evil" },
        });
        expect(next.ai.rateMaxPerWindow).toBe(1); // clamped
        expect(next.ai.modelTier).toBe("pro");    // allow-list held
    });
});

describe("superadmin allow-list", () => {
    it("parses a comma-separated env value, normalized", () => {
        const set = parseSuperadminEmails(" A@x.com , b@y.mx ,, notanemail ");
        expect(set.has("a@x.com")).toBe(true);
        expect(set.has("b@y.mx")).toBe(true);
        expect(set.size).toBe(2);
    });

    it("matches case-insensitively and rejects non-members", () => {
        const env = "hector@example.com";
        expect(isSuperadminEmail("HECTOR@example.com", env)).toBe(true);
        expect(isSuperadminEmail("other@example.com", env)).toBe(false);
        expect(isSuperadminEmail(undefined, env)).toBe(false);
        expect(isSuperadminEmail("hector@example.com", undefined)).toBe(false);
    });

    it("empty env means nobody is superadmin (fail closed)", () => {
        expect(parseSuperadminEmails("").size).toBe(0);
        expect(parseSuperadminEmails(undefined).size).toBe(0);
    });
});
