import { describe, it, expect, vi } from "vitest";
import { fingerprint, integrationStatuses, pingIntegration } from "./admin-integrations";

const SEASON = { ftc: 2026, frc: 2026 };
const ENV = { FTC_API_USERNAME: "user", FTC_API_KEY: "s3cret-key", FRC_API_USERNAME: "fu", FRC_API_KEY: "frc-key" };

describe("integration status (#119)", () => {
    it("never exposes a credential value, only an 8-hex fingerprint", () => {
        const rows = integrationStatuses(ENV);
        const dump = JSON.stringify(rows);
        for (const v of Object.values(ENV)) if (v.length > 3) expect(dump).not.toContain(v);
        const ftc = rows.find(r => r.key === "ftc")!;
        expect(ftc.configured).toBe(true);
        expect(ftc.fingerprint).toMatch(/^[0-9a-f]{8}$/);
    });

    it("fingerprint is stable, changes on rotation, null when any part is missing", () => {
        expect(fingerprint("a", "b")).toBe(fingerprint("a", "b"));
        expect(fingerprint("a", "b")).not.toBe(fingerprint("a", "c"));
        expect(fingerprint("ab", "")).toBeNull();
        expect(fingerprint("a", undefined)).toBeNull();
        expect(integrationStatuses({}).find(r => r.key === "frc")!.configured).toBe(false);
    });

    it("Firebase Admin counts gcloud ADC (local dev) as configured", () => {
        expect(integrationStatuses({}, () => true).find(r => r.key === "firebaseAdmin")!.configured).toBe(true);
        expect(integrationStatuses({}, () => false).find(r => r.key === "firebaseAdmin")!.configured).toBe(false);
    });

    it("rotation hints name secrets, never values", () => {
        const frc = integrationStatuses(ENV).find(r => r.key === "frc")!;
        expect(frc.rotate.join("\n")).toContain("firebase apphosting:secrets:set FRC_API_KEY");
        expect(frc.rotate.join("\n")).not.toContain("frc-key");
    });
});

describe("pingIntegration", () => {
    const res = (status: number) => new Response("{\"secret\":\"body\"}", { status });

    it("ok on 200 with Basic auth for FRC, no body returned", async () => {
        const f = vi.fn(async (_u: string, init?: RequestInit) => {
            expect((init?.headers as Record<string, string>).Authorization).toBe("Basic " + Buffer.from("fu:frc-key").toString("base64"));
            return res(200);
        });
        const r = await pingIntegration("frc", ENV, SEASON, f as unknown as typeof fetch);
        expect(f.mock.calls[0][0]).toBe("https://frc-api.firstinspires.org/v3.0/2026");
        expect(r).toMatchObject({ ok: true, status: 200 });
        expect(JSON.stringify(r)).not.toContain("body");
    });

    it("401 → unauthorized; missing creds → no call", async () => {
        expect(await pingIntegration("ftc", ENV, SEASON, (async () => res(401)) as unknown as typeof fetch)).toMatchObject({ ok: false, status: 401, reason: "unauthorized" });
        const f = vi.fn();
        expect(await pingIntegration("frc", {}, SEASON, f as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "missing" });
        expect(f).not.toHaveBeenCalled();
    });

    it("timeout and network errors are reported, not thrown", async () => {
        const timeout = async () => { throw Object.assign(new Error("t"), { name: "TimeoutError" }); };
        expect(await pingIntegration("ftc", ENV, SEASON, timeout as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "timeout" });
        const net = async () => { throw new TypeError("fetch failed"); };
        expect(await pingIntegration("ftc", ENV, SEASON, net as unknown as typeof fetch)).toMatchObject({ ok: false, reason: "network" });
    });

    it("Gemini key goes in a header, never the URL", async () => {
        const f = vi.fn(async () => res(200));
        await pingIntegration("gemini", { GOOGLE_GENERATIVE_AI_API_KEY: "gem-key" }, SEASON, f as unknown as typeof fetch);
        expect(String((f.mock.calls[0] as unknown[])[0])).not.toContain("gem-key");
    });

    it("VAPID is validated locally by key length", async () => {
        const pub = Buffer.alloc(65, 4).toString("base64url"), priv = Buffer.alloc(32, 1).toString("base64url");
        expect(await pingIntegration("vapid", { NEXT_PUBLIC_VAPID_PUBLIC_KEY: pub, VAPID_PRIVATE_KEY: priv }, SEASON)).toMatchObject({ ok: true });
        expect(await pingIntegration("vapid", { NEXT_PUBLIC_VAPID_PUBLIC_KEY: "abc", VAPID_PRIVATE_KEY: priv }, SEASON)).toMatchObject({ ok: false, reason: "invalidKey" });
    });
});
