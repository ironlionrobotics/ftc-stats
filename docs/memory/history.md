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
