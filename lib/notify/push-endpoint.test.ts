import { describe, it, expect } from "vitest";
import { parsePushSubscription } from "./push-endpoint";

const keys = { p256dh: "B" + "A".repeat(86), auth: "C".repeat(22) };

describe("parsePushSubscription (#110, SSRF guard)", () => {
    it("accepts the browsers' push services", () => {
        for (const endpoint of [
            "https://fcm.googleapis.com/fcm/send/abc:def",
            "https://updates.push.services.mozilla.com/wpush/v2/xyz",
            "https://web.push.apple.com/QGx",
            "https://wns2-par02p.notify.windows.com/w/?token=1",
        ]) expect(parsePushSubscription({ endpoint, keys })?.endpoint).toBe(new URL(endpoint).href);
    });

    it("rejects anything else the server would be made to call", () => {
        for (const endpoint of [
            "http://fcm.googleapis.com/fcm/send/abc",           // not https
            "https://fcm.googleapis.com:8443/fcm/send/abc",     // odd port
            "https://evil.example/fcm.googleapis.com",
            "https://fcm.googleapis.com.evil.example/x",
            "https://user:pw@fcm.googleapis.com/x",
            "https://169.254.169.254/latest/meta-data",
            "https://localhost/x",
            "not a url",
        ]) expect(parsePushSubscription({ endpoint, keys })).toBeNull();
    });

    it("rejects malformed keys", () => {
        const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
        expect(parsePushSubscription({ endpoint, keys: { ...keys, auth: "x" } })).toBeNull();
        expect(parsePushSubscription({ endpoint, keys: { ...keys, p256dh: "!!" + keys.p256dh } })).toBeNull();
        expect(parsePushSubscription({ endpoint })).toBeNull();
        expect(parsePushSubscription(null)).toBeNull();
    });
});
