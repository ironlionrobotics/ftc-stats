# Evidence: weight, motion, intrusiveness (2026-11-14)

Facts only. Target: production build at http://localhost:3108 (branch etapa1/foundations, `next start`, server already warm).

## Sources consulted
- `scripts/perf-baseline.mjs` read; NOT run (it fixes ROUTES and a 412x823 viewport, and writes into docs/perf/). Own script written instead: `docs/design/audit-2026-11-14/perf/measure.mjs`; raw output `perf/results.json`.
- Baselines (read-only): `docs/perf/baseline-2026-11-13.md` (prod), `docs/perf/etapa1-local-2026-11-13.md` (local build).
- Source checks: `app/layout.tsx`, `components/DeferredGlobals.tsx`, `app/globals.css`, `app/team/[teamNumber]/page.tsx`, `messages/en.json`.
- Method:
  - Viewport 390x844, DPR 3, isMobile + touch, system Chrome via @playwright/test.
  - Perf pass: browser cache disabled, service worker blocked, CDP Slow 4G (150 ms RTT, 1.6 Mbps down, 750 kbps up), 4x CPU throttle, `waitUntil: load` + 3 s settle. **Single run per route** (baselines use the median of 3), so TBT/LCP are noisy.
  - TBT = sum of (long task - 50 ms) after FCP, same definition as the baseline script. LCP/CLS from PerformanceObserver. No TTI metric was computed; `lastLongTaskEnd` (end of the last long task, ms) is the closest proxy.
  - JS "transferred" = CDP `encodedDataLength` of Script requests; "decoded" = `decodedBodySize` of script resources from the Resource Timing API.
  - Animation/notification pass: unthrottled, 3.5 s after load, `document.getAnimations()`, fresh context with `reducedMotion` = no-preference and reduce.
  - Theme pass: `colorScheme` = dark and light.
  - SW/offline pass: SW allowed, load, reload (SW-controlled), `setOffline(true)`, reload.

## Findings 1-3: weight and timing (per route, throttled)
| Route | JS requests | JS transferred KB | JS decoded KB | Requests total | Transferred KB total | Font KB | Image KB | TTFB ms | FCP ms | LCP ms | TBT ms | CLS | Last long task ends ms |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `/` | 27 | 383 | 1227 | 38 | 482 | 0 | 0 | 22 | 540 | 540 | 129 | 0 | 2514 |
| `/events` | 30 | 385 | 1236 | 45 | 518 | 0 | 0 (1 inline data: SVG) | 52 | 608 | 972 | 150 | 0 | 2647 |
| `/event/USMIRHQ` | 30 | 440 | 1435 | 43 | 565 | 0 | 0 | 19 | 508 | 924 | 170 | 0 | 2588 |
| `/team/30311` | 27 | 389 | 1246 | 40 | 530 | 0 | 0 | 30 | 596 | 1144 | 152 | 0 | 2628 |
| `/strategy` | 33 | 443 | 1405 | 44 | 548 | 0 | 0 | 21 | 524 | **2752** | 165 | 0 | 2558 |
| `/scouting` | 34 | 583 | 1932 | 47 | 690 | 0 | 0 | 22 | 532 | 860 | **298** | 0 | 3982 |

Requests by type (count): Script 27-34; Document 1; Stylesheet 1 (18 KB on every route); Other 1 (2 KB); Fetch 8-11 (0-6 KB). No requests with status >= 400 on any route. No web font files and no raster images are fetched on any route (system fonts per `docs/perf` notes).

Document sizes: / 40 KB, /events 72 KB, /event/USMIRHQ 58 KB, /team/30311 77 KB, /strategy 40 KB, /scouting 40 KB.

Comparison with `docs/perf` (different viewport 412x823, median of 3, so indicative only):
| Route | etapa1-local (11-13) JS KB / total KB / TBT | now JS KB / total KB / TBT |
|---|---|---|
| `/` | 390 / 464 / 146 | 383 / 482 / 129 |
| `/team/30311` | 432 / 515 / 119 | 389 / 530 / 152 |
| `/scouting` | 607 / 650 / 214 | 583 / 690 / 298 |
| `/strategy` | 472 / 515 / 140 | 443 / 548 / 165 |
| `/event/*` | 438 / 497 / 163 (FPEMX) | 440 / 565 / 170 (USMIRHQ) |
| `/events` | not in baseline | 385 / 518 / 150 |
Prod baseline (11-13, before Etapa 1): / 507 JS / 749 total / TBT 197; /scouting 680 / 889 / 377.
`/strategy` LCP 2752 ms is above the 2500 ms "good" threshold used in docs/perf; the 11-13 baselines had 472-752 ms for it. Not re-run, so run-to-run noise is not excluded. `/scouting` TBT 298 ms exceeds the 200 ms threshold (11-13: 214 local, 377 prod).
No TTI measured; JS main-thread work continues until about 2.5 s (3.0-4.0 s on /scouting) under 4x CPU.

## Finding 4: animations on idle screen
| Route | getAnimations() total / running | Infinite | Same with reduced motion |
|---|---|---|---|
| `/`, `/events`, `/event/USMIRHQ`, `/strategy`, `/scouting` | 0 / 0 | 0 | 0 / 0 |
| `/team/30311` | 1 / 1 | 1: CSS `pulse` on a decorative `div.absolute top-10 right-10 w-64 h-64 bg-accent/20 rounded-full blur-3xl animate-pulse` (`app/team/[teamNumber]/page.tsx:135`) | **still 1 running** (not stopped by prefers-reduced-motion) |
`app/globals.css:192` has one `prefers-reduced-motion: reduce` rule (only `.live-scanline::before`, `live-scan`). No global reduce rule was found by grep in `globals.css` beyond that one. Animations that appear after interaction (not idle) were not measured.

## Finding 5: notifications, badges, modals, banners, toasts on initial load
Detected at 3.5 s on all 6 routes (identical set, anonymous visitor, empty storage):
| Item | Selector / evidence | State |
|---|---|---|
| Sonner toast region | `section[aria-live=polite]` (aria-label "Notifications alt+T"), `app/layout.tsx:116` | present, empty (no toast) |
| AI assistant launcher + greeting bubble ("Iron Lion AI / Strategic Advisor / Hi! I'm PRIDE's str...") | `div.fixed.bottom-[calc(var(--tabbar-h)+1rem)].right-4` (72 px tall), plus a sticky header `div.p-4.bg-muted.border-b` (61 px) with the same text; component `components/ai/AssistantChat.tsx` via `DeferredGlobals` (rendered only when `aiAssistant` flag on) | visible on every route, fixed over the content above the tab bar |
| Mobile top bar | `header.md:hidden.sticky.top-0` 56 px, text "PRIDE" | persistent |
| Mobile tab bar | `nav.md:hidden.fixed.inset-x-0.bottom-0` 57 px, 5 items (Today, Events, Teams, Scouting, Strategy) | persistent |
Not present at load (no role=dialog / alertdialog / `[aria-modal]` / `dialog` found on any route): onboarding modal (`OnboardingModal`, only opens for a signed-in user without org), install prompt (`PWAInstallPrompt`, needs `beforeinstallprompt`, not fired in this run), past-season banner (`PastSeasonBanner`, nothing detected on these routes; /event/USMIRHQ is season 2026), sync badge (`OnlineSync`, only with pending offline data), cookie banner (none exists in the DOM scan). Persistent chrome on mobile: 56 + 57 px = 113 px of 844 px (13.4 %) plus the launcher.
Not tested: signed-in states, install-prompt event, past-season routes, pending-sync state.

## Finding 6: dark mode
- App default is dark: `themeInitScript` in `app/layout.tsx:74` adds class `dark` unless localStorage `ftc-theme` has theme `light`. It does NOT read `prefers-color-scheme`.
- Measured: with `colorScheme: light` and with `dark`, both give `html.dark`, body bg `rgb(7, 8, 10)`, text `rgb(243, 244, 246)`, `<meta name="theme-color" content="#07080a">` (single, not media-split). Identical on all 6 routes. localStorage empty at load.
- Light theme exists only via the explicit user toggle (account panel) persisted in `ftc-theme`. Light-theme rendering was not measured.

## Finding 7: service worker and offline
| Check | `/` | `/event/USMIRHQ` |
|---|---|---|
| SW registered (scope http://localhost:3108/, active, controlling after reload) | yes | yes |
| Offline reload after first load | yes: HTTP 200, h1 "Follow your team", 713 chars of body text, nav shell present | yes: HTTP 200, h1 "Rochester Qualifier", 2684 chars, stats (AVG SCORE 74.2, AVG AUTO 24.5) shown |
Both pages were visited online and reloaded once (SW-controlled) before going offline.

## Per-principle facts
Environmentally friendly (#9):
- First-view JS 383-583 KB transferred (1.2-1.9 MB decoded); total 482-690 KB; 38-47 requests; 27-34 script files per view; one 18 KB CSS file.
- 0 font bytes and 0 image bytes on every route (system fonts, no raster images).
- Main thread busy until about 2.5 s (3.0-4.0 s on /scouting) at 4x CPU; TBT 129-298 ms.
- /scouting is the heaviest (583 KB JS, 690 KB total, TBT 298 ms); / is the lightest (383 / 482 / 129).
- 1 infinite CSS animation (decorative blurred pulse) on /team/30311, not stopped by reduced motion; 0 on the other routes.
- Servers: static/dynamic mix not measured; offline reload works from the SW cache for both tested pages.
Unobtrusive (#5):
- No modal, banner, install prompt or toast was displayed at load on any of the 6 routes (anonymous visitor).
- A floating AI assistant launcher/greeting (fixed, 72 px) is shown on every route in addition to the 56 px top bar and 57 px tab bar on mobile.
- 0 idle animations on 5 of 6 routes.
- App ignores the OS colour-scheme preference and always starts dark.

## Known gaps
- Single run per route, localhost (no CDN, TTFB not representative); LCP 2752 ms on /strategy not repeated.
- No TTI value; only long-task end time. No real-device measurement.
- Signed-in and onboarding states, install prompt, PastSeasonBanner trigger, OnlineSync badge, toasts after actions not exercised.
- Animations/transitions triggered by interaction not counted. Reduced-motion audit limited to idle `getAnimations()` plus the single CSS rule in globals.css.
- Light-theme visuals and contrast not measured.
- `scripts/perf-baseline.mjs` not run (different viewport and fixed route list); numbers vs docs/perf are therefore indicative.
