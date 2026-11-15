# Evidencia de copy y contenido (auditoría 14-nov-2026)

Solo hechos con ruta:línea. Sin puntajes. Catálogo principal: `messages/es.json`; EN solo donde difiere.
Rama `etapa1/foundations`, commit a1fd7ff. Solo lectura.

## Sources consulted

- Catálogos: `messages/es.json` y `messages/en.json` (1607 llaves cada uno; ninguna llave falta en un idioma).
- Idioma por defecto: `i18n/config.ts:11` (`defaultLocale = "en"`); `i18n/locale.ts:10-22` resuelve cookie, luego `Accept-Language`, luego inglés. El locale es `es`, no `es-MX` (afecta formato de números, ver F7).
- Hoy: `app/page.tsx`, `components/home/*`, `components/today/*`, `components/notifications/NotifySettings.tsx`, `lib/today-summary.ts`, `lib/draft-odds.ts`, `lib/today.ts`.
- Shell: `components/shell/AppShell.tsx`, `nav.ts`, `PastSeasonBanner.tsx`, `components/LocaleSwitcher.tsx`.
- Eventos y Evento: `app/events/page.tsx`, `app/event/[eventCode]/page.tsx` (+ `pro/page.tsx`), `components/event/*`, `components/EventList.tsx`, `components/EventFilter.tsx`, `components/oracle/LiveScoreboard.tsx`, `components/analytics/AlliancePredictor.tsx`, `TournamentSimulator.tsx`.
- Equipos y Equipo: `app/teams/page.tsx`, `components/StatsTable.tsx`, `app/team/[teamNumber]/page.tsx`, `components/team/*`.
- Estrategia: `app/strategy/page.tsx`, `components/strategy/*`, `lib/projections.ts`, `lib/live-projection.ts`, `lib/aggregation.ts`.
- Scouting, Taller, Préstamos y Card: solo catálogos (`ScoutingClient`, `ScoutingContext`, `ScoutBoard`, `Workshop`, `Lending`, `TradingCard`, `CardView`), `components/card/TradingCardPreview.tsx` (cabecera) y `storage.rules:5-6,38`.
- Método: scripts de mapeo llave→archivo:línea (`t("...")` por archivo) y barrido heurístico de texto JSX/atributos sin catálogo. Detalle en Known gaps.

---

## Finding 1. Inventario de strings

### 1.1 Conteo por namespace (llaves hoja en es.json)

| Pantalla | Namespaces (llaves) |
|---|---|
| Shell | `Shell` 35, `LocaleSwitcher` 3, `Attribution` 2, `PwaInstall` 6, `Common` 1, `Tip` 1 |
| Hoy | `TodayPage` 32, `Following` 30, `NotifySettings` 18. `Lending.openLoans` (aviso en Hoy). `Today` 27 es código muerto (ver 1.2) |
| Eventos | `EventsPage` 6 |
| Evento | `PredictionLedger` 20, `AdvancementList` 16, `AwardList` 3, `ParticipantList` 5, `CachedEvent` 1, `LiveScoreboard` 20, `DraftOdds` 4 |
| Equipos / Equipo | `TeamsPage` 2, `TeamPage` 30, `SeasonAnalysis` 4, `Consistency` 57, `TeamReport` 50, `GrowthCurves` 1 |
| Estrategia | `StrategyPage` 16, `LiveRanking` 16, `AllianceSelector` 19, `MatchSimulator` 23, `MatchBriefingCard` 20, `Briefing` 7, `PicklistEditor` 47, `ScoutingPool` 26, `Projections` 7 |

### 1.2 Código muerto con catálogo

- `components/home/TodayPanel.tsx` y `TodayPanelLoader.tsx` no los importa nadie (grep en `app`, `components`, `lib`; solo aparecen en `docs/memory/*`). El namespace `Today` (27 llaves) lo usa solo `TodayPanel.tsx:66`.
- Esos strings no los ve ningún usuario. Hay catálogo vivo (`TodayPage`) y catálogo muerto (`Today`) con conceptos distintos para lo mismo (ver F6).

### 1.3 Hoy (`/`) en el teléfono

Sin equipo seguido (`app/page.tsx:48-60`):

| Texto ES | Llave | Archivo:línea |
|---|---|---|
| "Temporada {season} · {game}" | `TodayPage.kicker` | `app/page.tsx:37,51` |
| "Sigue a tu equipo" | `welcomeTitle` | `app/page.tsx:52` |
| Párrafo "Escribe el número de tu equipo y PRIDE se vuelve la página de tu equipo: próximo partido y su probabilidad, ranking y dónde probablemente terminas, y tus opciones en la selección de alianzas. No necesitas cuenta." | `welcomeBody` | `app/page.tsx:53` |
| Formulario: "Número de equipo", "ej. 30311", "Seguir", "Escribe un número de equipo válido (1–99999)." | `follow.*` | `components/today/FollowTeamForm.tsx:38-46` |
| "O explora todos los eventos." | `orBrowse` | `app/page.tsx:56` |
| Luego (en streaming): "Siguiendo", "Seguir otro equipo", "Eventos de hoy y próximos 7 días" y lo demás de `FollowSections` | `Following.*` | `app/page.tsx:117-130` |

Con equipo seguido y evento en vivo (`LiveSection`, `app/page.tsx:170-219`):

| Texto ES | Llave | Archivo:línea |
|---|---|---|
| Kicker "Temporada…", número de equipo, nombre corto | `kicker` | `app/page.tsx:71-75` |
| Enlace al evento + fase: "compitiendo ahora" / "empieza en N días" / "último evento" | `phase.*` | `app/page.tsx:78-80` |
| Aviso de préstamos abiertos: "N préstamos siguen abiertos: revisa la pestaña Préstamos antes de irte." | `Lending.openLoans` | `components/today/OpenLoansNotice.tsx:33` |
| "Próximo partido" | `nextMatch` | `app/page.tsx:179` |
| "{played} / {total} partidos de calificación jugados" | `qualsProgress` | `app/page.tsx:180` |
| Descripción del partido, cruda de la API ("Qualification 35") y hora | `next.description` | `app/page.tsx:185-186`; `lib/today.ts:95` |
| "Tu alianza" / "vs" (hardcoded) / "Rivales" | `yourAlliance`, `opponents` | `app/page.tsx:189-191` |
| "NN%" + "de probabilidad de ganar (forma en el evento)" | `winChance` | `app/page.tsx:195-196` |
| "El calendario de partidos aún no se publica." / "No hay partidos próximos en el calendario." | `noSchedule`, `noNextMatch` | `app/page.tsx:201` |
| Tarjeta "Ranking": "#N" "de N equipos" | `rank`, `ofTeams` | `app/page.tsx:207` |
| Tarjeta "Ranking score": valor con 2 decimales + récord "w–l–t" en números | `rs` | `app/page.tsx:208` |
| Tarjeta "Final proyectado": "#N" "probable #a–#b" o "—" "calificación terminada" | `projected`, `range`, `qualsDone` | `app/page.tsx:209-211` |
| Tarjeta "Opciones de alianza": "NN%" y "en ruta a capitán" o "probabilidad de ser elegido (N alianzas)" | `allianceOdds`, `wouldCaptain`, `pickOdds` | `app/page.tsx:212-214` |
| Sin evento en vivo: "Esta temporada" + filas "#rank · w–l–t" o "Aún no hay resultados esta temporada." | `seasonResults`, `resultLine`, `noResultsYet` | `app/page.tsx:89-107` |
| Pie (texto `text-xs`, al final de todo): "Calculado con datos oficiales de FIRST. Las proyecciones son probabilidades, no promesas." | `footnote` | `app/page.tsx:111` |

"Siguiendo" (`components/home/FollowingPanel.tsx`):

- "Siguiendo" (`:39`); "Actualizado hace X", solo si hay algo en vivo (`:40-45`).
- Fase: "En vivo" / "en N días" / "Terminó" / "Sin datos" (`:59`).
- "Qualys {q}/{qt}" y "Playoffs {p}/{pt}" (`:102-103`).
- "Último", "Próximos partidos", "Próximo", "ganó", "perdió", "empate" (`:107,117,157,166`).
- "vs" hardcoded (`:159`).
- "Sin eventos esta temporada" (`:149`).
- Porcentajes: `NN %–NN %` por partido (`:78`).

Avisos (`components/notifications/NotifySettings.tsx:103-133`; aparece si hay algo seguido o equipo seguido, `app/page.tsx:126`):

- "Avisos en este dispositivo".
- Texto largo de `hint`: "Te avisamos cuando tu equipo o un equipo que sigues está por jugar, sus resultados, alianzas y campeón…".
- Botón "Activar avisos"; categorías "Mi equipo está por jugar", "Resultados de mis equipos", "Alianzas, playoffs y campeón", "Préstamos y reparto de scouts".
- "Enviar prueba" y "Desactivar".

Eventos de hoy (`components/home/EventsToday.tsx:24-50`): "Eventos de hoy y próximos 7 días", "Región", "México", "Todas las regiones", "Buscar evento", "Nombre o código", "En vivo", "hoy / en N días", y los dos mensajes vacíos.

### 1.4 Shell

- Barra inferior de 5 pestañas vía `nav.ts:17-23` + `Shell.nav.*` (`AppShell.tsx:107-128`): "Hoy", "Eventos", "Equipos", "Scouting", "Estrategia".
- Barra superior móvil (`AppShell.tsx:98-102`): texto "PRIDE" hardcoded y botón de cuenta (icono de persona + número de equipo). Su única etiqueta es `aria-label` "Cuenta y ajustes" (`:198`).
- El buscador de equipo ("Número de equipo", `:183-184`) solo está en el riel de escritorio (`:84`); la barra móvil no lo incluye.
- Panel de cuenta (`AppShell.tsx:238-340`):
  - "Cuenta y ajustes", "Cerrar".
  - "Equipo que sigues", "Personaliza Hoy y las vistas de evento. No necesitas cuenta.", "ej. 30311", "Seguir", "Dejar".
  - "Más" (herramientas: "Data Lab", "Precisión del modelo", "Trading Card", "Préstamos de pits", "Taller"; solo móvil en el panel, `:281-292`).
  - "Claro/Oscuro" (`:303`), selector "Idioma" (`LocaleSwitcher`), "Iniciar sesión", "Entrar con Google", "Cerrar sesión", "Equipo {team}".
  - Atribución FIRST (`:341-343`).
  - Eliminar cuenta: "Eliminar mi cuenta", texto explicativo, "Escribe DELETE para confirmar", "Eliminar definitivamente", "Cancelar" (`:364-393`).
- `PastSeasonBanner` (`:20-23`): "Estás viendo la temporada {season}, no la actual ({current})…" y "Ir a {current}".

### 1.5 Eventos (`/events`) y Evento (`/event/[code]`)

Eventos (`app/events/page.tsx:82-97,140`):

- "Temporada {season} · {game}", "Eventos", "Eventos de la temporada, clasificación y avance", contadores "Equipos" / "Avanzaron" (sin explicación), pie "© año PRIDE. No afiliado con FIRST®.".
- Filtros `components/EventFilter.tsx:126-283`: todo en inglés hardcoded (ver 1.8).
- `components/EventList.tsx:29`: "Events in this View (N)".
- La misma `StatsTable` de /teams aparece debajo (`app/events/page.tsx:127`).

Evento, primera vista en el teléfono (el evento no usa `getTranslations`; lo del evento sale casi todo de strings en TSX):

- `app/event/[eventCode]/page.tsx:147` "Season 2026" (inglés), nombre del evento, código, sede, ciudad.
- `:166,168` botones de hermanos "Divisiones · Houston" / "Premier Events" (solo si el código está en `CHAMPIONSHIP_EVENTS_2025` / `PREMIER_EVENTS_2025`).
- `EventStats.tsx:197-227`: "Avg Score", "Avg Auto", "Matches" (`NQ | NP`), "Teams", "Highest Score", "Highest Clean", "Highest Auto"; chip "{Red|Blue} Alliance" (`:55`).
- Pestañas (`EventViewManager.tsx:362-368`, pestaña inicial `:55` = "teams"): "Teams", "Rankings", "Matches", "Oracle", "Advancement", "Awards", enlace "PRO" (`:385`).
- Control "Historia por Ronda", "R1", "Final", "Ronda N" / "FINAL" (`:395-412`; visible si la pestaña no es "matches").
- Pestaña "Teams" (`ParticipantList.tsx`): buscador "Buscar por # o nombre de equipo..." (`:32`), "N equipos en total" (`:41`), por tarjeta "Participante" (`:65`), "México" (`:76`) y "Ver partidos" (`:79`).
- Vacío en inglés: "No teams found matching…" (`:93`).
- Pestaña "Matches" (`MatchList.tsx`): "Próximos partidos", "Predicción: OPR + σ del evento · sin penalizaciones" (`:446-450`); cabeceras "Red Alliance / Blue Alliance / Score" (`:480-482`); "No match data available for this filter." (`:544`); "Final/Pending" (`:695,708`); "proyección" (`:994`); "¿Por qué este pronóstico?" (`:1009`).
- Llaves de `PredictionLedger.*` (`MatchList.tsx:479,516`, `PredictionLedger.tsx:18-95`): pronóstico PRIDE, "Acertó/Falló", "Parejo NN%", "Brier 0.xxx (moneda al aire: 0.250; menos es mejor)".
- Pestaña "Rankings" (`RankingTable.tsx:244-293`): "Rank", "Team", "RS", "NP Avg", "Base", "Auto", "High", "OPR", "Disc", "Sched", "W-L-T", "Plays".
- Pestaña "Oracle": `AlliancePredictor.tsx:331-678`, mayormente inglés ("Alliance Oracle", "Select a target team to identify statistically optimal partners.", "OPR Analytics", "Projected Alliance Score", "Remaining Pool"). Incluye el simulador de torneo con "Win Probability", "Champion", "Est. OPR".
- Pestañas "Advancement" y "Awards": llaves `AdvancementList.*` ("Quals", "TBP", "Jueceo"…) y `AwardList.*`.

### 1.6 Equipos (`/teams`) y Equipo (`/team/[n]`)

Equipos: `TeamsPage.title/subtitle` (`app/teams/page.tsx:32-33`) y `StatsTable.tsx` casi todo hardcoded:

- Botones "Rankings" / "Advancement" (`:96-106`), título "Rankings" o "Reporte de Avance" (`:87`), "Buscar equipo..." (`:117`), "Clasificados" (`:137`).
- Columnas (`:145-196`): "#", "Equipo", "RS", "Match", "Base", "Auto", "Máximo", "W-L-T", "Total Pts", "Judging", "Playoff", "Alianza", "Qual Pts", "Eventos".

Equipo (llaves `TeamPage.*`, `app/team/[teamNumber]/page.tsx`):

- Encabezado: "Desde {year}" (`:150`), "Visitar sitio web" (`:161`).
- Metadatos: "Nombre completo de la organización", "Identidad del robot" / "Designación pendiente", "Patrocinadores y afiliaciones" (`:172-182`).
- Para 30311: `TeamSeasonReport` completo (`:194-199`), casi todo hardcoded (ver F2 y 1.8). Para los demás: `TeamSeasonAnalysis` (`:201-209`; catálogo `SeasonAnalysis.*` + `Consistency.*`).
- "Historial de participación" (`:211`), por temporada: nombre del juego, "Analizando el desempeño en N torneos importantes" (`:235`), "Mejor de la temporada / Rank #n" (`:240-241`).
- Tarjeta por evento: "% de victorias", "Puntaje máx.", "Net prom.", "Prom. Auto" con subtítulos (`:275-278`), chips de alianza/avance/premio, botón "VER DETALLES DEL EVENTO" (`:313`).

### 1.7 Estrategia (`/strategy`)

`StrategyClient.tsx` (`app/strategy/page.tsx` solo monta el cliente):

- Título "Estrategia de Alianzas" (`:52`); subtítulo "Análisis de datos híbridos (API + Scouting) para toma de decisiones." (`:53`); selector "Evento" (`:57`).
- Seis pestañas (`:68-84`): "Picklist", "Alliance Oracle", "Simulador de Partidos", "Briefing", "Live Ranking", "Pool compartido". Pestaña inicial: Picklist (`:66`).
- Picklist (primera vista): tip "Picklist colaborativo en vivo" (`:90-91`); sin sesión: "Inicia sesión para usar el picklist editor." (`PicklistEditor.tsx:290`); con sesión: "Picklist Editor", `hint` (`:317`), botones "Pesos", "Auto-sort", "Reset estado" (`:337-354`), listas "Picklist / Disponibles / Do Not Pick" (`:399-454`).
- Tips de las otras pestañas: "Simulador con Bayesian blend" (`:101-102`), "Hoja imprimible para drive coach" (`:108-109`), "Proyección lineal in-event" (`:115-116`).
- Alliance Oracle (`AllianceSelector.tsx`): "Alliance Stack", "Capitán / 1er Pick / 2do Pick (rota/backup)", "Mejores recomendaciones", "Puntaje estimado de la alianza", "Preguntar a la IA".
- Simulador (`MatchSimulator.tsx`): "Selección de Equipos", botones "Red" / "Blue" (`:102,107`), "Predicción Roja/Azul", "Probabilidad de Victoria", "Análisis del Predictor IA", "Desglose de Puntos Estimados", "Confianza del Modelo".
- Briefing (`MatchBriefingCard.tsx`): "Match Briefing", "Selecciona match + 2 teams por alianza", "Drive Coach Briefing", "Insights del modelo", "Foco estratégico", "Plan A / Plan B".
- Live Ranking (`LiveRankingProjection.tsx`): título "Proyección final del ranking", `subtitle` largo (`:112`), columnas "Proyectado, Rango probable, Actual, Δ, Equipo, Jugados/Total, RS actual, RS final, Capitán" (`:168-176`).

### 1.8 Strings de interfaz fuera del catálogo (lista por archivo)

Todo lo siguiente lo ve el usuario y no pasa por `useTranslations`. Los conteos son del barrido heurístico, cota inferior.

- `app/event/[eventCode]/page.tsx:91,147,166,168` ("Event Not Found", "Season", "Divisiones · Houston", "Premier Events"). Las listas son de 2025 (`CHAMPIONSHIP_EVENTS_2025`).
- `components/event/EventViewManager.tsx:362-368,385,395-412,488-500`: pestañas, "Historia por Ronda", "Alianzas oficiales", "3 robots (juegan 2 por match, §15.3)".
- `components/event/EventStats.tsx:197-227`, 7 strings.
- `components/event/MatchList.tsx` (~76 strings, ejemplos): `:296` "Matches analizados / Temporada FTC"; `:335-406` textos de ayuda ("¿Qué es? / Cálculo / Interpretación"); `:417-433` "Tarjetas (Cards) / Yellow / Red"; `:446-450`; `:480-482,517-519,758-780` ("Red Alliance", "Penalty In", "Total"); `:823` "Season NP Avg"; `:888-913` frases de análisis armadas como strings (incluye "volado", "upset"); `:994,1009`.
- `components/event/RankingTable.tsx` (~40): cabeceras y tooltips `:244-293`, `:225` "No ranking data available for this event yet.", `:333` title "Calendario difícil…".
- `components/event/ParticipantList.tsx:93` "No teams found matching…".
- `components/StatsTable.tsx:87-196` (ver 1.6).
- `components/EventFilter.tsx:126-283` (15): "Filter Data Source", "By Criteria", "Specific Events", "Season", "Region", "Mexico (Default)", "USA (Generic)", "Event Type", "All Types", "Date Range", "Search events by name or code...", "No events found matching your search.", "Apply Filters".
- `components/EventList.tsx:29`.
- `components/analytics/AlliancePredictor.tsx` (20): `:331-350,408-418,427-489,531-678`.
- `components/analytics/TournamentSimulator.tsx` (30): `:308-309,438-471,538,569,583,853,1003-1141`; mezcla de inglés ("Win Probability", "Champion", "Select...") y español ("Robot que falló", "Estimado vs Real").
- `components/team/TeamSeasonReport.tsx` (~46), `RookieComparison.tsx` (11), `GrowthCurve.tsx` (9): narrativa española con claims hardcoded para 30311, sin pasar por catálogo (ver F2).
- `components/team/ConsistencyTracker.tsx:311` y similares: algunas etiquetas de gráfico.
- `components/shell/AppShell.tsx:370,374,381` ("DELETE" como palabra de confirmación; ver F6), `:100,138` ("PRIDE").
- `app/page.tsx:190` y `components/home/FollowingPanel.tsx:159`: "vs".
- `components/strategy/LiveRankingProjection.tsx:171`: "Δ".
- `components/strategy/AllianceSelector.tsx:138-139,223`: "OPR:", "Auto:", "+x OPR".
- `components/strategy/PicklistEditor.tsx:666-668`: "RS … NP …", "OPR …", "TIPS …".
- `components/strategy/MatchBriefingCard.tsx:283` ("FTC Stats México" impreso en la hoja; la marca del resto de la app es "PRIDE") y `:402` ("RS … NP …").
- `app/event/[eventCode]/pro/page.tsx:26-47`: banner "BETA FEATURE", "IRON LION INTELLIGENCE", "Pro-Scouting Database", "Acceso exclusivo…", nota de rendimiento.
- `components/event/MatchList.tsx:888` y `lib` de insights: frases que mezclan "Δ", "pts", "upset".

---

## Finding 2. Inflaciones (superlativos o afirmaciones sin respaldo en pantalla)

| # | Texto visible | Dónde | Hecho |
|---|---|---|---|
| 2.1 | "Predicción de alta precisión: Basada en abundantes datos de scouting." | `messages/es.json` `Projections.highConfidence`, mostrado en `MatchSimulator.tsx:199`; condición en `lib/projections.ts:275` | Se dispara cuando los 4 robots tienen `reliability === "high"`, es decir `scoredCount >= 4` (`lib/projections.ts:238`). Mide cuántas capturas hay, no una precisión validada. No muestra ningún dato de exactitud |
| 2.2 | "Análisis del Predictor IA" | `MatchSimulator.tsx:191` (`aiAnalysis`) | Las "insights" salen de reglas fijas (`lib/projections.ts:266-278`: ventaja de auto >25%, `highConfidence`, empate técnico). No hay modelo de IA en esa ruta |
| 2.3 | "Ventaja crítica: Alianza Roja domina en período Autónomo." | `Projections.redAutoAdvantage` / `blueAutoAdvantage` | Umbral `redAuto > blueAuto * 1.25` (`lib/projections.ts:272-273`). "Crítica" y "domina" para una diferencia de 25 % en el estimado de autónomo |
| 2.4 | "Confianza del Modelo NN%" | `MatchSimulator.tsx:219-221` | Suma la confianza de solo las 2 teams rojas y divide entre 4: `projection.redAlliance.teams.reduce(...)/4` (máximo 0.99+0.99 → 49.5 %). No incluye azules aunque el rótulo es global. La confianza de cada team es `1 − CV` acotada a 0.1-0.99 (`lib/projections.ts:225`) |
| 2.5 | "IA" en botones | `AllianceSelector.tsx:265` "Preguntar a la IA", `TeamAnalysisCard` "Notas IA", `AssistantChat.brand` "Iron Lion AI" | El chat existe (`DeferredGlobals.tsx:33`, solo si `aiAssistant` está activo). Hecho: depende de bandera de servidor; la UI no avisa cuándo está apagado |
| 2.6 | "Acceso exclusivo a métricas agregadas…" y "IRON LION INTELLIGENCE" | `app/event/[eventCode]/pro/page.tsx:26-37` | La página no verifica sesión (no hay `useAuth` ni gate en `ProScoutingDashboard.tsx`). Además dice "temporada 2025" fija en el texto, mientras `season` sale de cookie (`:16-17`) |
| 2.7 | Informe 30311: "Un rookie con rendimiento de tier veterano", "Top 19%", "1° Inspire Award", "~24% del #1 del mundo", "+59% en la temporada", "Resumen para patrocinadores — Titulares defendibles, cada uno respaldado por datos citados" | `components/team/TeamSeasonReport.tsx:42,51-54,214,245-246,329-330` | Texto y cifras escritos a mano, mostrados a cualquier usuario en `/team/30311` (`app/team/[teamNumber]/page.tsx:194-199`). "Fuentes" lista enlaces a FTCScout (`:264-270`). Narrativa con orientación de marketing para patrocinadores |
| 2.8 | "Los RP bonus y el seed valen oro … el modelo PRIDE acertó {correct} de {total} playoffs." | `TeamReport.learning.rpAndSeed.body` | Cifra de un solo evento (FPEMX) presentada junto a recomendaciones generales |
| 2.9 | "Calculado con datos oficiales de FIRST." | `TodayPage.footnote` (`app/page.tsx:111`) | Es parcialmente cierto: ranking oficial sí; las probabilidades salen de modelos propios. El mismo pie sí aclara "probabilidades, no promesas", pero está en `text-xs` al final de la página |
| 2.10 | "en vivo" / "En vivo" | `Following.live` (fase calculada por fechas, `FollowingPanel.tsx:59`), `StrategyPage.tipPicklistBody/Title` | Ver F5 (qué sí actualiza y qué no) |
| 2.11 | "Precisión del modelo" como destino de "Más" | `Shell.more.oracle` | La página (`/oracle`) publica "Precisión global" (`OraclePage.statAccuracy`) y calibración. Es el único lugar con evidencia de exactitud; se llega solo por "Más" |
| 2.12 | Porcentajes sin contexto | Ver abajo | Hoy: `NN%` de ganar y `NN%` de alianza sin intervalo ni número de partidos que sustentan el modelo (`app/page.tsx:195,213`). El modelo exige ≥2 qualys jugadas (`lib/today-summary.ts:126`); el rango "probable #a–#b" es un p10-p90 (`lib/live-projection.ts:330`) y no se dice |
| 2.13 | "Puntaje estimado de la alianza" | `AllianceSelector.tsx:234-241` | Suma dos `averageMatchPoints`; ese campo es el promedio de `sortOrder2` oficial (`lib/aggregation.ts:210`), que el propio tooltip del ranking describe como "Potencia bruta de la alianza" (`RankingTable.tsx:256`). Sumar dos promedios de alianza cuenta la producción de la alianza dos veces |
| 2.14 | "Sin ajuste a posteriori" | `LiveScoreboard.lead` | Es una afirmación de método; no se verificó en código (ver Known gaps) |

---

## Finding 3. Dark patterns

Ninguno encontrado. Revisado:

- Sin precios, suscripciones, pruebas gratuitas ni cobros (grep de "premium", "suscrib", "gratis", "pago", "cobr" sobre es.json: sin resultados relevantes).
- Sin escasez ni urgencia falsas: grep de "solo hoy", "limitad", "última oportunidad", temporizadores: nada.
- Sin confirmshaming: el aviso de instalación ofrece "Instalar", "Después", "Cerrar" (`PwaInstall.*`); el tip se descarta con "No mostrar de nuevo" (`Tip.dismiss`); el rechazo del permiso de avisos tiene texto neutro (`NotifySettings.permissionNeeded`, `denied`).
- La instalación se oculta 7 días tras descartarla (`components/PWAInstallPrompt.tsx:10-11,37-38`).
- Eliminar cuenta es consciente: texto explicativo y confirmación escrita (`AppShell.tsx:366-393`); el idioma de la confirmación es la excepción (F6).
- Excepción de "exclusividad" sin gate real: 2.6.

---

## Finding 4. Jerga o etiquetas poco claras para un estudiante de primer año

Convenciones: Dónde = archivo:línea donde se ve. Ayuda = si hay tooltip/explicación y de qué tipo. Propuesta = una línea.

| Término | Dónde | Ayuda existente | Propuesta (ES) |
|---|---|---|---|
| OPR | `RankingTable.tsx:275-276`, `MatchList.tsx:335-346`, `AllianceSelector.tsx:102,138`, `PicklistEditor.tsx:667`, Hoy (indirecto), `Consistency.*` | Tooltips solo con hover (`RankingTable.tsx:55`, `MatchList.tsx:416,558`); sin acceso táctil. Texto largo ("Offensive Power Rating… algoritmo de álgebra lineal") | "Puntos que aporta tu robot" con una línea de ayuda visible |
| npOPR | no aparece como tal; `AutoOPR/TeleOP OPR/Foul Strategy/Net Discipline` en `MatchList.tsx:352-406` | Hover-only | "Puntos de auto", "puntos de teleop", "faltas que provocas" |
| RS / Ranking Score | `app/page.tsx:208` ("Ranking score"), `RankingTable.tsx:251`, `StatsTable.tsx:152`, `LiveRankingProjection.tsx:174-175`, `PicklistEditor.tsx:weight_averageRS` | Solo en `RankingTable` (hover); en Hoy ninguna | "Puntos de ranking por partido" (promedio de RP) |
| RP | `Today.ranking.*` (muerto), `StrategyPage.tipRankingBody`, `TeamReport.learning.rpAndSeed` | Ninguna | "Puntos de ranking (RP)" definido la primera vez |
| NP / "NP Avg" | `RankingTable.tsx:255-256`, `PicklistEditor.tsx:weight_averageNP`, `MatchBriefingCard.tsx:402`, `TeamPage.kpiAvgNet` ("Net prom.") | Hover en tabla; no en el resto | "Puntos sin faltas (promedio)" |
| SWARM, POLLINATOR | No hay en las pantallas auditadas (solo en modelos `lib/rp-counts.ts`). `Workshop.cues.flowerUnlocked` usa "FLOWERS"/"NECTAR" | n/a | Los términos del juego deben mantenerse; añadir glosario corto |
| TIPS, LEAVE/PARK | `PicklistEditor.weight_tipsOpr`, `weight_leavePark`, `teamLine` (`:666-668`) | Ninguna | "Puntos de TIPS" / "Confiabilidad al salir y estacionar" |
| Oracle | Pestaña "Oracle" del Evento (`EventViewManager.tsx:365`, `AlliancePredictor.tsx:331`), pestaña "Alliance Oracle" de Estrategia (`StrategyPage.tabOracle`, `AllianceSelector.tsx`), página `/oracle` ("Precisión del modelo", `Shell.more.oracle`), `OraclePage.heroTitle` | Ninguna. Tres cosas distintas con el mismo nombre | "Simulador de alianzas" (Evento) / "Armar alianza" (Estrategia) / "Qué tan bien acierta PRIDE" (`/oracle`) |
| σ / sigma | `MatchList.tsx:450` "OPR + σ del evento", `ComparisonMatrix.consistency`, `EventAdvisor.colVolatility`, `Consistency.ui.chart.legend.band` | Ninguna | "Variación típica de puntos" |
| Brier | `PredictionLedger.brier` (`PredictionLedger.tsx:91`), `LiveScoreboard.brier/colBrier`, `OraclePage.colBrier` | Parentética "moneda al aire: 0.250; menos es mejor" (solo en el ledger); la tarjeta de LiveScoreboard tiene subtítulo; en `/event` el número va solo | "Error de las probabilidades (0 es perfecto)" |
| Monte Carlo | `LiveRanking.subtitle` ("Simula 1,000 veces…" sin la palabra), `LiveDraftBoard.modelNote` ("Monte Carlo ×1500"), `TournamentSimulator.tsx:69,533` ("2,000 simulaciones") | Subtítulo explica en lenguaje llano | "Simulación: repetimos el resto del evento 1,000 veces" |
| "Forma" | `TodayPage.winChance` ("forma en el evento", `app/page.tsx:196`), `Consistency.ui.table.form` ("Forma"), `Consistency.band.actual.label` ("Forma actual"), `TournamentSimulator.tsx:527` ("forma en playoffs") | Ninguna. En `Consistency.*` el texto lo define como rendimiento reciente | "según cómo ha jugado en este evento" |
| "Proyección / proyectado" | `TodayPage.projected` "Final proyectado" (`app/page.tsx:210`), `LiveRanking.col.projected`, `MatchList.tsx:994` "proyección" | El rango "probable #a–#b" no dice qué cubre (p10-p90, `lib/live-projection.ts:330`) | "Dónde terminarías (rango de 8 de cada 10 casos)" |
| Seed / "Seed est." | `Today.odds.field` "Seed #N" (muerto), `DraftOdds.*` ("Seed {seed} alcanza…"), `Consistency.ui.table.seed`, `EventAdvisor.colSeed`, `TeamReport.learning.rpAndSeed.title` | Ninguna | "Posición de clasificación (seed)" la primera vez |
| Alliance odds | `TodayPage.allianceOdds`: "Opciones de alianza" / `pickOdds`: "probabilidad de ser elegido" | Nota corta bajo el número | "Probabilidad de entrar a una alianza de playoffs" |
| Qualys / Quals | `Following.progress` "Qualys", `AdvancementList.quals`, `ScoutBoard.noSchedule`, `Today.ranking.qualsLeft` | Ninguna | "Partidos de clasificación" |
| Picklist / DNP / Auto-sort / Pesos | `StrategyPage.tabPicklist`, `PicklistEditor.*` | Tip de primera vez (`StrategyClient.tsx:90-91`) explica Pesos y Auto-sort; "DNP" y "selected/declined" no | "Lista de preferencia", "No elegir", "Ordenar solo" |
| Briefing | `StrategyPage.tabBriefing`, `MatchBriefingCard.*` | Tip (`StrategyClient.tsx:108-109`) | "Hoja para el coach" |
| Bayesian blend / varianza inversa | `StrategyPage.tipSimTitle/tipSimBody` | Ese tip es la explicación | "Combina datos oficiales y tu scouting, y confía más en el más estable" |
| Calibración | `AnalyticsPage.tabCalibration`, `OraclePage.*` | `OraclePage.howToRead` sí | "Qué tan buenas son las probabilidades" |
| Clean ("Highest Clean") | `EventStats.tsx:226` | Ninguna; significa puntaje menos faltas recibidas (`:100-101`) | "Mayor puntaje sin faltas" |
| TBP | `AdvancementList.tsx:145-150` | Hover-only, texto 8 px (`:149`) | "Puntos de desempate" visible |
| Disc, Sched | `RankingTable.tsx:280-286` | Hover-only | "Faltas netas", "Dificultad del calendario" |
| Pool compartido | `ScoutingEvent.tabPool`, `ScoutingPool.*` | `ScoutingPool.lockedBody`/`tableLegend` explican | OK; añadir una línea en la pestaña |
| Rank vs Ranking vs # | `TeamPage.rank` "Rank #n", `TodayPage.rank` "Ranking", `RankingTable.tsx:244` "Rank" | n/a | Unificar ("Posición") |

Hechos sobre el acceso a explicaciones en teléfono:

- Todas las ayudas de columnas de `RankingTable` y de tarjetas de `MatchList` y `AdvancementList` usan `group-hover` con `opacity-0 invisible pointer-events-none`: `RankingTable.tsx:55`, `MatchList.tsx:416,558`, `AdvancementList.tsx:149`.
- Solo hay 3 usos del `Tooltip` de Radix en el repo (`grep "<Tooltip"`), que sí responde a foco.
- Tamaños: `AdvancementList.tsx:149` tooltip a 8 px; `MatchList.tsx:429` etiquetas "Yellow/Red" a 8 px; `app/team/[teamNumber]/page.tsx:332,336` a 9 px.

---

## Finding 5. Desajustes etiqueta → comportamiento

| # | Etiqueta (archivo:línea) | Comportamiento real (archivo:línea) |
|---|---|---|
| 5.1 | `Shell.follow.help`: "Personaliza Hoy y las vistas de evento." (`AppShell.tsx:253`) | La cookie `pride_team` solo se lee en `app/page.tsx:36`, `app/layout.tsx:91` y acciones de push (`app/actions/push.ts:50`). Ningún componente de `app/event`, `components/event` ni `components/strategy` la usa (grep). Las filas resaltadas del Live Ranking usan el `orgId`, no el equipo seguido (`LiveRankingProjection.tsx:67-73`) |
| 5.2 | `StrategyPage.tipRankingTitle/Body`: "Proyección lineal in-event… si mantienes tu RP/match actual" (`StrategyClient.tsx:115-116`) | El motor simula 1,000 veces los partidos restantes con OPR del evento (`lib/live-projection.ts:34,203`) y el propio `LiveRanking.subtitle` lo dice (`LiveRankingProjection.tsx:112`). Dos explicaciones contradictorias en la misma pestaña |
| 5.3 | `PicklistEditor.hint`: "Click derecho/long-press para mover entre listas" (`PicklistEditor.tsx:317`) | No existe `onContextMenu` ni manejo de long-press en el repo (grep). El movimiento entre listas es por botones de icono (`:599-651`) |
| 5.4 | `AllianceSelector.sortOpr` "Ordenar por OPR" y "OPR: x" (`AllianceSelector.tsx:102,138`) | Ordena y muestra `averageMatchPoints` (`:61-62,138`), el promedio de `sortOrder2` oficial (`lib/aggregation.ts:210`), no el OPR (campo `opr` distinto en `types/scouting.ts:107`). El prompt de IA dice "OPR combinado" con esa suma (`:256`) |
| 5.5 | `MatchSimulator.modelConfidence` "Confianza del Modelo" | Solo toma las 2 teams rojas y divide entre 4 (`MatchSimulator.tsx:219-221`) |
| 5.6 | `MatchSimulator.aiAnalysis` "Análisis del Predictor IA" | Reglas fijas, no IA (F2.2) |
| 5.7 | `TeamPage.kpiAutoAvg` "Prom. Auto" con subtítulo `kpiConsistency` "Consistencia" (`app/team/[teamNumber]/page.tsx:278`); `kpiAvgNet` "Net prom." con subtítulo "Rendimiento" (`:277`) | El valor es un promedio (`rank.avgAuto`, `rank.avgNP`); no se calcula ninguna consistencia ahí |
| 5.8 | `TeamPage.kpiMaxScore` "Puntaje máx." con subtítulo "Mejor de la temporada" (`:276`) | `rank.highScore` es el máximo de ese evento; la tarjeta es por evento, no de temporada |
| 5.9 | `TeamPage.sponsors` "Patrocinadores y afiliaciones" (`:180-183`) | Muestra `nameFull` sin `nameShort` (restos del nombre legal) o, si queda vacío, "Administrado por una institución educativa local" (`TeamPage.localInstitution`), sin dato que lo respalde |
| 5.10 | `TeamPage.analyzing` "Analizando el desempeño en N torneos importantes" (`:235`) | Cuenta todos los eventos de la temporada (`year.events.length`), sin criterio de importancia |
| 5.11 | `TradingCard.subtitle` "El perfil público de robot de tu equipo" (`messages/es.json`) | Las tarjetas y medios solo se ven con sesión de equipo aprobado (`CardView.signIn`, `CardView.needTeam`; `storage.rules:5-6,38`) |
| 5.12 | `ParticipantList.country` "México" en cada tarjeta (`ParticipantList.tsx:76`) | Constante de catálogo, no dato del equipo; el evento puede tener equipos de otros países |
| 5.13 | `ParticipantList.viewMatches` "Ver partidos →" (`:79`) | Solo visible con hover (`opacity-0 group-hover:opacity-100`, `:77`), invisible en teléfono; la tarjeta completa sí es botón |
| 5.14 | Punto parpadeante rojo/azul en "Predicción Roja/Azul" (`MatchSimulator.tsx:158,179`, `animate-pulse`) | Cálculo local sobre datos ya cargados; sin actualización en vivo de la fuente |
| 5.15 | Hoy sin "Actualizado" en la tarjeta principal | `app/page.tsx` (tarjeta de próximo partido y de ranking) no tiene `AutoRefresh` ni muestra hora de datos. Solo "Siguiendo" sondea cada 60 s (`FollowingPanel.tsx:19,36`) y solo muestra "Actualizado" si hay algo en vivo (`:40-45`). El Evento recarga cada 60 s si está en vivo (`app/event/[eventCode]/page.tsx:142`) |
| 5.16 | `Shell.theme.light/dark` en el botón de tema (`AppShell.tsx:303`) | El botón muestra el tema actual, no la acción; el icono sol/luna cambia según el estado (`:299-303`). Ambigüedad de lectura |
| 5.17 | `NotifySettings.hint`: "alianzas y campeón de los eventos que sigues" (`NotifySettings.tsx:110`) | El envío lo dispara `app/api/cron/live/route.ts` con `lib/notify/*`. La existencia de las categorías (`compose.ts:81` para playoffs) se verificó; el programador que llama al cron no está en el repo (ver Known gaps) |
| 5.18 | `PicklistEditor.hint` y `tipPicklistBody` "sincronizan en vivo con todo tu equipo" | Sí existe listener `onSnapshot` (`lib/picklist-service.ts:58-65`; `PicklistEditor.tsx:173`). Sin desajuste; se anota por completitud |

---

## Finding 6. Idiomas mezclados y terminología inconsistente

### 6.1 Inglés en la interfaz en español (con catálogo)

Valores idénticos en `es.json` y `en.json` (las llaves de EN y ES coinciden):

- `StrategyPage.tabOracle` "Alliance Oracle", `tabBriefing` "Briefing", `tabRanking` "Live Ranking", `tabPicklist` "Picklist".
- `MatchSimulator.blue` "Blue" y `red` "Red" (botones, `MatchSimulator.tsx:102,107`).
- `MatchBriefingCard.title` "Match Briefing", `matchNumber` "Match #", `matchHeading` "MATCH #n", `coachBriefing` "Drive Coach Briefing", `planA` "Plan A".
- `PicklistEditor.title` "Picklist Editor", `autoSort` "Auto-sort", `weight_averageRS` "Ranking Score (RS)", `weight_averageNP` "Net Points (NP)", `bucketDnp` "Do Not Pick".
- `AllianceSelector.stack` "Alliance Stack", `obs` "(N obs)", `driver` "{skill} Driver".
- `TeamPage.rank` "Rank #n", `roleBackup` "Backup", `advPlayoffs` "Playoffs".
- `Following.playoffs` "Playoffs p/pt", `AdvancementList.quals` "Quals", `playoff` "Playoff".
- `Shell.more.dataLab` "Data Lab", `Shell.more.card`/`TradingCard.title` "Trading Card".
- `ScoutingClient.tabPit/tabMatch/tabSuper` "Pit Scouting / Match Scouting / Super Scouting".
- Mezcla dentro de una frase: `PicklistEditor.markSelected` "Marcar selected", `markDeclined` "Marcar declined", `resetState` "Reset estado", `MatchBriefingCard.subtitle` "Selecciona match + 2 teams por alianza".

### 6.2 Inglés en la interfaz sin catálogo

- Evento completo: pestañas "Teams, Rankings, Matches, Oracle, Advancement, Awards" (`EventViewManager.tsx:362-368`); "Season" (`app/event/[eventCode]/page.tsx:147`); "Avg Score, Avg Auto, Matches, Teams, Highest Score/Clean/Auto" (`EventStats.tsx:197-227`); "Red Alliance / Blue Alliance / Score / Pending" (`MatchList.tsx:480-482,708`); "Rank, Team, NP Avg, High, Disc, Sched, Plays" (`RankingTable.tsx:244-293`); "No teams found…" (`ParticipantList.tsx:93`).
- Estados del evento: "Event Not Found" (`page.tsx:91`).
- `StatsTable.tsx`: "Rankings", "Advancement", "Judging", "Playoff", "Total Pts", "Qual Pts", "Match".
- `EventFilter.tsx` y `EventList.tsx:29`: todo en inglés.
- Eventos: "Alliance Oracle", "OPR Analytics" y el resto del Oracle del Evento (`AlliancePredictor.tsx`).
- Cadenas de la API crudas en pantalla: `next.description` "Qualification 35" en Hoy (`app/page.tsx:185`, `lib/today.ts:95`) frente a "Q35" en Siguiendo (`lib/following-summary.ts:47`).
- Valores del rol de usuario sin traducir: `userDoc.role` se pinta tal cual ("admin", "lead"…) (`AppShell.tsx:317`).
- Palabra de confirmación "DELETE" en la UI en español (`AppShell.tsx:370,374,381` y `Shell.delete.explain`, `confirmLabel`).
- Marca: "PRIDE" (shell) vs "FTC Stats México" (hoja impresa, `MatchBriefingCard.tsx:283`) vs "Iron Lion AI" (`AssistantChat.brand`) vs "IRON LION INTELLIGENCE" (`pro/page.tsx`).

### 6.3 Mismo concepto, nombres distintos

| Concepto | Variantes (archivo:línea) |
|---|---|
| Partido de clasificación | "partidos de calificación" (`TodayPage.qualsProgress`, `app/page.tsx:180`; `LiveRanking.played`), "quals" (`Today.ranking.qualsLeft`, muerto), "Qualys" (`Following.progress`), "qualys" (`PredictionLedger.noForecastHint`, `ScoutBoard.noSchedule`), "Qualy" (`ScoutingContext.option.QUALIFICATION`), "Quals" (`AdvancementList.quals`), "clasificatorias" (`TeamReport.takeaway.champRecord`), "Matches" (`EventStats.tsx:209`) |
| Partido | "partido" (catálogo en general), "match" (`MatchBriefingCard.*`, `MatchList.tsx:296`, `StrategyPage.tipBriefingBody`) |
| Probabilidad de alianza | "Prob. de alianza" (`Today.odds.title`, `Consistency.ui.table.allianceProb`), "Opciones de alianza" (`TodayPage.allianceOdds`), "probabilidad de ser elegido" (`TodayPage.pickOdds`), "Probabilidad de selección" (`DraftOdds.*`) |
| Ranking score | "Ranking score" (`TodayPage.rs`), "RS" (`RankingTable.tsx:251`, `StatsTable.tsx:152`), "Ranking Score (RS)" (`PicklistEditor.weight_averageRS`), "Promedio de RP" (`LiveRanking.subtitle`), "RS actual/final" (`LiveRanking.col.*`) |
| Posición | "Rank" (`RankingTable.tsx:244`, `TeamPage.rank`), "Ranking" (`TodayPage.rank`), "Seed" (`DraftOdds.*`), "#" (`StatsTable.tsx:143`), "rk" (`LiveDraftBoard.invitedDespiteBetter`) |
| Partido parejo | "moneda al aire" (`PredictionLedger.brier`, `LiveScoreboard.brierSub`), "volado" (`MatchList.tsx:888`, `Consistency.note.volatility`), "Parejo" y "casi 50/50" (`PredictionLedger.tossup/tossupHint`), "Empate técnico" (`Projections.technicalTie`) |
| Pronóstico vs predicción vs proyección | "pronóstico PRIDE" (`PredictionLedger.column`), "Predicción Roja/Azul" (`MatchSimulator.redPrediction`), "Predicción: OPR + σ" (`MatchList.tsx:450`), "proyección" (`MatchList.tsx:994`), "Final proyectado" (`TodayPage.projected`) |
| Oracle | Tres objetos (F4) |
| Dejar de seguir | "Dejar" (`Shell.follow.clear`, `AppShell.tsx:275`), "Dejar de seguir {name}" (`Following.unfollow`, `FollowStar.tsx:31`) |
| Capitán | "Capitán" (`AllianceSelector.slotCaptain`, `LiveRanking.col.top4`), "en ruta a capitán" (`TodayPage.wouldCaptain`), "Captain" (`TournamentSimulator.tsx:438`) |
| Alianza | "Alianza Roja" (varios) vs "Red Alliance" (`EventStats.tsx:55`, `MatchList.tsx:480,758`) vs "Alliance {n}" (`TournamentSimulator.tsx:536`) |
| Estado en el nombre del botón | "Seguir" (verbo, `Shell.follow.set`, `TodayPage.follow.submit`, `Following.add`) frente a "Siguiendo" (título de sección, `Following.title`) |
| Rookie | "Año rookie" (`CardView.rookie`), "Temporada rookie" (`TeamSeasonReport.tsx:36`), "primer año de competencia" |
| Eventos "Equipos" | `EventsPage.teams` "Equipos" (conteo de equipos de la temporada, `app/events/page.tsx:93`) vs pestaña "Teams" del evento (equipos de ese evento) |

### 6.4 Diferencias ES/EN (solo desajustes)

- Ninguna llave falta en un idioma (1607 = 1607).
- Los textos de arriba sin catálogo (6.2) no tienen versión EN/ES: aparecen igual en ambos idiomas. En ES, el Evento queda mezclado; en EN, partes del Evento y de `TeamSeasonReport` quedan en español (`TeamSeasonReport.tsx`, `MatchList.tsx:335-406`, `AdvancementList`-aparte).

---

## Finding 7. Formato de números

Hechos con ejemplos. El locale activo es `es` (no `es-MX`); `Intl` en `es` produce `73 %` (con espacio duro) y `73,5 %`; `toFixed`/`Math.round` produce `73%` y `73.5%`.

### 7.1 Porcentajes

| Estilo | Ejemplos |
|---|---|
| `Intl` percent, 0 decimales → "73 %" (es) | `app/page.tsx:65,195,213`; `FollowingPanel.tsx:33,78,161` |
| `Intl` percent, 1 decimal → "73,5 %" | `components/oracle/LiveScoreboard.tsx:19` |
| Literal `%` sin espacio, 0 decimales → "73%" | `PredictionLedger.tsx:13`; `MatchSimulator.tsx:167`; `LiveRankingProjection.tsx:241` (`Math.round(pCaptain*100)%`); `app/team/[teamNumber]/page.tsx:275` (`winRate.toFixed(0)%`); `MatchList.tsx:934` |
| Literal `%`, 1 decimal con punto → "73.5%" | `TournamentSimulator.tsx:538` (`championProbability*100).toFixed(1)%`) sobre 2000 simulaciones |
| `%` dentro del catálogo con espacio | `LiveScoreboard.band` "{lo}–{hi} %", `MatchBriefingCard.redPct` "ROJO {pct}%" (sin espacio) |

Hecho: 2000 simulaciones dan un error de muestreo del orden de ±1 punto porcentual; la pantalla muestra un decimal (`TournamentSimulator.tsx:538`).

### 7.2 Decimales de las métricas

| Métrica | Variantes |
|---|---|
| RS | 2 decimales (`app/page.tsx:208`, `RankingTable.tsx:318`, `StatsTable.tsx:217`, `LiveRankingProjection.tsx`), 1 decimal (`MatchBriefingCard.tsx:402`, `PicklistEditor.tsx:666`) |
| OPR | 1 decimal (`RankingTable.tsx:333`, `MatchList.tsx:336,824`, `AllianceSelector.tsx:138`), 0 decimales (`MatchList.tsx:1033,1040`, `PicklistEditor.tsx:667`, `TeamSeasonReport.tsx:205`), 2 decimales en el promedio rotulado "Match" (`StatsTable.tsx:218`) |
| Brier | 3 decimales (`PredictionLedger.tsx:91`, `LiveScoreboard.tsx:39,66`), "0.250" con punto en el texto traducido (`PredictionLedger.brier`, `LiveScoreboard.brierSub`) |
| Puntaje proyectado | Entero (`MatchList.tsx:934,993`, `MatchSimulator.tsx:161`) |
| Faltas netas | 1 decimal con signo (`RankingTable.tsx:339`, `MatchList.tsx:379,396`) |
| TBP | 0 decimales (`AdvancementList.tsx:147`) |

### 7.3 Récord ganados–perdidos–empates

- En guion largo: `TodayPage.resultLine` "{w}–{l}–{t}" (`app/page.tsx:100`) y nota de RS (`:208`).
- Con guion corto: `FollowingPanel.tsx:154`, `app/team/[teamNumber]/page.tsx:275`, `StatsTable.tsx:224-230`.
- Con diagonal y colores: `RankingTable.tsx:351-357`.
- Encabezado "W-L-T" en inglés (`RankingTable.tsx:290`, `StatsTable.tsx:166`); en Hoy el récord sale como números sueltos "w–l–t" sin leyenda (`app/page.tsx:208`).

### 7.4 Separador decimal

- `toFixed` imprime punto ("80.8") en todo el código: ejemplos de arriba.
- `Intl` en `es` usa coma ("80,8"). En una misma sesión en español conviven "73,5 %" (`LiveScoreboard.tsx:19`) y "73.5%" (`TournamentSimulator.tsx:538`).
- Separador de miles: `toLocaleString("es-MX")` en `TeamSeasonReport.tsx:46,51,349,404` y `RookieComparison.tsx:74,81` (siempre "es-MX", no sigue el idioma del usuario).

---

## Per-principle facts

### Entendible (principio #4), solo hechos

- Los usuarios principales leen en Spanish; el idioma por defecto del código es inglés (`i18n/config.ts:11`) y se elige por cookie o `Accept-Language` (`i18n/locale.ts:10-22`).
- El cambio de idioma está dentro del panel de cuenta (`AppShell.tsx:305`), a dos toques: botón de cuenta → selector.
- Las explicaciones de columnas del Evento están en hover (F4); no hay glosario general (grep de "glosario" en `messages/es.json`: sin resultados) ni enlace a uno.
- Hoy usa 5 términos de jerga sin explicación en la misma pantalla: "Ranking score" (`app/page.tsx:208`), "forma en el evento" (`:196`), "Final proyectado" con "probable #a–#b" (`:210`), "Opciones de alianza" (`:213`), "en ruta a capitán" (`:213`).
- El Evento mezcla español e inglés en una misma pantalla y las ayudas largas de columnas (`MatchList.tsx:335-406`, `RankingTable.tsx:251-286`) llevan términos como "Mastermind", "Net Discipline", "Foul Strategy".
- La pestaña inicial del Evento es "Teams" (`EventViewManager.tsx:55`); el próximo partido y el ranking requieren cambiar de pestaña.
- La barra móvil de 5 destinos no incluye "Más": Taller, Préstamos, Trading Card, Data Lab y Precisión del modelo solo se alcanzan desde el botón de persona de la barra superior (`AppShell.tsx:98-102,281-292`), cuya única etiqueta es `aria-label`.
- Estrategia muestra 6 pestañas (`StrategyClient.tsx:63-86`) y la inicial (Picklist) exige sesión (`PicklistEditor.tsx:290`).
- Texto de interfaz de 8 a 10 px en fuentes importantes: tooltips y etiquetas (F4, "Tamaños"). Hoy usa `text-xs` (12 px) como mínimo.
- Los mensajes vacíos y de error tienen texto accionable en Hoy (`TodayPage.noNextMatch`, `noSchedule`, `Following.noneMx` con "Prueba con «Todas las regiones»").

### Honesto (principio #6), solo hechos

- Hoy cierra con "Las proyecciones son probabilidades, no promesas." (`app/page.tsx:111`, `text-xs`, al final) y `OraclePage.limit3Body`: "Es una herramienta para decidir mejor, no un oráculo."
- Los porcentajes de Hoy no muestran el tamaño de muestra, el modelo usado ni el intervalo; el modelo parte de ≥2 qualys jugadas (`lib/today-summary.ts:126`).
- Existe evidencia pública de exactitud (`/oracle`, "Precisión global", Brier, calibración, "Modelo original — sobreconfiado" vs "corregido") y un ledger por partido en el Evento (`PredictionLedger`), pero Hoy y Estrategia no enlazan a ella.
- Etiquetas con IA, "alta precisión", "Confianza del Modelo" o "Acceso exclusivo": F2.1-F2.6.
- Desajustes entre texto y código en Estrategia y Equipo: F5.2-F5.10.
- Informe del equipo 30311 con cifras y narrativa a mano visibles a cualquiera (`TeamSeasonReport.tsx`).
- Dark patterns: ninguno (F3).

---

## Known gaps

- El barrido de strings sin catálogo es heurístico (regex sobre JSX y atributos); los conteos de F1.8 son cota inferior y se dejaron fuera cadenas construidas por concatenación o en arrays (por ejemplo `MatchList.tsx:888-913` solo se muestreó).
- No se revisaron completos: `components/scouting/*` (formularios de Pit/Match/Super), `components/lending/*`, `components/workshop/*`, `components/card/*`; solo catálogos y encabezados. Para Taller, Préstamos y Card se confirmó el claim de privacidad (`Workshop.subtitle`) solo contra el catálogo, no contra código.
- No se ejecutó la app ni se vio el DOM renderizado; el orden y la visibilidad "en primera vista" se infirieron del código (por ejemplo, la pestaña inicial del Evento y la visibilidad de `NotifySettings`).
- Frases generadas por los motores de `lib` (insights de `lib/projections.ts`, textos de `lib/alliance-utils.ts`, bases de `draft-odds`) se citaron solo en los puntos usados; no se auditó cada clave.
- `lib/notify/*` y la ruta `app/api/cron/live/route.ts` confirman que los avisos existen; quién programa el cron (Cloud Scheduler u otro) no está en el repo, por lo que "te avisamos…" no se pudo verificar de punta a punta.
- La afirmación de `LiveScoreboard.lead` ("aquí no hay ajuste a posteriori") no se verificó contra el pipeline de predicción de `lib/prediction-ledger*`.
- Las cifras de `TeamSeasonReport` (19 %, 24 %, 59 %, 2.7 %) no se contrastaron contra su fuente; solo se documentó que están escritas a mano.
- `components/event/MatchList.tsx` es largo (1059 líneas); se revisaron cabecera, KPIs, tooltips, tarjetas de próximo partido y análisis, no todas las ramas.
- La heurística "sumar dos `averageMatchPoints` cuenta la alianza dos veces" (F2.13) se basa en que `sortOrder2` es un promedio por alianza; la definición exacta la da FIRST y no se verificó en un dato real.
