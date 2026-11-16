# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Next.js dev server (Turbopack)
npm run build            # production build — must use --webpack (Serwist requires it)
npm run start            # serve the production build
npm run lint             # ESLint
npm test                 # Vitest unit tests (480+ tests, must all pass before commit)
npm run test:rules       # Firestore security-rules tests on the emulator (picks a Java ≥21 from /usr/lib/jvm via scripts/with-java21.sh; emulator on port 8085)
node scripts/perf-baseline.mjs [url]  # mobile perf (JS KB, TBT, LCP) vs docs/perf/ baselines
npm run test:watch       # Vitest in watch mode
npm run test:e2e         # Playwright smoke tests (requires `npm run test:e2e:install` once)
npm run analyze          # Production build with bundle treemap (ANALYZE=true)
npm run generate:pwa-assets   # Regenerate /public/icons/* from public/icon.png
```

`docs/PENDING.md` is the authoritative source of pending work and pre-Premier checklist. Read it first when resuming.

## Required env vars (`.env.local`, also wired into `apphosting.yaml`)

| Var | Required for | Behavior if missing |
|---|---|---|
| `FTC_API_USERNAME` / `FTC_API_KEY` | FIRST API access (server-only) | App fetches return empty arrays; offline cache fallback kicks in |
| `NEXT_PUBLIC_FIREBASE_*` (or `FIREBASE_WEBAPP_CONFIG`) | Firebase Web SDK init | Client crashes on auth/Firestore use |
| `FRC_API_USERNAME` / `FRC_API_KEY` | FRC Events API v3 (`lib/frc-api.ts`, server-only; separate registration from FTC) | FRC data returns empty arrays |
| `STARTING_POINTS` (optional) | `off` = kill switch for per-robot starting points (#117); wins over the `/admin` flag | Default on; forecasts then start from zero as before |
| `SERVER_CACHE` (optional) | `off` = kill switch for the Firestore-backed server cache | Default on; the cache also self-disables for 30 s after any failure |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | firebase-admin SDK (server actions) | Calibration log, ground-truth validation, RP model training all silently fail |
| `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_ORG` + `SENTRY_PROJECT` + `SENTRY_AUTH_TOKEN` | Production error tracking | Sentry no-ops in dev anyway (gated on `NODE_ENV === "production"`) |

## Architecture

Next.js 16 App Router + React 19 + React Compiler (`reactCompiler: true`). Tailwind v4 via `@tailwindcss/postcss`. Path alias `@/*` → repo root.

**Build uses `--webpack` flag** because Serwist's service-worker compilation requires webpack — Next 16 defaults to Turbopack and would fail. Dev (Turbopack) works fine because SW is disabled in dev.

### Data flow

**Three storage tiers, each with a specific purpose:**

1. **Server cache** (`lib/server-cache.ts` → `lib/tiered-cache.ts`, used by `lib/ftc-api.ts`) — analytical cache for FTC API responses + computed aggregations: per-instance memory (L1) in front of Firestore `server_cache` (L2, gzipped JSON, Admin SDK only, TTL policy on `expiresAt`). Every remote op has a timeout and a circuit breaker, so a broken cache costs one timeout per 30 s, never seconds per call. Also hosts rate-limit counters (`server_counters`). Replaced Upstash Redis in Nov 2026 (decision #89) after the free DB was deleted for inactivity.
2. **Firestore** (`lib/firebase.ts` for Web SDK on client, `lib/firebase-admin.ts` for Admin SDK on server) — real-time collaborative data: scouting entries (`match_scouting`, `pit_scouting`), users, orgs, invitations, picklists, calibration logs. **Sensitive per-org secrets (Discord webhooks) live in `org_secrets/{orgId}`** to avoid leaking via the public-readable `orgs/` collection.
3. **Dexie (IndexedDB)** — two distinct DBs:
   - `FTCStatsLocal` (`lib/localDatabase.ts`) — pending scouting entries captured offline, drained to Firestore by `OnlineSync` when connectivity returns
   - `FTCStatsClientCache` (`lib/client-cache.ts`) — SWR cache for server-rendered pages (home/stats), enables true offline browsing of previously-loaded data

### FIRST API access — server-only

The FTC public API blocks browser CORS, so all FIRST API access is server-only (`lib/ftc-api.ts` starts with `import "server-only"`). Flow:

1. Server Components call `lib/aggregation.ts` or `lib/ftc-api.ts`.
2. Each fetcher reads the server cache via `getCachedData()`. TTL via `getSmartTTL()`: completed events 30 days, future events 1–24 h, active events 60 s. `getSmartTTL` and `fetchEvents` are wrapped in `React.cache()` to dedupe within a single request.
3. On miss, `fetchWithRetry` (exponential backoff, retries 5xx/429 only).
4. Data passes as props to Client Components.

**Never re-fetch FIRST API data from the browser** — add a server action under `app/actions/` instead.

### Federated scouting model

**Multiple orgs (teams) can contribute scouting to the same event.** Each entry is attributed (`scoutId`, `orgId`) and aggregated cross-org via `lib/scouting-aggregation.ts`. Per-field rules (see `docs/architecture/collaborative-scouting-model.md`):

- **Numeric** fields → weighted mean (weights = scout reliability × confidence)
- **Categorical** → majority vote (tie-break by latest timestamp)
- **Subjective** (driverSkill, defenseRating) → per-org buckets, NEVER merged cross-org because rating scales calibrate differently
- **Notes** → listed with full attribution

Ground-truth validation (`lib/ground-truth-validation.ts`) uses **leave-one-out marginal accuracy** to update per-scout reliability scores — measures each scout's individual impact on consensus accuracy, not pooled error.

### Projection / Oracle layers

- `lib/aggregation.ts` — raw stats from API
- `lib/projections.ts` — hybrid projection with **Bayesian inverse-variance blend** between API base and live scouting (replaced fixed 60/40 heuristic). Win probability uses real logistic, not piecewise linear
- `lib/alliance-utils.ts` — greedy captain selection + Monte Carlo with **per-team σ derived from event-history variance** (replaced σ=30 global)
- `lib/win-probability.ts` — single win-probability model: normal model Φ(Δμ/σ) when a variance model exists (backtested 75.6% on 2026 playoffs), logistic on Δ/avg with **k = 3.5** otherwise (fitted 2024–2026, decision #94)
- `lib/live-projection.ts` — final-ranking projection: Monte Carlo of the remaining quals on event OPR (`eventStrengthModel`, non-penalty = final − fouls RECEIVED, #48), sampled bonus RP and strength uncertainty, official tiebreakers in API order. **Ranking Score is an AVERAGE** (decision #95)
- `lib/rp-inference.ts` + `lib/logistic-regression.ts` — DECODE per-RP logistic models; `lib/rp-counts.ts` — BIOBUZZ count models (POLLINATOR = Negative Binomial on tips OPR; SWARM = exact enumeration + Platt calibration, #88/#96). Labels come from the official `/scores` breakdowns (`lib/score-breakdown.ts`)
- `lib/today-summary.ts` — "Hoy" assembly for a followed team (next match odds, projected rank, alliance odds), decision #98
- `lib/starting-points.ts` (+ `-server.ts`) — per-robot starting points for `eventStrengthModel`: 3-season history table built offline (`scripts/build-history-table.ts` → `lib/data/starting-history-<S>.json`); in-season prior pending; null ⇒ old behavior, decision #117

### Scouting subsystem

Three tabs in `/scouting`:
- **Pit** (`ScoutingForm.tsx`) — robot specs. Private notes (org-only) + opt-in `publicSummary` (cross-org)
- **Match** (`MatchScoutingForm.tsx` → game-specific forms in `components/scouting/games/`) — counters per match, RHF + Zod
- **Super** (`SuperScoutingForm.tsx`) — subjective ratings (driver, defense, reliability, would-pick), `scoutingMode: "super"` so it doesn't pollute objective consensus

Game schemas are declarative and **routed by season** (`lib/games/registry.ts` → `ftc-biobuzz-2026.ts` / `ftc-decode-2025.ts`; each definition owns its fields AND its `score()`), with season rules (fouls, RP targets, tiebreakers) in `lib/games/season-rules.ts`. New season: follow the runbook in `docs/architecture/game-schema-migration.md` (decisions #86–#88).

### Federation, workshop and pit lending (decisions #101–#105, branch `etapa1/foundations`)

- **Observation context** (`lib/scouting-context.ts`): every match/super entry has `tournamentLevel` PRACTICE_FIELD | PRACTICE | QUALIFICATION | PLAYOFF. Only official contexts feed ground truth (same level), practice weighs 0.5.
- **Shared pool** (`lib/scouting-pool.ts` + `app/actions/scouting-pool.ts`): the ONLY cross-team read of scouting. Server-side (match_scouting stays own-org in rules), unlocked after 5 objective captures at the event, objective fields only, pseudonymous per-event aliases (`pool_aliases`, server-only, `lib/pool-aliases.ts`). Never return notes, stars, names, uids or org ids from it.
- **Self-report**: `GameDefinition.selfReport` drives the Trading Card questions; typical-match counters reuse scouting field ids so `score()` prices the claim.
- **Scout board** (`lib/scout-claims.ts`, `app/actions/scout-claims.ts`): `scout_claims` is read-only for clients; claims carry alias + hashed scout id.
- **Pit lending** (`lib/lending.ts`, `/lending`): inventory, presence and requests are client-written within the own team; `loans` only via `app/actions/lending.ts`, readable by the two parties.
- **Workshop** (`/workshop`, `lib/match-clock.ts`): official match timing in `SeasonRules.matchTiming`; runs saved to Dexie v3 first, then `practice_runs` (own-org, never shared).
- Team-scoped server actions resolve the caller with `callerWithTeam()` and rate-limit with `allowUser()` (`lib/server-caller.ts`).
- **Trading Card v2** (#106/#107): general questions (`lib/team-profile/general-questions.ts`) + season `selfReport`; robot media in Storage (`storage.rules`, `lib/team-media*.ts`) visible only to approved teams — read with `getBlob`, never `getDownloadURL`; `/card/[team]` viewer; reports moderated in `/admin`. `npm run test:rules` runs Firestore + Storage emulators.

### Strategy page (6 tabs)

- **Picklist** — drag-and-drop (dnd-kit, lazy-loaded), DNP list, real-time collab via Firestore listener, weighted-score sliders persisted in localStorage
- **Alliance Oracle** — greedy auto-pick
- **Simulator** — Monte Carlo match prediction with per-team σ
- **Briefing** — printable 1-page handout for drive coach (CSS @print, NOT @react-pdf/renderer)
- **Live Ranking** — Monte Carlo projection of the final ranking (likely range, P(captain)); see `lib/live-projection.ts`
- **Pool** — every robot of the event from the shared pool (#102). All tabs use the event chosen on /scouting (cookie `scouting_event`, #100)

### Analytics page (2 tabs)

- **Data Lab** — multi-event comparison (Recharts, lazy-loaded)
- **Calibración** — Brier score, log loss, accuracy, reliability diagram (admin/lead only)

### Navigation (branch `etapa1/foundations`, not yet in production)

App shell `components/shell/` with 5 destinations — **Hoy** (`/`, the followed team's day), **Eventos** (`/events`, season view), **Equipos** (`/teams`), **Scouting**, **Estrategia** — bottom tab bar on mobile, rail on desktop; "Más" holds Data Lab, model accuracy and Trading Card; account panel holds followed team, theme, language, session, team-admin panels and account deletion. Following a team needs no account (`pride_team` cookie). Production (`main`) still has the old `components/Sidebar.tsx` until Etapa 1 deploys. Plan and status: `docs/PENDING.md` § RETOMAR AQUÍ.

### Superadmin console (`/admin`, decision #119)

Gate: verified ID-token email in `SUPERADMIN_EMAILS` (env, not editable from the app). Runtime config in Firestore `app_config/global` (`lib/app-config.ts`, 60 s per-instance cache; schema + sanitization in `lib/app-config-schema.ts`): feature flags `aiAssistant`, `startingPoints`, `frc`, `liveNotifications` and a plain-text `maintenanceBanner`. Precedence env kill switch (`=off`) > config > default (`resolveFlag`); read with `flagOn()` / `getEffectiveFlags()`. Every write appends to `admin_audit` (server-only by default-deny rules). **Credentials are never stored or edited in the app**: `lib/admin-integrations.ts` reports presence, an 8-hex SHA-256 fingerprint, a live ping (`{ok,status,ms}` only) and the Secret Manager rotation commands.

### Auth + Orgs

Firebase Auth for identity. `users/{uid}.orgId` for team membership — **written only by the server**: a new team is a request (`team_claims/{n}`) that a superadmin approves in `/admin` (decision #90); joining an existing team uses a 6-char invite (`redeemInviteAction`). `orgs/{orgId}` for team metadata (no client creates). `<OnboardingModal>` in root layout walks new users through "register my team / I have a code".

### Public surface hardening

Anonymous server actions validate inputs (`lib/input-guards.ts`) and rate-limit per visitor in memory on cache misses (`lib/request-guard.ts`; client IP = hop left of App Hosting's 2 infrastructure hops in X-Forwarded-For), decision #91. Security headers and report-only CSP in `next.config.ts` (#97). Firestore rules regression tests: `npm run test:rules` (emulator, needs Java 21).

### Offline-first contract

- **Service Worker** (Serwist, `app/sw.ts`) — precaches build artifacts + runtime caches HTML/JS. App shell loads offline.
- **Scouting capture** — writes to Dexie immediately via `useSaveLocalScouting`. `OnlineSync` (mounted in root layout) drains to Firestore on `online` event.
- **Stats browsing** — `CacheWriter` writes server data to Dexie on every successful server render. `OfflineFallback` reads from Dexie when server returns empty.
- **Discord notifications** — sent automatically when 3+ consecutive sync failures via `notifyDiscordAction`.

### Notable RSC constraints

- **Functions cannot be passed Server → Client.** `HydrateAndCache.tsx` uses `CacheWriter` + `OfflineFallback` (serializable-only props) instead of render props. See its module comment.
- **Dynamic routes** must `await props.params` and `await props.searchParams` (Next.js 15+ shape).
- **Season fallback** for `/event/[code]` and `/analytics` uses `getCurrentSeason()` (calendar-aware) not hardcoded year — and `/event/[code]` accepts `?season=...` URL param + falls back across adjacent seasons if the event isn't found.

## Key files & where to look

| Concern | Files |
|---|---|
| Algorithms | `lib/projections.ts`, `lib/alliance-utils.ts`, `lib/scouting-aggregation.ts`, `lib/ground-truth-validation.ts`, `lib/logistic-regression.ts`, `lib/rp-inference.ts` |
| Data layer | `lib/ftc-api.ts`, `lib/server-cache.ts`, `lib/tiered-cache.ts`, `lib/firebase.ts`, `lib/firebase-admin.ts`, `lib/scouting-service.ts`, `lib/localDatabase.ts`, `lib/client-cache.ts` |
| Form schemas | `lib/schemas/scouting.ts`, `lib/games/ftc-decode-2025.ts`, `types/game-definition.ts` |
| UI primitives | `components/ui/` (Card, Tabs, Skeleton, Tip, ConfirmDialog, Tooltip) |
| Offline machinery | `components/OnlineSync.tsx`, `components/HydrateAndCache.tsx`, `app/sw.ts` |
| Admin panels | `components/auth/InviteGenerator.tsx`, `GroundTruthValidator.tsx`, `DiscordSettings.tsx`, `RpModelTrainer.tsx` |
| Server actions | `app/actions/*.ts` (all server-side mutations live here) |
| Runbook | `docs/failover-runbook.md` (game-day decision tree) |
| Pending work | `docs/PENDING.md` |

## Project memory

`docs/memory/history.md` and `docs/memory/decisions.md` are hand-maintained logs. **When making a non-obvious change to scoring, weights, caching, or the Oracle, add an entry to `decisions.md`.** When closing a session of substantial work, append a summary to `history.md`.
