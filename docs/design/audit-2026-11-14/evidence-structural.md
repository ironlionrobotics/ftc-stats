# Evidence: structural audit of PRIDE (2026-11-14)

Read-only fact gathering. No scoring, no proposals. Citations are `file:line` relative to the repo root.
Counts come from reading JSX and from `grep` of tags (`<button|Link|a|input|select|textarea`); "per item" means the count scales with data.
Branch `etapa1/foundations`, HEAD a1fd7ff.

## 1. Sources consulted

- Shell: `components/shell/AppShell.tsx`, `nav.ts`, `PastSeasonBanner.tsx`; root `app/layout.tsx`, `components/DeferredGlobals.tsx`.
- Pages: `app/page.tsx`, `app/events/page.tsx`, `app/event/[eventCode]/page.tsx`, `app/teams/page.tsx`, `app/team/[teamNumber]/page.tsx`, `app/scouting/page.tsx`, `app/strategy/page.tsx`, `app/workshop/page.tsx`, `app/lending/page.tsx`, `app/card/page.tsx`, `app/card/[team]/page.tsx`.
- Components: `components/{home,today,notifications,event,team,scouting,scouting/games,strategy,analytics,workshop,lending,card,ui}`, `EventFilter.tsx`, `EventList.tsx`, `StatsTable.tsx`.
- `npx eslint <74 files> -f json` (read-only, output to scratchpad): 0 messages (0 errors, 0 warnings, so no unused imports or vars flagged).
- Orphan scan: grep of every `components/**/*.tsx` basename against imports.
- Not run: no browser, no build, no screenshots. Phone widths are inferred from Tailwind classes, not measured.

## 2. Findings per surface

### Shell (`components/shell/AppShell.tsx`, 398 lines)

1. Interactive elements.
   - Phone, always visible: brand Link (:100) + AccountButton (:101) + 5 bottom-tab Links (:109-126) = 7.
   - Desktop rail (`hidden md:flex`, :83): brand Link (:136) + team-search input (:179) + 5 primary Links + 5 secondary Links (:87,:91) + AccountButton (:94) = 13.
   - Account panel, opened from the AccountButton (:129), ~12 to 16 controls depending on state:
     - backdrop button (:241), close (:245), follow input (:262), "set" (:270), "clear" (:274, only if a team is followed);
     - 5 "more tools" Links (:287, phone only, `md:hidden`);
     - theme toggle (:297), LocaleSwitcher (buttons, `components/LocaleSwitcher.tsx:40`);
     - signed out: Google sign-in (:331); signed in: logout (:325) + delete-account (:363) + up to 4 admin panels (InviteGenerator, GroundTruthValidator, RpModelTrainer, DiscordSettings, :321-324; each returns null unless role is admin or lead);
     - FIRST attribution link (:342).
2. Depth: layout → AppShell → AccountPanel → DeleteAccount / InviteGenerator = 4. Shell is a sibling of page content, not a parent.
3. Repeats.
   - "Follow a team" input: AccountPanel (:262), Hoy `FollowTeamForm` (`components/today/FollowTeamForm.tsx:34`), Hoy `FollowTeamInline` (`components/home/FollowTeamInline.tsx:38`). Three inputs with the same purpose, all calling `setFollowedTeamAction`.
   - Team-number search input: shell rail (:179, desktop only) vs `StatsTable` search "Buscar equipo..." (`components/StatsTable.tsx:115`) vs `ParticipantList` search (`components/event/ParticipantList.tsx:30`).
   - The 5 secondary destinations are listed twice (rail :91 and account panel :284), as designed per the code comment (:281).
4. Unused imports or dead props: eslint 0 on `components/shell`. `PastSeasonBanner` is mounted per page (`app/scouting/page.tsx`, `strategy`, `lending`, `workshop`), not in the shell.
5. Phone/desktop: the team-search form is inside the `hidden md:flex` aside only (:83-85). On phone there is no global team search. "Más" is not a tab; the 5 secondary destinations are inside the account panel (:282, `md:hidden`).
7. Primitives: uses none of `components/ui/*` (hand-rolled dialog `role="dialog"` at :240, hand-rolled buttons).

### Hoy `/` (`app/page.tsx`, 231 lines)

1. Interactive elements (JSX).
   - Empty state, no followed team: FollowTeamForm input + button (2, `FollowTeamForm.tsx:34,43`) + "browse events" Link (`app/page.tsx:57`) + followSections (below).
   - Followed team: OpenLoansNotice Link (1, conditional, `OpenLoansNotice.tsx:32`); event-name Link in the header (`app/page.tsx:73`, conditional on `pick`); non-live: one Link per season-result row (:94); live: `LiveSection` has 0 interactive elements (Stat/AllianceBox are plain divs, :155-231); followSections (below).
   - followSections (`FollowSections`, :111-128), always rendered after the main card:
     - `FollowingPanel` (only if follows exist): per event card 1 Link + 1 star (`FollowingPanel.tsx:91,97`); per team card 2 Links + 1 star (:141,:146,:151);
     - `FollowTeamInline` (2: input + button, :38,:40);
     - `NotifySettings` (if `hasFollows||hasTeam` and push supported): 1 enable button (`NotifySettings.tsx:113`), or after enabling 4 checkboxes + 2 buttons = 6 (:123,:129,:132);
     - `EventsToday`: select + search input + submit = 3 (`EventsToday.tsx:27,32,34`) + per event 1 Link + 1 FollowStar (:46,:56), limit 30 (MX) or 60 (all) per `listEvents` (`app/page.tsx:131`).
   - Total with a followed team, live, zero follows: 1 + 2 + 1 + 3 + 2×(≤30) = 7 + 2×(≤30), i.e. up to ~67; shell not included.
2. Depth: page → FollowSections → FollowingPanel → EventCard → NextLine → Teams = 6 (`FollowingPanel.tsx`). Main card: page → LiveSection → AllianceBox = 3.
3. Repeats.
   - Follow-a-team entry: FollowTeamForm (empty state) + FollowTeamInline (always) + shell panel (see Shell). In the empty state both FollowTeamForm and FollowTeamInline render on the same screen (`app/page.tsx:54` and `:125`).
   - Next-match line for a followed team appears in `LiveSection` (:130-148) and again in `FollowingPanel.TeamCard` (`FollowingPanel.tsx:155-163`) when the followed team is also in follows.
   - Event list entries with an event Link appear in three blocks: header (:73), `FollowingPanel`, `EventsToday`.
4. Dead code: `components/home/TodayPanelLoader.tsx` (74 lines) is imported by nothing (grep); it dynamic-imports `components/home/TodayPanel.tsx` (454 lines), so both are orphaned (528 lines). eslint reports nothing.
5. Tabs: 0. Server-rendered single column. `grid-cols-2 md:grid-cols-4` for the 4 Stat cards (:147).
6. See task (a).
7. Primitives: none of `components/ui/*` used. Hand-rolled cards `rounded-[4px] border border-border bg-card` at :156, :168, `NotifySettings.tsx:101`, `FollowingPanel.tsx:88,:138`.

### Eventos `/events` (`app/events/page.tsx`, 145 lines)

1. Elements.
   - `EventFilter`, criteria mode: 2 mode buttons (`EventFilter.tsx:130,139`) + season select (:158) + region select (:168) + type select (:187) + 2 date inputs (:201,:207) + Apply (:279) = 8.
   - `EventFilter`, selection mode: 2 + season select + search input (:220) + select-all (:236) + up to MAX_VISIBLE_EVENTS (150) rows that are `div onClick` (:249), not buttons or checkboxes + Apply = 6 + ≤150.
   - `EventList`: one Link per event in the filter (`EventList.tsx:35`).
   - `StatsTable`: 2 view buttons (`StatsTable.tsx:91,100`) + search (:115) + "Clasificados" toggle (:124) + ~9 sortable `<th onClick>` (:143-191, th not button) + up to 100 row Links (:207, PAGE_SIZE :26) + "load more" (:261).
2. Depth: page → EventFilter (2); page → EventList (2); page → StatsTable → Card (3).
3. Repeats.
   - Two mode toggles that are hand-rolled tab bars on one page: EventFilter (:130,:139) and StatsTable (:91,:100).
   - Team search: StatsTable (:115) duplicates the shell search (rail only).
   - The same `StatsTable` renders on `/teams` (`app/teams/page.tsx:36`) with no event or region filter.
   - Event picker #4 of 5 (see §3).
4. Eslint 0.
5. Tabs: 2 + 2 (filter mode, table view), hand-rolled. `StatsTable` has 9 columns in qualification view and 8 in advancement, inside `overflow-x-auto` (:139). Desktop-style table on phone with horizontal scroll. `EventFilter` is entirely English hardcoded ("Filter Data Source", "By Criteria", "Apply Filters", `EventFilter.tsx:125-280`) with no `useTranslations`.
7. Primitives: `Card` used in `StatsTable` only (:82). `EventFilter` and `EventList` hand-roll `bg-card p-4 rounded-xl border` (:124, `EventList.tsx:25`).

### Evento `/event/[code]` (`app/event/[eventCode]/page.tsx`, 230 lines)

1. Elements.
   - Header: no interactive elements (title only, :143-160). No follow star, no link to scouting/strategy for this event.
   - Conditional sibling-event Links for Championship/Premier groups (:165-190).
   - `EventViewManager` (`components/event/EventViewManager.tsx`): 6 tab buttons (:370) + 1 "PRO" Link (:383) + round slider (`input type=range`, :403, shown when tab ≠ matches).
   - Default tab is "teams" (:55): `ParticipantList` search input + one button per team (`ParticipantList.tsx:30,49`; 40 to 60 teams per event).
   - Rankings tab: 5 `<th>` + `HeaderWithTooltip` ≈ 13 header cells (`RankingTable.tsx:241-300`) + 1 button per team (:312).
   - Matches tab: `MatchRow` with 4 `TeamInfo` buttons per match (`MatchList.tsx:582`), expand toggle (:943/:1004), "Quitar Filtro" (:324).
   - Oracle tab: `AlliancePredictor` (11 elements, 3 sub-modes at :358,:367,:376) → `LiveDraftBoard` (10) / `TournamentSimulator` (26).
   - Advancement and Awards: 0 interactive elements.
2. Depth: page → EventViewManager → AlliancePredictor → TournamentSimulator = 4; page → EventViewManager → MatchList → MatchRow → MatchDetails → StatRow = 6.
3. Repeats.
   - Three things called Oracle: the event tab (`EventViewManager.tsx` tab key "oracle", label "Oracle" at :362), the Strategy tab `tabOracle` (`StrategyClient.tsx:71`, which mounts `AllianceSelector`, a different component), and the `/oracle` page (`app/oracle/page.tsx`, secondary nav `nav.ts:26`, a calibration report).
   - Team list repeated as 3 tabs on the same data: Teams (`ParticipantList`), Rankings (`RankingTable`), Matches filtered by team.
   - Round slider: single instance (:403).
4. Eslint 0.
5. Tabs: 6 + PRO link + 3 sub-modes inside Oracle. Tab bar is `overflow-x-auto` (:359). `MatchList` has two tables with `min-w-[900px]` (`MatchList.tsx:476,:513`), forced horizontal scroll on phone; `TeamInfo` has `min-w-[140px]` ×4 per row (:585). `RankingTable` header tooltips are hover-only (`group/tip` at :53; touch devices cannot hover).
   - i18n: `EventViewManager`, `RankingTable`, `EventStats`, `EventList`, and the page itself have 0 `useTranslations` (hardcoded English/Spanish mix, e.g. "Historia por Ronda", "Alianzas oficiales", "Teams", "Rankings", `EventViewManager.tsx:362-367,:407`).
6. See task (c).
7. Primitives: event tab bar is hand-rolled (not `ui/Tabs`, :359-380). `Card` not used in `components/event/*`; every panel is a hand-rolled `bg-card border rounded-xl`.

### Equipos `/teams` (`app/teams/page.tsx`, 38 lines)

1. Elements: only `StatsTable` (see Events; all of it, up to ~110 on first view).
2. Depth: page → StatsTable → Card = 3.
3. Repeats: whole `StatsTable` duplicates `/events` bottom section; header comment says "Team search lives in the shell" (`app/teams/page.tsx:11`) but the shell search is desktop-only (AppShell.tsx:83-85).
4. Eslint 0.
5. Tabs: 2 view toggles inside StatsTable. 9-column table on phone.

### Equipo `/team/[n]` (`app/team/[teamNumber]/page.tsx`, 339 lines)

1. Elements: website `<a>` (:160, conditional); `TeamSeasonReport` (only 30311: external links, :269); `TeamSeasonAnalysis` → `ConsistencyTracker` field select (`ConsistencyTracker.tsx:206`); per-event "view event" Link (:312, one per event). No follow button, no scouting link, no Trading Card link on the profile.
2. Depth: page → TeamSeasonAnalysis → ConsistencyTracker = 3.
3. Repeats: none notable. Follow-a-team has no entry here (FollowStar is only used in `FollowingPanel` and `EventsToday`, never on team or event pages).
5. Tabs: 0. Long single page: header block, metadata grid (`md:grid-cols-3`), analysis, history cards. `h1` up to `text-6xl` (:146), header avatar `w-44`.
7. Primitives: `Card` used in the history cards (:256) and imported at :7.

### Scouting `/scouting` (`app/scouting/page.tsx` 71 lines + `ScoutingClient.tsx` 324)

1. Elements.
   - Team list pane: event select (`ScoutingClient.tsx:170`) + "open board" (:185-193) + TeamList: header/toggle button (`TeamList.tsx:43`), search input (:57), one button per team (:71), add-by-number (:97) and another (:112).
   - Detail pane (a team selected): back button (:218, phone only), 4 `TabsTrigger` (~:246-262: pit, match, super, pool), 1 Tip.
   - Match tab: "New record" toggle (`GameScoutingForm.tsx:152`), then when open: 4 context radios (`ContextPicker.tsx:19`) + match-number input (:169) + BIOBUZZ form + Save (:199). BIOBUZZ fields per `lib/games/ftc-biobuzz-2026.ts`: 19 fields (12 counters with 44px minus/plus = 24 buttons, 3 checkboxes, 1 stars (5 buttons), 2 enums (3+4 option buttons), 1 textarea). Total ≈ 47 controls on the open form + entry list below.
   - Pit tab: `PitQuestionnaire` (save/edit buttons + robot-name input + 2 textareas + `DynamicGameForm` self-report fields).
   - Super tab: `SuperScoutingForm` (9 button/input/textarea tags).
   - Pool tab: `PoolPanel` (2 Links to `/card/N`, 1 reload button).
   - Board view: `ScoutBoard`: suggested chips (:86) + per match 4 to 6 team cells each with a `/card/N` Link (:118) + take / scout-now / release buttons (:126-130).
2. Depth: page → ScoutingClient → Tabs → TabsContent → MatchScoutingForm → GameScoutingForm → DynamicGameForm → SectionCard → FieldRenderer → CounterFieldRender = 10 (8 excluding `ui/Tabs` wrappers).
3. Repeats.
   - Event picker (`<select>`): ScoutingClient:170, StrategyClient:58, LendingClient:42, plus `/events` EventFilter and Hoy EventsToday. Shared state is a cookie (`scouting_event`) written only by Scouting, Strategy and Lending (grep `SCOUTING_EVENT_COOKIE`: app/scouting, strategy, lending pages + 3 clients); `/event/[code]` and Hoy never set it.
   - Two ways to start a match entry: Tab "match" + "New record", or Board → take → scout-now (`ScoutingClient.tsx:229-236`).
   - Team picker: `TeamList` list + search, plus add-by-number, plus board cell.
4. Dead props.
   - `scoutingDataMap={{}}` passed to `TeamList` with a comment "Not used anymore" (`ScoutingClient.tsx:207`).
   - `GameScoutingForm.EntriesList` declares `team: ScoutTeam` in its props type but does not destructure it (`GameScoutingForm.tsx` function `EntriesList`).
   - `components/scouting/games/FTC_DecodeForm.tsx` (531 lines) has no importer by name (orphan scan).
   - eslint 0.
5. Tabs: 4 (`ui/Tabs`) + a board/robot toggle; all shown on phone, `TabsList` scrolls (`ui/Tabs.tsx:36`). Phone adaptation exists: master-detail via `mobileShowForm` (`ScoutingClient.tsx:70`). The wrapper uses `h-screen` (:158) inside a layout that already has a sticky 56px top bar and a fixed bottom tab bar (AppShell:99,:105).
   - Default tab: `program === 'FTC' ? "pit" : "match"` (`ScoutingClient.tsx:238`), so the first tab on opening a team is Pit, not Match.
   - After a save, the match number auto-increments (`GameScoutingForm.tsx:138`); initial default is 1 (:78).
   - `ScoutBoard`'s `onScoutTeam(n)` passes only the team number (`ScoutingClient.tsx:229`), so the match number is not prefilled in the form.
6. See task (b).
7. Primitives: `Tabs` ×1, `Tip` ×1 (:232), `Card` in game forms (`GameScoutingForm.tsx:149`), `ConfirmDialog` in `MatchScoutingForm.tsx:56`. Hand-rolled: board/robot toggle, `ContextPicker` (own radiogroup), bg-muted panels.

### Estrategia `/strategy` (`app/strategy/page.tsx` 51 lines + `StrategyClient.tsx` 129)

1. Elements: event select (`StrategyClient.tsx:58`) + 6 `TabsTrigger` (:66-83; pool conditional on `eventCode`) + active-tab contents:
   - Picklist (`PicklistEditor`, 6 tag counts + per-row buttons): header buttons: weights (:326), auto-sort (:339), reset (:348); weight sliders (one input per weight key, :381); per picklist row: drag grip (:573) + 4 IconBtn (move-to-DNP, remove, selected, declined, `PicklistEditor.tsx:600-620`) = 5; per available row: 2 IconBtn (:649,:652); DNP rows own buttons (`DNPTeamCard` :690).
   - Oracle tab: `AllianceSelector` 9 tags.
   - Simulator: `MatchSimulator` 5.
   - Briefing: `MatchBriefingCard` 3.
   - Ranking: `LiveRankingProjection` 2.
   - Pool: `EventPoolTable` 0 interactive (87 lines, table).
2. Depth: page → StrategyClient → Tabs → TabsContent → PicklistEditor → Bucket → SortableTeamCard → IconBtn = 8 (6 excluding `ui/Tabs`).
3. Repeats: event select (see Scouting); each tab renders its own `Tip` (4 `Tip`s, :90,:101,:108,:115) and its own `Card`.
4. Eslint 0.
5. Tabs: 6 (5 without event), all shown on phone in a horizontally-scrolling `TabsList`. Picklist: `grid-cols-1 md:grid-cols-3` (:396, buckets stack on phone). Drag and drop: `PointerSensor` with `distance: 4` + `KeyboardSensor` (:188-190); no `TouchSensor`, and `touch-none`/`touch-action` appear nowhere in `PicklistEditor.tsx`. The grip is a 32px button (:573-577), under the 44px `ui/Tabs` target (`ui/Tabs.tsx:52`). `PicklistEditor` loaded with `dynamic(..., {ssr:false})` (`StrategyClient.tsx:17`). Weights persist in localStorage, picklist via Firestore listener (:174).
6. See task (d).
7. Primitives: `Tabs` ×1, `Tip` ×4, `Card` in `PicklistEditor`, `AllianceSelector`, `MatchSimulator`, `MatchBriefingCard`, `LiveRankingProjection` (importers list below).

### Workshop `/workshop` (`app/workshop/page.tsx` 25 lines)

1. `WorkshopClient` 7 tags + `MatchTimer` 6 tags. Selects at `WorkshopClient.tsx:169,:174`; `TabsTrigger` ×3 (:99-101: match, history, progress).
2. Depth: page → WorkshopClient → Tabs → TabsContent → MatchTimer = 5.
3. Repeats: mode switch in `MatchTimer.tsx:125` and a mode `<select>` in `WorkshopClient.tsx:174`.
4. Eslint 0.
5. Tabs: 3, uses `ui/Tabs`.

### Lending `/lending` (`app/lending/page.tsx` 45 lines)

1. `LendingClient` 28 tags in 424 lines: event select (:42), 4 `TabsTrigger` (:97-100: find, requests, inventory, loans), category select (:282), forms and request/loan action buttons.
2. Depth: page → LendingClient → Tabs → TabsContent = 4.
3. Repeats: event select #3 of 5.
4. Eslint 0.
5. Tabs: 4, `ui/Tabs`. Tab labels carry live counts (:98, :100).

### Card `/card` and `/card/[team]`

1. `/card`: `TradingCardEditor` 4 tags + the self-report fields rendered by `DynamicGameForm` (reused from scouting, `TradingCardEditor.tsx:25`) + `MediaGallery` 15 tags (259 lines); preview `TradingCardPreview` 0 tags. `/card/[team]`: `CardView` 1 tag.
2. Depth: page → TradingCardEditor → MediaGallery = 3; page → CardView = 2.
3. Repeats: `/card/N` Links appear in `PoolPanel` (:68,:107) and `ScoutBoard` (:118); no link to `/card/N` from `/team/N` or the event pages.
4. Eslint 0.
5. Tabs: 0.

## 3. Cross-cutting findings

### Repeated-pattern ledger

- Event picker (same purpose: choose which event the screen works on), 5 implementations:
  1. `components/EventFilter.tsx:154,168,187` (criteria selects + selection list, `/events`).
  2. `components/home/EventsToday.tsx:27` (region select + search on Hoy).
  3. `components/scouting/ScoutingClient.tsx:170`.
  4. `components/strategy/StrategyClient.tsx:58`.
  5. `components/lending/LendingClient.tsx:42`.
  Scouting, Strategy and Lending share the `scouting_event` cookie; Hoy picks via `pickRelevantEvent` for the followed team (`app/page.tsx:80`); `/event/[code]` takes the event from the URL only.
- Follow-a-team entry: 3 (`AppShell.tsx:262`, `FollowTeamForm.tsx:34`, `FollowTeamInline.tsx:38`). Follow-an-event: `FollowStar` in `EventsToday.tsx:56` and `FollowingPanel.tsx:97` only.
- Hand-rolled tab/segment bars (not `ui/Tabs`): `EventViewManager.tsx:359`, `AlliancePredictor.tsx:358-376`, `EventFilter.tsx:130-140`, `StatsTable.tsx:91-101`, `MatchTimer.tsx:125`, `ScoutingClient.tsx:185-193` board toggle. `ui/Tabs` users: `ScoutingClient`, `StrategyClient`, `LendingClient`, `WorkshopClient`, `app/analytics/page.tsx`, `team/RookieComparison.tsx` = 6 files.
- Team search: shell rail (desktop), `StatsTable.tsx:115`, `ParticipantList.tsx:30`, `TeamList.tsx:57`.
- Page headers: each page hand-writes its `<header>`/`h1`: Hoy `text-4xl font-black md:text-5xl` (`app/page.tsx:68`), Events `text-4xl md:text-5xl font-bold font-display` (`app/events/page.tsx:79`), Teams `text-3xl md:text-4xl font-black uppercase` (`app/teams/page.tsx:32`), Strategy `text-4xl font-bold font-display` (`StrategyClient.tsx:50`), Workshop/Lending `text-3xl font-black` + icon, Card `text-3xl font-black font-display`. 5 distinct h1 styles; Scouting has no h1 (grep: `ScoutingClient.tsx` has no `<h1>`).
- Naming collisions: "Oracle" ×3 (event tab, strategy tab, `/oracle`); "Teams" = `/teams` table vs event "Teams" tab vs scouting team list; "Rankings" = StatsTable view vs event tab.
- Global fixed overlays on every page (`app/layout.tsx:110-116`, `DeferredGlobals.tsx`): AssistantChat bubble (`AssistantChat.tsx:145`, enabled by default `lib/app-config-schema.ts:36`), PWAInstallPrompt (`PWAInstallPrompt.tsx:72`), OnlineSync badge stack (`OnlineSync.tsx:333,407,423`), Toaster top-right (`layout.tsx:118`), OnboardingModal (full-screen modal, `OnboardingModal.tsx:137`, signed-in users with no org). All use `bottom-[calc(var(--tabbar-h)+Nrem)] right-4` above the phone tab bar.

### Tasks from a cold start on phone (taps counted from opening the app, excluding typing)

(a) See the followed team's next match and win probability.
- Team already followed (cookie `pride_team`): 0 taps. `/` renders `LiveSection` (`app/page.tsx:130-148`) with next match and `winProbability` only when the picked event is live (`pick.phase === "live"`, :210-216, `loadToday`); otherwise it shows season results and "no events/results" text.
- Not followed: open `/` → tap the team input (`FollowTeamForm.tsx:34`) → type number → tap submit (:43) = 2 taps + typing. Alternate: account button → input → set (`AppShell.tsx:101,262,270`) = 3 taps.
- The next-match card has no links: team numbers and match are plain text (`AllianceBox`, :221-231), no jump to the match, the event, a rival, or scouting for it.

(b) Start a match scouting entry for a specific match/team.
- Tab route: Scouting tab (1) → [event select if the cookie event is not the right one: 1 to 2] → tap team in `TeamList` (:71) (1; with 40+ teams, search input tap + typing adds 1) → "Match Scouting" tab (default is Pit, `ScoutingClient.tsx:238`) (1) → "New record" (`GameScoutingForm.tsx:152`) (1) → context defaults to QUALIFICATION (`lib/scouting-context.ts:17`) → match number input (:150), default 1, typed manually. Minimum 4 taps + match number typing; then counters.
- Board route: Scouting (1) → "open board" (`ScoutingClient.tsx:185`) (1) → "take" on a team cell (`ScoutBoard.tsx:130`) (1) → "scout now" (:126) (1) → lands on Match tab → "New record" (1) = 5 taps; match number is not carried over (`onScoutTeam(n)` takes only the team, `ScoutingClient.tsx:229`), so it still has to be typed.
- Qualifier match numbers exist in `schedule` (`ScoutingClient.tsx:44,47`) but the match-number field is a free number input.

(c) Open a rival team's profile from an event.
- Within `/event/[code]` there is no Link to `/team/N`: grep for `/team/` in `components/` and `app/` finds only `StatsTable.tsx:207`, `FollowingPanel.tsx:141`, `AppShell.tsx:172` (rail search), and the orphaned `TodayPanel.tsx:422`. On the event page, tapping a team (Teams tab `ParticipantList.tsx:49`, Rankings `RankingTable.tsx:312`, a match row `MatchList.tsx:582`) sets a team filter and switches to the Matches tab (`EventViewManager.tsx:423-436`); it does not navigate.
- Route that reaches `/team/N`: Equipos tab (1) → tap search (1) + type → tap row Link (1) = 3 taps from any screen (also from `/events`, which has the same table below the filter). From inside an event: event page → Equipos tab → search → row = 3 taps (the event context is lost). Via Hoy: only for teams in "Siguiendo" (`FollowingPanel.tsx:141`).
- On desktop: type the number in the rail search and press Enter (`AppShell.tsx:166-175`) = 1 tap + typing; absent on phone (:83-85).
- Reaching an event from Hoy/Eventos: Hoy list or `/events` `EventList` card Link (1 tap), shows the "teams" tab by default (`EventViewManager.tsx:55`).

(d) Open the picklist for the current event.
- Estrategia tab (1). `Tabs defaultValue="picklist"` (`StrategyClient.tsx:65`), so the picklist is the first tab; the event is the cookie event or live → next → latest (`lib/scouting-event.ts:41-52`). 1 tap if that is the right event; otherwise + select (`StrategyClient.tsx:58`) (1 to 2). The picklist chunk loads lazily with "loadingPicklist" text (`StrategyClient.tsx:17-20`).
- The "current event" on Strategy is independent from the event the user last viewed on `/event/[code]` (that page does not write the cookie) and from Hoy's followed-team event.

## 4. Size outliers (top 15 `.tsx` under `components/` and `app/`, lines)

| # | Lines | File |
|---|---|---|
| 1 | 1181 | components/analytics/TournamentSimulator.tsx |
| 2 | 1059 | components/event/MatchList.tsx |
| 3 | 760 | components/strategy/PicklistEditor.tsx |
| 4 | 733 | components/analytics/LiveDraftBoard.tsx |
| 5 | 705 | components/analytics/AlliancePredictor.tsx |
| 6 | 531 | components/scouting/games/FTC_DecodeForm.tsx (orphan by name) |
| 7 | 510 | components/event/EventViewManager.tsx |
| 8 | 486 | components/scouting/SuperScoutingForm.tsx |
| 9 | 465 | components/team/TeamSeasonReport.tsx |
| 10 | 462 | components/OnlineSync.tsx |
| 11 | 454 | components/home/TodayPanel.tsx (orphan, only imported by orphan TodayPanelLoader) |
| 12 | 446 | components/team/ConsistencyTracker.tsx |
| 13 | 446 | components/scouting/ScoutingForm.tsx |
| 14 | 424 | components/lending/LendingClient.tsx |
| 15 | 419 | components/strategy/MatchBriefingCard.tsx |

Next: CalibrationDashboard 414. Page files: `app/oracle/page.tsx` 396, `app/team/[teamNumber]/page.tsx` 339, `app/event/[eventCode]/page.tsx` 230, `app/page.tsx` 231. Of the top 5, 3 are in the Oracle/analytics group reachable from the event "Oracle" tab (`AlliancePredictor` → `LiveDraftBoard`, `TournamentSimulator`).

## 5. Shared UI primitives (`components/ui/*`)

| Primitive | Lines | Importing files | Notes |
|---|---|---|---|
| Card | 33 | 14 (app/team page, AlliancePredictor, GameScoutingForm, FTC_DecodeForm, FRC_ReefscapeForm, MatchBriefingCard, DynamicGameForm, AllianceSelector, PicklistEditor, LiveRankingProjection, CalibrationDashboard, MatchSimulator, SuperScoutingForm, TradingCardEditor) + StatsTable | 36 `<Card` usages total. Ad-hoc equivalent: 147 `bg-card`+`border` class occurrences across 62 files. |
| Tabs | 90 | 6 (ScoutingClient, StrategyClient, LendingClient, WorkshopClient, analytics page, RookieComparison) | 6 hand-rolled tab/segment bars listed in §3. Has `role=tablist/tab/tabpanel` (`ui/Tabs.tsx:36,53,79`); hand-rolled bars have no ARIA roles (e.g. `EventViewManager.tsx:370`). |
| Skeleton | 66 | 1 (`app/loading.tsx`) | `animate-pulse` ad hoc in 10 other files. |
| Tip | 73 | 3 (StrategyClient ×4, ScoutingClient ×1, CalibrationDashboard) | |
| ConfirmDialog | 129 | 5 (layout provider, PicklistEditor, MediaGallery, TournamentSimulator, MatchScoutingForm) | |
| Tooltip | 41 | 0 importers | Orphan. Event tables use ad-hoc hover tooltips (`RankingTable.tsx:53-57`); `title=` appears in 82 places in `components/`. |

Shell, Hoy, Events, Event (except via sub-components), Teams, Workshop (besides Tabs), Lending (besides Tabs) and Card pages hand-roll their panels. Hoy/Shell/Home/Notifications use border radius `rounded-[4px]` while Events/Event/EventFilter use `rounded-xl`/`rounded-2xl` and team profile `rounded-3xl` (`app/team/[teamNumber]/page.tsx:140`); two corner scales in the product.

## 6. Per-principle facts

Useful (#2: serves the core tasks on phone)
- Hoy answers (a) with 0 taps once a team is followed and the event is live; the answer is non-interactive (no link to match, event, rival).
- Scouting entry: ≥4 taps to the form and a free-typed match number; Pit is the default tab; BIOBUZZ match form has ~47 controls, 12 counters with 44px targets (`DynamicGameForm.tsx:171-190`).
- Rival profile from an event is unreachable by link; 3 extra taps via Equipos search; the phone shell has no search.
- Picklist: 1 tap from the tab bar (default tab) on phone; drag uses PointerSensor only, grip 32px.
- Pit lending, workshop and card are on the secondary list inside the account panel on phone (2 taps: avatar → item).
- Followed-team `winProbability` only for live events; outside live events Hoy shows season results (`app/page.tsx:92-109`).

Understandable (#4)
- i18n coverage inconsistent: `EventFilter`, `EventList`, `StatsTable`, `EventViewManager`, `RankingTable`, `EventStats` and the event page have no translation calls and mix English/Spanish ("Apply Filters" next to "Buscar equipo...", "Clasificados", "Reporte de Avance", "Historia por Ronda", `StatsTable.tsx:87,:115,:133`). Strategy, Scouting, Hoy, Shell are translated.
- Same word for different things: "Oracle" ×3, "Teams" ×3, "Rankings" ×2; "Pool" is a Scouting tab and a Strategy tab.
- Event context is defined in 3 independent places (Hoy followed-team event, `scouting_event` cookie, URL on `/event`) plus 2 filters; `PastSeasonBanner` exists because the season cookie silently shifts operational pages (`PastSeasonBanner.tsx:8-12`).
- Hover-only help: RankingTable header tooltips (`RankingTable.tsx:53-57`).
- Hand-rolled tab bars lack ARIA tab roles; EventFilter's event rows are `div onClick` (`EventFilter.tsx:249`).
- Scouting page has no `h1`; other pages use 5 different title styles.

Unobtrusive (#5)
- Persistent overlays on every route: assistant bubble (default on), PWA install prompt, offline sync badges, toaster, onboarding modal for signed-in users with no org (`layout.tsx:110-118`, `DeferredGlobals.tsx`); all fixed to the bottom-right above the tab bar.
- Hoy appends 4 stacked blocks after the main card: FollowingPanel, FollowTeamInline, NotifySettings, EventsToday (`app/page.tsx:118-127`).
- Decorative layers: blurred gradient blobs on Scouting (`ScoutingClient.tsx:155-156`), blueprint grid on Events (`app/events/page.tsx:75`), `shadow-2xl`/`border-4` avatar on team profile (:140), `animate-in` transitions on filters and tabs.
- Account panel mixes preferences, FIRST attribution, and up to 4 admin tools for admin/lead users (`AppShell.tsx:321-324`).

As little design as possible (#10)
- Hand-rolled implementations of the same idea: 5 event pickers, 3 follow-a-team inputs, 6 tab/segment bars outside `ui/Tabs`, 147 ad-hoc card class strings vs 36 `<Card>`; 2 border-radius scales; 5 h1 styles.
- Dead code: `TodayPanelLoader` + `TodayPanel` (528 lines), `ui/Tooltip` (41), `FTC_DecodeForm` (531) with no importers by name; `scoutingDataMap={{}}` dead prop (`ScoutingClient.tsx:207`); `EntriesList` `team` prop unused.
- Largest components (>700 lines) are analytics/event screens: `TournamentSimulator` 1181, `MatchList` 1059, `PicklistEditor` 760, `LiveDraftBoard` 733, `AlliancePredictor` 705.
- Events and Teams are the same table component with different headers; the Teams page has no filter.
- ESLint reports 0 issues on 74 audited files, so the redundancy above is structural, not lint-visible.

## 7. Known gaps

- No runtime measurement: no rendered DOM counts, no viewport widths, no screenshots. Element counts are static JSX/grep counts; list-driven counts are given as bounds (e.g. 30/60/100/150 caps).
- Interactive-count greps do not see `onClick` on non-button elements except where noted (EventFilter rows, `th` sort handlers).
- Not examined in depth: `TournamentSimulator`, `LiveDraftBoard`, `AllianceSelector` internals, `SuperScoutingForm` flow, `OnlineSync`, `AssistantChat`, `app/admin`, `app/analytics`, `app/oracle`, `/event/[code]/pro`.
- "Phone shows all tabs" is inferred from `ui/Tabs.tsx` (`overflow-x-auto`, `shrink-0`) and `EventViewManager.tsx:359`, not measured; how many triggers fit in view at 360px was not computed.
- Orphan detection is by basename grep; `FTC_DecodeForm.tsx` could be referenced dynamically or from tests (tests not searched).
- The i18n gap list is based on absence of `useTranslations/getTranslations` in a file; strings may still arrive as props from translated parents.
- `docs/PENDING.md` and prior design docs were not read, so already-planned fixes are not reflected.
