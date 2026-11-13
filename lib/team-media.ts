/**
 * Robot photos, short clips and YouTube links on the Trading Card (#106) —
 * pure part (limits, validation, paths). Media are visible ONLY to members of
 * approved teams (never public): files are read with the Storage SDK under
 * rules, never through public download URLs.
 */

export type MediaKind = "photo" | "clip" | "youtube";

export interface TeamMedia {
    id: string;
    teamNumber: number;
    season: number;
    kind: MediaKind;
    /** Storage paths (photo/clip). */
    path?: string;
    thumbPath?: string;
    /** YouTube video id (kind youtube). */
    youtubeId?: string;
    contentType?: string;
    bytes?: number;
    durationS?: number;
    width?: number;
    height?: number;
    caption: string;
    /** Uploader confirmed: no identifiable faces of members, or their permission. */
    consent: true;
    uploadedBy: string;
    createdAt?: { seconds: number } | null;
}

export const MEDIA_LIMITS = {
    photos: 12,
    clips: 3,
    youtube: 5,
    photoMaxBytes: 5 * 1024 * 1024,
    clipMaxBytes: 50 * 1024 * 1024,
    clipMaxSeconds: 60,
    photoMaxDim: 1600,
    thumbMaxDim: 400,
    captionMax: 80,
} as const;

export const CLIP_TYPES = ["video/mp4", "video/webm", "video/quicktime"] as const;
export const PHOTO_INPUT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"] as const;

export type MediaError =
    | "media.tooMany"
    | "media.tooBig"
    | "media.tooLong"
    | "media.badType"
    | "media.badYoutube"
    | "media.consentRequired";

/** Storage object path; `variant` is the full file or its thumbnail/poster. */
export function mediaPath(season: number, teamNumber: number, mediaId: string, variant: "original" | "thumb"): string {
    return `team_media/${season}/${teamNumber}/${mediaId}/${variant}`;
}

/** Scale (w, h) to fit inside `max` on its longest side, never upscaling. */
export function fitWithin(w: number, h: number, max: number): { width: number; height: number } {
    if (w <= 0 || h <= 0) return { width: 0, height: 0 };
    const scale = Math.min(1, max / Math.max(w, h));
    return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

/** Video id from youtube.com/watch, youtu.be, /shorts, /embed or /live URLs; null otherwise. */
export function parseYouTubeId(raw: string): string | null {
    let url: URL;
    try {
        url = new URL(raw.trim());
    } catch {
        return null;
    }
    const host = url.hostname.replace(/^www\.|^m\./, "");
    let id: string | null = null;
    if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
        if (url.pathname === "/watch") id = url.searchParams.get("v");
        else {
            const m = url.pathname.match(/^\/(?:shorts|embed|live)\/([^/?#]+)/);
            id = m ? m[1] : null;
        }
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}

/** Whether another item of `kind` fits under the per-team limits. */
export function canAdd(kind: MediaKind, existing: Pick<TeamMedia, "kind">[]): boolean {
    const n = existing.filter(m => m.kind === kind).length;
    const max = kind === "photo" ? MEDIA_LIMITS.photos : kind === "clip" ? MEDIA_LIMITS.clips : MEDIA_LIMITS.youtube;
    return n < max;
}

export function validateClip(c: { type: string; bytes: number; durationS: number }): MediaError | null {
    if (!(CLIP_TYPES as readonly string[]).includes(c.type)) return "media.badType";
    if (c.bytes > MEDIA_LIMITS.clipMaxBytes) return "media.tooBig";
    if (!Number.isFinite(c.durationS) || c.durationS > MEDIA_LIMITS.clipMaxSeconds + 0.5) return "media.tooLong";
    return null;
}

export function validatePhotoInput(type: string): MediaError | null {
    return type.startsWith("image/") ? null : "media.badType";
}

export function cleanCaption(raw: unknown): string {
    return typeof raw === "string" ? raw.replace(/\s+/g, " ").trim().slice(0, MEDIA_LIMITS.captionMax) : "";
}
