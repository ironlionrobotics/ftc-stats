import { describe, it, expect, vi, beforeEach } from "vitest";
import type { MatchScouting } from "@/types/scouting";

// C5: saveMatchScouting must be idempotent — a re-sent capture (interrupted
// offline drain, retried mutation, re-scanned QR) must converge to exactly ONE
// Firestore document, never a duplicate. We mock firebase/firestore to assert
// the create-if-not-exists behavior and the deterministic doc id.

const { getDocMock, setDocMock, docMock } = vi.hoisted(() => ({
    getDocMock: vi.fn(),
    setDocMock: vi.fn(),
    docMock: vi.fn((_db: unknown, col: string, id: string) => ({ __col: col, __id: id })),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
    collection: vi.fn((_db: unknown, col: string) => ({ __col: col })),
    doc: docMock,
    getDoc: getDocMock,
    setDoc: setDocMock,
    getDocs: vi.fn(),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    onSnapshot: vi.fn(),
    limit: vi.fn(),
    Timestamp: { now: () => ({ seconds: 123, nanoseconds: 0 }) },
}));

import { saveMatchScouting } from "./scouting-service";

function entry(id?: string): MatchScouting {
    return {
        id,
        teamNumber: 101,
        matchNumber: 1,
        eventCode: "MX",
        season: 2025,
        program: "FTC",
        scoutId: "s1",
        scouterId: "s1",
        scoutName: "Scout",
        scouterName: "Scout",
        orgId: "30311",
        notes: "",
        timestamp: null,
    } as MatchScouting;
}

beforeEach(() => {
    getDocMock.mockReset();
    setDocMock.mockReset();
    docMock.mockClear();
    // Default: document does not exist yet.
    getDocMock.mockResolvedValue({ exists: () => false });
});

describe("saveMatchScouting — idempotency (C5)", () => {
    it("writes once, keyed by the stable local id, when the doc is absent", async () => {
        await saveMatchScouting(entry("local_42"), "local_42");

        // doc() addressed the deterministic id in the right collection.
        expect(docMock).toHaveBeenLastCalledWith(expect.anything(), "match_scouting", "local_42");
        expect(setDocMock).toHaveBeenCalledTimes(1);

        // The id is the doc KEY, never stored in the body.
        const [, body] = setDocMock.mock.calls[0];
        expect(body).not.toHaveProperty("id");
        // Federation defaults + server timestamp are applied.
        expect(body.orgId).toBe("30311");
        expect(body.timestamp).toEqual({ seconds: 123, nanoseconds: 0 });
    });

    it("is a no-op when the same id already exists (re-drain / retry / re-scan)", async () => {
        getDocMock.mockResolvedValue({ exists: () => true });

        await saveMatchScouting(entry("local_42"), "local_42");

        // Existence check ran; NO write (would duplicate + violate immutable rules).
        expect(getDocMock).toHaveBeenCalledTimes(1);
        expect(setDocMock).not.toHaveBeenCalled();
    });

    it("two sends of the same capture target the same doc id (stable idempotency key)", async () => {
        // First send: absent → creates.
        getDocMock.mockResolvedValueOnce({ exists: () => false });
        await saveMatchScouting(entry("local_7"), "local_7");
        // Second send (e.g. markAsSynced never ran): now present → no-op.
        getDocMock.mockResolvedValueOnce({ exists: () => true });
        await saveMatchScouting(entry("local_7"), "local_7");

        const ids = docMock.mock.calls.map(c => c[2]);
        expect(new Set(ids)).toEqual(new Set(["local_7"]));
        expect(setDocMock).toHaveBeenCalledTimes(1); // exactly one document created
    });

    it("falls back to the entry's own id when no explicit docId is passed", async () => {
        await saveMatchScouting(entry("local_9"));
        expect(docMock).toHaveBeenLastCalledWith(expect.anything(), "match_scouting", "local_9");
        expect(setDocMock).toHaveBeenCalledTimes(1);
    });

    it("generates an id only when the entry carries none", async () => {
        await saveMatchScouting(entry(undefined));
        const generatedId = docMock.mock.calls.at(-1)?.[2] as string;
        expect(generatedId).toMatch(/^local_\d+_[a-z0-9]+$/);
        expect(setDocMock).toHaveBeenCalledTimes(1);
    });
});
