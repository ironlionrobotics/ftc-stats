import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "firebase/auth";

// M4: createOrJoinOrgByTeamNumber must CREATE only. Joining an existing org by
// bare team number is removed (it let anyone enroll into a rival org). We mock
// firestore to assert the create path and the throw-on-existing path.

const { getDocMock, setDocMock, updateDocMock } = vi.hoisted(() => ({
    getDocMock: vi.fn(),
    setDocMock: vi.fn(),
    updateDocMock: vi.fn(),
}));

vi.mock("@/lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
    collection: vi.fn(),
    doc: vi.fn((_db: unknown, col: string, id: string) => ({ __col: col, __id: id })),
    getDoc: getDocMock,
    setDoc: setDocMock,
    updateDoc: updateDocMock,
    serverTimestamp: vi.fn(() => "ts"),
    increment: vi.fn((n: number) => ({ __inc: n })),
    Timestamp: { now: () => ({ seconds: 0, nanoseconds: 0 }), fromMillis: (m: number) => ({ seconds: m }) },
}));

import { createOrJoinOrgByTeamNumber } from "./orgs";
import { CodedError } from "./errors";

const user = { uid: "u1", email: "a@b.c", displayName: "A" } as unknown as User;

beforeEach(() => {
    getDocMock.mockReset();
    setDocMock.mockReset();
    updateDocMock.mockReset();
});

describe("createOrJoinOrgByTeamNumber (M4)", () => {
    it("creates a new org and makes the caller admin when the number is free", async () => {
        getDocMock.mockResolvedValue({ exists: () => false });

        const org = await createOrJoinOrgByTeamNumber(user, {
            teamNumber: 30311,
            displayName: "Iron Lion",
            program: "FTC",
        });

        expect(setDocMock).toHaveBeenCalledTimes(1); // org doc created
        // caller assigned admin (setUserOrg → updateDoc with role admin)
        expect(updateDocMock).toHaveBeenCalledTimes(1);
        expect(updateDocMock.mock.calls[0][1]).toEqual({ orgId: "30311", role: "admin" });
        expect(org.id).toBe("30311");
        expect(org.createdBy).toBe("u1");
    });

    it("refuses to join an EXISTING org by bare team number (throws, no writes)", async () => {
        getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ teamNumber: 9999 }) });

        // Asserted as a code, not prose: the message is localized at render.
        const attempt = createOrJoinOrgByTeamNumber(user, {
            teamNumber: 9999,
            displayName: "Rivals",
            program: "FTC",
        });
        await expect(attempt).rejects.toBeInstanceOf(CodedError);
        await expect(attempt).rejects.toMatchObject({ code: "org.alreadyExists" });

        // No membership write happened — the user did NOT join the rival org.
        expect(setDocMock).not.toHaveBeenCalled();
        expect(updateDocMock).not.toHaveBeenCalled();
    });
});
