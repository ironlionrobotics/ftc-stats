import { describe, it, expect } from "vitest";
import { parse, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import en from "@/messages/en.json";
import es from "@/messages/es.json";

type Catalog = { [key: string]: string | Catalog };

/** Flatten a nested catalog into dotted key paths -> message string. */
function flatten(node: Catalog, prefix = "", out: Record<string, string> = {}): Record<string, string> {
    for (const [k, v] of Object.entries(node)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (typeof v === "string") out[path] = v;
        else flatten(v, path, out);
    }
    return out;
}

// ICU AST node types (see @formatjs/icu-messageformat-parser TYPE enum):
// 0 literal, 1 argument, 2 number, 3 date, 4 time, 5 select, 6 plural, 7 pound, 8 tag.
function collectPlaceholders(elements: MessageFormatElement[], into: Set<string>): void {
    for (const el of elements) {
        switch (el.type) {
            case 1:
            case 2:
            case 3:
            case 4:
                into.add(el.value);
                break;
            case 5:
            case 6:
                into.add(el.value);
                for (const opt of Object.values(el.options)) collectPlaceholders(opt.value, into);
                break;
            case 8:
                into.add(`<${el.value}>`);
                collectPlaceholders(el.children, into);
                break;
            default:
                break;
        }
    }
}

function placeholdersOf(message: string): string[] {
    const set = new Set<string>();
    collectPlaceholders(parse(message), set);
    return [...set].sort();
}

const enFlat = flatten(en as Catalog);
const esFlat = flatten(es as Catalog);

describe("i18n catalog parity (messages/en.json vs messages/es.json)", () => {
    it("has exactly the same set of key paths", () => {
        const enKeys = Object.keys(enFlat).sort();
        const esKeys = Object.keys(esFlat).sort();
        const missingInEs = enKeys.filter(k => !(k in esFlat));
        const missingInEn = esKeys.filter(k => !(k in enFlat));
        expect({ missingInEs, missingInEn }).toEqual({ missingInEs: [], missingInEn: [] });
    });

    it("uses the same ICU placeholders for every key", () => {
        const mismatches: string[] = [];
        for (const key of Object.keys(enFlat)) {
            if (!(key in esFlat)) continue; // reported by the key-set test
            const a = placeholdersOf(enFlat[key]);
            const b = placeholdersOf(esFlat[key]);
            if (a.join("|") !== b.join("|")) {
                mismatches.push(`${key}: en={${a.join(",")}} es={${b.join(",")}}`);
            }
        }
        expect(mismatches).toEqual([]);
    });

    it("every message is valid ICU syntax", () => {
        const invalid: string[] = [];
        for (const [locale, flat] of [["en", enFlat], ["es", esFlat]] as const) {
            for (const [key, msg] of Object.entries(flat)) {
                try {
                    parse(msg);
                } catch (e) {
                    invalid.push(`${locale}:${key}: ${(e as Error).message}`);
                }
            }
        }
        expect(invalid).toEqual([]);
    });
});
