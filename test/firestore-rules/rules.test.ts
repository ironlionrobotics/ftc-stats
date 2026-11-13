import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import {
    assertFails,
    assertSucceeds,
    initializeTestEnvironment,
    type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from "firebase/firestore";

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

// ---------------------------------------------------------------------------
// Federation, workshop and pit lending (decisions #101–#105)
// ---------------------------------------------------------------------------

/** Two approved teams (A = 111, B = 222) and a user with no team. */
async function seedTeams() {
    await seed("users/a1", { ...bareProfile, orgId: "111", role: "admin" });
    await seed("users/a2", { ...bareProfile, orgId: "111", role: "scout" });
    await seed("users/b1", { ...bareProfile, orgId: "222", role: "admin" });
    await seed("users/n1", { ...bareProfile });
}
const as = (uid: string) => env.authenticatedContext(uid).firestore();

describe("match_scouting context and privacy (#101/#102)", () => {
    const entry = { scoutId: "a1", orgId: "111", season: 2026, eventCode: "MXTLQ", teamNumber: 5, matchNumber: 1 };
    it("accepts the four contexts and rejects anything else", async () => {
        await seedTeams();
        await assertSucceeds(setDoc(doc(as("a1"), "match_scouting/e1"), { ...entry, tournamentLevel: "PRACTICE_FIELD" }));
        await assertSucceeds(setDoc(doc(as("a1"), "match_scouting/e2"), { ...entry }));
        await assertFails(setDoc(doc(as("a1"), "match_scouting/e3"), { ...entry, tournamentLevel: "FINAL" }));
    });
    it("another team still cannot read raw entries (the pool goes through the server)", async () => {
        await seedTeams();
        await seed("match_scouting/e1", { ...entry, notes: "private" });
        await assertFails(getDoc(doc(as("b1"), "match_scouting/e1")));
    });
});

describe("team_profiles (#101)", () => {
    it("readable by approved teams only", async () => {
        await seedTeams();
        await seed("team_profiles/2026_111", { teamNumber: 111, season: 2026 });
        await assertSucceeds(getDoc(doc(as("b1"), "team_profiles/2026_111")));
        await assertFails(getDoc(doc(as("n1"), "team_profiles/2026_111")));
    });
});

describe("server-only federation docs (#102/#103)", () => {
    it("pool aliases are invisible; claims are readable but never client-written", async () => {
        await seedTeams();
        await seed("pool_aliases/2026_MXTLQ", { aliases: { "111": "A" } });
        await seed("scout_claims/2026_MXTLQ_QUALIFICATION_1", { season: 2026, eventCode: "MXTLQ", claims: {} });
        await assertFails(getDoc(doc(as("a1"), "pool_aliases/2026_MXTLQ")));
        await assertSucceeds(getDoc(doc(as("b1"), "scout_claims/2026_MXTLQ_QUALIFICATION_1")));
        await assertFails(getDoc(doc(as("n1"), "scout_claims/2026_MXTLQ_QUALIFICATION_1")));
        await assertFails(setDoc(doc(as("a1"), "scout_claims/2026_MXTLQ_QUALIFICATION_2"), { claims: {} }));
    });
});

describe("practice_runs (#105)", () => {
    const run = { orgId: "111", season: 2026, createdBy: "a2", total: 50 };
    it("private to the team; author or admin deletes", async () => {
        await seedTeams();
        await assertSucceeds(setDoc(doc(as("a2"), "practice_runs/r1"), run));
        await assertFails(setDoc(doc(as("a2"), "practice_runs/r2"), { ...run, createdBy: "a1" }));
        await assertFails(setDoc(doc(as("b1"), "practice_runs/r3"), run));
        await assertSucceeds(getDoc(doc(as("a1"), "practice_runs/r1")));
        await assertFails(getDoc(doc(as("b1"), "practice_runs/r1")));
        await seed("practice_runs/r4", run);
        await assertSucceeds(deleteDoc(doc(as("a1"), "practice_runs/r4")));
    });
});

describe("pit lending (#104)", () => {
    const item = { orgId: "111", teamNumber: 111, name: "Servo", category: "part", qty: 2, lendable: true, giveaway: false };
    it("inventory: own writes only, bounded fields; others see lendable items only", async () => {
        await seedTeams();
        await assertSucceeds(setDoc(doc(as("a1"), "org_inventory/111_x"), item));
        await assertFails(setDoc(doc(as("a1"), "org_inventory/222_x"), item));
        await assertFails(setDoc(doc(as("b1"), "org_inventory/111_y"), item));
        await assertFails(setDoc(doc(as("a1"), "org_inventory/111_z"), { ...item, qty: 5000 }));
        await seed("org_inventory/111_hidden", { ...item, lendable: false });
        await assertSucceeds(getDoc(doc(as("b1"), "org_inventory/111_x")));
        await assertFails(getDoc(doc(as("b1"), "org_inventory/111_hidden")));
        await assertSucceeds(getDocs(query(collection(as("b1"), "org_inventory"), where("lendable", "==", true))));
    });
    it("presence: under its own deterministic id only", async () => {
        await seedTeams();
        const p = { season: 2026, eventCode: "MXTLQ", orgId: "111", teamNumber: 111, teamName: "A", pit: "12" };
        await assertSucceeds(setDoc(doc(as("a1"), "event_presence/2026_MXTLQ_111"), p));
        await assertFails(setDoc(doc(as("a1"), "event_presence/2026_MXTLQ_222"), p));
    });
    it("requests: created open by the team, only their status changes, only by the team", async () => {
        await seedTeams();
        const r = { season: 2026, eventCode: "MXTLQ", orgId: "111", teamNumber: 111, pit: "12", item: "Servo", note: "", status: "open" };
        await assertSucceeds(setDoc(doc(as("a2"), "lend_requests/q1"), r));
        await assertFails(setDoc(doc(as("a2"), "lend_requests/q2"), { ...r, status: "resolved" }));
        await assertSucceeds(updateDoc(doc(as("a1"), "lend_requests/q1"), { status: "resolved" }));
        await assertFails(updateDoc(doc(as("a1"), "lend_requests/q1"), { item: "Motor" }));
        await assertFails(updateDoc(doc(as("b1"), "lend_requests/q1"), { status: "cancelled" }));
        await assertSucceeds(getDoc(doc(as("b1"), "lend_requests/q1")));
    });
    it("loans: only the parties read them and nobody writes from the client", async () => {
        await seedTeams();
        await seed("users/c1", { ...bareProfile, orgId: "333" });
        await seed("loans/l1", { parties: ["111", "222"], status: "lent" });
        await assertSucceeds(getDoc(doc(as("a2"), "loans/l1")));
        await assertSucceeds(getDoc(doc(as("b1"), "loans/l1")));
        await assertFails(getDoc(doc(as("c1"), "loans/l1")));
        await assertFails(updateDoc(doc(as("b1"), "loans/l1"), { status: "returned" }));
        await assertFails(setDoc(doc(as("a1"), "loans/l2"), { parties: ["111"], status: "lent" }));
    });
});
