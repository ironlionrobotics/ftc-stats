import { describe, it, expect } from "vitest";
import { scrubMp4Metadata } from "./mp4-scrub";

function box(t: string, payload: Uint8Array): Uint8Array {
    const out = new Uint8Array(8 + payload.length);
    new DataView(out.buffer).setUint32(0, out.length);
    out.set([...t].map(c => c.charCodeAt(0)), 4);
    out.set(payload, 8);
    return out;
}
const cat = (...parts: Uint8Array[]) => {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) { out.set(p, at); at += p.length; }
    return out;
};
const text = (s: string) => new TextEncoder().encode(s);

describe("mp4 metadata scrub (#106 review)", () => {
    it("blanks udta/meta inside moov and trak without changing size or mdat", () => {
        const gps = box("udta", box("©xyz", text("+19.4326-099.1332/")));
        const appleMeta = box("meta", text("com.apple.quicktime.location.ISO6709 +19.43"));
        const trak = box("trak", cat(box("tkhd", new Uint8Array(4)), box("udta", text("name"))));
        const moov = box("moov", cat(box("mvhd", new Uint8Array(8)), trak, gps, appleMeta));
        const mdat = box("mdat", text("VIDEO-BYTES"));
        const file = cat(box("ftyp", text("isom")), moov, mdat);
        const before = file.length;
        const n = scrubMp4Metadata(file);
        expect(n).toBe(3);
        expect(file.length).toBe(before);
        const s = new TextDecoder("latin1").decode(file);
        expect(s).not.toContain("+19.4326");
        expect(s).not.toContain("ISO6709");
        expect(s).toContain("VIDEO-BYTES");
        expect(s).toContain("mvhd");
    });
    it("leaves files without moov or with malformed sizes alone", () => {
        const file = box("ftyp", text("isom"));
        expect(scrubMp4Metadata(file)).toBe(0);
        const bad = new Uint8Array([0, 0, 0, 99, 0x6d, 0x6f, 0x6f, 0x76]);
        expect(scrubMp4Metadata(bad)).toBe(0);
    });
});
