import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc } from "firebase/firestore";
import { ref, uploadBytes, getBytes, deleteObject } from "firebase/storage";

/**
 * Trading Card media rules (#106): Storage objects and their Firestore
 * metadata. Emulator only (demo project).
 */
let env: RulesTestEnvironment;
const bare = { email: "a@b.c", displayName: "A", role: "scout", reliability: 1, matchesScouted: 0 };

beforeAll(async () => {
    env = await initializeTestEnvironment({
        projectId: "demo-pride",
        firestore: { rules: readFileSync("firestore.rules", "utf8") },
        storage: { rules: readFileSync("storage.rules", "utf8") },
    });
});
afterAll(async () => { await env?.cleanup(); });
beforeEach(async () => {
    await env.clearFirestore();
    await env.clearStorage();
    await env.withSecurityRulesDisabled(async ctx => {
        const db = ctx.firestore();
        await setDoc(doc(db, "users/adm"), { ...bare, orgId: "111", role: "admin" });
        await setDoc(doc(db, "users/sc"), { ...bare, orgId: "111", role: "scout" });
        await setDoc(doc(db, "users/oth"), { ...bare, orgId: "222", role: "admin" });
        await setDoc(doc(db, "users/none"), { ...bare, orgId: null });
    });
});

const img = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const path = "team_media/2026/111/m1/original";

describe("storage team_media (#106)", () => {
    it("an admin uploads an image of its own team; scouts and other teams can't", async () => {
        const st = (uid: string) => env.authenticatedContext(uid).storage();
        await assertSucceeds(uploadBytes(ref(st("adm"), path), img, { contentType: "image/jpeg" }));
        await assertFails(uploadBytes(ref(st("sc"), "team_media/2026/111/m2/original"), img, { contentType: "image/jpeg" }));
        await assertFails(uploadBytes(ref(st("oth"), "team_media/2026/111/m3/original"), img, { contentType: "image/jpeg" }));
    });
    it("rejects wrong types and clips in the thumb slot", async () => {
        const st = env.authenticatedContext("adm").storage();
        await assertFails(uploadBytes(ref(st, "team_media/2026/111/m4/original"), img, { contentType: "text/html" }));
        await assertFails(uploadBytes(ref(st, "team_media/2026/111/m5/thumb"), img, { contentType: "video/mp4" }));
        await assertSucceeds(uploadBytes(ref(st, "team_media/2026/111/m6/original"), img, { contentType: "video/mp4" }));
        await assertFails(uploadBytes(ref(st, "other/file"), img, { contentType: "image/jpeg" }));
    });
    it("rejects files over the size limits", async () => {
        const st = env.authenticatedContext("adm").storage();
        const big = new Uint8Array(5 * 1024 * 1024 + 1);
        await assertFails(uploadBytes(ref(st, "team_media/2026/111/m7/original"), big, { contentType: "image/jpeg" }));
    });
    it("only approved team members read; nobody anonymous", async () => {
        await assertSucceeds(uploadBytes(ref(env.authenticatedContext("adm").storage(), path), img, { contentType: "image/jpeg" }));
        await assertSucceeds(getBytes(ref(env.authenticatedContext("oth").storage(), path)));
        await assertFails(getBytes(ref(env.authenticatedContext("none").storage(), path)));
        await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), path)));
        await assertFails(deleteObject(ref(env.authenticatedContext("oth").storage(), path)));
        await assertSucceeds(deleteObject(ref(env.authenticatedContext("adm").storage(), path)));
    });
});

describe("firestore team_media metadata (#106)", () => {
    const meta = { teamNumber: 111, season: 2026, kind: "photo", path, caption: "", consent: true, uploadedBy: "adm" };
    it("admin of the team with consent; never scouts, other teams or without consent", async () => {
        const db = (uid: string) => env.authenticatedContext(uid).firestore();
        await assertSucceeds(setDoc(doc(db("adm"), "team_media/m1"), meta));
        await assertFails(setDoc(doc(db("adm"), "team_media/m2"), { ...meta, consent: false, path: "team_media/2026/111/m2/original" }));
        await assertFails(setDoc(doc(db("sc"), "team_media/m3"), { ...meta, uploadedBy: "sc", path: "team_media/2026/111/m3/original" }));
        await assertFails(setDoc(doc(db("oth"), "team_media/m4"), { ...meta, uploadedBy: "oth", path: "team_media/2026/111/m4/original" }));
        await assertFails(setDoc(doc(db("adm"), "team_media/m5"), { ...meta, path: "team_media/2026/222/m5/original" }));
        await assertSucceeds(setDoc(doc(db("adm"), "team_media/y1"), { ...meta, kind: "youtube", path: null, youtubeId: "dQw4w9WgXcQ" }));
        await assertFails(setDoc(doc(db("adm"), "team_media/y2"), { ...meta, kind: "youtube", path: null, youtubeId: "<script>" }));
        await assertSucceeds(getDoc(doc(db("oth"), "team_media/m1")));
        await assertFails(getDoc(doc(db("none"), "team_media/m1")));
        await assertSucceeds(updateDoc(doc(db("adm"), "team_media/m1"), { caption: "Robot v2" }));
        await assertFails(updateDoc(doc(db("adm"), "team_media/m1"), { teamNumber: 222 }));
    });
    it("reports are write-only; the profile photo is chosen by admin/lead", async () => {
        const db = (uid: string) => env.authenticatedContext(uid).firestore();
        await assertSucceeds(setDoc(doc(db("oth"), "media_reports/r1"), { mediaId: "m1", reason: "faces", reportedBy: "oth" }));
        await assertFails(getDoc(doc(db("oth"), "media_reports/r1")));
        await assertFails(setDoc(doc(db("none"), "media_reports/r2"), { mediaId: "m1", reason: "x", reportedBy: "none" }));
        await assertSucceeds(setDoc(doc(db("sc"), "team_profiles/2026_111"), { teamNumber: 111, season: 2026 }, { merge: true }));
        await assertFails(setDoc(doc(db("sc"), "team_profiles/2026_111"), { teamNumber: 111, season: 2026, profileMediaId: "m1" }, { merge: true }));
        await assertSucceeds(setDoc(doc(db("adm"), "team_profiles/2026_111"), { teamNumber: 111, season: 2026, profileMediaId: "m1" }, { merge: true }));
    });
});
