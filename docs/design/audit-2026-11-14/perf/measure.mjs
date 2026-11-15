import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const BASE = "http://localhost:3108";
const ROUTES = ["/", "/events", "/event/USMIRHQ", "/team/30311", "/strategy", "/scouting"];
const OBS = () => { const w = window; w.__p = { lcp: 0, cls: 0, lt: [] };
  new PerformanceObserver(l => { for (const e of l.getEntries()) w.__p.lcp = e.renderTime || e.loadTime || e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) w.__p.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver(l => { for (const e of l.getEntries()) w.__p.lt.push([e.startTime, e.duration]); }).observe({ type: "longtask", buffered: true }); };
const ctxOpts = (extra = {}) => ({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: "allow", ...extra });
const browser = await chromium.launch({ channel: "chrome" }).catch(() => chromium.launch());
const out = {};
for (const r of ROUTES) {
  const res = { route: r };
  // Pass A: throttled, cold cache
  const ctx = await browser.newContext(ctxOpts({ serviceWorkers: "block" }));
  const page = await ctx.newPage(); const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable"); await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: 1.6*1024*1024/8, uploadThroughput: 750*1024/8 });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  const reqs = new Map();
  cdp.on("Network.responseReceived", e => reqs.set(e.requestId, { type: e.response.mimeType, rt: e.type, url: e.response.url, status: e.response.status }));
  cdp.on("Network.loadingFinished", e => { const q = reqs.get(e.requestId); if (q) q.enc = e.encodedDataLength; });
  await page.addInitScript(OBS);
  await page.goto(BASE + r, { waitUntil: "load", timeout: 120000 });
  await page.waitForTimeout(3000);
  const m = await page.evaluate(() => { const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? 0; const p = window.__p;
    const tbt = p.lt.filter(([s]) => s >= fcp).reduce((s, [, d]) => s + Math.max(0, d - 50), 0);
    const lastLT = p.lt.length ? Math.max(...p.lt.map(([s,d]) => s+d)) : 0;
    const res = performance.getEntriesByType("resource").filter(e => e.initiatorType==="script"||e.name.endsWith(".js"));
    return { ttfb: nav.responseStart, fcp, lcp: p.lcp, cls: p.cls, tbt, loadEnd: nav.loadEventEnd, lastLongTaskEnd: lastLT, longTasks: p.lt.length,
      jsDecoded: res.reduce((s,e)=>s+e.decodedBodySize,0), jsEncoded: res.reduce((s,e)=>s+e.encodedBodySize,0), jsCount: res.length }; });
  const byType = {}; let total = 0;
  for (const q of reqs.values()) { const k = q.rt; byType[k] ??= { n: 0, kb: 0 }; byType[k].n++; byType[k].kb += (q.enc||0)/1024; total += q.enc||0; }
  res.perf = m; res.reqCount = reqs.size; res.byType = byType; res.totalKB = total/1024;
  res.fontKB = [...reqs.values()].filter(q => q.rt==="Font").reduce((s,q)=>s+(q.enc||0),0)/1024;
  res.imageKB = [...reqs.values()].filter(q => q.rt==="Image").reduce((s,q)=>s+(q.enc||0),0)/1024;
  res.fontFiles = [...reqs.values()].filter(q => q.rt==="Font").map(q=>q.url.split("/").pop());
  res.imageFiles = [...reqs.values()].filter(q => q.rt==="Image").map(q=>q.url.replace(BASE,""));
  res.nonOk = [...reqs.values()].filter(q => q.status>=400).map(q=>q.status+" "+q.url.replace(BASE,""));
  await ctx.close();
  // Pass B: unthrottled; animations, notifications, theme
  for (const mode of ["no-preference","reduce"]) {
    const c2 = await browser.newContext(ctxOpts({ serviceWorkers: "block", reducedMotion: mode, colorScheme: "light" }));
    const p2 = await c2.newPage(); await p2.goto(BASE + r, { waitUntil: "load", timeout: 60000 }); await p2.waitForTimeout(3500);
    const a = await p2.evaluate(() => {
      const anims = document.getAnimations().map(x => ({ n: x.animationName || x.transitionProperty || x.constructor.name, t: x.constructor.name, state: x.playState, iter: x.effect?.getComputedTiming().iterations, el: (x.effect?.target?.tagName||"")+"."+String(x.effect?.target?.className?.baseVal ?? x.effect?.target?.className ?? "").slice(0,50) }));
      const running = anims.filter(x => x.state === "running");
      const infinite = running.filter(x => x.iter === Infinity);
      const ov = [...document.querySelectorAll('[role=dialog],[role=alertdialog],[role=alert],[role=status],[aria-live],[aria-modal=true],dialog,[data-sonner-toaster],[data-sonner-toast],[class*=toast i],[class*=banner i],[class*=Banner]')].map(e => ({ tag: e.tagName, role: e.getAttribute("role"), live: e.getAttribute("aria-live"), id: e.id, cls: String(e.className).slice(0,60), text: (e.innerText||"").trim().slice(0,70), vis: !!(e.offsetWidth||e.offsetHeight) }));
      const fixedEls = [...document.querySelectorAll("body *")].filter(e => { const s = getComputedStyle(e); return (s.position==="fixed"||s.position==="sticky") && e.offsetWidth>0 && e.offsetHeight>0; }).map(e => ({ tag: e.tagName, cls: String(e.className).slice(0,50), pos: getComputedStyle(e).position, h: Math.round(e.getBoundingClientRect().height), text: (e.innerText||"").trim().slice(0,50).replace(/\n/g," | ") }));
      const cs = getComputedStyle(document.documentElement);
      return { total: anims.length, running: running.length, infinite: infinite.length, infDetail: infinite.slice(0,8), anims: anims.slice(0,12), ov, fixedEls, htmlClass: document.documentElement.className, dataTheme: document.documentElement.getAttribute("data-theme"), colorScheme: cs.colorScheme, bodyBg: getComputedStyle(document.body).backgroundColor, bodyColor: getComputedStyle(document.body).color, scrollH: document.documentElement.scrollHeight }; });
    res["anim_"+mode] = a; await c2.close();
  }
  for (const cs of ["dark","light"]) {
    const c3 = await browser.newContext(ctxOpts({ serviceWorkers: "block", colorScheme: cs }));
    const p3 = await c3.newPage(); await p3.goto(BASE + r, { waitUntil: "load" }); await p3.waitForTimeout(1500);
    res["theme_"+cs] = await p3.evaluate(() => ({ htmlClass: document.documentElement.className, dataTheme: document.documentElement.getAttribute("data-theme"), bodyBg: getComputedStyle(document.body).backgroundColor, bodyColor: getComputedStyle(document.body).color, metaTheme: document.querySelector('meta[name=theme-color]')?.outerHTML ?? null, ls: Object.keys(localStorage) }));
    await c3.close();
  }
  out[r] = res; console.log("done", r);
}
// SW + offline
const sw = {};
for (const r of ["/", "/event/USMIRHQ"]) {
  const c = await browser.newContext(ctxOpts({ serviceWorkers: "allow" })); const p = await c.newPage();
  await p.goto(BASE + r, { waitUntil: "load" }); await p.waitForTimeout(1500);
  // visit other route for runtime caching of both
  const reg = await p.evaluate(async () => { const rs = await navigator.serviceWorker?.getRegistrations?.() ?? []; await navigator.serviceWorker?.ready.catch(()=>{}); return { count: rs.length, scope: rs[0]?.scope, active: !!rs[0]?.active, ctrl: !!navigator.serviceWorker?.controller }; }).catch(e => ({ err: String(e) }));
  await p.waitForTimeout(4000);
  await p.reload({ waitUntil: "load" }); await p.waitForTimeout(2000); // now SW-controlled
  await c.setOffline(true);
  let off;
  try { const resp = await p.reload({ waitUntil: "load", timeout: 20000 }); await p.waitForTimeout(2500);
    off = { status: resp?.status(), title: await p.title(), bodyLen: (await p.evaluate(() => document.body.innerText)).length, h1: await p.evaluate(() => document.querySelector("h1")?.innerText ?? null), snippet: (await p.evaluate(() => document.body.innerText)).slice(0,160).replace(/\n/g," | ") };
  } catch (e) { off = { error: String(e).slice(0, 120) }; }
  sw[r] = { reg, off }; await c.close();
}
out.__sw = sw;
writeFileSync("docs/design/audit-2026-11-14/perf/results.json", JSON.stringify(out, null, 1));
await browser.close();
