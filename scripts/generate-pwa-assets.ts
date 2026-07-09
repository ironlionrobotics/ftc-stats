/**
 * Generates the PWA icon set from `public/icon.png` (source must be ≥512×512).
 *
 * Run via `npm run generate:pwa-assets`. Output is committed to
 * `public/icons/` so the manifest references stable URLs that the browser /
 * service worker can precache.
 *
 * What we generate (covering the most common device requirements):
 *   - Android: 48, 72, 96, 144, 192, 256, 384, 512 (any)
 *   - Android maskable: 192, 512 with 10% safe-zone padding
 *   - iOS apple-touch-icon: 180 (matches non-retina + retina iPhones / iPads)
 *   - Favicons: 32, 16
 *
 * Maskable safe-zone: Android adaptive icons crop ~10% off each edge. We pad
 * the source so the content stays visible. See https://web.dev/maskable-icon/
 */

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

const SOURCE = "public/icon.png";
const OUT_DIR = "public/icons";

const SIZES_ANY = [48, 72, 96, 128, 144, 152, 167, 180, 192, 256, 384, 512];
const SIZES_MASKABLE = [192, 512];
const FAVICON_SIZES = [16, 32];

async function main() {
    await mkdir(OUT_DIR, { recursive: true });

    const source = sharp(SOURCE);
    const meta = await source.metadata();
    // 500+ is OK — sharp upscales the last 12px via Lanczos with negligible
    // quality loss. Going below 500 would visibly blur the 512 output.
    if ((meta.width ?? 0) < 500 || (meta.height ?? 0) < 500) {
        throw new Error(
            `Source ${SOURCE} is ${meta.width}×${meta.height}; must be ≥500×500.`,
        );
    }

    // Standard "any" purpose icons — fit the source to the target square.
    for (const size of SIZES_ANY) {
        const out = join(OUT_DIR, `icon-${size}.png`);
        await sharp(SOURCE)
            .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png({ quality: 90 })
            .toFile(out);
        console.log(`  ${out} (${size}×${size})`);
    }

    // Maskable icons need a 20% border (10% per edge) of safe zone so the
    // adaptive-icon crop doesn't eat into the logo.
    for (const size of SIZES_MASKABLE) {
        const inner = Math.round(size * 0.8);
        const padding = Math.round((size - inner) / 2);
        const out = join(OUT_DIR, `icon-maskable-${size}.png`);
        const resizedBuffer = await sharp(SOURCE)
            .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png()
            .toBuffer();
        await sharp({
            create: {
                width: size,
                height: size,
                channels: 4,
                // Background matches the app's theme color so the icon edges
                // blend with the launcher tile color.
                background: { r: 10, g: 10, b: 10, alpha: 1 },
            },
        })
            .composite([{ input: resizedBuffer, top: padding, left: padding }])
            .png({ quality: 90 })
            .toFile(out);
        console.log(`  ${out} (${size}×${size}, maskable, ${inner}×${inner} inner)`);
    }

    // Favicons (PNG variants; .ico generation needs an extra dep, skip).
    for (const size of FAVICON_SIZES) {
        const out = join(OUT_DIR, `favicon-${size}.png`);
        await sharp(SOURCE)
            .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
            .png({ quality: 90 })
            .toFile(out);
        console.log(`  ${out}`);
    }

    console.log("\n✅ PWA icon set generated. Update manifest.webmanifest to reference these paths.");
}

main().catch(err => {
    console.error("PWA asset generation failed:", err);
    process.exit(1);
});
