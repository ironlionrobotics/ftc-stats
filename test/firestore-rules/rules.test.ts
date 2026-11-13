import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";

/**
 * Security-rules regression tests (decisions #78, #90, #97). Run against the
 * local emulator with a demo project id — never touches production.
 */
let env: RulesTestEnvironment;

const bareProfile = { email: "a@b.c", displayName: "Ana", orgId: null, role: "scout", reliability: 1, matchesScouted: 0 };

beforeAll(async () => {
    env = await initializeTestEnvironment({
        projectId: "demo-pride",
        firestore: { rules: readFileSync("firestore.rules", "utf8") },
    });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); });

/** Seeds data bypassing rules (as the Admin SDK would). */
async function seed(path: string, data: Record<string, unknown>) {
    await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), path), data); });
}

describe("users/{uid}", () => {
    it("a new user can create only a bare profile", async () => {
        const db = env.authenticatedContext("u1").firestore();
        await assertSucceeds(setDoc(doc(db, "users/u1"), bareProfile));
    });
    it("cannot create a profile already inside a team or with a higher role", async () => {
        const db = env.authenticatedContext("u1").firestore();
        await assertFails(setDoc(doc(db, "users/u1"), { ...bareProfile, orgId: "30311" }));
        await assertFails(setDoc(doc(db, "users/u1"), { ...bareProfile, role: "admin" }));
        await assertFails(setDoc(doc(db, "users/u1"), { ...bareProfile, reliability: 5 }));
    });
    it("cannot create someone else's profile", async () => {
        const db = env.authenticatedContext("u1").firestore();
        await assertFails(setDoc(doc(db, "users/u2"), bareProfile));
    });
    it("can edit its name but never its team, role, claim slot or reliability", async () => {
        await seed("users/u1", { ...bareProfile });
        const db = env.authenticatedContext("u1").firestore();
        await assertSucceeds(updateDoc(doc(db, "users/u1"), { displayName: "Ana R." }));
        await assertFails(updateDoc(doc(db, "users/u1"), { orgId: "30311" }));
        await assertFails(updateDoc(doc(db, "users/u1"), { role: "admin" }));
        await assertFails(updateDoc(doc(db, "users/u1"), { openClaimTeam: 30311 }));
        await assertFails(updateDoc(doc(db, "users/u1"), { reliability: 2 }));
    });
    it("cannot read another user's profile", async () => {
        await seed("users/u2", { ...bareProfile });
        const db = env.authenticatedContext("u1").firestore();
        await assertFails(getDoc(doc(db, "users/u2")));
    });
});

describe("orgs and team claims (decision #90)", () => {
    it("no client can create a team workspace", async () => {
        const db = env.authenticatedContext("u1").firestore();
        await assertFails(setDoc(doc(db, "orgs/30311"), { teamNumber: 30311, displayName: "X", program: "FTC", createdBy: "u1" }));
    });
    it("team claims and server collections are closed to clients", async () => {
        await seed("team_claims/30311", { status: "pending", requestedBy: "u1", requestedEmail: "a@b.c" });
        const db = env.authenticatedContext("u1").firestore();
        await assertFails(getDoc(doc(db, "team_claims/30311")));
        await assertFails(setDoc(doc(db, "team_claims/1"), { status: "pending" }));
        await assertFails(getDoc(doc(db, "server_cache/x")));
        await assertFails(getDoc(doc(db, "server_counters/x")));
    });
    it("invite usage counters are server-only", async () => {
        await seed("org_invites/ABC234", { orgId: "30311", uses: 0, createdBy: "admin1" });
        const db = env.authenticatedContext("u1").firestore();
        await assertSucceeds(getDoc(doc(db, "org_invites/ABC234")));
        await assertFails(updateDoc(doc(db, "org_invites/ABC234"), { uses: 1 }));
    });
});

describe("scouting is private to the team (decision #78)", () => {
    beforeEach(async () => {
        await seed("users/a1", { ...bareProfile, orgId: "100" });
        await seed("users/b1", { ...bareProfile, orgId: "200" });
        await seed("match_scouting/e1", { orgId: "100", season: 2026, eventCode: "MXTLQ", teamNumber: 5, scoutId: "a1", timestamp: 1 });
    });
    it("a member reads its own team's scouting", async () => {
        const db = env.authenticatedContext("a1").firestore();
        await assertSucceeds(getDocs(query(collection(db, "match_scouting"), where("orgId", "==", "100"))));
    });
    it("another team cannot read it, by query or by id", async () => {
        const db = env.authenticatedContext("b1").firestore();
        await assertFails(getDocs(query(collection(db, "match_scouting"), where("orgId", "==", "100"))));
        await assertFails(getDoc(doc(db, "match_scouting/e1")));
    });
    it("anonymous visitors cannot read scouting", async () => {
        const db = env.unauthenticatedContext().firestore();
        await assertFails(getDoc(doc(db, "match_scouting/e1")));
    });
});
