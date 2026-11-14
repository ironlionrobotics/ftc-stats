import { describe, it, expect } from "vitest";
import { createTranslator } from "next-intl";
import es from "@/messages/es.json";
import en from "@/messages/en.json";
import { compose, DEFAULT_PREFS, type Subscriber, type Translate } from "./compose";
import type { NotifyEvent } from "./diff";

const tr = (locale: "es" | "en"): Translate => {
    const t = createTranslator({ locale, messages: locale === "es" ? es : en, namespace: "Notify" });
    return (k, v) => t(k as never, v as never);
};
const sub = (p: Partial<Subscriber>): Subscriber => ({ follows: { events: [], teams: [] }, myTeam: null, prefs: DEFAULT_PREFS, ...p });
const ctx = { eventName: "Rochester Qualifier", t: tr("es") };

const soon: NotifyEvent = { kind: "matchSoon", eventCode: "USMIRHQ", key: "Q:0:39", label: "Q39", level: "QUALIFICATION", teams: [7252, 25099, 7253, 22134], red: [7252, 25099], blue: [7253, 22134], pRed: 0.73, ahead: 2 };
const result: NotifyEvent = { kind: "matchResult", eventCode: "USMIRHQ", key: "Q:0:34", label: "Q34", level: "QUALIFICATION", teams: [1, 2, 7252, 4], red: [1, 2], blue: [7252, 4], redScore: 56, blueScore: 122, ranks: { 7252: 1 } };
const playoff: NotifyEvent = { ...result, key: "P:3:1", label: "M3", level: "PLAYOFF" } as NotifyEvent;

describe("compose (#110)", () => {
    it("tells a team follower about its match from its side", () => {
        const p = compose(soon, sub({ follows: { events: [], teams: [7253] } }), ctx)!;
        expect(p.title).toBe("7253 juega en ~2 partidos (Q39)");
        expect(p.body).toContain("27%"); // blue side of 73%
        expect(p.tag).toBe("USMIRHQ:Q:0:39:soon");
    });

    it("reports a win with own score first and the rank", () => {
        const p = compose(result, sub({ myTeam: 7252 }), ctx)!;
        expect(p.title).toBe("7252 ganó Q34: 122–56");
        expect(p.body).toBe("Va #1 · Rochester Qualifier");
    });

    it("event followers get playoffs and milestones, never qual results", () => {
        const s = sub({ follows: { events: ["USMIRHQ"], teams: [] } });
        expect(compose(result, s, ctx)).toBeNull();
        expect(compose(soon, s, ctx)).toBeNull();
        expect(compose(playoff, s, ctx)!.title).toBe("Rochester Qualifier: M3");
        const al: NotifyEvent = { kind: "alliances", eventCode: "USMIRHQ", teams: [7252, 7253], alliances: [{ number: 1, teams: [7252, 7253] }] };
        expect(compose(al, s, ctx)!.title).toBe("Alianzas listas en Rochester Qualifier");
        expect(compose(al, sub({ follows: { events: [], teams: [7253] } }), ctx)!.title).toBe("7253 va en la Alianza 1");
    });

    it("respects switched-off categories and strangers", () => {
        expect(compose(soon, sub({ myTeam: 7252, prefs: { ...DEFAULT_PREFS, soon: false } }), ctx)).toBeNull();
        expect(compose(soon, sub({ myTeam: 30311 }), ctx)).toBeNull();
    });

    it("speaks English too", () => {
        expect(compose(result, sub({ myTeam: 7252 }), { ...ctx, t: tr("en") })!.title).toBe("7252 won Q34: 122–56");
    });
});
