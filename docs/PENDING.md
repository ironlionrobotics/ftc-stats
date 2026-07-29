# Pendientes — PRIDE

**Última actualización:** 29 jul 2026 (sesión 18 — estrategia de producto, benchmark, modelo de apertura)
**Premier Event objetivo:** julio 2026 — ✅ CUMPLIDO (FPEMX, ver `docs/memory/history.md` sesión 15)

---

## 🚦 NUEVA FASE — leer `docs/ESTRATEGIA-PRODUCTO-Y-APERTURA.md` antes de retomar

La sesión 18 cambió la dirección del producto. El documento de estrategia es ahora insumo obligatorio junto a este archivo. Resumen de lo que decidió:

- **No se monetiza.** La API de FIRST lo prohíbe contractualmente (decisión #74). Sostenibilidad = patrocinio de infraestructura.
- **Se abre la app con reciprocidad**, 4 anillos (decisión #75). **El gate de lectura va ANTES de invitar a nadie.**
- **Se invierte el primitivo del scouting** a autorreporte federado (decisión #76).
- **Inglés por defecto + i18n** (decisión #77).

### 🟢 Gate de lectura de Firestore — FASE 1 HECHA (29 jul, sesión 19)

**Lockdown a org propia.** `match_scouting` y `pit_scouting` ya no son `allow read: if isAuthed()`: la regla exige `resource.data.orgId == myOrgId()`. Como las reglas de Firestore **no son filtros**, cada query de lista añade `where("orgId","==", miOrg)` (si no, se rechaza entera); un cliente que filtre por otra org recibe deny porque `myOrgId()` sigue siendo el suyo. Esto cierra **todas** las fugas de golpe: notas privadas de pit, ratings subjetivos (super scouting vive en `match_scouting` con `scoutingMode:"super"`) y el pool objetivo. No hizo falta separar pit todavía —solo lees tus propios docs—; eso es Fase 2. Decisión #78.

- **Reglas** (`firestore.rules`): `match_scouting` + `pit_scouting` read scopeado a org propia, con guarda `resource == null` (para el existence-probe de create-if-not-exists y el fallback de `getPitScouting`) y rama legacy para docs pre-1.4 sin `orgId` (implícitamente 30311).
- **Índices** (`firestore.indexes.json`): +2 compuestos `[orgId, season, eventCode, timestamp]` y `[orgId, season, teamNumber, timestamp]`.
- **Servicio** (`lib/scouting-service.ts`): `listenToMatchScouting` / `getMatchScoutingOnce` / `getMatchScoutingForTeam` reciben `orgId` y filtran; `getPublicPitSummaries` deshabilitada (stub `[]`, es seam de Fase 2).
- **6 callers** cableados con su `effectiveOrgId`: MatchBriefingCard, ScoutingClient, AllianceSelector, MatchSimulator, EventViewManager, AssistantChat.
- Verificado: typecheck 0, lint 0, 307 tests, `firebase_validate_security_rules` OK, build de producción OK (sin regresión del chunk público de `/event`).

**⚠️ Acción de usuario ANTES de que aplique:** `firebase deploy --only firestore:rules,firestore:indexes`. Y testear en dev: un usuario de org A **no** puede leer `match_scouting`/`pit_scouting` de org B (query con `where(orgId==B)` → permission-denied), y 30311 sigue viendo lo suyo.

**Caveat legacy:** entradas `match_scouting` pre-Sprint-1 sin `orgId` quedan **fuera de las listas** (el filtro `where(orgId==)` no matchea campo ausente). Los gets sí las alcanzan (rama legacy). Si existieran y hicieran falta en listas, un backfill puntual les pone `orgId="30311"`. Improbable que haya: las escrituras setean `orgId` desde Sprint 1.

### 🔴 Bloqueante de la apertura — FASE 2 (con la primera invitación)

**Federación selectiva cross-org.** Recién cuando se onboardee la org #2 (y se pueda probar con 2 orgs): (1) marcador `event_participation/{org__season__event}` para gatear el pool objetivo por contribución (contribuir-para-leer), (2) mover super scouting a colección propia org-privada, (3) separar pit en doc privado (notas+specs) + colección pública `public_pit_summaries` (solo `publicSummary`, para que las notas nunca viajen con el resumen), (4) allowlist de login. Ver `docs/ESTRATEGIA-PRODUCTO-Y-APERTURA.md` Parte IV.

### 🔴 Incumplimiento de licencia, en producción hoy

**Falta la atribución a la API de FIRST.** La página de la API exige un enlace de retorno en el footer o el "About" de cualquier app que muestre sus datos. Grep sobre `app/` y `components/` no encuentra ninguna referencia a `firstinspires.org`. Desplegado sin ella desde el 25 jul. **Se arregla con una línea.**

### ⏳ Urgente por calendario (~6 semanas)

**Conectar el motor de juego declarativo.** `lib/games/ftc-decode-2025.ts` + `types/game-definition.ts` + `zod-from-definition.ts` + `DynamicGameForm.tsx` son ~600 líneas ya escritas y testeadas que **nadie importa**. Falta un cambio de import en `MatchScoutingForm.tsx` + QA de paridad. El juego FTC 2026-27 se anuncia en septiembre: con el motor conectado, adaptarse cuesta *escribir un archivo*; sin conectarlo, cuesta *reescribir formularios* en plena pretemporada. Va acompañado de `docs/architecture/game-schema-migration.md`, **citado 3 veces (`CLAUDE.md:83`, aquí en :137 y :229) y nunca escrito**.

### 🧹 Matar (verificado, con evidencia)

- **Datos FRC fabricados** — `app/scouting/page.tsx:20-51` asigna OPRs inventados (45.2 / 52.4 / 60.1) a **equipos mexicanos reales**: Cerbotics 4400, PrepaTec LamBot 3478, Botbusters 4635. Corre en producción con el toggle FRC. Incompatible con la narrativa de "cada número es auditable".
- **Toggle FTC/FRC visible** — promete un modo sin datos reales detrás. Ocultar hasta que TBA esté conectado.
- **`share_target` del manifest** (`public/manifest.webmanifest:54-62`) — declara recibir `title`/`text`/`url`; `/scouting` no lee `searchParams`. Quitar o implementar.
- **Sección react-hooks de este archivo** (líneas ~194-197) — ya resuelto en `deab1f6` (42 → 0, decisión #41). Pendiente fantasma.

**Conservar sin activar** (253 loc correctas, semilla real de FRC): `lib/tba-api.ts`, `lib/frc-alliance-utils.ts`.

### 🎨 Arquitectura de información

Diagnóstico: **la app está organizada por conjuntos de datos, no por el momento en que estás.** Mayor palanca: **`/` deja de ser tabla global y se vuelve "Hoy"** (próximo partido, ranking proyectado, cobertura de scouting, probabilidad de alianza). **No requiere matemática nueva** — `LiveRankingProjection`, el `nextMatch` de `MatchList`, `draftOdds()` y `lib/consistency.ts` ya lo calculan todo. Es ensamblaje.

Otros: el Oracle se monta en 2 lugares (2 clics vs 5 niveles); hay **dos simuladores que no se conocen** (`TournamentSimulator`, 1164 líneas, está enterrado); `TeamSeasonReport` está **cableado a 30311** (los demás ven página vacía — bloquea la apertura); renombrar "Iron Lion Intelligence" en `/pro`; nav en un solo idioma; **`lead` y `admin` son indistinguibles** (ningún check en el repo los separa).

### 🌐 i18n

Inglés por defecto + `es`. **No es refactor de UI**: 13 módulos de `lib/` tienen español en la capa de análisis (`draft-odds.ts` genera frases, `consistency.ts` escribe notas, `schemas/scouting.ts` tiene mensajes de Zod). El patrón correcto es que esa capa devuelva **claves + parámetros**, no prosa. Meter el andamiaje **antes** de construir "Hoy" y las vistas de red. **Regla desde hoy: ningún string nuevo hardcodeado.**

---

## ✅ Producción al día (desplegado 2026-07-29)

En vivo en https://ftc-stats--ironlion-scouting.us-central1.hosted.app.
Reglas de Firestore desplegadas (bloques `app_config` + `ground_truth_runs`) y rollout de App Hosting completo.

Este despliegue llevó 12 commits: página pública `/oracle`, secciones de consistencia / trayectoria / probabilidad de alianza en el reporte de equipo, ground-truth idempotente, cola offline de pit scouting, panel de entradas atascadas, fallback offline en `/event`, y el trabajo de bundle.

Verificado en producción: las 7 rutas responden 200; `/oracle` sirve las cifras del expediente (21,436 partidos, 74.8%, diagrama de fiabilidad); el reporte muestra las tres secciones nuevas; y **Firebase quedó en 0 KB en la carga inicial de `/`, `/event`, `/team` y `/oracle`**, conservándose sólo en `/scouting` (397 KB), que es donde corresponde.

**Pendiente de acción del usuario**: `SUPERADMIN_EMAILS` en `.env.local` para abrir `/admin` en dev (en producción ya va por `apphosting.yaml`).

---

## 🔭 Siguientes análisis/features propuestos (no arrancados)

Del menú discutido en sesión 16 (los 3 primeros ya se hicieron: schedule strength, modelo de eliminatorias, selector de eventos):
- ~~**Detector de meta defensivo**~~ ❌ DESCARTADO 29 jul tras probar la premisa (decisión #70, `scripts/oracle-noise-analysis.mjs`). La σ por evento **ya** absorbe la dificultad: al subir σ, precisión y confianza bajan juntas y la brecha se mantiene. Normalizado por escala, el ruido no predice nada. Además todas las brechas son negativas (infra-confianza), así que ensanchar σ empeoraría la calibración. Power Play fue la temporada **mejor calibrada** de las siete.
- ~~**Curvas de crecimiento** rookie→veterano~~ ✅ HECHO 29 jul para México (decisión #71). Sección 05 del reporte de equipo + `scripts/growth-curves.mjs` (acepta cualquier región). Medido en percentil, no OPR (no comparable entre juegos), con control de sesgo de supervivencia. 30311 está en el p79.2 como rookie — el nivel que un programa mexicano típico alcanza en su 6ª temporada. **Pendiente opcional**: correr otras regiones para comparar la FORMA de la progresión (los percentiles son intra-región, así que no comparan fuerza absoluta).
- ~~**Ciencia del draft**~~ ✅ HECHO 29 jul (decisión #72). 606 eventos / 15,186 observaciones de 2025; alianzas reconstruidas desde composición de playoffs. `lib/draft-odds.ts` + columna "Prob. de alianza" en el reporte. Hallazgo: a igualdad de seed (7-12), estar en el decil alto de OPR sube la selección de 50% a 94%.
- ~~**Página pública de calibración**~~ ✅ HECHO 29 jul (decisión #69). `/oracle`, enlazada en el nav. Cifras recomputadas desde la data cruda, no transcritas. Incluye el diagrama de fiabilidad con la curva del modelo original (sobreconfiado) junto a la corregida.
- ~~**Tracker de consistencia 30311**~~ ✅ HECHO 28 jul (decisión #61). `lib/consistency.ts` +24 tests, sección 02 del reporte de equipo. Hallazgo: la dispersión es **crecimiento** (r² 0.77, +8.4 OPR/evento), no volatilidad — y el OPR público va 15.2 puntos por detrás de la forma actual. El driver de volatilidad real es **teleop**, no auto (contradice el learning previo del reporte, que habría que actualizar).
- ~~**consDiff** en el modelo de eliminatorias~~ ✅ HECHO 29 jul (decisión #73). De paso se descubrió que el −0.13 de #59 era un **bug de convergencia** del fit (real: −0.696, 5× mayor); corregido el fit y la decisión. Se verificó además que el efecto es lineal, no una interacción con z.

Este documento es la **fuente autoritativa** de qué falta. Leer al iniciar cualquier sesión nueva. Después de hacer trabajo, actualizar moviendo items entre secciones.

---

## ✅ Completado desde el cierre de sesión 9 (auditoría 2026-07-08/09)

Auditoría completa del repo (algoritmos, seguridad, datos/offline) seguida de remediación por tareas, cada una con tests de regresión y commit propio. Detalle completo por fix en `docs/memory/decisions.md` #29-#38. Todo en rama `feat/oracle-alliance_maker-260210`, 211 tests verdes, typecheck limpio.

- **Correctness estadística**: blend bayesiano (proyecciones), reliability de scouts (ground-truth), descomposición train/serve de features RP (**modelo RP cache bump a v2 — ver acción de usuario abajo**), unificación de win-probability (un solo modelo Φ/logística en vez de dos fórmulas divergentes).
- **Seguridad**: `app/actions/ai.ts` hardening (auth + rate-limit + input caps), IDOR en ground-truth validation (scopeado por org), escrituras de scouting idempotentes (elimina duplicados en red inestable), RBAC de membresía de orgs (reglas Firestore bloquean auto-escalación de rol), DoS de analytics (cap + saneo de `eventCodes`).
- **Bugs mecánicos**: crash de hooks en `RankingTable.tsx`, poison-pill + race condition en `OnlineSync`'s drain queue, `updatePicklist` filtrando campos del cliente hacia Firestore.
- **Lint**: barrido completo de `no-explicit-any`/`no-unused-vars`/`no-unescaped-entities` (213→0), `public/sw.js` excluido de ESLint (generado).

---

## 🔴 Bloqueantes para Premier (acción del usuario, NO código)

Ninguno de estos los puede hacer Claude. Son setup operativo:

### Credenciales en `.env.local` + Firebase App Hosting

| Var | Dónde se obtiene | Sin esto |
|---|---|---|
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | console.upstash.com → Create Redis DB (REST API enabled) | Cache analítico no-op → app más lenta pero funcional |
| `FIREBASE_SERVICE_ACCOUNT_KEY` (JSON one-line) | Firebase Console → Project Settings → Service Accounts → Generate new private key | **Bloquea** ground-truth validation, calibration log, RP model training. **Además**: el fix M8 (2026-07-08) bumpeó la cache key de modelos RP a `v2` — cualquier modelo entrenado antes de esa fecha ya no se sirve; hay que reentrenar desde cero una vez configurada esta variable |
| `NEXT_PUBLIC_SENTRY_DSN` + `SENTRY_ORG` + `SENTRY_PROJECT` + `SENTRY_AUTH_TOKEN` | sentry.io → crear proyecto Next.js | Sin error tracking en prod (no crítico para julio) |

### Deploy de Firestore rules + indexes

```bash
firebase deploy --only firestore:rules,firestore:indexes
```

Sin esto:
- Onboarding modal falla al escribir `users/{uid}` doc
- Picklists no persisten
- Calibration log no persiste
- Org secrets (Discord webhook) inaccesible

**Además (fix M4, 2026-07-08)**: las reglas de `users/{uid}` se endurecieron para bloquear auto-escalación de rol/orgId (no se pudo testear con emulador en el entorno de desarrollo de esa sesión). **Tras este deploy, correr ambos flujos de onboarding en el proyecto dev antes de dar por buenas las reglas**: (1) crear org nueva → debe quedar `admin`, (2) redimir código de invitación → debe quedar `scout` sin poder tocar su propio `orgId`/`role` de otra forma. Detalle en `docs/memory/decisions.md` #35.

### Códigos oficiales de eventos Premier

Actualizar `lib/constants.ts` con los `eventCode` reales del:
- Premier Evento de México (julio 2026)
- 1-2 eventos Premier previos (junio/inicio julio) para validación

### Operativo (no código)

- **Drill offline** pre-evento — DevTools Network "Offline" + validar Dexie + QR fallback (1h con el equipo)
- **Training material para scouts** — 1 página escrita + video corto demostrando flow (Pit → Match → Super)
- **PWA install** en cada tablet del equipo (Chrome móvil → "Add to Home Screen")
- **Hotspots** disponibles per 2 scouts como Wi-Fi backup
- **Paper backup sheets** impresos por si todo cae (ver `docs/failover-runbook.md` §1.1)

---

## 🟠 Alta prioridad — recomendable antes de Premier

### Próxima sesión (~3-5h trabajo)

1. **Validar en dev que todo lo construido funciona end-to-end**
   - Recorrer todas las pantallas con credenciales reales puestas
   - Probar el flow federado completo: crear org → invitar otro user → ambos capturar match → validar consensus
   - Probar offline en venue-like conditions (DevTools Offline + recargar)
   - Capturar issues en este mismo documento bajo "🟡 Encontrado en QA"

2. **Wire `HydrateAndCache`** — ✅ `/event/[code]` HECHO 29 jul (decisión #67), verificado end-to-end en navegador. Antes mostraba "Event Not Found" cuando la API no respondía. **Falta `/analytics`** (menos crítico: sus datos ya son secundarios y la pestaña Data Lab es exploratoria).

3. **Splash screens iOS reales** (`scripts/generate-pwa-assets.ts` ampliar)
   - `pwa-asset-generator` o agregar al script las 20+ resoluciones iOS device-specific
   - Sin esto iOS hace splash genérico (negro)
   - ~30 min

### Si hay tiempo extra antes de Premier

4. ~~**Firebase Auth lazy-load**~~ ✅ HECHO 29 jul (decisión #65). El diagnóstico de este item era incorrecto: no era *dónde se monta* `AuthProvider` sino que `Sidebar -> InviteGenerator -> lib/orgs -> lib/firebase` metía el SDK en el chunk de toda página pública. `/event` pasó de **1271 KB a 762 KB (−40%)** y Firebase salió por completo de `/`, `/event`, `/analytics` y `/team`. Sólo `/scouting` y `/strategy` lo conservan, que es lo correcto.

5. **Entrenar modelos RP con datos reales**
   - Una vez `FIREBASE_SERVICE_ACCOUNT_KEY` + `UPSTASH_REDIS_REST_URL` configurados
   - Sidebar admin → "Entrenar modelos" → corre `trainRpModelsAction(2025)`
   - Reentrenar antes de cada validación

6. **Acumular calibration data**
   - Cada briefing generado auto-loggea predicción a `calibration_log`
   - Después de validación 1, correr ground-truth validator (sidebar admin) para settle outcomes
   - Calibration dashboard en /analytics empieza a mostrar Brier real

### De la auditoría 2026-07-08/09 (código)

7. ~~**M1 — Cache stampede / single-flight en `lib/ftc-api.ts`**~~ ✅ HECHO 16 jul (commit `d5186a5`, decisión #39). Single-flight in-process (`lib/single-flight.ts` + `readThrough`), 9 fetchers refactorizados. Verificado en navegador.

8. ~~**Residual M4 (vector 2) — unirse a org ajena como scout**~~ ✅ HECHO 16 jul (commit `3f42662`, decisión #40). Redención movida a server-action Admin-SDK + regla `users/{uid}` endurecida. **⚠️ FALTA acción usuario**: testear reglas post `firebase deploy --only firestore:rules` en dev (ambos flujos onboarding + confirmar que write directo de orgId→org ajena es rechazado). Sin `FIREBASE_SERVICE_ACCOUNT_KEY` el action no corre e2e en dev.

9. ~~**React Compiler — backlog react-hooks (42 hallazgos)**~~ ✅ HECHO 16 jul (commit `deab1f6`, decisión #41). Los 42 → 0. Verificado en navegador (Oracle prop-sync, bracket derivado, RankingTable sorting). De paso se arregló un bug real: `MatchSimulator` no recalculaba la proyección al ajustar puntos manualmente (`manualAdjustments` faltaba en deps). Sin cambios de comportamiento en el resto.

### De la auditoría 2026-07-24/25 (medios — pueden esperar post-Premier)

Los críticos/altos de esa auditoría (identidad season/eventCode, captura FTC offline-first, caché de fallos, TTL UTC, payload del home, StatsTable, región "All", RP trainer global, listeners sin error callback) quedaron **resueltos y desplegados** en la misma sesión (decisiones #42–#44). Quedan los medios:

10. ~~**`app/actions/pro-scouting.ts`** — NaN en consistency + join que nunca empata~~ ✅ HECHO 28 jul (Sonnet, revisado por Opus). `computeStdDev()` guarda el caso vacío; `levelsMatch()` normaliza igual que `analytics.ts:168`; además se encontró y arregló un tercer bug relacionado: el lookup de `scoreBreakdown` asumía que un score entry contenía ambas alianzas anidadas (`?.['red'] || ?.['Red']`), pero `FTCMatchScoreEntry` real (`lib/ftc-api.ts:26-31`) tiene un entry POR alianza con su propio campo `alliance` — se corrigió a buscar por `alliance` + usar `scoreBreakdown` directo, igual que `analytics.ts:172-173`. Se eliminaron los tipos locales duplicados a favor de `FTCMatchScoreEntry`/`FTCAllianceScoreBreakdown` de `lib/ftc-api.ts`. 7 tests nuevos en `pro-scouting.test.ts` (249 total). **Queda pendiente, fuera de esta pasada**: el dashboard Pro sigue haciendo 1 server action por equipo (~30-40 round-trips) — no se tocó por ser un cambio de UX (perdería el progressive loading actual), requiere decisión de diseño.
11. ~~**Ground-truth validation no idempotente**~~ ✅ HECHO 29 jul (decisión #63). Marcador `ground_truth_runs` con IDs de entradas consumidas + `WriteBatch` atómico; re-ejecutar es incremental, no doble-aplica. 4 tests nuevos. **Requiere deploy de `firestore.rules`** (colección nueva).
12. ~~**Dead-letter invisible en la cola offline**~~ ✅ HECHO 29 jul (Sonnet + revisión Opus). El badge "N pend." ya sólo cuenta filas dentro de su presupuesto de reintentos; las atascadas salen en un pill rojo aparte con panel de inspección (equipo/match/evento/error), **Reintentar**, **Reintentar todas** y **Exportar JSON** (funciona sin red). 4 tests nuevos (281 total). **Falta verificación visual con sesión iniciada** — el pill sólo renderiza para usuario autenticado, así que no lo pude ver en navegador.
13. ~~**Server actions que lanzan en vez de `{ok:false}`**~~ ✅ HECHO 29 jul (decisión #64, Sonnet + revisión Opus). Los 4 archivos + `CalibrationDashboard.refresh()`.
14. ~~**`fetchTeam` cachea `null`**~~ ✅ HECHO 29 jul (decisión #64). Ya no escribe `null`: `readThrough` trata falsy como miss, así que era una escritura inútil.
15. ~~**Pit scouting sin cola offline**~~ ✅ HECHO 29 jul (decisión #66, Sonnet + revisión Opus). Tabla Dexie `pendingPits` (esquema v2, migración probada), `useSavePitScouting` con fallback remote→local, drenado en `OnlineSync`. De paso: el hook era **código muerto** — `ScoutingClient` llamaba `savePitScouting` directo; ya está cableado. **Falta verificación visual con sesión iniciada** (igual que #12).
16. **Juego 2026-2027** — ✅ renombre HECHO 29 jul (decisión #68): `FTC_DecodeForm` + identificadores de schema/tipos. **Falta** (cuando salga el juego nuevo): cablear `DynamicGameForm` según `docs/architecture/game-schema-migration.md`.

---

## 🟡 Encontrado en QA

(Vacío por ahora — agregar aquí cualquier issue al revisar dev real.)

---

## 🟢 Backlog post-Premier

### Limpieza estructural (Direction A — Design System Foundation, ~6-10h)

Documentado en sesión 9 análisis UX. Mover ANTES de cualquier rediseño visual.

- Eliminar sección "Force overrides for hardcoded classes" en `app/globals.css`
- Find/replace agresivo: `text-white` → `text-foreground`, `bg-white/5` → `bg-card`, etc. en los ~50 componentes
- Definir 3 surfaces semánticas (surface-1/2/3) en lugar de mezclar `bg-white/[0.02]`, `bg-black/40`, `bg-card`
- Reducir paleta a 2 acentos (primary + status). Eliminar uso decorativo de cyan/purple/etc.
- Escala tipográfica fija: 4 tamaños + 3 weights
- Primitives shadcn-style: `<Button variant size>`, `<Card>`, `<Badge>` con variantes (selectivo, no la CLI completa)

### Rediseño visual (Direction C — Modern Technical, ~8-12h)

Solo después de A. Dirección guardada en memoria: **Modern technical (Linear / Vercel / Statbotics)**.

- Background más cálido (no `#030712` azul-negro frío)
- Primary candidate: violet `#8b5cf6` o cyan `#06b6d4` en lugar de orange
- Cards sólidas con borde fino + sombra leve (no translúcido)
- Sin neon glows ni `blur-3xl` decorativos
- Tipografía respirada, hero treatments
- Color como herramienta semántica (status), no decoración
- **NO redesignar el form de scouting si scouts ya entrenaron con el actual**

### Features deferidas

- **Migración `FTC_IntoTheDeepForm` → `<DynamicGameForm>` con `FTC_DECODE_2025` definition**
  - Infra lista; switch es one-line en `MatchScoutingForm`
  - Requiere QA exhaustivo de paridad antes de hacer cutover
  - Beneficio real recién en septiembre 2026 (nueva temporada)
- **Per-RP logistic regression entrenado con datos mexicanos** (esperar Premier para tener data)
- **Marginal accuracy v2**: weight por contribución share (no solo presencia binaria)
- **EPA-style model port** completo de Statbotics (post-Premier work, semanas)
- **Vertical features pendientes Sept 1.7-1.13**:
  - `share_target` parsing real (hoy aterriza pero ignora params)
  - Heatmap 12×6 grid en match form (ScoutingPASS-style)
  - Robot iteration log season-long
  - Virtual Pit profiles públicos (modelo FTC Bonfire)
  - OCR scoreboard photo entry

### Documentación

- README.md actualizar (lleva info desactualizada de pre-Sprint 0)
- Diagrama de arquitectura (Mermaid) en `docs/architecture/overview.md`
- Tutorial scout en 1 página (puede ser un PDF generado desde la app misma)

### Limpieza react-hooks / React Compiler (de la auditoría, decisión #38 — bajo riesgo, no bloquea Premier)

- **`static-components`** (24 hallazgos, `RankingTable.tsx` + `FRC_ReefscapeForm.tsx`): componentes (`SortIcon`, `HeaderWithTooltip`, `HighlightValue`, `Counter`, `Checkbox`) declarados dentro del render — se recrean cada render, reseteando su estado y rompiendo la optimización del compilador. Fix: sacarlos a scope de módulo y pasar lo que hoy capturan por closure como props explícitas. Mecánico pero superficie de UI amplia → **Sonnet, con dev server abierto para verificar visualmente** (no se hizo en la sesión de auditoría por no tener navegador disponible)
- **`set-state-in-effect`** (6 restantes: `Sidebar.tsx`, `TournamentSimulator.tsx` x2, `MatchScoutingForm.tsx`, `ScoutingClient.tsx`, `MatchSimulator.tsx`), **`exhaustive-deps`** (5), **`preserve-manual-memoization`** (4, `MatchList.tsx`) — sin evaluar caso por caso; algunos pueden ser el mismo patrón SSR-safe legítimo documentado en `lib/hooks/use-tip-dismissed.ts`, otros bugs reales → **Sonnet** para el triage inicial, escalar a Opus si alguno resulta ser comportamiento real

---

## 📋 Checklist condensado pre-Premier (24h antes del evento)

Copiado del `failover-runbook.md` §5:

- [ ] Visit `/` en dev account, confirmar no errors
- [ ] Visit `/scouting`, capturar test entry, confirmar guarda
- [ ] Visit `/strategy` → todas las 5 tabs renderean sin errors
- [ ] Visit `/analytics` → Calibración tab carga
- [ ] `npm run build` localmente debe pasar
- [ ] Firestore rules deployadas (comparar con archivo local)
- [ ] Upstash dashboard muestra cache reads
- [ ] Sentry dashboard recibe events (prod-only)
- [ ] Imprimir `docs/failover-runbook.md` + paper backup sheets
- [ ] 1+ hotspot por 2 scouts
- [ ] PWA instalado en cada device del scout
- [ ] Tablets cargadas + power banks de respaldo

---

## 🗂️ Mapa de archivos clave para retomar

| Si necesitas… | Mirar… |
|---|---|
| Entender qué hace el código sin leer todo | `CLAUDE.md` |
| Saber por qué se decidió X | `docs/memory/decisions.md` |
| Resumen de sesiones anteriores | `docs/memory/history.md` |
| Game-day decision tree | `docs/failover-runbook.md` |
| Arquitectura federada de scouting | `docs/architecture/collaborative-scouting-model.md` |
| Cómo migrar al juego 2026-2027 | `docs/architecture/game-schema-migration.md` |
| Memorias persistentes Claude | `~/.claude/projects/.../memory/MEMORY.md` |
