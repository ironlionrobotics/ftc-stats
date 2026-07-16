# Pendientes — FTC Stats México

**Última actualización:** 16 jul 2026 (cierre de auditoría + remediación 2026-07-08/09)
**Premier Event objetivo:** julio 2026

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

2. **Wire `HydrateAndCache` en `/event/[code]` y `/analytics`**
   - Hoy solo el home tiene el patrón offline-fallback
   - El renderer `RenderCachedPayload` tiene un `case "event-stats"` placeholder listo
   - ~30 min cada uno

3. **Splash screens iOS reales** (`scripts/generate-pwa-assets.ts` ampliar)
   - `pwa-asset-generator` o agregar al script las 20+ resoluciones iOS device-specific
   - Sin esto iOS hace splash genérico (negro)
   - ~30 min

### Si hay tiempo extra antes de Premier

4. **Firebase Auth lazy-load** (refactor ~2h, alto impacto bundle)
   - Hoy el chunk común tiene 560 KB de Firebase eager porque `AuthProvider` está en root layout
   - Mover Auth a un wrapper opt-in solo en rutas con login (/scouting, /strategy parts)
   - Routes públicas (/, /event, /analytics tab Data Lab) no necesitan Firebase eagerly
   - **Mejora más grande pendiente de bundle**

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

9. **React Compiler — 2 hallazgos con riesgo real de bug** (del barrido de lint, decisión #38 en `decisions.md`)
   - `components/analytics/AlliancePredictor.tsx:34-35` — `setState` llamado dentro de un `useMemo`; el lint de React Compiler lo marca como riesgo de loop infinito, no diagnosticado a fondo. **Modelo: Opus** (hay que leer el memo completo)
   - `components/scouting/ScoutingForm.tsx:74` — `Date.now()` llamado durante el render (impuro, rompe memoización del compilador). **Modelo: Sonnet/Opus**, riesgo bajo pero requiere revisar qué depende de ese valor

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
