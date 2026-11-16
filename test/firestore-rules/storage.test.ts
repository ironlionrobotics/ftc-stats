import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
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
const path = "team_media/2026/111/AAAAAAAAAAAAAAAAAAA1/original";

describe("storage team_media (#106)", () => {
    it("an admin uploads an image of its own team; scouts and other teams can't", async () => {
        const st = (uid: string) => env.authenticatedContext(uid).storage();
        await assertSucceeds(uploadBytes(ref(st("adm"), path), img, { contentType: "image/jpeg" }));
        await assertFails(uploadBytes(ref(st("sc"), "team_media/2026/111/AAAAAAAAAAAAAAAAAAA2/original"), img, { contentType: "image/jpeg" }));
        await assertFails(uploadBytes(ref(st("oth"), "team_media/2026/111/AAAAAAAAAAAAAAAAAAA3/original"), img, { contentType: "image/jpeg" }));
    });
    it("rejects wrong types and clips in the thumb slot", async () => {
        const st = env.authenticatedContext("adm").storage();
        await assertFails(uploadBytes(ref(st, "team_media/2026/111/AAAAAAAAAAAAAAAAAAA4/original"), img, { contentType: "text/html" }));
        await assertFails(uploadBytes(ref(st, "team_media/2026/111/AAAAAAAAAAAAAAAAAAA5/thumb"), img, { contentType: "video/mp4" }));
        await assertSucceeds(uploadBytes(ref(st, "team_media/2026/111/AAAAAAAAAAAAAAAAAAA6/original"), img, { contentType: "video/mp4" }));
        await assertFails(uploadBytes(ref(st, "other/file"), img, { contentType: "image/jpeg" }));
    });
    it("rejects files over the size limits", async () => {
        const st = env.authenticatedContext("adm").storage();
        const big = new Uint8Array(5 * 1024 * 1024 + 1);
        await assertFails(uploadBytes(ref(st, "team_media/2026/111/AAAAAAAAAAAAAAAAAAA7/original"), big, { contentType: "image/jpeg" }));
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
    const meta = { teamNumber: 111, season: 2026, kind: "photo", path, contentType: "image/webp", bytes: 1000, caption: "", consent: true, uploadedBy: "adm" };
    it("admin of the team with consent; never scouts, other teams or without consent", async () => {
        const db = (uid: string) => env.authenticatedContext(uid).firestore();
        await assertSucceeds(setDoc(doc(db("adm"), "team_media/AAAAAAAAAAAAAAAAAAA1"), meta));
        await assertFails(setDoc(doc(db("adm"), "team_media/AAAAAAAAAAAAAAAAAAA2"), { ...meta, consent: false, path: "team_media/2026/111/AAAAAAAAAAAAAAAAAAA2/original" }));
        await assertFails(setDoc(doc(db("sc"), "team_media/AAAAAAAAAAAAAAAAAAA3"), { ...meta, uploadedBy: "sc", path: "team_media/2026/111/AAAAAAAAAAAAAAAAAAA3/original" }));
        await assertFails(setDoc(doc(db("oth"), "team_media/AAAAAAAAAAAAAAAAAAA4"), { ...meta, uploadedBy: "oth", path: "team_media/2026/111/AAAAAAAAAAAAAAAAAAA4/original" }));
        await assertFails(setDoc(doc(db("adm"), "team_media/AAAAAAAAAAAAAAAAAAA5"), { ...meta, path: "team_media/2026/222/AAAAAAAAAAAAAAAAAAA5/original" }));
        const yt = { teamNumber: 111, season: 2026, kind: "youtube", caption: "", consent: true, uploadedBy: "adm" };
        await assertSucceeds(setDoc(doc(db("adm"), "team_media/YYYYYYYYYYYYYYYYYYY1"), { ...yt, youtubeId: "dQw4w9WgXcQ" }));
        await assertFails(setDoc(doc(db("adm"), "team_media/YYYYYYYYYYYYYYYYYYY2"), { ...yt, youtubeId: "<script>" }));
        await assertSucceeds(getDoc(doc(db("oth"), "team_media/AAAAAAAAAAAAAAAAAAA1")));
        await assertFails(getDoc(doc(db("none"), "team_media/AAAAAAAAAAAAAAAAAAA1")));
        await assertSucceeds(updateDoc(doc(db("adm"), "team_media/AAAAAAAAAAAAAAAAAAA1"), { caption: "Robot v2" }));
        await assertFails(updateDoc(doc(db("adm"), "team_media/AAAAAAAAAAAAAAAAAAA1"), { teamNumber: 222 }));
    });
    it("reports are write-only; the profile photo is chosen by admin/lead", async () => {
        const db = (uid: string) => env.authenticatedContext(uid).firestore();
        await assertSucceeds(setDoc(doc(db("oth"), "media_reports/AAAAAAAAAAAAAAAAAAA1_oth"), { mediaId: "AAAAAAAAAAAAAAAAAAA1", reason: "faces", reportedBy: "oth" }));
        await assertFails(getDoc(doc(db("oth"), "media_reports/AAAAAAAAAAAAAAAAAAA1_oth")));
        await assertFails(setDoc(doc(db("none"), "media_reports/AAAAAAAAAAAAAAAAAAA1_none"), { mediaId: "AAAAAAAAAAAAAAAAAAA1", reason: "x", reportedBy: "none" }));
        await assertSucceeds(setDoc(doc(db("sc"), "team_profiles/2026_111"), { teamNumber: 111, season: 2026 }, { merge: true }));
        await assertFails(setDoc(doc(db("sc"), "team_profiles/2026_111"), { teamNumber: 111, season: 2026, profileMediaId: "AAAAAAAAAAAAAAAAAAA1" }, { merge: true }));
        await assertSucceeds(setDoc(doc(db("adm"), "team_profiles/2026_111"), { teamNumber: 111, season: 2026, profileMediaId: "AAAAAAAAAAAAAAAAAAA1" }, { merge: true }));
    });
});

describe("media hardening (#106 review)", () => {
    const base = { teamNumber: 111, season: 2026, kind: "photo", contentType: "image/webp", bytes: 1000, caption: "", consent: true, uploadedBy: "adm" };
    const id = "BBBBBBBBBBBBBBBBBBB1";
    const own = `team_media/2026/111/${id}`;
    it("paths can only point at the item's own folder; no extra keys; youtube carries no paths", async () => {
        const db = env.authenticatedContext("adm").firestore();
        await assertFails(setDoc(doc(db, `team_media/${id}`), { ...base, path: `${own}/original`, thumbPath: "team_media/2026/222/XXXXXXXXXXXXXXXXXXXX/original" }));
        await assertFails(setDoc(doc(db, `team_media/${id}`), { ...base, path: `${own}/original`, junk: "x".repeat(1000) }));
        await assertFails(setDoc(doc(db, `team_media/${id}`), { teamNumber: 111, season: 2026, kind: "youtube", youtubeId: "dQw4w9WgXcQ", path: "team_media/2026/222/x/original", caption: "", consent: true, uploadedBy: "adm" }));
        await assertFails(setDoc(doc(db, "team_media/short"), { ...base, path: "team_media/2026/111/short/original" }));
        await assertSucceeds(setDoc(doc(db, `team_media/${id}`), { ...base, path: `${own}/original`, thumbPath: `${own}/thumb` }));
    });
    it("another team's admin can't edit or delete; reports are one per user with fixed keys", async () => {
        await env.withSecurityRulesDisabled(async ctx => { await setDoc(doc(ctx.firestore(), `team_media/${id}`), { ...base, path: `${own}/original` }); });
        const oth = env.authenticatedContext("oth").firestore();
        await assertFails(updateDoc(doc(oth, `team_media/${id}`), { caption: "hacked" }));
        await assertFails(deleteDoc(doc(oth, `team_media/${id}`)));
        await assertFails(setDoc(doc(oth, `media_reports/${id}_someoneelse`), { mediaId: id, reason: "x", reportedBy: "oth" }));
        await assertFails(setDoc(doc(oth, `media_reports/${id}_oth`), { mediaId: id, reason: "x", reportedBy: "oth", extra: "y" }));
        await assertSucceeds(setDoc(doc(oth, `media_reports/${id}_oth`), { mediaId: id, reason: "x", reportedBy: "oth" }));
    });
    it("storage paths must look like real season and media ids", async () => {
        const st = env.authenticatedContext("adm").storage();
        await assertFails(uploadBytes(ref(st, "team_media/9999x/111/BBBBBBBBBBBBBBBBBBB1/original"), img, { contentType: "image/jpeg" }));
        await assertFails(uploadBytes(ref(st, "team_media/2026/111/short/original"), img, { contentType: "image/jpeg" }));
    });
});

describe("robot logs (#120)", () => {
    const id = "LLLLLLLLLLLLLLLLLLL1";
    const csvPath = `robot_logs/2026/111/${id}/motor_diag_20261116_101503.csv`;
    const csv = new TextEncoder().encode("time_s,battery_volts\n0,12.5\n");
    const st = (uid: string) => env.authenticatedContext(uid).storage();
    const db = (uid: string) => env.authenticatedContext(uid).firestore();
    const docData = (by: string) => ({
        id, orgId: "111", season: 2026, teamNumber: 111, createdBy: by, uploadedAt: 1, recordedAt: 1,
        kind: "practice", eventCode: null, match: null, practiceRunId: null, label: "", format: "motor-diag",
        files: ["motor_diag_20261116_101503.csv"], channels: [], summary: {},
    });

    it("storage: any member of the team uploads CSV; others and wrong names/types can't", async () => {
        await assertSucceeds(uploadBytes(ref(st("sc"), csvPath), csv, { contentType: "text/csv" }));
        await assertFails(uploadBytes(ref(st("oth"), `robot_logs/2026/111/${id}/b.csv`), csv, { contentType: "text/csv" }));
        await assertFails(uploadBytes(ref(st("none"), `robot_logs/2026/111/${id}/c.csv`), csv, { contentType: "text/csv" }));
        await assertFails(uploadBytes(ref(st("sc"), `robot_logs/2026/111/${id}/x.html`), csv, { contentType: "text/csv" }));
        await assertFails(uploadBytes(ref(st("sc"), `robot_logs/2026/111/${id}/d.csv`), csv, { contentType: "text/html" }));
        await assertFails(uploadBytes(ref(st("sc"), `robot_logs/2026/111/short/e.csv`), csv, { contentType: "text/csv" }));
        await assertFails(uploadBytes(ref(st("sc"), `robot_logs/2026/111/${id}/big.csv`), new Uint8Array(5 * 1024 * 1024 + 1), { contentType: "text/csv" }));
        await assertSucceeds(uploadBytes(ref(st("sc"), `robot_logs/2026/111/${id}/meta.json`), csv, { contentType: "application/json" }));
        await assertFails(uploadBytes(ref(st("sc"), `robot_logs/2026/111/${id}/f.csv`), csv, { contentType: "application/json" }));
    });
    it("storage: private to the team — other approved teams can't read or delete", async () => {
        await assertSucceeds(uploadBytes(ref(st("sc"), csvPath), csv, { contentType: "text/csv" }));
        await assertSucceeds(getBytes(ref(st("adm"), csvPath)));
        await assertFails(getBytes(ref(st("oth"), csvPath)));
        await assertFails(getBytes(ref(env.unauthenticatedContext().storage(), csvPath)));
        // Re-uploading the same path is evaluated as a create by the emulator, so
        // it can't be blocked reliably; it stays within the team anyway.
        await assertFails(deleteObject(ref(st("oth"), csvPath)));
        await assertSucceeds(deleteObject(ref(st("sc"), csvPath)));
    });
    it("firestore: own team, own uid, fixed keys; private; only labels change", async () => {
        await assertSucceeds(setDoc(doc(db("sc"), `robot_logs/${id}`), docData("sc")));
        await assertFails(setDoc(doc(db("sc"), "robot_logs/LLLLLLLLLLLLLLLLLLL2"), { ...docData("adm"), id: "LLLLLLLLLLLLLLLLLLL2" }));
        await assertFails(setDoc(doc(db("oth"), "robot_logs/LLLLLLLLLLLLLLLLLLL3"), { ...docData("oth"), id: "LLLLLLLLLLLLLLLLLLL3" }));
        await assertFails(setDoc(doc(db("sc"), "robot_logs/LLLLLLLLLLLLLLLLLLL4"), { ...docData("sc"), id: "LLLLLLLLLLLLLLLLLLL4", teamNumber: 222 }));
        await assertFails(setDoc(doc(db("sc"), "robot_logs/LLLLLLLLLLLLLLLLLLL5"), { ...docData("sc"), id: "LLLLLLLLLLLLLLLLLLL5", junk: 1 }));
        await assertFails(setDoc(doc(db("sc"), "robot_logs/LLLLLLLLLLLLLLLLLLL6"), { ...docData("sc"), id: "LLLLLLLLLLLLLLLLLLL6", kind: "other" }));
        await assertSucceeds(getDoc(doc(db("adm"), `robot_logs/${id}`)));
        await assertFails(getDoc(doc(db("oth"), `robot_logs/${id}`)));
        await assertSucceeds(updateDoc(doc(db("adm"), `robot_logs/${id}`), { label: "Q12", kind: "match", match: { level: "QUALIFICATION", number: 12 } }));
        await assertFails(updateDoc(doc(db("adm"), `robot_logs/${id}`), { summary: { fake: true } }));
        await assertFails(updateDoc(doc(db("adm"), `robot_logs/${id}`), { label: "x".repeat(61) }));
        await assertFails(updateDoc(doc(db("adm"), `robot_logs/${id}`), { match: "junk" }));
        await assertFails(deleteDoc(doc(db("oth"), `robot_logs/${id}`)));
        // Any member (not only the uploader) deletes, same as the Storage files.
        await assertSucceeds(deleteDoc(doc(db("adm"), `robot_logs/${id}`)));
    });
    it("firestore: rejects wrong types on create", async () => {
        const bad = (patch: Record<string, unknown>) => setDoc(doc(db("sc"), "robot_logs/LLLLLLLLLLLLLLLLLLL7"), { ...docData("sc"), id: "LLLLLLLLLLLLLLLLLLL7", ...patch });
        await assertFails(bad({ teamNumber: "111" }));
        await assertFails(bad({ summary: "x" }));
        await assertFails(bad({ channels: "x" }));
        await assertFails(bad({ files: [] }));
        await assertFails(bad({ label: "x".repeat(61) }));
        await assertSucceeds(bad({}));
    });
});
