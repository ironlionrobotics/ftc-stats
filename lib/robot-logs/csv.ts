/**
 * Minimal numeric CSV parser for robot logs (#120). Robot loggers write plain
 * comma-separated numbers with one header line — no quoting — so this stays
 * tiny and dependency-free. Tolerates CRLF, blank lines, a trailing newline,
 * spaces around cells, and short/empty cells (→ NaN).
 */

export const MAX_ROWS = 20_000;
export const MAX_COLUMNS = 128;

export interface CsvTable {
    header: string[];
    /** columns[i] holds the values of header[i]. */
    columns: number[][];
    rows: number;
}

export class CsvError extends Error {
    constructor(public code: "empty" | "tooManyColumns" | "tooManyRows" | "noRows") {
        super(code);
    }
}

function parseCell(s: string | undefined): number {
    if (s === undefined) return NaN;
    const v = s.trim();
    if (v === "") return NaN;
    if (v === "true") return 1;
    if (v === "false") return 0;
    const n = Number(v);
    return Number.isFinite(n) ? n : NaN;
}

export function parseCsv(text: string): CsvTable {
    const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter(l => l.trim() !== "");
    if (lines.length === 0) throw new CsvError("empty");
    const header = lines[0].split(",").map(h => h.trim());
    if (header.length > MAX_COLUMNS) throw new CsvError("tooManyColumns");
    const body = lines.slice(1);
    if (body.length === 0) throw new CsvError("noRows");
    // Refuse rather than truncate: a cut log would hide whatever happened at
    // its end (e.g. a late brownout) and read as healthy.
    if (body.length > MAX_ROWS) throw new CsvError("tooManyRows");
    const used = body;
    const columns = header.map(() => new Array<number>(used.length));
    for (let r = 0; r < used.length; r++) {
        const cells = used[r].split(",");
        for (let c = 0; c < header.length; c++) columns[c][r] = parseCell(cells[c]);
    }
    return { header, columns, rows: used.length };
}
