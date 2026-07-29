# 🧠 Memoria del Proyecto: FTC Stats México

Este documento centraliza el progreso, las decisiones técnicas y el estado actual del desarrollo para asegurar continuidad y claridad en el futuro.

## 📝 Resumen Ejecutivo
Transformación de un script de automatización en Python (`ftc_event_advancement.py`) a una plataforma web de alto rendimiento (Next.js) para el análisis de estadísticas de FIRST Tech Challenge en México.

---

## 🛠️ Stack Tecnológico
- **Frontend**: Next.js 14, React, TypeScript.
- **Estilos**: Tailwind CSS (Dark Mode, Glassmorphism).
- **Animaciones**: Framer Motion.
- **API**: Integración directa con `ftc-api.firstinspires.org`.
- **Iconografía**: Lucide React.

---

## 🗓️ Registro de Sesiones y Progreso

### Sesión 1: Cimentación (21 Ene 2026)
- **Objetivo**: Inicializar el proyecto y conectar con la API.
- **Logros**: 
    - Creación de la estructura Next.js.
    - Implementación del cliente de API con autenticación Base64.
    - Definición de tipos de datos para Rankings y Advancement.

### Sesión 2: Inteligencia de Datos y UI (21 Ene 2026)
- **Objetivo**: Implementar el reporte de avance y promedios de calificación.
- **Logros**:
    - **Descubrimiento Crítico**: Se encontró el endpoint `/points` para obtener puntajes numéricos exactos de Judging, Playoff, etc.
    - Implementación de lógica de agregación (suma para avance, promedio para calificación).
    - Creación de la tabla interactiva con resaltado para equipos que ya tienen pase al nacional.
    - Corrección de bugs en el cálculo del High Score (usando `sortOrder6`).

### Sesión 5: Monitoreo en Vivo y Refinamiento (24 Ene 2026)
- **Objetivo**: Implementar la visualización de partidos en vivo y mejorar la experiencia de usuario en regionales.
- **Logros**:
    - **Página de Eventos**: Creación de la ruta dinámica `/event/[eventCode]` con fetching de datos en servidor (SSR) para evitar bloqueos de la API.
    - **Visualización de Matches**: Implementación del componente `MatchList` que muestra alianzas rojas/azules, marcadores dinámicos y ganadores resaltados.
    - **Alineación Premium**: Rediseño de la tabla de alianzas a un sistema de 4 columnas individuales para asegurar alineación vertical perfecta entre equipos.
    - **Vínculo de Equipos**: Integración de nombres oficiales de equipos dentro de la lista de partidos mediante el mapeo de datos de rankings.
    - **Abreviación Inteligente**: Optimización de descripciones (ej. "Upper Bracket R1 M1") para maximizar el espacio en pantalla.
    - **Expansión de Calendario**: Inclusión de los regionales de Toluca y San Luis Potosí, y corrección de la temporada a 2025 para sincronización de datos.

### Sesión 6: Analítica de Potencial y Proyección Nacional (03 Feb 2026)
- **Objetivo**: Refinar la precisión del Power Score y mejorar la visualización de la comparativa de equipos.
- **Logros**:
    - **Algoritmo DECODE 2025-2026**: Implementación de pesos oficiales para premios (Inspire 60/30/15, Otros 12/6/3) según el manual de la temporada.
    - **Índice de Fortaleza (Event Strength)**: Creación de un sistema de ponderación de resultados basado en la competitividad de cada regional (número de equipos, promedios de puntaje y autónomo).
    - **UX Mejorada**: Implementación de columna "Sticky" para nombres de equipos y visualización directa del Power Score en la tabla principal.
    - **Corrección de Integridad**: Arreglo de bug en la caché que duplicaba premios entre eventos y ajuste de tipos de datos en el filtrado de premios.
    - **Etiquetado Dinámico**: Sistema de etiquetas inteligentes ("Candidato Fuerte", "Potencial") basado en el Power Score y estabilidad.

---

## 💡 Decisiones de Diseño Importantes
1. **Identidad Visual**: Uso de color Naranja (Primary) y Violeta/Indigo (Secondary) para diferenciar "Stats" de "Advancement".
2. **Abreviaturas de Eventos**: Uso de códigos amigables como MTY, GDL, CDMX para mejorar la legibilidad.
3. **Filtro Advanced**: Inclusión de un toggle rápido para visualizar solo a los clasificados al nacional.
4. **Scouting Traducido**: Se decidió mantener las opciones internas del formulario en español para facilitar la captura rápida por parte de los scouts en México.
5. **Nomenclatura Híbrida**: En los matches, se decidió mantener los nombres de brackets oficiales ("Upper/Lower Bracket") completos pero abreviar términos técnicos ("Round/Match" a "R/M") por estética y espacio.
6. **Poder de la Alianza**: Se decidió documentar explícitamente que los promedios (TeleOp, Auto) son de alianza, no individuales, para asegurar una interpretación correcta de los datos.

---

### Sesión 7: Optimización del Alliance Oracle y RP Híbrido (09 Feb 2026)
- **Objetivo**: Corregir inconsistencias en la recomendación de alianzas y mejorar la precisión de los Ranking Points.
- **Logros**:
    - **RP Híbrido (API + Scouting)**: Implementación de lógica que infiere el éxito de RPs (Movimiento, Artefactos) directamente de los puntajes de la API (Auto > 35, TeleOp > 75) como respaldo al scouting manual.
    - **Algoritmo de Recomendación 2.0**: Re-balanceo de la fórmula final (OPR sube al 70% de peso) y transición de penalización por faltas fija a una **penalización dinámica escalada**.
    - **Inyección de RP Efectivos**: Sistema que otorga "beneficio de la duda" a equipos élite con datos de RP en cero pero OPRs altos, evitando que bajen injustamente en las sugerencias.
    - **UI/UX Avanzada**: Mejora visual del Oracle con indicadores de ranking oficial, numeración de sugerencias (#1, #2, etc.) y visualización de RPs proyectados incluso para equipos en el "pool" restante.
    - **Sincronización de Filtros**: Implementación de limpieza automática de equipos excluidos al resetear la búsqueda principal.

---

## 💡 Decisiones de Diseño Importantes
1. **Identidad Visual**: Uso de color Naranja (Primary) y Violeta/Indigo (Secondary) para diferenciar "Stats" de "Advancement".
2. **Abreviaturas de Eventos**: Uso de códigos amigables como MTY, GDL, CDMX para mejorar la legibilidad.
3. **Filtro Advanced**: Inclusión de un toggle rápido para visualizar solo a los clasificados al nacional.
4. **Scouting Traducido**: Se decidió mantener las opciones internas del formulario en español para facilitar la captura rápida por parte de los scouts en México.
5. **Nomenclatura Híbrida**: En los matches, se decidió mantener los nombres de brackets oficiales ("Upper/Lower Bracket") completos pero abreviar términos técnicos ("Round/Match" a "R/M") por estética y espacio.
6. **Poder de la Alianza**: Se decidió documentar explícitamente que los promedios (TeleOp, Auto) son de alianza, no individuales, para asegurar una interpretación correcta de los datos.
7. **Basura vs Datos**: En el oráculo, se decidió que es mejor "estimar al alza" basándose en OPR que mostrar un "0%" engañoso cuando la causa es falta de datos, no falta de capacidad.

---

### Sesión 8: Simulador de Playoffs e Interactividad Total (10 Feb 2026)
- **Objetivo**: Crear un sistema de simulación de brackets interactivo y probabilístico.
- **Logros**:
    - **Interactive Alliance Builder**: Implementación de un flujo de creación de alianzas manual y automático con selección dinámica de capitanes (el rango más alto disponible siempre elige).
    - **Overrides de Bracket**: Capacidad única de forzar ganadores en cualquier match del bracket con propagación automática de resultados y probabilidades a las rondas siguientes.
    - **Simulación Monte Carlo**: Integración de motor de simulación probabilística que ejecuta 2,000 iteraciones del torneo considerando la varianza de performance para dar probabilidades de campeonato reales.
    - **Gestión de Escenarios**: Sistema de persistencia local para guardar y cargar configuraciones específicas de brackets (ej. "Escenario: Sorpresa en Semifinales").
    - **Visualización de Brackets**: Rediseño visual de los brackets con líneas de conexión dinámicas y markers de flechas para indicar el flujo de ganadores y perdedores.

---

## 🚀 Próximos Pasos (Prioridad Alta)
1. **GitHub Sync**: Mantener sincronizados los cambios con el repositorio remoto.
2. **Compatibilidad de Autónomo**: Detectar conflictos de posición inicial entre aliados.
3. **Optimización de Caché**: Refinar el sistema de Firestore para minimizar llamadas redundantes a la API de FTC.
4. **Reporte para Jueces**: Generar un PDF descargable con el resumen del equipo para entregar en el nacional.


---

### Sesión 9: Migración de infraestructura, modelo federado y entrega de Plan Premier (24 May 2026)
**Objetivo**: De cero a "todo el código del plan Premier Event listo + UX polish + features avanzadas + algoritmos avanzados".

**Resumen narrativo** (ver `docs/PENDING.md` para próximos pasos y `docs/memory/decisions.md` §20-28 para razones técnicas):

- **Sprint 0 — Storage migration + algoritmos quick wins**: Quitamos `force-dynamic` global, quitamos `enableIndexedDbPersistence` (crash mobile), migramos `api_cache` Firestore → Upstash Redis (5-20× más rápido), agregamos firebase-admin para reads server-side, Sentry setup, memoización `React.cache()`. Mejoras de algoritmos: win probability logística real, hybrid blend bayesiano inverse-variance, component breakdown calculado, infra de calibración (Brier/log-loss/reliability diagram).

- **Sprint 1 — Modelo federado completo**: schema `match_scouting` con `scoutId`+`orgId`, aggregation cross-org con conflict resolution (numeric weighted mean, categorical mayoría, subjective per-org), SourceBadge UI, pit público/privado split, Super Scouting form (driver/defense/reliability/would-pick), Auth + users/orgs/invitations collections + onboarding modal + invite generator UI, ground-truth validation server action, Dexie reemplaza idb-keyval, Zustand reemplaza Contexts, RHF + Zod + TanStack Query en forms, Serwist PWA + OnlineSync background sync, paginación + Firestore indexes.

- **Sprint 3 — Strategy tools**: Picklist editor drag-and-drop con @dnd-kit + real-time Firestore sync, DNP list, marcado selected/declined. Match Strategy Briefing printable (CSS @print, NO @react-pdf/renderer). Live Ranking projection con extrapolación lineal RP/match.

- **Sprint 5 — Calibration + Reliability**: dashboard de calibración (Brier, log loss, accuracy, reliability diagram), `<SourceBadge>` ahora usa `useScoutReliabilities` hook para weighted aggregation real, `MatchBriefingCard` auto-logea predictions a `calibration_log` con dedupe por doc id determinista.

- **Sprint 6 — Polish + Game-Day**: Vitest 57 tests inicial (subió a 125), `@next/bundle-analyzer` setup, runbook completo `docs/failover-runbook.md`, Playwright smoke E2E setup (5 tests).

- **UX Polish 3 fases**: Sonner toasts reemplazan 11 `alert()`s. `<Skeleton>` primitive + `app/loading.tsx`. Empty states con CTA accionable. `useConfirm()` hook + Radix alert-dialog reemplazan 4 `confirm()` nativos. Tooltip primitive. Tabs ARIA + 44px touch target + transitions fade+slide. PWA install prompt con dismiss persistido. Microinteracciones: `active:scale-[0.98]` + `focus-visible:ring`. Touch target audit 32-44px. Contrast fixes.

- **Features B (4)**: Picklist weighted sliders con 6 métricas (RS, NP, Auto, Win Rate, Best Rank, Advancement Pts) + Auto-sort button + persistencia localStorage per (org, event). Discord webhook con `org_secrets` collection separada + rate limit Redis + URL validation anti-SSRF. Onboarding tips `<Tip>` dismissible con versioning. JSON game-agnostic form schema infra (GameDefinition + zod-from-definition + DynamicGameForm + FTC_DECODE_2025 ref, NO wired aún — preparado para sept 2026).

- **Algoritmos C (3)**: Per-team σ Monte Carlo (clamp [8, 60], sqrt sum of squares para alliance). LOO marginal accuracy en ground-truth validation. Per-RP logistic regression pura TypeScript (gradient descent + L2 + standardize) entrenable vía sidebar UI, fallback transparente al heurístico empírico cuando no hay modelo.

- **Direction B (Performance + Offline + PWA)**: PWA polish (script `generate-pwa-assets.ts` genera 16 iconos via sharp, manifest con 14 iconos + shortcuts + share_target + maskable). Bundle reduction: removida framer-motion (−193 KB), lazy-load PicklistEditor (dnd-kit) + ComparisonView (recharts) via `next/dynamic`. Offline cache real (`FTCStatsClientCache` Dexie + `CacheWriter` + `OfflineFallback` para home page con banner ámbar "Mostrando datos cacheados...").

- **Bug fix de cierre**: Default `|| 2024` hardcoded en `/event/[code]` y `/analytics` causaba 404 en eventos 2025 cuando cookie ausente. Corregido a `getCurrentSeason()` + soporte `?season=` URL param + fallback multi-season en event lookup.

**Métricas finales**:
- 125 tests unitarios pasando
- 5 smoke tests E2E definidos
- Build verde con webpack + Serwist + Sentry + bundle analyzer
- TypeScript clean

**Lo que NO se hizo (deferred a post-Premier)**:
- Direction A (Design system foundation) y C (Visual overhaul Modern technical) — riesgo pre-evento
- Firebase Auth lazy-load (chunk 560 KB eager sigue siendo el limitante de bundle común)
- Splash screens iOS per-device (manifest tiene placeholder)
- Migración del form FTC actual a `<DynamicGameForm>` (infra lista, switch es one-line cuando se valide en QA)

### Sesión 10: Auditoría + clúster de correctness estadística (08 Jul 2026)
- **Objetivo**: Auditoría completa del repo y fix de los 4 defectos estadísticos identificados (con Fable 5).
- **Logros**:
    - **Auditoría** de 3 frentes (algoritmos, seguridad, datos/offline): hallazgos priorizados; los top: ~130 archivos sin commitear, crash de hooks en RankingTable, `ai.ts` sin auth, IDOR en ground-truth cross-org, sync offline no idempotente.
    - **C6** (`projections.ts`): estadísticas del blend bayesiano divididas por conteo filtrado (`scoredCount`), no por total con supers; reliability por observaciones objetivas; breakdown siempre suma al total; confianza invariante a multiplicadores. Primera suite de tests del archivo (24). Decisión #29.
    - **M6** (`ground-truth-validation.ts`): reliability = precisión de entradas propias (v3), reemplaza LOO marginal cuya escala era inconsistente con su fallback y decaía con la redundancia. Supers y anónimos excluidos de atribución. `computeAllianceSignals()` pura + 8 tests. Decisión #30.
    - **M8** (`rp-inference.ts` + `analytics.ts`): descomposición compartida `allianceScoreComponents()` elimina el train-serve skew (tele fallback ahora resta endgame); modelo cache v2 — **reentrenar modelos RP post-deploy**. Decisión #31.
    - **Win-prob unificada** (`lib/win-probability.ts`): un modelo, dos entradas (probit Φ con σ para el Oracle — ahora consistente con su Monte Carlo; logística k=1.5 para proyecciones). Fix Box-Muller u1=0. Decisión #32.
- **Métricas**: tests 125 → 177 (todos verdes); typecheck limpio; cada fix con regresión verificada contra el código viejo (re-introducción temporal del bug).
- **Pendiente señalado**: discrepancia comentario/código en `driverSkillImpact` (±7.5% vs ±15%) — decisión de calibración abierta; resto de hallazgos de auditoría (seguridad, offline, git) sin atacar aún.

### Sesión 10 (cont.): Remediación de seguridad/arquitectura (08 Jul 2026, Opus 4.8)
Tras el clúster estadístico, se ejecutó la remediación de los hallazgos de seguridad/arquitectura de la auditoría, cada fix con tests de regresión verificados contra el código viejo y commit propio:
- **C1** — commit del working tree completo (~163 archivos que vivían solo en disco). `4be5ad8`.
- **C3** — `app/actions/ai.ts` hardening: auth vía verifyIdToken + allow-list de model + rate-limit Redis + input caps. Lógica en `lib/ai-guards.ts`. `2ab98ad`. Decisión #33 (C4).
- **C4** — IDOR: `runGroundTruthValidation` scopeada por `orgId` (query filter + guard defensivo). `a5d6ea7`.
- **C5** — escrituras de match scouting idempotentes (id determinista + create-if-not-exists, respeta reglas inmutables). `649ec40`. Decisión #34.
- **M4+M5** — RBAC de orgs (reglas `users/{uid}` bloquean escalación de rol + freeze reliability; `createOrJoinOrgByTeamNumber` create-only) y DoS de analytics (quitar forceRefresh, sanear eventCodes). `1d388e0`. Decisión #35.

### Sesión 11: Bugs mecánicos + barrido de lint + catalogación react-hooks (09 Jul 2026, Sonnet 5)
- **C2+M2+M3+M7** — crash de hooks en `RankingTable` (early-return tras 4 useMemo), poison-pill de `OnlineSync.drain` (continue + dead-letter), race de drain (ref-lock), `updatePicklist` filtrando campos del cliente. `2a00b98`. Decisión #36.
- **Barrido de lint** — `public/sw.js` excluido de ESLint; 213→0 en no-unused-vars/no-explicit-any/no-unescaped-entities vía 5 agentes paralelos por archivo. `5a31930`. Decisión #37.
- **Descubrimiento**: el linter reveló 42 hallazgos `react-hooks/*` orientados a React Compiler (no estaban en el alcance original) — catalogados como backlog en decisión #38 (2 resueltos, resto priorizado por riesgo).

### Sesión 12: Cierre de la auditoría — M1, M4 vector 2, backlog react-hooks (16 Jul 2026, Opus 4.8)
- **M1** — single-flight (request coalescing) contra cache stampede en `lib/ftc-api.ts`. Nuevo `lib/single-flight.ts` (Map de promesas en vuelo) + helper `readThrough`; 9 fetchers refactorizados preservando semántica exacta. In-process, no lock distribuido (justificado). `d5186a5`. Decisión #39. Verificado en navegador.
- **M4 vector 2** — redención de invitación movida a server-action Admin-SDK (`app/actions/redeem-invite.ts`, transacción — cierra también el race de maxUses) + regla `users/{uid}` endurecida (rama "rol sin cambio" ahora exige orgId sin cambio → ningún cliente escribe orgId hacia org que no creó, cerrando la lectura cross-tenant de estrategia rival). Validación pura en `lib/invite-redemption.ts`. `3f42662`. Decisión #40.
- **Backlog react-hooks (42→0)** — todos resueltos y verificados en navegador. Judgment calls en Opus (AlliancePredictor prop-sync compare-during-render, MatchSimulator/TournamentSimulator estado derivado→useMemo, Sidebar useSyncExternalStore, ScoutingClient dead state, etc.); `static-components` mecánicos en Sonnet paralelo (RankingTable, FRC_ReefscapeForm). **Bug real encontrado y arreglado**: `MatchSimulator` no recalculaba la proyección al ajustar puntos manualmente (`manualAdjustments` faltaba en deps). `deab1f6`. Decisión #41.
- **Hallazgo de infra**: un `next-server` zombi (Next 15.5.15, 7.6 GB RAM, ~8 días corriendo) ocupaba el puerto 3000 — probable causa del síntoma reportado de "saturación de RAM"; terminado.
- **Estado**: TODA la auditoría cerrada (C1–C6, M1–M8, lint, react-hooks; decisiones #29–#41). 224 tests verdes, typecheck limpio, único lint restante el `no-require-imports` preexistente de firebase.ts.
- **Pendiente usuario** (no código): testear reglas Firestore M4/M4v2 post-deploy; reentrenar modelos RP v2; decidir driverSkillImpact ±7.5% vs ±15%.

### Sesión 13: Deploy a App Hosting + Upstash + auditoría en vivo con fixes durante el Premier FPEMX (24-25 Jul 2026, Fable 5)
- **Puesta en línea** — Backend App Hosting `ftc-stats` creado en `us-central1` (proyecto `ironlion-scouting`), secretos en Secret Manager (FTC API, Gemini, Upstash), despliegue desde código local (`firebase deploy --only apphosting`, config en `firebase.json` — sin necesidad de merge a main ni GitHub connect). URL: https://ftc-stats--ironlion-scouting.us-central1.hosted.app. Base Upstash Redis creada y verificada en producción (home 9.2s→2.4s, llave `ftcapi:events_2025`). `apphosting.yaml`: runConfig 1GiB/4 instancias; `FIREBASE_WEBAPP_CONFIG` y ADC hacen innecesarios los secretos de Firebase.
- **Auditoría completa** (3 agentes paralelos: memoria/payloads, bucles/terminación, correctness; hallazgos críticos verificados a mano contra el código y magnitudes contra la API real). Resultado: **cero bucles infinitos** — los congelamientos venían de volumen de datos (catálogo mundial serializado + región "All" + tabla sin virtualización). Hallazgos críticos NUEVOS no cubiertos por auditorías previas: split-brain de season (2024 hardcodeado vs `ftc_season`), namespace de eventCode (abreviatura vs código FIRST), captura FTC sin ruta offline, caché que memoizaba fallos hasta 30 días, y TTL con mezcla UTC/local que marcaba el evento completado durante su última tarde.
- **Fixes aplicados y desplegados el mismo día** (evento FPEMX en curso 23-25 jul; los de caché se desplegaron primero por urgencia del día final): decisiones #42 (caché/UTC), #43 (identidad season+eventCode, `lib/active-event.ts`), #44 (offline-first FTC, payload del home 1.8MB→~1/6, StatsTable memo+paginación, "All Regions" eliminado, RP trainer MX-only, error callbacks en listeners, poda de IndexedDB cableada). También: lint `no-require-imports` de firebase.ts resuelto (import estático).
- **Verificado**: Firestore sin entradas de scouting previas (no hizo falta migración de identidad). 224 tests verdes, typecheck y lint limpios, build de producción ok.
- **Medios pendientes** → PENDING.md items 10-16 (pro-scouting NaN/join, ground-truth idempotencia, dead-letter UI, actions que lanzan, fetchTeam null, pit sin cola, renombrar FTC_IntoTheDeepForm→Decode).

### Sesión 14: Optimización móvil + rediseño visual Modern technical (25 Jul 2026, Fable 5 + 2 agentes Sonnet)
- **Análisis en vivo FPEMX** — modelo OPR + Monte Carlo (30k sims) sobre datos reales de la API para las 2 quals restantes de 30311: P(ganar Q34)≈83% con la mejora de auto, Q42 ~100%; rank final típico 9-10, techo realista 7-8, top-4 matemáticamente inalcanzable; recomendación clave: asegurar movement RP en Q42 (umbral ≥21 pts salida+base, derivado empíricamente) y draftear a 32753 (OPR 90, rank 16, infravalorado).
- **Móvil** — auditoría con Playwright (390×844) y fixes: overflow de página en /event eliminado, master-detail en /scouting, tabla compacta, link Estrategia en Sidebar (faltaba), headers con wrap. Decisión #45.
- **Rediseño** — tokens violet/cyan claro+oscuro, tipografía Geist/Archivo/Geist Mono (bug: las fuentes del @theme nunca se cargaban), flat design, ~900 reemplazos de clases hardcodeadas en ~40 archivos vía 2 agentes Sonnet supervisados con excepciones documentadas. El toggle de tema funciona en toda la app por primera vez. Decisión #46.
- **Estado**: 224 tests verdes, lint/tsc limpios, build ok. NO desplegado — regla nueva: ningún deploy a App Hosting sin OK explícito de Héctor.

### Sesión 15: Deploy en vivo + suite de análisis en tiempo real durante FPEMX (24-28 Jul 2026, Fable 5 + Opus 4.8)
Sesión larga y multi-tema, con la app YA en producción y usada en vivo durante el México Premier Event.

- **Deploy a Firebase App Hosting**: backend `ftc-stats` en `us-central1` (proyecto `ironlion-scouting`), secretos en Secret Manager (FTC API, Gemini, Upstash), Upstash Redis creado y verificado. URL: https://ftc-stats--ironlion-scouting.us-central1.hosted.app. Decisiones #42-#44 (caché, identidad de datos, offline-first) desplegadas primero por urgencia del día final del evento. **Regla nueva del usuario**: NO desplegar sin OK explícito (memoria `feedback_no_deploy_sin_permiso`).
- **Rediseño visual "Modern technical"** (dirección guardada, ejecutada porque el Premier terminó y el usuario lo pidió): tokens violet/cyan, tipografía real (Geist/Archivo/Geist Mono — las fuentes del @theme nunca se cargaban), flat design, ~900 reemplazos a tokens en ~40 archivos. Toggle claro/oscuro funciona en toda la app por primera vez. Optimización móvil (master-detail scouting, tab bars scrolleables, link Estrategia). Decisiones #45-#46.
- **Análisis en vivo FPEMX**: OPR + Monte Carlo sobre datos reales para las 2 quals restantes de 30311; comparación competitiva vs FTC Scout/Orange Alliance/ftcstats/FTC Secrets (investigación con fuentes primarias).
- **Alianzas de 3 robots** (Championship/Premier §15.3, semántica "mejor par" — solo 2 de 3 juegan): auto-detección desde `fetchAlliances`, toggle en simulador. FPEMX resultó 6 alianzas de 2. Decisión #47.
- **Calendario híbrido + predicción de matches + análisis explicable + rebrand a PRIDE**. Decisión #49.
- **Draft en vivo + asesor de invitación** (inferencia de scouting rival vía T702). Decisión #50.
- **Corrección de semántica de fouls del API** (estaba invertida en medio código — `scoreXFoul` = cometidos, no recibidos) + capa de realidad del bracket (falla por robot, foul points, resultados reales, import API) + bracket en bandas upper/lower. Decisión #48.
- **Validación**: modelo acertó 9/10 ganadores de playoffs reales de FPEMX; único upset fue de 30311. Ver decisiones.md "Validación del modelo contra FPEMX".
- **Estado**: rama `feat/oracle-alliance_maker-260210`, 224 tests verdes, tsc/lint limpios. Todo commiteado y desplegado a producción.

## Sesión 16 — 2026-07-28 · Rediseño Nightshift, reporte 30311, validación masiva del Oracle

Sesión larga (22 commits, todos pusheados a `feat/oracle-alliance_maker-260210`; **producción NO actualizada** — el último rollout es de la sesión 15).

**Diseño.** Investigación de dirección visual → prototipo interactivo con 3 direcciones → Héctor eligió **C "Nightshift"** (dark-first, chartreuse `#c4f135` + cobalto, Space Grotesk + JetBrains Mono). Implementado por tokens (cero reescritura de componentes), con script anti-FOUC, default oscuro, focus-glow, View Transitions en tabs y el scanline de firma en el match "Próximo". Prototipos versionados en `docs/design/`.

**Reporte 30311 (`/team/30311`).** Retrospectiva grado-sponsor con datos citados de FTCScout: arco de OPR, percentiles mundiales, cohortes rookie nacional/internacional (único rookie mexicano con Inspire; top 2.7% mundial), tarjetas de evento enriquecidas con rol de playoffs + avance + premios (arreglado el Reach Award faltante usando el endpoint por-evento). Correcciones pedidas por Héctor: "torneo debut", tabla de México aclarada como tier veterano (no ranking nacional), "Resultados por evento".

**Validación masiva del Oracle (decisiones #51-#59).** Backtests con metodología uniforme: Houston 2025 por división (65.5%), 7 Premier Events (69.9%), Into The Deep, y luego el **script reanudable `scripts/oracle-backtest.mjs`** sobre **7 temporadas / 2,793 eventos / 21,436 matches de playoffs de todas las regiones**. Constante ~76% con calibración a <3pp siempre; PowerPlay 2022 outlier por meta defensivo; jerarquía estable regional > Premier > Worlds > Finals. Contrafactual de 30311 en Worlds/Premiers (#58).

**Mejoras derivadas.** (1) Explicación determinística del "¿por qué este partner?" en Oracle — sin LLM, offline-safe. (2) Reenfoque de la IA: fuera el "AI Analysis" redundante, el chat ahora sintetiza **notas de scouting** (lo único que el motor no puede fusionar) + botón "Notas IA" en Pro Scouting. (3) **Consola superadmin** `/admin` (config runtime en Firestore, secretos solo como estado, raíz de confianza `SUPERADMIN_EMAILS`). (4) Columna **schedule strength**. (5) **σ de playoffs 2.4×** aprendida de 10,800 matches (log-loss −27%, decisión #59). (6) **Selector de eventos** (#60) con 1,213 perfiles históricos.

**Visión.** `docs/VISION-PRIDE.md`: PRIDE como proyecto insignia para premios FTC/FRC — 8 territorios, 3 horizontes, matriz de premios. La base FRC ya existe en el repo (~2-3 semanas a paridad).

---

## Sesión 17 — 29 jul 2026 · Cierre del backlog de análisis + dos despliegues

Sesión larga de ejecución sobre el backlog acumulado. **Producción quedó al día** (dos rollouts autorizados explícitamente por Héctor: uno al inicio con lo de la sesión 16, otro al cierre con 12 commits nuevos).

**Deuda técnica cerrada** (#10-#16 de PENDING): `pro-scouting.ts` (NaN en consistency + join que nunca empataba + un tercer bug en el lookup de `scoreBreakdown`), server actions que fallaban abierto sin firebase-admin, `fetchTeam` cacheando `null`, **ground-truth idempotente** (marcador `ground_truth_runs` + WriteBatch atómico, #63), **dead-letter visible** en la cola offline con export JSON, **pit scouting con cola offline** (tabla Dexie v2, migración probada), renombre `FTC_DecodeForm`.

**Rendimiento (#65).** El diagnóstico que llevaba meses en PENDING era incorrecto: no era dónde se monta `AuthProvider` sino que `Sidebar → InviteGenerator → lib/orgs → lib/firebase` metía el SDK en el chunk de toda página pública. Trazando el grafo de imports estáticos: `/event` de 1271 a 762 KB y Firebase fuera de las 4 rutas públicas. Después `/` bajó a 677 KB al sacar Dexie del critical path (#67).

**Offline en `/event` (#67).** Antes mostraba "Event Not Found" cuando la API no respondía. Verificado end-to-end simulando la API caída.

**Análisis nuevos.** Tracker de consistencia (#61, la dispersión de 30311 es **crecimiento** r²=0.77, no volatilidad; el driver de volatilidad real es teleop, no auto), **página pública `/oracle`** (#69, cifras recomputadas desde la data cruda + diagrama de fiabilidad que muestra el modelo original sobreconfiado junto al corregido), **curvas de crecimiento** (#71, 30311 en percentil 79.2 como rookie = donde el programa mexicano típico llega en su 6ª temporada, con control de sesgo de supervivencia), **ciencia del draft** (#72, 606 eventos: a igualdad de seed, el decil alto de OPR sube la selección de 50% a 94%), **consDiff integrado** (#73).

**Tres cosas documentadas que resultaron falsas.** (1) El `−0.13` de consDiff en la decisión #59 era un **bug de convergencia** del fit — el valor real es −0.696, 5× mayor; corregido el fit y la decisión. (2) `useSavePitScouting` era **código muerto**; un comentario en otro archivo afirmaba lo contrario. (3) El detector de meta defensivo se **descartó tras falsificar su premisa** (#70): la σ por evento ya absorbe la dificultad y todas las brechas son negativas, así que ensancharla habría empeorado la calibración. Power Play fue la temporada **mejor calibrada** de las siete.

**Método.** Probar la premisa antes que la implementación se pagó tres veces. Y dos falsos negativos propios al medir bundles cruzando contra `.next/` local — App Hosting reconstruye en la nube, hay que descargar los chunks reales.

307 tests (era 242 al abrir). Scripts nuevos reutilizables: `oracle-noise-analysis.mjs`, `growth-curves.mjs`, `draft-science.mjs`, `draft-analysis.mjs`.

---

## Sesión 18 — 29 jul 2026 · Estrategia de producto: benchmark, modelo de apertura y la inversión del scouting

Sesión sin código de producción. El entregable es `docs/ESTRATEGIA-PRODUCTO-Y-APERTURA.md` (6 partes) y las decisiones #74–#77. Tres agentes en paralelo (mapa de arquitectura de información, cacería de funcionalidad muerta, benchmark competitivo) más análisis propio de la parte de negocio.

### El hallazgo que reordenó todo

Se preguntó si convenía cobrar suscripción. **La respuesta no es cultural, es contractual**: la API de FIRST prohíbe expresamente el uso comercial ("There can be no financial gain from acquiring an access token"). Verificado directamente en la fuente, no vía agente. PRIDE está construida sobre esos datos, así que cualquier suscripción choca de frente. La misma página exige una **atribución con enlace de retorno que la app no tiene** y lleva sin tener desde el despliegue del 25 jul.

### La apertura no era el dilema que parecía

La premisa "si abro la app pierdo competitividad" resultó parcialmente falsa. De cinco capas de ventaja, solo una es genuinamente rival (los datos de scouting); operar la red tiene **rendimientos crecientes**. La inversión clave: **el problema no es de secreto, es de escasez** — 2-4 scouts no cubren 40 equipos, y cada equipo que entra multiplica la cobertura propia.

Pero el gate no existía. `firestore.rules` tiene `allow read: if isAuthed()` para `match_scouting` y `pit_scouting`, con un TODO sin cerrar que lo admite, y `pit_scouting` mezcla notas privadas con el resumen público **en el mismo documento** (las reglas de Firestore no pueden enmascarar campos). Login Google sin allowlist. **La decisión de abrir ya estaba medio tomada, en la dirección equivocada.**

### La inversión del primitivo (propuesta de Héctor)

De "scouteo a otros y comparto observaciones" a **"reporto sobre mí y comparto eso"**. Colapsa el costo de cobertura de 20 scouts a 2 y disuelve la objeción de privacidad documentada en Chief Delphi.

Su problema central es que el autorreporte es *cheap talk* — todos tienen incentivo a verse pickeable. **PRIDE ya tiene el antídoto y probablemente es la única del ecosistema que lo tiene**: `ground-truth-validation.ts` contrasta contra el puntaje oficial, que es infalsificable. De ahí salieron la taxonomía de qué se puede autorreportar (criterio: ¿verificable contra el score?), la defensa contra la omisión (el calendario da un **denominador conocido** → gatear por cobertura %, no por volumen), y la regla de que el autorreporte **agrega una fuente en lugar de reemplazar** — para lo cual el blend bayesiano de `projections.ts` ya sirve tal cual.

### Lo que dijo el benchmark

El ecosistema está partido en tres capas que casi nunca se cruzan (datos / captura / modelo) y **ninguna herramienta las combina**. Huecos confirmados: **ningún tool de FTC predice partidos con probabilidad**; nadie en FTC publica calibración (y en FRC solo Statbotics, congelado desde 2023); **offline-first es la queja #1 de la comunidad** y las soluciones reales son USBs con corredores humanos; y todo el ecosistema tiene bus factor de 1 (TBA opera con ~$5,000/año pidiendo ayuda en público).

Dos suposiciones nuestras cayeron: **sí existe producto de pago en FTC** (FTC Tracker Pro, $1.99/mes) y **sí existe app FTC en español** (la misma). Y un usuario de Chief Delphi escribió, sin saberlo, la especificación de PRIDE: *"ease of linking data sets together between many scouters even on different teams"*.

### Deuda encontrada

`app/scouting/page.tsx:20-51` sirve **OPRs fabricados atribuidos a equipos mexicanos reales** (Cerbotics, PrepaTec LamBot, Botbusters) cuando se activa el toggle FRC. El motor de juego declarativo (~600 loc, testeado) sigue sin importarse y su ventana se cierra en ~6 semanas, cuando se anuncie el juego 2026-27. `docs/architecture/game-schema-migration.md` se cita 3 veces y nunca se escribió. `lib/tba-api.ts` y `lib/frc-alliance-utils.ts` no los importa nadie. `lead` y `admin` son indistinguibles: ningún check en el repo los separa.

### Método

Los tres agentes corrieron **solo-lectura y en paralelo**, con instrucción explícita de no ejecutar ningún git que cambiara estado — la lección de la sesión 17 se aplicó desde el arranque. Los hechos con consecuencia (la cláusula de la API, los datos FRC falsos, las reglas de Firestore, la falta de atribución) se verificaron de primera mano antes de escribirlos, no se tomaron del reporte del agente.

## Sesión 19 — 29 jul 2026 · Los tres bloqueantes + el barrido i18n con Sonnet + Trading Card

Sesión de ejecución sobre el plan de la sesión 18. Cinco commits en `feat/oracle-alliance_maker-260210`, todos verificados (typecheck 0, lint 0, tests, build de producción). **Nada desplegado** — política de no-deploy sin OK de Héctor.

### 1. Gate de lectura de Firestore — Fase 1 (`6acd300`, decisión #78)

El primer bloqueante de la apertura. `match_scouting` y `pit_scouting` tenían `allow read: if isAuthed()` → cualquier autenticado leía el scouting de toda org, **incluidas las notas privadas de pit** (que comparten doc con el `publicSummary`, y las reglas no enmascaran campos). Se resolvió con **lockdown a org propia**: la regla exige `resource.data.orgId == myOrgId()` y cada query añade `where("orgId","==", miOrg)`.

El hallazgo que forzó el diseño: **las reglas de Firestore no son filtros** — una query de lista se rechaza entera si algún doc no pasa, así que no cabe "lo mío + lo objetivo de otros" en una query cuando la regla ramifica sobre un campo por-doc. Por eso se partió en Fase 1 (lockdown, ahora) y **Fase 2** (federación selectiva: marcador de participación, split pit público/privado, super scouting en colección aparte — con la primera invitación, cuando haya 2 orgs para probarla). Guarda `resource == null` (para el existence-probe de create y el fallback de `getPitScouting`) + rama legacy para docs pre-1.4. Requiere `firebase deploy --only firestore:rules,firestore:indexes` + test dev cross-org antes de aplicar.

### 2. Motor de juego declarativo — cutover FTC (`49f4a79`, decisión #79)

El plan registrado ("cambiar un import de `FTC_DecodeForm` a `DynamicGameForm`") **era imposible**: `DynamicGameForm` es solo el render de inputs; faltaba el wrapper (useForm + mapeo + guardado + lista). Se construyó `GameScoutingForm` + `lib/games/build-entry.ts`. La trampa de paridad: el form hardcodeado *derivaba* `autoParked` de `endgameBaseParking` y lo persistía, y la agregación lo lee → se añadió el contrato **`toEntry`** a `GameDefinition`. Tests de paridad prueban que `buildEntryGameFields` produce la entrada **idéntica** al form viejo. `docs/architecture/game-schema-migration.md` **escrito** (citado 3×, nunca existía). Cutover en vivo porque la temporada DECODE ya terminó (sin scouts que interrumpir). Septiembre 2026 = escribir un archivo de definición.

### 3–4. i18n: andamiaje + barrido de 8 módulos (`fccdd1b` + `cfe93c6`, decisión #80)

`next-intl` **cookie-based, sin routing de URL** (se descartó el prefijo `/en /es` por superficie/riesgo). Andamiaje en `i18n/`, plugin en `next.config`, provider + `<html lang>`, `LocaleSwitcher` en el sidebar. El **patrón de capa de análisis** (claves+params, no prosa) probado en `draft-odds.ts` (`basis` → `DraftBasis` discriminado). Luego **2 agentes Sonnet en paralelo** barrieron 7 módulos más (consistency, event-selector, projections, alliance-utils, briefings/briefing-data, reports/growth-curves, reports/team-30311-decode).

**Método de delegación:** conjuntos de archivos **disjuntos** por agente (sin consumidor compartido), y prohibición de tocar `messages/*.json` — devolvían el JSON del namespace, yo lo fusioné con un script node (paridad en/es verificada). Así, cero colisiones en el árbol compartido. Verifiqué de forma autoritativa con el código de ambos + mi catálogo juntos (build real resuelve mensajes). Los casos **no mecánicos** (Zod de `schemas/scouting`, labels-como-data de `games/ftc-decode-2025`) se reservaron para el modelo principal — patrón nuevo, no barrido. `constants` no tiene nada (nombres propios de eventos).

### 5. Benchmark WikiScout + Trading Card V1 (`e80a357`, decisión #81)

Héctor mandó 11 capturas de **WikiScout** (competidor directo, logueado como 30311 en el mismo México Premier Event). Hallazgo estratégico: su "Trading Card" **es** el autorreporte federado (#76) ya en producción, **pero sin ancla de ground-truth** (cheap talk; sus stats salen vacías sin captura manual). Valida la dirección y afila el foso.

Se construyó **Trading Card V1** en `/card`: editor de autodescripción del propio equipo (capacidades, rangos de puntos, descripciones, foto por URL) → colección `team_profiles` (era stub de reglas sin usar; **pública, write solo a tu equipo**, distinta de pit que es privado por-org). El diferenciador ya presente: la carta muestra los rangos autorreportados **junto a** rank/récord/puntos **medidos** de la FIRST API. i18n desde el inicio. Fase 2: vista pública de otras cartas + reconciliación formal contra ground-truth + OPR/SoS medidos + subida real de foto.

Otras ideas del benchmark anotadas en PENDING (no arrancadas): home "Hoy" + des-hardcodear 30311; rankings tri-columna + tag "UNLUCKY"; scouts nombrados bajo la org; Custom Questions.

### Pendientes al cierre

- **Acción de usuario:** deploy de reglas+índices de Firestore + test cross-org; validar el camino declarativo del motor en un evento en vivo (luego borrar `FTC_DecodeForm`).
- **i18n restante:** mensajes de error/validación (Zod de scouting, invite-redemption, orgs) como categoría de patrón nuevo; labels del motor de juego; grueso de strings de UI (incremental). Regla activa: ningún string nuevo hardcodeado.
- **Trading Card Fase 2** y las demás ideas WikiScout.
