import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Picklist } from "@/types/picklist";

// M7: updatePicklist must only write the whitelisted patch fields (teams /
// doNotPick / selected / declined) + updatedAt/updatedBy. It previously
// spread the ENTIRE client-held `picklist` object into the write, which let
// a stale/tampered local copy silently overwrite fields like `orgId` and
// leaked a stray `id` field into the document.

const { setDocMock } = vi.hoisted(() => ({
    setDocMock: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
    collection: vi.fn(),
    doc: vi.fn((_db: unknown, col: string, id: string) => ({ __col: col, __id: id })),
    getDoc: vi.fn(),
    setDoc: setDocMock,
    onSnapshot: vi.fn(),
    Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }) },
}));

import { updatePicklist } from "./picklist-service";

const picklist: Picklist = {
    id: "30311_MXTOL",
    orgId: "30311",
    eventCode: "MXTOL",
    season: 2025,
    teams: [1, 2, 3],
    doNotPick: [],
    selected: [],
    declined: [],
    createdBy: "u1",
    createdAt: { seconds: 0, nanoseconds: 0 },
    updatedAt: { seconds: 0, nanoseconds: 0 },
    updatedBy: "u1",
};

beforeEach(() => {
    setDocMock.mockReset();
});

describe("updatePicklist (M7)", () => {
    it("writes only the patch fields + audit metadata — no full-object spread", async () => {
        await updatePicklist(picklist, "u2", { teams: [3, 2, 1] });

        expect(setDocMock).toHaveBeenCalledTimes(1);
        const [, data, opts] = setDocMock.mock.calls[0];
        expect(opts).toEqual({ merge: true });
        expect(data).toEqual({
            teams: [3, 2, 1],
            updatedAt: { seconds: 0, nanoseconds: 0 },
            updatedBy: "u2",
        });
        // Must NOT leak orgId, id, eventCode, createdBy, season from the
        // client-held picklist object.
        expect(data).not.toHaveProperty("orgId");
        expect(data).not.toHaveProperty("id");
        expect(data).not.toHaveProperty("eventCode");
        expect(data).not.toHaveProperty("createdBy");
        expect(data).not.toHaveProperty("season");
    });

    it("a tampered local orgId never reaches the write payload", async () => {
        const tampered = { ...picklist, orgId: "99999-rival-org" };
        await updatePicklist(tampered, "u2", { selected: [42] });

        const [, data] = setDocMock.mock.calls[0];
        expect(data).not.toHaveProperty("orgId");
    });
});
