/**
 * Removes location and other user metadata from MP4/MOV clips before upload
 * (#106 review). Phones store GPS in `udta` (©xyz) and `meta` boxes inside
 * `moov`/`trak`. Instead of deleting them — which would shift `mdat` and
 * break every chunk offset — each such box is retyped to `free` and its
 * payload zeroed: same size, same offsets, no metadata.
 */

const CONTAINERS = new Set(["moov", "trak", "mdia", "minf", "edts", "dinf", "stbl"]);
const SCRUB = new Set(["udta", "meta"]);

function type(buf: Uint8Array, at: number): string {
    return String.fromCharCode(buf[at], buf[at + 1], buf[at + 2], buf[at + 3]);
}

/** Box size, handling 64-bit (size 1) and to-end (size 0) forms; null if malformed. */
function boxSize(view: DataView, at: number, end: number): { size: number; header: number } | null {
    if (at + 8 > end) return null;
    let size = view.getUint32(at);
    let header = 8;
    if (size === 1) {
        if (at + 16 > end) return null;
        const big = view.getBigUint64(at + 8);
        if (big > BigInt(Number.MAX_SAFE_INTEGER)) return null;
        size = Number(big);
        header = 16;
    } else if (size === 0) {
        size = end - at;
    }
    if (size < header || at + size > end) return null;
    return { size, header };
}

function walk(buf: Uint8Array, view: DataView, start: number, end: number, depth: number): number {
    let scrubbed = 0;
    let at = start;
    while (at < end) {
        const box = boxSize(view, at, end);
        if (!box) break;
        const t = type(buf, at + 4);
        if (depth > 0 && SCRUB.has(t)) {
            // Retype to 'free' and blank the payload; size stays the same.
            buf[at + 4] = 0x66; buf[at + 5] = 0x72; buf[at + 6] = 0x65; buf[at + 7] = 0x65;
            buf.fill(0, at + box.header, at + box.size);
            scrubbed++;
        } else if (CONTAINERS.has(t) && depth < 8) {
            scrubbed += walk(buf, view, at + box.header, at + box.size, depth + 1);
        }
        at += box.size;
    }
    return scrubbed;
}

/** Scrubs in place and returns how many metadata boxes were neutralized. */
export function scrubMp4Metadata(buf: Uint8Array): number {
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    // Only top-level `moov` is descended (depth 0 = file level).
    let scrubbed = 0;
    let at = 0;
    while (at < buf.length) {
        const box = boxSize(view, at, buf.length);
        if (!box) break;
        if (type(buf, at + 4) === "moov") scrubbed += walk(buf, view, at + box.header, at + box.size, 1);
        at += box.size;
    }
    return scrubbed;
}
