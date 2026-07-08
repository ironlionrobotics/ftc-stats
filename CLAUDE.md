# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev              # Next.js dev server (Turbopack)
npm run build            # production build — must use --webpack (Serwist requires it)
npm run start            # serve the production build
npm run lint             # ESLint
npm test                 # Vitest unit tests (125+ tests, must all pass before commit)
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
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Analytical cache (events, aggregations) | Cache no-ops, every read hits FTC API (degraded perf) |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | firebase-admin SDK (server actions) | Calibration log, ground-truth validation, RP model training all silently fail |
| `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_ORG` + `SENTRY_PROJECT` + `SENTRY_AUTH_TOKEN` | Production error tracking | Sentry no-ops in dev anyway (gated on `NODE_ENV === "production"`) |

## Architecture

Next.js 16 App Router + React 19 + React Compiler (`reactCompiler: true`). Tailwind v4 via `@tailwindcss/postcss`. Path alias `@/*` → repo root.

**Build uses `--webpack` flag** because Serwist's service-worker compilation requires webpack — Next 16 defaults to Turbopack and would fail. Dev (Turbopack) works fine because SW is disabled in dev.

### Data flow

**Three storage tiers, each with a specific purpose:**

1. **Upstash Redis** (`lib/redis.ts`, `lib/ftc-api.ts`) — analytical cache for FTC API responses + computed aggregations. TTL-based via `SET ... EX`. When Redis isn't configured, cache no-ops and every read hits the API directly.
2. **Firestore** (`lib/firebase.ts` for Web SDK on client, `lib/firebase-admin.ts` for Admin SDK on server) — real-time collaborative data: scouting entries (`match_scouting`, `pit_scouting`), users, orgs, invitations, picklists, calibration logs. **Sensitive per-org secrets (Discord webhooks) live in `org_secrets/{orgId}`** to avoid leaking via the public-readable `orgs/` collection.
3. **Dexie (IndexedDB)** — two distinct DBs:
   - `FTCStatsLocal` (`lib/localDatabase.ts`) — pending scouting entries captured offline, drained to Firestore by `OnlineSync` when connectivity returns
   - `FTCStatsClientCache` (`lib/client-cache.ts`) — SWR cache for server-rendered pages (home/stats), enables true offline browsing of previously-loaded data

### FIRST API access — server-only

The FTC public API blocks browser CORS, so all FIRST API access is server-only (`lib/ftc-api.ts` starts with `import "server-only"`). Flow:

1. Server Components call `lib/aggregation.ts` or `lib/ftc-api.ts`.
2. Each fetcher reads Upstash via `getCachedData()`. TTL via `getSmartTTL()`: completed events 30 days, future events 1–24 h, active events 60 s. `getSmartTTL` and `fetchEvents` are wrapped in `React.cache()` to dedupe within a single request.
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
- `lib/rp-inference.ts` + `lib/logistic-regression.ts` — per-RP logistic regression (movement / artifact / pattern) trained from season match outcomes. **Falls back transparently to empirical heuristic when no model is cached** in Redis

### Scouting subsystem

Three tabs in `/scouting`:
- **Pit** (`ScoutingForm.tsx`) — robot specs. Private notes (org-only) + opt-in `publicSummary` (cross-org)
- **Match** (`MatchScoutingForm.tsx` → game-specific forms in `components/scouting/games/`) — counters per match, RHF + Zod
- **Super** (`SuperScoutingForm.tsx`) — subjective ratings (driver, defense, reliability, would-pick), `scoutingMode: "super"` so it doesn't pollute objective consensus

Game schemas can also be defined declaratively (`lib/games/ftc-decode-2025.ts` + `types/game-definition.ts` + `lib/games/zod-from-definition.ts` + `components/scouting/games/DynamicGameForm.tsx`). **Infrastructure ready, NOT wired in production** — see `docs/architecture/game-schema-migration.md`. When the 2026-2027 game launches, define a new file in `lib/games/` and swap one import.

### Strategy page (5 tabs)

- **Picklist** — drag-and-drop (dnd-kit, lazy-loaded), DNP list, real-time collab via Firestore listener, weighted-score sliders persisted in localStorage
- **Alliance Oracle** — greedy auto-pick
- **Simulator** — Monte Carlo match prediction with per-team σ
- **Briefing** — printable 1-page handout for drive coach (CSS @print, NOT @react-pdf/renderer)
- **Live Ranking** — extrapolación lineal de RP/match al fin de qualifying

### Analytics page (2 tabs)

- **Data Lab** — multi-event comparison (Recharts, lazy-loaded)
- **Calibración** — Brier score, log loss, accuracy, reliability diagram (admin/lead only)

### Auth + Orgs

Firebase Auth for identity. `users/{uid}.orgId` for team membership. `orgs/{orgId}` for team metadata. `org_invites/{code}` for 6-char join codes. `<OnboardingModal>` in root layout forces new users through "create or join org" before they can write scouting.

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
| Data layer | `lib/ftc-api.ts`, `lib/redis.ts`, `lib/firebase.ts`, `lib/firebase-admin.ts`, `lib/scouting-service.ts`, `lib/localDatabase.ts`, `lib/client-cache.ts` |
| Form schemas | `lib/schemas/scouting.ts`, `lib/games/ftc-decode-2025.ts`, `types/game-definition.ts` |
| UI primitives | `components/ui/` (Card, Tabs, Skeleton, Tip, ConfirmDialog, Tooltip) |
| Offline machinery | `components/OnlineSync.tsx`, `components/HydrateAndCache.tsx`, `app/sw.ts` |
| Admin panels | `components/auth/InviteGenerator.tsx`, `GroundTruthValidator.tsx`, `DiscordSettings.tsx`, `RpModelTrainer.tsx` |
| Server actions | `app/actions/*.ts` (all server-side mutations live here) |
| Runbook | `docs/failover-runbook.md` (game-day decision tree) |
| Pending work | `docs/PENDING.md` |

## Project memory

`docs/memory/history.md` and `docs/memory/decisions.md` are hand-maintained logs. **When making a non-obvious change to scoring, weights, caching, or the Oracle, add an entry to `decisions.md`.** When closing a session of substantial work, append a summary to `history.md`.
