# 04 · Handoff para /make-plan (REDISEÑO)

````
/make-plan Redesign the PRIDE mobile UI/UX (Next.js 16 PWA for FTC scouting, branch etapa1/foundations; phone 390px and tablet 820px first, desktop keeps its full toolset). Current design failed a Dieter Rams audit at 9/30 with critical gaps in principles #3 aesthetic (0), #2 useful (1), #4 understandable (1), #6 honest (1).

Verdict paragraph:
> PRIDE's mobile experience is redesigned starting from the event-day tasks and a new color system. The UI layer (navigation architecture, base components and tokens) is rebuilt; the engine and the data stay, because they work.

Why redesign and not refine: the total is 9/30 (below 20), and the color system is broken at the root (secondary/accent = alliance blue, danger = alliance red in app/globals.css:29-38 and :53-62), so restyling screens without new tokens and a new navigation architecture would keep the same confusion.

Preserve from current design:
- Alliance red/blue as the ONLY meaning of red/blue (tokens --color-alliance-red/blue in app/globals.css).
- System fonts, zero font bytes (decision #93; app/globals.css @theme), with the condensed number stack for scores.
- Offline-first shell: Serwist SW, Dexie capture queue, CacheWriter/OfflineFallback (offline reload of / and /event works today).
- Bottom tab bar on phone / rail on desktop with aria-current (components/shell/AppShell.tsx), and the visible focus ring.
- All algorithms, server actions, caches, i18n catalogs (messages/es.json, en.json, 1607 keys each), federated scouting rules and push notifications. UI-only redesign.
- Performance budget: first-view JS ≤ current (383–583 KB transferred), TBT ≤ 200 ms on 4x CPU.

Discard:
- Token aliasing secondary/accent = alliance blue and danger = alliance red. Evidence: app/globals.css:29-38. Caused failure on #3/#4 (283 secondary uses and 245 danger uses with ≥6 meanings each: buttons, tabs, links, ties, losses, LIVE, DNP).
- Win/loss/tie in green/red/blue and the 4 different traffic-light scales. Evidence: StatsTable.tsx:224-228, RankingTable.tsx:351-355. #3/#4.
- Event page that opens on KPI cards and tabs where team taps only filter (no team link). Evidence: EventViewManager.tsx:423-436, MatchList.tsx:476,513 (900px tables). #2/#10.
- Five independent event pickers and three follow-team inputs. Evidence: EventFilter, EventsToday, ScoutingClient:170, StrategyClient:58, LendingClient:42; AppShell.tsx:262, FollowTeamForm.tsx:34, FollowTeamInline.tsx:38. #10.
- Always-on chrome over content: default chat FAB (lib/app-config-schema.ts:36), 99px install banner, team hero gradient and blur glows (app/team/[teamNumber]/page.tsx:135, EventStats.tsx:28). #5/#7.
- Hover-only tooltips and jargon without tap help (RankingTable.tsx:55, MatchList.tsx:416). #4.
- Hand-rolled cards/tabs (≈147 `bg-card border` strings in 62 files, 6 custom tab bars, 5 h1 styles). #3.

Top 5 moves from the audit (verbatim):
1. #3/#4 Color: new semantic system — a brand accent that is neither red nor blue, neutrals with 3 surface levels, status colors (success/warning/error) distinct from alliance red/blue, red/blue only for alliances and always with shape or label besides hue (red/blue contrast is 1.13–1.27:1 today), a single traffic-light scale, light/dark parity fixed (@custom-variant dark; remove `.text-white` !important at globals.css:220). Evidence: globals.css:29-38; secondary 283 uses, danger 245 uses.
2. #2 Useful: mobile information architecture around 4 event tasks (my next match; capture; look up a team; alerts). One global "active event" instead of 5 pickers; every team number links to its profile in the event context; team search in the mobile shell. Evidence: EventViewManager.tsx:423-436, AppShell.tsx:83-85.
3. #2 Capture in ≤2 taps from the match or the assignment: match number and team pre-filled, Match as the default tab, phased form (auto/teleop/end) with ≥48px counters. Evidence: ScoutingClient.tsx:229,238 (today 4–5 taps, match number typed, ~47 controls).
4. #5/#10 Content first, minimal chrome: Hoy opens with the next match and its win probability (not an empty message); the event opens on the live/next match, not averages; chat FAB opt-in; install as a one-time inline card; no hero gradient. Evidence: shots/phone-dark-home.png, lib/app-config-schema.ts:36.
5. #4/#6/#8 Touch base and honest copy: ≥44px targets (today 17/25 on /team are smaller), ≥12px text (today up to 161 texts of 9–11px), tap-to-explain glossary for OPR/RS/etc., full i18n of the Event screens (MatchList ~76 and RankingTable ~40 hardcoded strings), default locale by browser/Mexico, fix false labels ("Predicción de alta precisión" fires on ≥4 captures — projections.ts:238; "OPR" in AllianceSelector is average points; "proyección lineal" is Monte Carlo; "Acceso exclusivo" with no gate; promised long-press doesn't exist), one terminology and number format, skeletons, and error states with an action.

Redesign principles in priority order:
1. #2 Useful — each of the 4 event tasks is completed in ≤2 taps from Hoy on a phone, one-handed, in under 5 seconds.
2. #4 Understandable — a first-year student names every primary control and reads every color correctly (red/blue = alliance only; any other color has exactly one meaning, written in a legend).
3. #3 Aesthetic / #10 Less — one token system (type scale ≤6 sizes, 4-px spacing grid, ≤1 accent hue + neutrals + 3 status colors + 2 alliance colors), shared primitives only, no decorative gradients/glows.

Deliverables for the plan:
- New mobile information architecture (task-first screen map; what stays desktop-only: Data Lab, simulator internals, draft board, admin).
- New primary flows (low-fi, labeled) for the 4 tasks, side-by-side with today's tap counts.
- Color and type tokens shown as 2–3 HTML prototypes the owner reviews on his phone before implementation (precedent: docs/design/direcciones-2026-11.html), in light and dark, with WCAG ratios.
- Component kit: match card, probability bar, team row/link, event context switcher, counters, tabs/segments, sheet, empty/loading/error states.
- States checklist (empty, loading, error, success, offline, focus, disabled) per screen.
- Migration path: tokens first (renamed semantic tokens + codemod of secondary/danger usages), then shell, then screens in task order (Hoy → Event → Capture → Team → Strategy on tablet). Each step shippable on its own and perf-checked against docs/perf/.
- Cutover criteria: no `secondary`/`danger` used with a non-alliance meaning; 0 hardcoded palette classes outside documented exceptions (print briefing, QR, camera, scrims); all phone touch targets ≥44px; Rams re-audit ≥22/30.

Anti-patterns to guard against:
- Porting old structure under new styling.
- Keeping both designs behind a flag indefinitely.
- Redesigning to follow a trend rather than the principles above.
- Adding web fonts, animation libraries or heavier JS (performance > aesthetics for this owner).
- Changing algorithms or data while redesigning.
````
