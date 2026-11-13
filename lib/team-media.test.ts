import { describe, it, expect } from "vitest";
import { parseYouTubeId, fitWithin, canAdd, validateClip, mediaPath, cleanCaption, MEDIA_LIMITS } from "./team-media";

describe("team media (#106)", () => {
    it("parses YouTube ids from the usual URL shapes and rejects the rest", () => {
        expect(parseYouTubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
        expect(parseYouTubeId("https://youtu.be/dQw4w9WgXcQ?si=x")).toBe("dQw4w9WgXcQ");
        expect(parseYouTubeId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
        expect(parseYouTubeId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
        expect(parseYouTubeId("https://evil.com/watch?v=dQw4w9WgXcQ")).toBeNull();
        expect(parseYouTubeId("https://youtube.com/watch?v=short")).toBeNull();
        expect(parseYouTubeId("not a url")).toBeNull();
    });
    it("fits images inside the max side without upscaling", () => {
        expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
        expect(fitWithin(3000, 4000, 400)).toEqual({ width: 300, height: 400 });
        expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    });
    it("enforces per-team counts", () => {
        expect(canAdd("photo", Array(MEDIA_LIMITS.photos - 1).fill({ kind: "photo" }))).toBe(true);
        expect(canAdd("photo", Array(MEDIA_LIMITS.photos).fill({ kind: "photo" }))).toBe(false);
        expect(canAdd("clip", Array(3).fill({ kind: "clip" }))).toBe(false);
        expect(canAdd("clip", Array(12).fill({ kind: "photo" }))).toBe(true);
    });
    it("validates clips by type, size and duration", () => {
        expect(validateClip({ type: "video/mp4", bytes: 10e6, durationS: 30 })).toBeNull();
        expect(validateClip({ type: "video/avi", bytes: 10e6, durationS: 30 })).toBe("media.badType");
        expect(validateClip({ type: "video/mp4", bytes: 60 * 1024 * 1024, durationS: 30 })).toBe("media.tooBig");
        expect(validateClip({ type: "video/mp4", bytes: 1e6, durationS: 75 })).toBe("media.tooLong");
        expect(validateClip({ type: "video/mp4", bytes: 1e6, durationS: NaN })).toBe("media.tooLong");
    });
    it("builds paths and cleans captions", () => {
        expect(mediaPath(2026, 30311, "abc", "thumb")).toBe("team_media/2026/30311/abc/thumb");
        expect(cleanCaption("  hola   robot ")).toBe("hola robot");
        expect(cleanCaption("x".repeat(200)).length).toBe(80);
    });
});
