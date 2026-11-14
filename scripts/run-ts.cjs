#!/usr/bin/env node
/**
 * Runs a TypeScript analysis script with the app's "@/..." imports resolved,
 * so backtests replay the REAL lib/ code instead of a re-typed copy.
 *   node scripts/run-ts.cjs scripts/live-quals-backtest.ts 2026
 */
const path = require("node:path");
const { createJiti } = require("jiti");

const root = path.resolve(__dirname, "..");
const jiti = createJiti(__filename, { alias: { "@": root } });
const [script, ...rest] = process.argv.slice(2);
if (!script) {
    console.error("usage: node scripts/run-ts.cjs <script.ts> [args...]");
    process.exit(1);
}
process.argv = [process.argv[0], path.resolve(script), ...rest];
jiti.import(path.resolve(script)).catch(e => {
    console.error(e);
    process.exit(1);
});
