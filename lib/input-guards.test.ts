import { describe, it, expect } from "vitest";
import {
    isValidSeason,
    parseSeason,
    normalizeEventCode,
    isValidTeamNumber,
    clampInt,
    parseIsoDate,
    parseRegion,
    clientIpFromForwardedFor,
    limiterKeyForIp,
    forwardedForShape,
} from "./input-guards";
import { FixedWindowLimiter } from "./rate-limiter";

const CURRENT = 2026;

describe("seasons", () => {
    it("accepts supported seasons up to next year's kickoff", () => {
        expect(isValidSeason(2019, CURRENT)).toBe(true);
        expect(isValidSeason(2027, CURRENT)).toBe(true);
        for (const s of [2018, 2028, 2025.5, NaN, "2025", null]) expect(isValidSeason(s, CURRENT)).toBe(false);
    });
    it("parses URL/cookie values, ignoring junk", () => {
        expect(parseSeason("2025", CURRENT)).toBe(2025);
        expect(parseSeason("999999", CURRENT)).toBeUndefined();
        expect(parseSeason("abc", CURRENT)).toBeUndefined();
        expect(parseSeason(undefined, CURRENT)).toBeUndefined();
    });
});

describe("event codes and team numbers", () => {
    it("normalizes real codes and rejects anything else", () => {
        expect(normalizeEventCode(" mxtlq ")).toBe("MXTLQ");
        expect(normalizeEventCode("USCAFRQ1")).toBe("USCAFRQ1");
        for (const c of ["", "A", "MX TLQ", "MX/TLQ", "x".repeat(21), 42, null]) expect(normalizeEventCode(c)).toBeNull();
    });
    it("team numbers are positive 5-digit integers", () => {
        expect(isValidTeamNumber(30311)).toBe(true);
        for (const n of [0, -3, 100_000, 1.5, "30311"]) expect(isValidTeamNumber(n)).toBe(false);
    });
    it("clampInt bounds numeric options", () => {
        expect(clampInt(1e9, 1, 50, 10)).toBe(50);
        expect(clampInt(-4, 1, 50, 10)).toBe(1);
        expect(clampInt("abc", 1, 50, 10)).toBe(10);
        expect(clampInt(undefined, 1, 50, 10)).toBe(10);
    });
});

describe("home filters", () => {
    it("dates must be ISO calendar dates", () => {
        expect(parseIsoDate("2026-11-27")).toBe("2026-11-27");
        for (const d of ["27/11/2026", "2026-13-45x", "", 5]) expect(parseIsoDate(d)).toBeUndefined();
    });
    it("regions are short plain names or codes", () => {
        expect(parseRegion("MX")).toBe("MX");
        expect(parseRegion("Nuevo León")).toBe("Nuevo León");
        expect(parseRegion("x".repeat(41))).toBeUndefined();
        expect(parseRegion("<script>")).toBeUndefined();
    });
});

describe("clientIpFromForwardedFor", () => {
    it("takes the client hop appended by Google's proxy, ignoring spoofed prefixes", () => {
        expect(clientIpFromForwardedFor("203.0.113.9, 35.191.10.4")).toBe("203.0.113.9");
        expect(clientIpFromForwardedFor("6.6.6.6, 203.0.113.9, 35.191.10.4")).toBe("203.0.113.9");
        expect(clientIpFromForwardedFor("203.0.113.9")).toBe("203.0.113.9");
        expect(clientIpFromForwardedFor(null)).toBeNull();
        expect(clientIpFromForwardedFor("")).toBeNull();
    });
});

describe("limiter keys and diagnostics", () => {
    it("groups IPv6 by /64 and keeps IPv4", () => {
        expect(limiterKeyForIp("203.0.113.9")).toBe("203.0.113.9");
        expect(limiterKeyForIp("2001:db8:aa:bb:1:2:3:4")).toBe("2001:db8:aa:bb::/64");
        expect(limiterKeyForIp("2001:DB8:AA:BB:9:9:9:9")).toBe(limiterKeyForIp("2001:db8:aa:bb:1:2:3:4"));
    });
    it("describes the header shape without leaking addresses", () => {
        const shape = forwardedForShape("203.0.113.9, 35.191.10.4");
        expect(shape).toBe("2 hops [v4, gproxy]");
        expect(shape).not.toContain("203");
        expect(forwardedForShape(null)).toBe("absent");
    });
});

describe("FixedWindowLimiter", () => {
    it("allows up to max per window, then blocks until the window resets", () => {
        let t = 0;
        const l = new FixedWindowLimiter(3, 60, () => t);
        expect([l.hit("a"), l.hit("a"), l.hit("a"), l.hit("a")]).toEqual([true, true, true, false]);
        expect(l.hit("b")).toBe(true); // other visitors unaffected
        t = 60_001;
        expect(l.hit("a")).toBe(true);
    });
    it("stays bounded under a flood of distinct keys", () => {
        const t = 0;
        const l = new FixedWindowLimiter(5, 60, () => t, 100);
        for (let i = 0; i < 1000; i++) l.hit(`ip${i}`);
        expect(l.size).toBeLessThanOrEqual(100);
    });
});
