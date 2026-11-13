#!/usr/bin/env node
/**
 * Mobile performance baseline for PRIDE routes (plan "PRIDE abierta al público",
 * Etapa 0). Every redesign stage is compared against this: no route may regress.
 *
 * Uses the project's Playwright Chromium with Lighthouse-like mobile conditions:
 * 412×823 viewport, 4× CPU slowdown, "Slow 4G" network (150 ms RTT,
 * 1.6 Mbps down, 750 kbps up). Each route is warmed once (server cache), then
 * measured N times on a cold browser cache; the median is reported.
 *
 * Metrics (from the page's own PerformanceObserver entries):
 *   TTFB, FCP, LCP, CLS, TBT (sum of long-task time over 50 ms after FCP,
 *   until load + 2 s), JS transferred (KB, compressed), total transferred (KB).
 *
 * Usage:
 *   node scripts/perf-baseline.mjs [baseUrl] [--runs 3] [--out docs/perf/baseline-YYYY-MM-DD]
 * Default baseUrl: production.
 */
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, dflt) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : dflt;
};
const BASE = args.find(a => a.startsWith("http")) ?? "https://ftc-stats--ironlion-scouting.us-central1.hosted.app";
const RUNS = Number(flag("--runs", "3"));
const OUT = flag("--out", `docs/perf/baseline-${new Date().toISOString().slice(0, 10)}`);

const ROUTES = [
    "/",
    "/event/FPEMX?season=2025",
    "/event/AUBRQ1?season=2026",
    "/team/30311",
    "/scouting",
    "/strategy",
    "/oracle",
];

// Injected before any page script: collect paint/LCP/CLS/long tasks.
const OBSERVERS = () => {
    const w = window;
    w.__perf = { lcp: 0, cls: 0, longTasks: [] };
    new PerformanceObserver(l => {
        for (const e of l.getEntries()) w.__perf.lcp = e.renderTime || e.loadTime || e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    new PerformanceObserver(l => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) w.__perf.cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    new PerformanceObserver(l => {
        for (const e of l.getEntries()) w.__perf.longTasks.push([e.startTime, e.duration]);
    }).observe({ type: "longtask", buffered: true });
};

async function measure(browser, url) {
    const context = await browser.newContext({
        viewport: { width: 412, height: 823 },
        deviceScaleFactor: 2.625,
        isMobile: true,
        hasTouch: true,
        userAgent: "Mozilla/5.0 (Linux; Android 11; moto g power) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 PRIDE-perf-baseline",
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    let jsBytes = 0;
    let totalBytes = 0;
    const types = new Map();
    cdp.on("Network.responseReceived", e => types.set(e.requestId, e.type));
    cdp.on("Network.loadingFinished", e => {
        totalBytes += e.encodedDataLength;
        if (types.get(e.requestId) === "Script") jsBytes += e.encodedDataLength;
    });

    await page.addInitScript(OBSERVERS);
    await page.goto(url, { waitUntil: "load", timeout: 180_000 });
    await page.waitForTimeout(2000); // let LCP settle and late long tasks land

    const m = await page.evaluate(() => {
        const nav = performance.getEntriesByType("navigation")[0];
        const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0;
        const p = window.__perf;
        const tbt = p.longTasks
            .filter(([start]) => start >= fcp)
            .reduce((s, [, d]) => s + Math.max(0, d - 50), 0);
        return { ttfb: nav.responseStart, fcp, lcp: p.lcp, cls: p.cls, tbt, load: nav.loadEventEnd };
    });
    await context.close();
    return { ...m, jsKB: jsBytes / 1024, totalKB: totalBytes / 1024 };
}

const median = xs => {
    const s = [...xs].sort((a, b) => a - b);
    return s[Math.floor(s.length / 2)];
};

// Prefer the system Google Chrome (no browser download needed); fall back to
// Playwright's bundled Chromium if Chrome isn't installed.
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const results = [];
try {
    for (const route of ROUTES) {
        const url = BASE + route;
        await fetch(url).catch(() => {}); // warm the server-side cache
        const runs = [];
        for (let i = 0; i < RUNS; i++) {
            try {
                runs.push(await measure(browser, url));
                process.stdout.write(`ok ${route} #${i + 1}\n`);
            } catch (e) {
                process.stdout.write(`FAIL ${route} #${i + 1}: ${e instanceof Error ? e.message : e}\n`);
            }
        }
        if (!runs.length) continue;
        const keys = ["ttfb", "fcp", "lcp", "cls", "tbt", "load", "jsKB", "totalKB"];
        results.push({ route, runs: runs.length, ...Object.fromEntries(keys.map(k => [k, median(runs.map(r => r[k]))])) });
    }
} finally {
    await browser.close();
}

mkdirSync(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
writeFileSync(`${OUT}.json`, JSON.stringify({ base: BASE, runs: RUNS, measuredAt: new Date().toISOString(), results }, null, 2) + "\n");

const ms = v => `${Math.round(v)}`;
const table = [
    `# Línea base de rendimiento móvil — ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Origen: ${BASE}. Mediana de ${RUNS} corridas por ruta, caché del navegador vacía, servidor ya caliente.`,
    "Condiciones: 412×823, CPU 4× más lenta, red Slow 4G (150 ms RTT, 1.6 Mbps). Script: `scripts/perf-baseline.mjs`.",
    "",
    "| Ruta | TTFB ms | FCP ms | LCP ms | TBT ms | CLS | JS KB | Total KB |",
    "|---|---|---|---|---|---|---|---|",
    ...results.map(r => `| \`${r.route}\` | ${ms(r.ttfb)} | ${ms(r.fcp)} | ${ms(r.lcp)} | ${ms(r.tbt)} | ${r.cls.toFixed(3)} | ${ms(r.jsKB)} | ${ms(r.totalKB)} |`),
    "",
    "Umbrales de Google para \"bueno\": LCP ≤ 2500 ms, CLS ≤ 0.1, TBT ≤ 200 ms (proxy de laboratorio de INP).",
    "",
].join("\n");
writeFileSync(`${OUT}.md`, table);
process.stdout.write(`\n${table}\n`);
