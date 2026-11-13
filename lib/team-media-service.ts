import { app, db } from "./firebase";
import { getStorage, ref, uploadBytesResumable, getBlob, deleteObject, type UploadTask } from "firebase/storage";
import {
    collection, doc, query, where, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp, type Unsubscribe,
} from "firebase/firestore";
import { fitWithin, mediaPath, cleanCaption, MEDIA_LIMITS, type TeamMedia, type MediaError } from "@/lib/team-media";

/**
 * Client side of Trading Card media (#106). Photos are re-encoded in the
 * browser (≤1600 px WebP/JPEG + 400 px thumbnail) — re-encoding through a
 * canvas drops EXIF, including GPS. Files are read back with getBlob() under
 * Storage rules (approved teams only); public download URLs are never used.
 */

const storage = () => getStorage(app);

export class MediaUploadError extends Error {
    constructor(public readonly code: MediaError | "media.decode" | "media.upload") {
        super(code);
    }
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
    return new Promise(resolve => canvas.toBlob(b => resolve(b), type, quality));
}

/** Draws `source` scaled to fit `max` and encodes it as WebP (JPEG fallback). */
async function encode(source: CanvasImageSource, w: number, h: number, max: number): Promise<{ blob: Blob; width: number; height: number }> {
    const { width, height } = fitWithin(w, h, max);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new MediaUploadError("media.decode");
    ctx.drawImage(source, 0, 0, width, height);
    const webp = await canvasBlob(canvas, "image/webp", 0.85);
    const blob = webp && webp.type === "image/webp" ? webp : await canvasBlob(canvas, "image/jpeg", 0.85);
    if (!blob) throw new MediaUploadError("media.decode");
    return { blob, width, height };
}

/** Photo → { full, thumb } re-encoded without metadata. */
export async function preparePhoto(file: File): Promise<{ full: Blob; thumb: Blob; width: number; height: number }> {
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
        throw new MediaUploadError("media.decode"); // e.g. HEIC on a browser that can't decode it
    }
    try {
        const full = await encode(bitmap, bitmap.width, bitmap.height, MEDIA_LIMITS.photoMaxDim);
        const thumb = await encode(bitmap, bitmap.width, bitmap.height, MEDIA_LIMITS.thumbMaxDim);
        if (full.blob.size > MEDIA_LIMITS.photoMaxBytes) throw new MediaUploadError("media.tooBig");
        return { full: full.blob, thumb: thumb.blob, width: full.width, height: full.height };
    } finally {
        bitmap.close();
    }
}

/** Reads a clip's duration and grabs a poster frame (≤400 px). */
export async function probeClip(file: File): Promise<{ durationS: number; width: number; height: number; poster: Blob | null }> {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    try {
        await new Promise<void>((resolve, reject) => {
            video.onloadedmetadata = () => resolve();
            video.onerror = () => reject(new MediaUploadError("media.decode"));
        });
        const durationS = video.duration;
        let poster: Blob | null = null;
        try {
            video.currentTime = Math.min(0.5, durationS / 2);
            await new Promise<void>(resolve => { video.onseeked = () => resolve(); setTimeout(resolve, 3000); });
            poster = (await encode(video, video.videoWidth, video.videoHeight, MEDIA_LIMITS.thumbMaxDim)).blob;
        } catch {
            poster = null; // a clip without a poster still plays
        }
        return { durationS, width: video.videoWidth, height: video.videoHeight, poster };
    } finally {
        URL.revokeObjectURL(url);
    }
}

/** Uploads with progress; `onTask` exposes the task so the UI can cancel. */
function upload(path: string, data: Blob, contentType: string, onProgress: (f: number) => void, onTask?: (t: UploadTask) => void): Promise<void> {
    return new Promise((resolve, reject) => {
        const task = uploadBytesResumable(ref(storage(), path), data, { contentType, cacheControl: "private, max-age=86400" });
        onTask?.(task);
        task.on("state_changed",
            snap => onProgress(snap.totalBytes ? snap.bytesTransferred / snap.totalBytes : 0),
            () => reject(new MediaUploadError("media.upload")),
            () => resolve());
    });
}

export function newMediaId(): string {
    return doc(collection(db, "team_media")).id;
}

interface UploadCtx {
    season: number;
    teamNumber: number;
    uid: string;
    caption: string;
    onProgress: (fraction: number) => void;
    onTask?: (t: UploadTask) => void;
}

export async function uploadPhoto(file: File, ctx: UploadCtx): Promise<string> {
    const id = newMediaId();
    const { full, thumb, width, height } = await preparePhoto(file);
    const path = mediaPath(ctx.season, ctx.teamNumber, id, "original");
    const thumbPath = mediaPath(ctx.season, ctx.teamNumber, id, "thumb");
    await upload(thumbPath, thumb, thumb.type, () => {}, ctx.onTask);
    await upload(path, full, full.type, ctx.onProgress, ctx.onTask);
    await setDoc(doc(db, "team_media", id), {
        teamNumber: ctx.teamNumber, season: ctx.season, kind: "photo", path, thumbPath,
        contentType: full.type, bytes: full.size, width, height,
        caption: cleanCaption(ctx.caption), consent: true, uploadedBy: ctx.uid, createdAt: serverTimestamp(),
    });
    return id;
}

export async function uploadClip(file: File, probe: { durationS: number; width: number; height: number; poster: Blob | null }, ctx: UploadCtx): Promise<string> {
    const id = newMediaId();
    const path = mediaPath(ctx.season, ctx.teamNumber, id, "original");
    const thumbPath = probe.poster ? mediaPath(ctx.season, ctx.teamNumber, id, "thumb") : null;
    if (probe.poster && thumbPath) await upload(thumbPath, probe.poster, probe.poster.type, () => {}, ctx.onTask);
    await upload(path, file, file.type, ctx.onProgress, ctx.onTask);
    await setDoc(doc(db, "team_media", id), {
        teamNumber: ctx.teamNumber, season: ctx.season, kind: "clip", path, ...(thumbPath ? { thumbPath } : {}),
        contentType: file.type, bytes: file.size, durationS: Math.round(probe.durationS * 10) / 10,
        width: probe.width, height: probe.height,
        caption: cleanCaption(ctx.caption), consent: true, uploadedBy: ctx.uid, createdAt: serverTimestamp(),
    });
    return id;
}

export async function addYouTube(youtubeId: string, ctx: Omit<UploadCtx, "onProgress" | "onTask">): Promise<string> {
    const id = newMediaId();
    await setDoc(doc(db, "team_media", id), {
        teamNumber: ctx.teamNumber, season: ctx.season, kind: "youtube", youtubeId,
        caption: cleanCaption(ctx.caption), consent: true, uploadedBy: ctx.uid, createdAt: serverTimestamp(),
    });
    return id;
}

export const updateCaption = (id: string, caption: string) =>
    updateDoc(doc(db, "team_media", id), { caption: cleanCaption(caption) });

/** Removes the files then the metadata (an orphan file is harmless; an orphan doc would show broken). */
export async function deleteMedia(m: TeamMedia): Promise<void> {
    for (const p of [m.path, m.thumbPath]) {
        if (!p) continue;
        await deleteObject(ref(storage(), p)).catch(e => {
            if ((e as { code?: string })?.code !== "storage/object-not-found") throw e;
        });
    }
    await deleteDoc(doc(db, "team_media", m.id));
}

export function listenTeamMedia(season: number, teamNumber: number, cb: (rows: TeamMedia[]) => void): Unsubscribe {
    const q = query(collection(db, "team_media"), where("season", "==", season), where("teamNumber", "==", teamNumber));
    return onSnapshot(q, snap => {
        const rows = snap.docs.map(d => ({ ...(d.data() as Omit<TeamMedia, "id">), id: d.id }));
        rows.sort((a, b) => (a.createdAt?.seconds ?? 0) - (b.createdAt?.seconds ?? 0));
        cb(rows);
    }, err => {
        console.error("[media] listener failed:", err);
        cb([]);
    });
}

/** Sets (or clears) the robot's profile photo on the team card. */
export async function setProfileMedia(season: number, teamNumber: number, mediaId: string | null): Promise<void> {
    await setDoc(doc(db, "team_profiles", `${season}_${teamNumber}`), { teamNumber, season, profileMediaId: mediaId }, { merge: true });
}

export async function reportMedia(mediaId: string, reason: string, uid: string): Promise<void> {
    await setDoc(doc(collection(db, "media_reports")), {
        mediaId, reason: reason.trim().slice(0, 200), reportedBy: uid, createdAt: serverTimestamp(),
    });
}

// Blob URLs per storage path, kept for the page's lifetime (rules-checked reads).
const blobUrls = new Map<string, Promise<string>>();

export function mediaBlobUrl(path: string): Promise<string> {
    let p = blobUrls.get(path);
    if (!p) {
        p = getBlob(ref(storage(), path)).then(b => URL.createObjectURL(b));
        p.catch(() => blobUrls.delete(path));
        blobUrls.set(path, p);
    }
    return p;
}
