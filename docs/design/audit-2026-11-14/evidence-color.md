# Evidencia de color: PRIDE (14-nov-2026, rama etapa1/foundations, a1fd7ff)

Solo hechos con archivo:línea. Sin puntuaciones ni propuestas de rediseño.

## Sources consulted

- `app/globals.css` (313 líneas, completo) y `docs/design/audit-2026-11-14/00-scope.md`.
- grep sobre 244 archivos `.ts`/`.tsx` de `app/`, `components/`, `lib/` (se excluyen `*.test.*`, `*.spec.*`, `__tests__`).
- Lectura de contexto en: `MatchList.tsx`, `RankingTable.tsx`, `StatsTable.tsx`, `PicklistEditor.tsx`, `MatchBriefingCard.tsx`, `QRExport.tsx`, `QRScanner.tsx`, `ConfirmDialog.tsx`, `Tooltip.tsx`, `TodayPanel.tsx`, `ComparisonView.tsx`, `TournamentSimulator.tsx`, `lib/stores/theme-store.ts`.
- Contrastes calculados con la fórmula WCAG 2.x sobre los hex de globals.css.
- No se corrió build, servidor ni agentes.

---

## Finding 1. Token map (`app/globals.css`)

Cabecera de la dirección "Transmisión": líneas 3-15. Dice que "los ÚNICOS colores son el rojo y el azul de alianza (más success/warning)", que `primary` es tinta neutra y que "nunca hardcodear slate/white/black en componentes".

| Token | Claro (`:root`) | Oscuro (`.dark`) | Líneas |
|---|---|---|---|
| background | #f2f3f5 | #07080a | 19 / 44 |
| foreground | #0c0e12 | #f3f4f6 | 20 / 45 |
| card | #ffffff | #101217 | 21 / 46 |
| card-foreground | #0c0e12 | #f3f4f6 | 22 / 47 |
| muted | #e8eaee | #181b22 | 23 / 48 |
| muted-foreground | #5d6370 | #8b92a1 | 24 / 49 |
| border (input = border, l.99) | #d5d9e0 | #222731 | 25 / 50 |
| primary (tinta) | #0c0e12 | #f3f4f6 | 27 / 52 |
| primary-foreground | #ffffff | #07080a | 28 / 53 |
| **secondary** | **#2457d6** (= alliance-blue) | **#4d7dff** (= alliance-blue) | 29 / 54 |
| secondary-foreground | #ffffff | #ffffff | 30 / 55 |
| **accent** | **#2457d6** | **#4d7dff** | 31 / 56 |
| accent-foreground | #ffffff | #ffffff | 32 / 57 |
| alliance-red | #d6303a | #ff4d57 | 34 / 59 |
| alliance-blue | #2457d6 | #4d7dff | 35 / 60 |
| success | #13804a | #3ccf7e | 37 / 62 |
| warning | #a5680a | #f0b429 | 38 / 63 |
| **danger** | **#d6303a** (= alliance-red) | **#ff4d57** (= alliance-red) | 39 / 64 |

- Los tokens se re-exponen a Tailwind en `@theme` (líneas 72-99).
- Tema por clase `.dark` en `<html>` (`lib/stores/theme-store.ts:32,63`).
- No hay `@custom-variant dark` en `app/globals.css` ni en `app/layout.tsx` (grep sin resultados).

Utilidades, keyframes y overrides que aplican color:

| Elemento | Línea | Color que usa |
|---|---|---|
| `body` | 104-105 | background / foreground |
| `:focus-visible` outline | 132-135 | `--color-primary` |
| `.glass` | 144-145 | card / border |
| `.glass-card` | 150-151 | card / border |
| `.text-gradient` | ~157 | `from-primary to-secondary` (0 usos en TSX) |
| `.bg-grid` | 162-163 | border (1 uso: `app/events/page.tsx:75`) |
| `.live-scanline::before` | 185 | gradiente con `--color-primary` (1 uso: `MatchList.tsx:1056`) |
| `@keyframes live-scan` | 188-191 | solo transform |
| `.custom-scrollbar` | 202, 209 | border |
| `.text-white` | 220-222 | `color: var(--color-foreground) !important` |
| Excepción del anterior | 225-233 | `.bg-primary/.bg-secondary` y `[class*=bg-orange-6/blue-6/purple-6/green-6/yellow-5/red-6]` con `.text-white` vuelven a `primary-foreground` |
| `.text-gray-200/300`, `gray-400/500`, `slate-400/500`, `slate-800/900` | 240-255 | remapeados a foreground / muted-foreground, `!important` |
| `.border-white/10`, `white/5`, `slate-100/200` | 257-262 | border, `!important` |
| `.bg-white/5`, `white/10`, `black/20`, `slate-50/100` | 264-269 | muted, `!important` |
| `.bg-white`, `.md:bg-white/5`, `.bg-background` | 273-279, 236 | card / muted / background, `!important` |
| `@media print` | 290-313 | `body` fondo blanco y texto negro `!important` |

Hecho derivado: `.text-white` se fuerza a foreground con `!important`. Por tanto `text-white` sobre `bg-danger` o sobre el fondo inline `var(--color-alliance-*)` no sale blanco: sale #0c0e12 en claro y #f3f4f6 en oscuro. Afecta a `app/page.tsx:224`, `components/home/FollowingPanel.tsx:66`, `components/event/PredictionLedger.tsx:33`, `components/shell/AppShell.tsx:388`, `components/ui/ConfirmDialog.tsx:103`. La excepción de las líneas 225-233 no incluye `bg-danger`.

---

## Finding 2. Conteos de uso de clases semánticas

Cuenta por ocurrencia de clase (`bg|text|border|ring|fill|stroke|from|to|via|outline|divide|shadow|decoration|accent|caret|placeholder` + token, con o sin `/N`). Tests excluidos.

| Familia | Ocurrencias | Archivos | Top archivos (conteo) |
|---|---|---|---|
| primary | 592 | 76 | FTC_DecodeForm 35, MatchList 33, TeamSeasonReport 26, SuperScoutingForm 25, LiveDraftBoard 20 |
| secondary | 283 | 35 | MatchList 34, AlliancePredictor 30, TournamentSimulator 26, FRC_ReefscapeForm 24, AssistantChat 17, team/[teamNumber]/page 16 |
| accent | 10 | 2 | AllianceSelector 5, team/[teamNumber]/page 5 |
| danger | 245 | 47 | MatchList 38, MatchSimulator 16, AlliancePredictor 15, SuperScoutingForm 13, TournamentSimulator 13 |
| warning | 181 | 42 | ConsistencyTracker 14, ScoutingForm 11, PitQuestionnaire 10, MatchList 10, ComparisonView 10 |
| success | 170 | 37 | ScoutingForm 18, PitQuestionnaire 16, AdvancementList 13, PicklistEditor 12, ConsistencyTracker 9 |
| **alliance-red / alliance-blue (como clase)** | **0** | **0** | no existe ninguna clase `*-alliance-red` ni `*-alliance-blue` |
| muted (incl. muted-foreground) | 1229 | no medido | TournamentSimulator 70, MatchList 47, AlliancePredictor 47 |
| foreground | 442 | no medido | TournamentSimulator 26, StatsTable 22, LiveDraftBoard 22 |
| border | 574 | no medido | LendingClient 33, TournamentSimulator 31, AlliancePredictor 28 |
| card | 160 | no medido | AlliancePredictor 16, TournamentSimulator 15 |
| background | 53 | no medido | LendingClient 12, EventFilter 9 |

Desglose por prefijo de los tokens de color (total 1481): text-primary 247, bg-primary 202, text-danger 125, text-secondary 121, bg-secondary 96, text-success 91, text-warning 86, border-primary 86, bg-danger 76, bg-warning 50, bg-success 48, border-warning 40, border-secondary 39, border-danger 38, ring-primary 28, border-success 26, from-primary 14, ring-secondary 12, to-secondary 10, bg-accent 4, text-accent 3.

Uso vía `var(--color-*)` en `style`/SVG:

| Token | Ocurrencias | Archivos |
|---|---|---|
| alliance-red | 8 | PredictionLedger 3, FollowingPanel 2, ProgressChart 1, ScoutBoard 1, app/page.tsx 1 |
| alliance-blue | 8 | mismos archivos y mismo reparto |
| primary | 12 | TeamSeasonReport 4, GrowthCurve 4, ConsistencyTracker 3, ProgressChart 1 |
| secondary | 5 | GrowthCurve 5 |
| success / danger | 7 / 6 | ConsistencyTracker, oracle/page.tsx |
| warning | 0 | n/a |
| muted-foreground | 18 | oracle 6, GrowthCurve 5, ProgressChart 3 |

Hecho clave: `alliance-red` y `alliance-blue` solo se usan en 5 archivos, vía `var()` en estilos inline (`app/page.tsx:225`, `components/event/PredictionLedger.tsx:34,61,65,68,69`, `components/home/FollowingPanel.tsx:67,109,111`, `components/scouting/ScoutBoard.tsx:117`, `components/workshop/ProgressChart.tsx:29,30`). En el resto de la app, el rojo y el azul de alianza se pintan con `danger` y `secondary` (Finding 4).

### Variantes de opacidad (clases de tokens de color): 691 ocurrencias

Top archivos: MatchList 43, AlliancePredictor 30, PicklistEditor 29, LiveDraftBoard 28, TeamSeasonReport 27, SuperScoutingForm 27, team/[teamNumber]/page 27, ConsistencyTracker 25, ScoutingForm 24.

| Variante | Conteo | Variante | Conteo |
|---|---|---|---|
| primary/10 | 53 | warning/20 | 24 |
| primary/20 | 47 | primary/90 | 24 |
| secondary/10 | 39 | danger/20 | 23 |
| danger/10 | 35 | warning/10 | 22 |
| secondary/20 | 29 | primary/5 | 21 |
| muted/50 | 27 | warning/30 | 18 |
| primary/30 | 25 | danger/30 | 18 |
| secondary/30 | 17 | success/30 | 16 |

`primary/10`, `/20`, `/30` suman 125 ocurrencias.

---

## Finding 3. Colores hardcodeados

### 3a. Clases de paleta Tailwind (`red-`, `blue-`, ..., `white`, `black`)

Total 125 ocurrencias en 26 archivos. Por familia: white 37, gray 27, slate 17, red 10, black 10, blue 9, purple 5, indigo 3, amber 3, green 2, emerald 2.

| Archivo | Conteo | Nota |
|---|---|---|
| `components/strategy/MatchBriefingCard.tsx` | 35 | hoja imprimible, deliberado (Finding 8) |
| `app/event/[eventCode]/pro/page.tsx` | 13 | blue/purple/amber/slate claros (l.26-52) |
| `components/analytics/AlliancePredictor.tsx` | 11 | `bg-slate-800 text-white` (l.447, 464, 475, 523, 586, 595) |
| `components/StatsTable.tsx` | 8 | l.95, 104, 224-228 |
| `components/scouting/SourceBadge.tsx` | 8 | popover `bg-slate-900`, gray-300/400/500 (l.201-225) |
| `components/scouting/QRScanner.tsx` | 8 | overlay de cámara (l.60-79) |
| `components/strategy/AllianceSelector.tsx` | 6 | l.263 `from-indigo-600 to-purple-600` |
| `components/ui/Tooltip.tsx` | 4 | l.32, 35 |
| `components/card/MediaGallery.tsx` | 4 | scrim negro (l.169, 179, 239) |
| `components/analytics/TournamentSimulator.tsx` | 4 | l.705 emerald/red |
| `components/ui/ConfirmDialog.tsx` | 3 | l.67, 70, 103 |
| `components/scouting/QRExport.tsx` | 3 | l.24, 27 |
| otros 14 archivos | 1-2 c/u | mayormente `text-white` |

Ejemplos archivo:línea (30):

1. `components/strategy/AllianceSelector.tsx:263` `bg-gradient-to-r from-indigo-600 to-purple-600 ... shadow-indigo-500/20`.
2. `components/StatsTable.tsx:224` `text-green-600 dark:text-green-500` (victorias).
3. `components/StatsTable.tsx:226` `text-red-600 dark:text-red-500` (derrotas).
4. `components/StatsTable.tsx:228` `text-blue-600 dark:text-blue-500` (empates).
5. `components/analytics/TournamentSimulator.tsx:705` `text-emerald-600 dark:text-emerald-400` / `text-red-600 dark:text-red-400` (promedio positivo/negativo).
6. `components/analytics/TournamentSimulator.tsx:760,763,778,805` hex `#cbd5e1`, `#3b82f6`, `#e2e8f0` en SVG del bracket.
7. `components/analytics/ComparisonView.tsx:87-117` 13 literales hex/rgba (Finding 5).
8. `app/event/[eventCode]/pro/page.tsx:26` `bg-blue-100 text-blue-700 border-blue-200`.
9. `app/event/[eventCode]/pro/page.tsx:29` `bg-purple-100 text-purple-700 border-purple-200`.
10. `app/event/[eventCode]/pro/page.tsx:42` `bg-amber-50 border-amber-100 text-amber-800`.
11. `app/event/[eventCode]/pro/page.tsx:33,36,38,52` `text-slate-900/500/700/400`.
12. `app/event/[eventCode]/page.tsx:88` `bg-red-500/10`.
13. `app/analytics/page.tsx:43` `bg-white/5 border-white/10`.
14. `components/analytics/AlliancePredictor.tsx:447,464,475,586,595` `bg-slate-800 text-white`.
15. `components/ui/Tooltip.tsx:32` `bg-slate-800 text-white border-white/10`; l.35 `fill-slate-800`.
16. `components/scouting/SourceBadge.tsx:201` `bg-slate-900 border-white/10`.
17. `components/scouting/SourceBadge.tsx:202,203,214,222,225` `bg-white`, `text-gray-400/500/300`.
18. `components/scouting/QRScanner.tsx:60` `bg-slate-900/90`; l.67 `bg-slate-800`; l.70 `bg-black/60`; l.79 `text-slate-300`.
19. `components/scouting/QRExport.tsx:24,27` `bg-white`, `border-slate-100`.
20. `components/scouting/ProScoutingDashboard.tsx:96` `bg-slate-900/50`.
21. `components/card/MediaGallery.tsx:169,179,239` `bg-black/50`, `bg-black/80`, `bg-black`.
22. `components/auth/OnboardingModal.tsx:137` `bg-black/80`.
23. `components/shell/AppShell.tsx:241` `bg-black/60`; l.388 `text-white` sobre `bg-danger`.
24. `components/ui/ConfirmDialog.tsx:67,70,103`.
25. `components/strategy/MatchBriefingCard.tsx:262` `bg-white text-black`.
26. `components/strategy/MatchBriefingCard.tsx:293,295,296,298` `text-red-600`, `bg-red-500`, `bg-blue-500`, `text-blue-600`.
27. `components/strategy/MatchBriefingCard.tsx:372` `text-red-600 border-red-600` / `text-blue-600 border-blue-600`.
28. `components/strategy/MatchBriefingCard.tsx:405` `text-red-600 font-bold` (banderas de riesgo, no alianza).
29. `components/scouting/games/FRC_ReefscapeForm.tsx:261,280` `text-white` (l.261 sobre `bg-danger`).
30. `text-white` bajo el override global: `app/page.tsx:224`, `FollowingPanel.tsx:66`, `PredictionLedger.tsx:33`, `EventStats.tsx:31`, `MatchList.tsx:691`, `team/[teamNumber]/page.tsx:243,268`, `ScoutingForm.tsx:162`, `PitQuestionnaire.tsx:136`.

### 3b. Literales hex/rgb/hsl/oklch (en comillas)

23 literales en 4 archivos de TSX:

| Archivo | Conteo | Líneas / valores |
|---|---|---|
| `components/analytics/ComparisonView.tsx` | 13 | l.87, 109 `#333`; l.88-89, 110-111 `#888`; l.91, 113 `#0f172a`, `#334155`, `#fff`; l.92, 114 `rgba(255,255,255,0.05)`; l.95 `#8b5cf6`; l.96 `#10b981`; l.117 `#f59e0b` |
| `components/analytics/TournamentSimulator.tsx` | 4 | l.760 `#cbd5e1`; l.763 `#3b82f6`; l.778 `#3b82f6` / `#e2e8f0`; l.805 `#cbd5e1` |
| `app/global-error.tsx` | 4 | l.16 `#07080a`/`#f3f4f6`; l.19, 22 `#8b92a1`; l.23 `#f3f4f6`/`#07080a` (iguales a tokens oscuros; la pantalla no depende del CSS) |
| `app/layout.tsx` | 2 | l.51 `mask-icon color #0a0a0a`; l.63 `themeColor #07080a` (solo oscuro; sin variante clara) |

No hay `oklch`, `hsl` ni `color-mix` en TSX/TS. `lib/` no contiene clases de color.

Props con nombre de color como cadena: `color="red"|"blue"` en `MatchBriefingCard.tsx:305,310,367` y `MatchSimulator.tsx:124,136,278`; `color: "purple"|"green"` en `lib/games/ftc-biobuzz-2026.ts:48,57,82,91,131`, `ftc-decode-2025.ts:45,53,69,77`, `lib/team-profile/general-questions.ts:58,60`, que `components/scouting/games/DynamicGameForm.tsx:68-69,164-165` y `FTC_DecodeForm.tsx:485` mapean a `text-primary` (purple) y `text-success` (green).

---

## Finding 4. Conflictos semánticos

Clasificación automática (heurística): línea con clase `secondary|accent` o `danger` y sin las palabras blue/red/alliance/isRed/isBlue en ±2 líneas se marca "sin contexto de alianza". Cuenta por línea, no por ocurrencia.

| Token | Líneas con el token | Con contexto de alianza | Sin contexto de alianza |
|---|---|---|---|
| secondary / accent (= azul de alianza) | 183 | 34 | 149 |
| danger (= rojo de alianza) | 155 | 30 | 125 |

La heurística tiene falsos negativos: p. ej. `MatchList.tsx:761,764,993,998,1022,1033` son del lado rojo y quedan en "sin contexto".

### 4a. `secondary`/`accent` (azul de alianza) usado para algo que no es la alianza azul

**CTA / botón primario**

- `components/scouting/MatchScoutingForm.tsx:150` botón guardar `bg-secondary text-secondary-foreground`.
- `components/analytics/TournamentSimulator.tsx:366` botón principal.
- `components/ai/AssistantChat.tsx:213,225` envío y FAB; l.175 burbuja del usuario.
- `components/scouting/games/FRC_ReefscapeForm.tsx:172` contador `bg-secondary text-secondary-foreground`.
- `components/strategy/AllianceSelector.tsx:107` `bg-accent` (botón de orden activo).
- `components/OnlineSync.tsx:367,387,429` botones `bg-secondary/20 text-secondary`.
- `components/event/EventViewManager.tsx:385`.

**Enlace / texto accionable**

- `app/oracle/page.tsx:235` enlace `text-secondary hover:underline`.
- `components/team/TeamSeasonReport.tsx:269` enlaces externos.
- `components/analytics/TournamentSimulator.tsx:512`.

**Estado de selección / pestaña activa / foco**

- `components/StatsTable.tsx:104` pestaña activa `bg-secondary`; l.129 filtro activo; l.133 estrella `fill-secondary`.
- `components/analytics/AlliancePredictor.tsx:361` modo activo `text-secondary`.
- `components/analytics/TournamentSimulator.tsx:320` selección `border-secondary`.
- `components/scouting/TeamList.tsx:48,79` equipo seleccionado.
- `components/scouting/PitQuestionnaire.tsx:128` y `ScoutingForm.tsx:150`: insignia "nuevo" en `secondary`, "editando" en `success`.
- Anillos de foco: `ProScoutingDashboard.tsx:138,145`, `TournamentSimulator.tsx:440,456`, `AlliancePredictor.tsx:409`, `AssistantChat.tsx:207`.

**Estado / información**

- `components/ui/Tip.tsx:39,44` variante `info` = secondary.
- `components/team/ConsistencyTracker.tsx:48` etiqueta "estable"; l.427.
- `components/scouting/TeamAnalysisCard.tsx:46` rango de consistencia `bg-secondary/15`.
- `components/event/RankingTable.tsx:355` empates en `text-secondary`.
- `components/team/TeamSeasonReport.tsx:457` insignia "Championship".

**Visualización de datos de un equipo (no de una alianza)**

- `components/team/GrowthCurve.tsx:51-60,80-81` mediana de México, banda y puntos en `var(--color-secondary)`.
- `components/scouting/TeamAnalysisCard.tsx:97` barra de endgame.
- `components/team/TeamSeasonReport.tsx:354` barra de habilidad; l.133,206,403 columnas de OPR.
- `components/event/EventStats.tsx:206,219` tarjetas `from-secondary to-secondary/70`.
- `components/analytics/AlliancePredictor.tsx:36-37` `RP_COLORS = [success, primary, secondary]`.
- `components/strategy/AllianceSelector.tsx:139,141` métricas "Auto" en secondary y otra en accent.

**Decoración**

- Blobs/blur: `ScoutingClient.tsx:156`, `MatchScoutingForm.tsx:115`.
- Gradientes `from-primary/.. to-secondary/..`: `team/[teamNumber]/page.tsx:127,131`, `TradingCardPreview.tsx:70`, `TeamSeasonReport.tsx:33,241`, `AllianceSelector.tsx:233`.
- Puntos animados: `AssistantChat.tsx:188-190`, `MatchScoutingForm.tsx:125`, `MatchSimulator.tsx:178`.
- Iconos: `StatsTable.tsx:86`, `RankingTable.tsx:247`, `ConsistencyTracker.tsx:158`, `AlliancePredictor.tsx:330`.
- Rojo + tinta + azul como franja decorativa: `components/strategy/MatchSimulator.tsx:165` `from-danger via-primary to-secondary`.

**Categorías de lista con rojo/azul/verde que no son alianzas**: `components/strategy/PicklistEditor.tsx:401,431,453` `accent="emerald"` (Picklist), `"blue"` (Disponibles), `"red"` (No elegir); mapas en l.499-509 y l.734-737 (botones de icono: red = mover a DNP, blue = quitar de la lista).

### 4b. `danger` (rojo de alianza) usado para algo que no es la alianza roja

**Error / validación**

- Formularios: `ScoutingForm.tsx:246,275,332,357`, `SuperScoutingForm.tsx:199,280,300,305`, `FTC_DecodeForm.tsx:173,289`, `GameScoutingForm.tsx:181,191`, `PitQuestionnaire.tsx:153`.
- Errores de acción: `EventPoolTable.tsx:37`, `PoolPanel.tsx:56`, `HydrateAndCache.tsx:106`, `OnboardingModal.tsx:196,259`, `InviteGenerator.tsx:106`.

**Destructivo / eliminar**

- `ui/ConfirmDialog.tsx:105`, `shell/AppShell.tsx:325,363,369,376,378,388`, `lending/LendingClient.tsx:302`, `card/MediaGallery.tsx:194`, `workshop/WorkshopClient.tsx:219`, `admin/MediaReportsReview.tsx:52`, `AllianceSelector.tsx:270,298`, `MatchSimulator.tsx:345,354`, `TournamentSimulator.tsx:406,505`.

**"Perder" / valor negativo / malo**: ver Finding 6.

**Selección / modo de entrada**

- `FTC_DecodeForm.tsx:146`, `GameScoutingForm.tsx:155`, `FRC_ReefscapeForm.tsx:172`: modo "restar" del contador `bg-danger/20 text-danger`.
- `FRC_ReefscapeForm.tsx:261` calificación de defensa seleccionada `bg-danger text-white`.
- `SuperScoutingForm.tsx:270-271` respuesta "No" a "would pick"; l.386 `wouldPick` falso.
- `PicklistEditor.tsx:703` `line-through decoration-danger/50` (equipo descartado).
- `LiveDraftBoard.tsx:498,640,656` equipos fuera de playoffs.

**Estado en vivo / sistema**

- `home/TodayPanel.tsx:177-178` insignia "EN VIVO" `border-danger/30 bg-danger/10 text-danger` con punto `animate-pulse`.
- `OnlineSync.tsx:377,409` errores de sincronización.
- `auth/DiscordSettings.tsx:151,196`, `auth/GroundTruthValidator.tsx:123,164`.

**Datos**

- `analytics/CalibrationDashboard.tsx:239,246` fiabilidad success/warning/danger.
- `oracle/page.tsx:288,292,310` curva "original" en danger frente a "corregida" en success.
- `team/ConsistencyTracker.tsx:353-355,375` línea del "número público" en danger.
- `scouting/SourceBadge.tsx:249` `bg-danger` como nivel de fuente.

**Tarjeta roja del reglamento**: `event/MatchList.tsx:596` `redCard` → `bg-danger`.

### 4c. Uso CORRECTO de rojo/azul de alianza (a preservar)

Con los tokens de alianza:

- `app/page.tsx:224-225` caja de alianza.
- `components/home/FollowingPanel.tsx:67,109,111` puntaje del último partido.
- `components/event/PredictionLedger.tsx:34,61,65,68,69` barra de probabilidad rojo/azul.
- `components/scouting/ScoutBoard.tsx:117` borde izquierdo según alianza.
- `components/workshop/ProgressChart.tsx:29,30` series auto (azul) y teleop (rojo): aquí rojo/azul codifican fases, no alianzas.

Con `danger`/`secondary` (alianza representada con tokens de estado):

- `components/event/MatchList.tsx`: encabezados "Blue Alliance" l.481, 518, 774; puntajes l.601-610, 761-780, 799; barras de probabilidad l.993-999, 1022-1040; fondo de ganador l.678-698; anillo de equipo filtrado l.587-589.
- `components/strategy/MatchSimulator.tsx:152-165, 252-260, 292-297` paneles y barra rojo/azul.
- `components/strategy/MatchBriefingCard.tsx:184-185` `ring-danger/50` / `ring-secondary/50`.
- `components/analytics/TournamentSimulator.tsx:939-944, 1085, 1156-1159` ganador rojo y marcador `text-danger`–`text-secondary`.
- `components/event/EventStats.tsx:53` insignia de alianza `bg-danger/10` / `bg-secondary/10`.

Contraste entre alianzas (calculado): rojo vs azul 1.27:1 en claro (#d6303a vs #2457d6) y 1.13:1 en oscuro (#ff4d57 vs #4d7dff).

---

## Finding 5. Gráficas y data-viz

| Dónde | Tipo | Colores | Paleta |
|---|---|---|---|
| `components/analytics/ComparisonView.tsx:87-117` | Recharts barras | `#8b5cf6`, `#10b981`, `#f59e0b`; ejes `#888`; rejilla `#333`; tooltip `#0f172a` / `#334155` / `#fff` | Hex de paleta Tailwind (violet-500, emerald-500, amber-500, slate-900, slate-700); tooltip oscuro fijo |
| `components/workshop/ProgressChart.tsx:18-30` | Recharts líneas | rejilla `var(--color-border)`, ejes `var(--color-muted-foreground)`, auto `var(--color-alliance-blue)`, teleop `var(--color-alliance-red)` | Tokens |
| `app/oracle/page.tsx:270-311` | SVG a mano | rejilla border, texto muted-foreground, original `danger`, corregida `success` | Tokens |
| `components/team/TeamSeasonReport.tsx:307-324` | SVG a mano | línea y degradado `primary`, puntos `card`/`primary` | Tokens (tinta) |
| `components/team/ConsistencyTracker.tsx:339-375` | SVG a mano | línea `primary`, tendencia y banda `success`, número público `danger` | Tokens |
| `components/team/GrowthCurve.tsx:44-83` | SVG a mano | mediana/banda `secondary`, cohorte `muted-foreground`, Iron Lion `primary` | Tokens |
| `components/analytics/TournamentSimulator.tsx:760-805` | SVG (bracket) | `#cbd5e1`, `#3b82f6`, `#e2e8f0` | Hex (slate-300, blue-500, slate-200) |
| Barras `div` de probabilidad | HTML | `MatchList.tsx:998-999` danger/80 + secondary/80; `MatchSimulator.tsx:256-260`; `PredictionLedger.tsx:68-69` | Alianza |
| Barras de fiabilidad | HTML | `CalibrationDashboard.tsx:239` success/warning/danger | Semáforo |

Recharts solo se importa en 2 archivos (`ProgressChart.tsx`, `ComparisonView.tsx`). Canvas: solo `lib/team-media-service.ts:34` (`getContext("2d")` para procesar imágenes, sin color de UI); no hay `fillStyle`/`strokeStyle`.

---

## Finding 6. Colores de estado

Conteos: success 170, warning 181, danger 245 (Finding 2).

- **success** se usa para: guardado/copiado (`InviteGenerator.tsx:89`), victorias (`RankingTable.tsx:351`), avance (`AdvancementList.tsx`, 13), buena fiabilidad (`CalibrationDashboard.tsx:239,246`), "editando" (`PitQuestionnaire.tsx:128`, `ScoutingForm.tsx:150`), consenso de fuente (`SourceBadge.tsx:114`), probabilidad >= 0.85 (`TodayPanel.tsx:314`, `ConsistencyTracker.tsx:404`), tendencia (`ConsistencyTracker.tsx:349`), valor positivo (`MatchList.tsx:397`, `AlliancePredictor.tsx:472`), artefactos "green" del juego (`DynamicGameForm.tsx:69`, `FTC_DecodeForm.tsx:485`) y categoría "Picklist" (`PicklistEditor.tsx:401,499-509`).
- **warning** se usa para: pendiente/offline (`OnlineSync.tsx:427`), primer lugar (`RankingTable.tsx:303`), máximo de columna (`RankingTable.tsx:79`), premios (`TeamSeasonReport.tsx:140`), victoria de un equipo (`team/[teamNumber]/page.tsx:302` `isWin ? warning`), tarjeta amarilla (`MatchList.tsx:429`), bandera "burbuja" (`EventAdvisor.tsx:175`), avisos de formulario (`ScoutingForm.tsx:223,231`), sugerencias/estrellas (`AllianceSelector.tsx:206`, `ComparisonView.tsx:134`), banner de temporada pasada (`shell/PastSeasonBanner.tsx:18`), cues del temporizador (`workshop/MatchTimer.tsx:139`), nivel medio de probabilidad y fiabilidad.
- **danger**: ver Finding 4b.

Danger (o rojo de paleta) para "perder" o números negativos, no errores:

| Archivo:línea | Qué se pinta |
|---|---|
| `components/event/RankingTable.tsx:353` | conteo de derrotas |
| `components/event/RankingTable.tsx:344` | suerte de calendario < -3 |
| `components/event/RankingTable.tsx:79` | mínimo negativo de columna |
| `components/StatsTable.tsx:226` | derrotas en `text-red-600 dark:text-red-500` (paleta) |
| `components/analytics/TournamentSimulator.tsx:705` | promedio negativo en `text-red-600` (paleta) |
| `components/event/MatchList.tsx:397,401,406` | disciplina neta negativa |
| `components/analytics/AlliancePredictor.tsx:472,594,679` | disciplina neta |
| `components/home/TodayPanel.tsx:317,447` | probabilidad < 0.6; tendencia a la baja |
| `components/team/ConsistencyTracker.tsx:404, 45` | probabilidad < 0.6; etiqueta "declive" |
| `components/analytics/ComparisonView.tsx:228` | tendencia `down` |
| `components/analytics/TournamentSimulator.tsx:1162` | predicción fallida |
| `components/event/PredictionLedger.tsx:45` | "miss" de predicción |
| `components/oracle/LiveScoreboard.tsx:73` | predicción incorrecta |

Victorias/derrotas/empates con tres colores en una misma celda: `RankingTable.tsx:351-355` success / danger / secondary; `StatsTable.tsx:224-228` green / red / blue.

Escalas de semáforo con umbrales distintos: 0.85 / 0.6 en `TodayPanel.tsx:312-317` y `ConsistencyTracker.tsx:404`; 0.8 / 0.5 en `CalibrationDashboard.tsx:239,246`; 34 % en `PicklistEditor.tsx:678`; 4 / 2 en `FTC_DecodeForm.tsx:426`.

Contrastes calculados (texto sobre fondo / tarjeta):

| Token | Claro (bg / card) | Oscuro (bg / card) |
|---|---|---|
| secondary | 5.55 / 6.16 | 5.43 / 5.08 |
| success | 4.49 / 4.98 | 9.94 / 9.29 |
| warning | 4.13 / 4.58 | 10.75 / 10.05 |
| danger | 4.35 / 4.84 | 6.15 / 5.76 |
| muted-foreground | 5.43 / 6.03 | 6.42 / 6.00 |

Texto blanco sobre color sólido: secondary 6.16 (claro) / 3.69 (oscuro); danger 4.84 (claro) / 3.26 (oscuro); success 4.98 (claro). Warning sobre `background` claro: 4.13. El override de globals.css (l.225-233) hace que `bg-secondary text-white` use `primary-foreground` (en oscuro #07080a).

---

## Finding 7. Paridad claro/oscuro

- Variantes `dark:` en TSX: **5 ocurrencias en 3 archivos**: `StatsTable.tsx:224,226,228`, `EventStats.tsx:28` (`dark:opacity-20`), `TournamentSimulator.tsx:705`. No hay `@custom-variant dark` en los CSS/layout revisados; con Tailwind v4 por defecto `dark:` se resuelve por `prefers-color-scheme`, mientras el toggle de la app agrega la clase `.dark` (`lib/stores/theme-store.ts:32,63`). No verificado en navegador.
- Colores fijos de un solo tema (no cambian con el toggle):
  - `ComparisonView.tsx:87-117`: tooltip `#0f172a`, ejes `#888`, rejilla `#333` (13 literales).
  - `ui/Tooltip.tsx:32,35` `bg-slate-800 text-white`.
  - `scouting/SourceBadge.tsx:201-225` popover `bg-slate-900` con `text-gray-*`.
  - `scouting/QRScanner.tsx:60-79` `bg-slate-900/90`, `bg-slate-800`, `bg-black/60`.
  - `analytics/AlliancePredictor.tsx:447-595` 6 chips `bg-slate-800 text-white`.
  - `app/event/[eventCode]/pro/page.tsx:26-52` paleta clara (blue-100, purple-100, amber-50, slate-*) sin variantes oscuras.
  - `app/global-error.tsx:16-23` solo oscuro; `app/layout.tsx:63` `themeColor: "#07080a"` solo oscuro.
- La capa de compatibilidad de globals.css (l.220-281) fuerza `!important` en más de 20 selectores de paleta. Ocurrencias reales en TSX: gray 27, slate 17, white 37.
- Gradientes: 19 líneas con `bg-gradient|bg-linear`. Líneas con `blur-3xl|blur-[..]`: 7 (EventStats 1, AllianceSelector 1, ScoutingClient 2, MatchScoutingForm 1, team/[teamNumber]/page 2). `.glass`/`.glass-card`: 2 líneas (`team/[teamNumber]/page.tsx`).

---

## Finding 8. Excepciones deliberadas

- **Hoja imprimible** `components/strategy/MatchBriefingCard.tsx`: 35 ocurrencias de paleta (`bg-white text-black`, `gray-*`, `red-600/500`, `blue-600/500`, `border-black`). Comentario l.263-264: "forces light theme for printer"; l.25-31 explican `window.print()` con CSS de impresión. En la hoja, rojo/azul de alianza en l.293-298 y l.372; `text-red-600` en l.405 es para banderas de riesgo (no alianza). La hoja también se ve blanca en pantalla en tema oscuro (l.262).
- **QR export** `components/scouting/QRExport.tsx:24-26`: comentario "Stays bg-white regardless of theme... contrast is functional (scannability), not decorative".
- **QR scanner / cámara** `components/scouting/QRScanner.tsx:60-79`: overlay oscuro fijo (`bg-slate-900/90`, `bg-black/60`, `text-slate-300`). Sin comentario explicativo; borde y esquinas con `border-primary`; error con `danger` (l.75).
- **Scrim de modales** `components/ui/ConfirmDialog.tsx:67-70`: comentario "Scrim stays literal bg-black/opacity... intentionally don't tokenize the backdrop". También `OnboardingModal.tsx:137`, `MediaGallery.tsx:169-239`, `AppShell.tsx:241`.
- **Pantalla de error global** `app/global-error.tsx:16-23`: hex literales porque no depende del CSS de la app.
- **`@media print` global**: `app/globals.css:290-313`.

---

## Per-principle facts

### Estético (#3)

- La cabecera de tokens declara grises + rojo/azul de alianza + success/warning (`globals.css:3-15`). En código hay 1481 usos de clases de color semántico (primary 592, secondary 283, accent 10, danger 245, warning 181, success 170).
- `accent` y `secondary` tienen el mismo valor (#2457d6); `accent` se usa 10 veces en 2 archivos, `secondary` 283 en 35.
- 19 líneas con gradiente (`bg-gradient|bg-linear`), varias `from-primary/.. to-secondary/..` (tinta a azul). El comentario de `.glass` (l.139-141) dice que los paneles con blur "leen como ruido" a la luz del día, y hay 7 líneas con `blur-3xl|blur-[..]` y 2 usos de `.glass`.
- 125 ocurrencias de paleta Tailwind en 26 archivos y 23 hex literales en 4, pese a la regla "Never hardcode slate/white/black" (l.12-13). El override `!important` (l.220-281) enmascara parte.
- Fuera de los tokens aparecen violeta, esmeralda y ámbar (`ComparisonView.tsx:95,96,117`), índigo-morado (`AllianceSelector.tsx:263`), azul/morado/ámbar claros (`app/event/[eventCode]/pro/page.tsx:26-42`).
- 691 ocurrencias de tokens con opacidad; `primary/10`, `/20`, `/30` suman 125.
- `.text-gradient` y `.glass` están definidos y casi sin uso (0 y 2).

### Comprensible (#4)

- El mismo azul significa: alianza azul (`MatchList.tsx:481`), botón principal (`MatchScoutingForm.tsx:150`), pestaña activa (`StatsTable.tsx:104`), enlace (`oracle/page.tsx:235`), empates (`RankingTable.tsx:355`), mediana de México (`GrowthCurve.tsx:51`), estado "estable" (`ConsistencyTracker.tsx:48`), aviso informativo (`Tip.tsx:39`), foco (`ProScoutingDashboard.tsx:138`), chat (`AssistantChat.tsx:175`), bucket "Disponibles" (`PicklistEditor.tsx:431`), decoración.
- El mismo rojo significa: alianza roja (`MatchList.tsx:601`), error de formulario (`ScoutingForm.tsx:246`), eliminar (`AppShell.tsx:388`), derrotas (`RankingTable.tsx:353`), disciplina negativa (`MatchList.tsx:397`), "EN VIVO" (`TodayPanel.tsx:177`), tarjeta roja (`MatchList.tsx:596`), "restar" en contador (`FTC_DecodeForm.tsx:146`), bucket DNP (`PicklistEditor.tsx:453`), probabilidad baja (`TodayPanel.tsx:317`).
- Verde y ámbar: success = victorias, consenso, estado bueno, categoría de picklist, artefacto "green" del juego; warning = primer lugar, premios, victoria de un equipo (`team/[teamNumber]/page.tsx:302`), pendiente/offline, tarjeta amarilla.
- Hay al menos 4 escalas de semáforo con umbrales distintos (Finding 6).
- El contraste rojo/azul es 1.27:1 (claro) y 1.13:1 (oscuro): se separan por tono, no por luminancia. En `MatchList.tsx` el lado se rotula con texto "Blue Alliance" en el encabezado (l.481, 518).

### Honesto (#6)

- `danger` codifica "malo" y "alianza roja" a la vez: un puntaje de alianza roja (`MatchList.tsx:601-610`) y un error de formulario (`ScoutingForm.tsx:246`) o una derrota (`RankingTable.tsx:353`) comparten color. Lo mismo `secondary` con "interactivo" y "alianza azul" (`MatchScoutingForm.tsx:150` vs `MatchList.tsx:481`).
- En `RankingTable.tsx:351-355` y `StatsTable.tsx:224-228` rojo/azul indican derrotas/empates de un equipo individual, no de una alianza.
- Las barras de probabilidad de partido usan rojo/azul de alianza (`PredictionLedger.tsx:68-69`, `MatchList.tsx:998-999`), correcto para alianzas. Las probabilidades de la pantalla Hoy usan semáforo success/warning/danger con umbrales 0.85/0.6 (`TodayPanel.tsx:312-317`; comentario "Same thresholds as PickOdds").
- `ComparisonView` usa violeta/verde/ámbar sin relación con los tokens y tooltips oscuros incluso en tema claro.
- Los artefactos "purple/green" del juego se pintan con `primary` (tinta) y `success` (`DynamicGameForm.tsx:68-69`); el color no coincide con el nombre del campo.
- `text-white` forzado a foreground (Finding 1): texto negro sobre `bg-danger` y sobre las cajas de alianza de `app/page.tsx:224` en tema claro.

---

## Known gaps

- Los conteos son por texto (grep), no ejecutan Tailwind. Clases construidas dinámicamente (p. ej. `colorClass` en `EventStats.tsx`, mapas `RP_COLORS`, `colorMap` de `PicklistEditor`) cuentan en la definición, no en el uso.
- La clasificación alianza / no alianza de 4a-4b es heurística (ventana ±2 líneas). Tiene falsos positivos y negativos. Las 338 líneas (183 + 155) no se revisaron una por una; las listas de 4a-4b son una selección manual representativa, no exhaustiva.
- Los conteos de muted/foreground/border/card/background incluyen alias y variantes (`muted-foreground`, `border-border`); no se midieron archivos.
- No se auditaron CSS fuera de `app/globals.css` (no hay otros bajo `app/`), ni `public/` ni `docs/`.
- No se revisaron las capturas de `docs/design/audit-2026-11-14/shots/` ni se corrió la app. La afirmación sobre `dark:` por `prefers-color-scheme` frente a la clase `.dark` y los efectos del override `!important` no se probaron en navegador.
- No se distinguen vistas con sesión y sin sesión; se cuenta todo el código.
- Los contrastes son sobre `--color-background` y `--color-card`, no sobre fondos con opacidad (`bg-danger/10`, etc.), que son la mayoría de los usos.
- Los números de línea de `.text-gradient` (~157) y `:focus-visible` son aproximados a ±3 líneas.
- Los literales `#NNN` en `lib/` y `components/` son referencias de decisiones (p. ej. #106) y se descartaron.
