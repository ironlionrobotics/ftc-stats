#!/usr/bin/env node
/**
 * Runs a TypeScript analysis script with the app's "@/..." imports resolved,
 * so backtests replay the REAL lib/ code instead of a re-typed copy.
 *   node scripts/run-ts.mjs scripts/live-quals-backtest.ts 2026
 */
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createJiti } from "jiti";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const jiti = createJiti(import.meta.url, { alias: { "@": root } });
const [script, ...rest] = process.argv.slice(2);
if (!script) {
    console.error("usage: node scripts/run-ts.mjs <script.ts> [args...]");
    process.exit(1);
}
process.argv = [process.argv[0], resolve(script), ...rest];
jiti.import(resolve(script)).catch(e => {
    console.error(e);
    process.exit(1);
});
