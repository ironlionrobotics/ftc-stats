import { describe, it, expect } from "vitest";
import {
    DEFAULT_APP_CONFIG,
    mergeAppConfig,
    sanitizeConfigPatch,
    parseSuperadminEmails,
    isSuperadminEmail,
    bannerText,
    resolveFlag,
    BANNER_MAX,
    diffConfig,
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

describe("feature flags and banner (#119)", () => {
    it("new flags default on, banner off; garbage keeps defaults", () => {
        const c = mergeAppConfig({ features: { frc: "no", startingPoints: 0, liveNotifications: null, maintenanceBanner: "x" } });
        expect(c.features).toEqual(DEFAULT_APP_CONFIG.features);
    });

    it("a patch can flip one flag without touching the others", () => {
        const next = sanitizeConfigPatch(DEFAULT_APP_CONFIG, { features: { frc: false } });
        expect(next.features.frc).toBe(false);
        expect(next.features.startingPoints).toBe(true);
        expect(next.features.aiAssistant).toBe(true);
    });

    it("banner text is plain, single-line and capped; HTML stays literal text", () => {
        const next = sanitizeConfigPatch(DEFAULT_APP_CONFIG, {
            features: { maintenanceBanner: { enabled: true, es: "  <b>hola</b>\n\tmundo\u0000 ", en: "x".repeat(500) } },
        });
        expect(next.features.maintenanceBanner.es).toBe("<b>hola</b> mundo");
        expect(next.features.maintenanceBanner.en).toHaveLength(BANNER_MAX);
        expect(bannerText(next.features.maintenanceBanner, "es")).toBe("<b>hola</b> mundo");
    });

    it("bannerText: null when off or empty, falls back across locales", () => {
        expect(bannerText({ enabled: false, es: "a", en: "b" }, "es")).toBeNull();
        expect(bannerText({ enabled: true, es: "", en: "" }, "es")).toBeNull();
        expect(bannerText({ enabled: true, es: "solo es", en: "" }, "en")).toBe("solo es");
        expect(bannerText({ enabled: true, es: "es", en: "en" }, "en-US")).toBe("en");
    });

    it("precedence: env kill switch > stored config > default", () => {
        const off = mergeAppConfig({ features: { startingPoints: false } });
        expect(resolveFlag("startingPoints", DEFAULT_APP_CONFIG, null, {})).toEqual({ value: true, source: "default" });
        expect(resolveFlag("startingPoints", off, { features: { startingPoints: false } }, {})).toEqual({ value: false, source: "config" });
        expect(resolveFlag("startingPoints", DEFAULT_APP_CONFIG, { features: { startingPoints: true } }, { STARTING_POINTS: "off" })).toEqual({ value: false, source: "env" });
        // A flag without an env switch ignores env entirely.
        expect(resolveFlag("frc", DEFAULT_APP_CONFIG, null, { FRC: "off" })).toEqual({ value: true, source: "default" });
    });
});

describe("diffConfig (audit log)", () => {
    it("lists only changed leaves as dotted paths", () => {
        const next = sanitizeConfigPatch(DEFAULT_APP_CONFIG, { features: { frc: false, maintenanceBanner: { enabled: true, es: "Hola" } } });
        expect(diffConfig(DEFAULT_APP_CONFIG, next)).toEqual([
            { path: "features.frc", before: true, after: false },
            { path: "features.maintenanceBanner.enabled", before: false, after: true },
            { path: "features.maintenanceBanner.es", before: "", after: "Hola" },
        ]);
        expect(diffConfig(next, next)).toEqual([]);
    });
});
