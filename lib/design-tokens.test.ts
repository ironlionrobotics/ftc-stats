import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Regression guard for the "Oro" design system: min 12px text, semantic tokens only.
const ROOT = path.resolve(__dirname, "..");

// Deliberate exceptions (repo-relative, posix separators).
const ALLOWLIST: string[] = [
    "components/strategy/MatchBriefingCard.tsx", // printable paper sheet: fixed black-on-white by design
    "components/scouting/QRScanner.tsx", // camera chrome over video feed: fixed dark surfaces
    "app/global-error.tsx", // root error boundary renders outside the app CSS/tokens
];

const PALETTE =
    /\b(bg|text|border|ring|from|via|to|fill|stroke|divide|outline|decoration|shadow)-(red|rose|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|slate|gray|zinc|neutral|stone)-\d{2,3}\b/;
const BW = /\b(bg|text|border)-(white|black)\b(?!\/)/g;
const SMALL_TEXT = /text-\[(\d+(?:\.\d+)?)px\]/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const HEX_CONTEXT = /className|style=|fill=|stroke=/;

function walk(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === "node_modules" || e.name.startsWith(".")) continue;
            walk(p, out);
        } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
    }
    return out;
}

function violations(): string[] {
    const found: string[] = [];
    const files = [...walk(path.join(ROOT, "app")), ...walk(path.join(ROOT, "components"))];
    for (const file of files) {
        const rel = path.relative(ROOT, file).split(path.sep).join("/");
        if (ALLOWLIST.includes(rel)) continue;
        fs.readFileSync(file, "utf8").split("\n").forEach((line, i) => {
            const where = `${rel}:${i + 1}`;
            for (const m of line.matchAll(SMALL_TEXT)) {
                if (Number(m[1]) < 12) found.push(`${where} text size below 12px: ${m[0]}`);
            }
            const p = line.match(PALETTE);
            if (p) found.push(`${where} palette color: ${p[0]}`);
            for (const bw of line.matchAll(BW)) {
                if (bw[0] !== "bg-white" && bw[0] !== "text-white") found.push(`${where} white/black color: ${bw[0]}`);
            }
            if (HEX_CONTEXT.test(line) && HEX.test(line)) found.push(`${where} hex literal: ${line.match(HEX)![0]}`);
        });
    }
    return found;
}

describe("design tokens", () => {
    it("has no sub-12px text, palette colors or hex literals outside the allowlist", () => {
        expect(violations()).toEqual([]);
    });
});
