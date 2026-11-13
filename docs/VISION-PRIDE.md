# PRIDE — Visión: de herramienta de scouting a proyecto insignia de Iron Lion

*2026-07-28 · Documento estratégico. Insumo para: roadmap de producto, engineering portfolio, y presentaciones a jueces (FTC/FRC).*

---

## 1. Qué es PRIDE hoy (activos reales, no aspiraciones)

**~27,000 líneas de TypeScript, 224 tests, en producción, validada en competencia real.**

| Activo | Estado | Evidencia |
|---|---|---|
| **Motor predictivo (Oracle)** | Validado en vivo | 9/10 ganadores de playoffs acertados en FPEMX 2026. OPR Gauss-Seidel, blend bayesiano API+scouting, Monte Carlo con σ por equipo, regresión logística por RP |
| **Scouting federado multi-equipo** | Único en su clase | Varias organizaciones contribuyen a una base compartida; reliability score por scout vía leave-one-out; datos subjetivos nunca se mezclan entre orgs |
| **Draft en vivo + asesor de invitación** | Probado en FPEMX | Proyecciones por alianza en tiempo real; escenarios aceptar-vs-declinar con inferencia de la calidad de scouting del rival |
| **Capa de realidad del bracket** | Probado | Modela fallas de robot y foul points; explica lo que el modelo puro no puede (la Lower Final 198-180) |
| **Offline-first PWA** | En producción | Serwist + Dexie + sync automático; sobrevive al WiFi de venue |
| **Reporte de temporada grado-sponsor** | Nuevo | `/team/30311`: percentiles mundiales, cohortes rookie nacional/internacional, premios — con fuentes citadas |
| **Base FRC ya iniciada** | Parcial | `tba-api.ts` (The Blue Alliance), toggle FTC/FRC, `frc-alliance-utils.ts` (sinergia Reefscape), tipos de scouting FRC |
| **Juegos declarativos** | Infraestructura lista | `types/game-definition.ts` + `DynamicGameForm`: definir el juego 2026-27 = escribir un archivo |
| **Design system propio** | Nightshift desplegado | Tokens semánticos, dark-first, legible en venue |

**La tesis:** PRIDE ya no es "una app de stats". Es una **plataforma de inteligencia competitiva federada** — y eso es exactamente el tipo de proyecto que FIRST premia cuando trasciende al robot.

---

## 2. FTC → FRC: la brecha es menor de lo que parece

Lo que se transfiere **sin tocar** (es matemática, no reglas): OPR/EPA, win-probability, Monte Carlo, picklist, reliability de scouts, calibración (Brier/log-loss).

| Capa | FTC (hoy) | FRC (brecha) |
|---|---|---|
| Datos | FIRST FTC API + Upstash | **TBA API ya integrada** — falta paridad de fetchers (schedule híbrido, alianzas) |
| Alianzas | 2 robots (+3 Premier §15.3) | 3 robots + backup, serpentine — `generateAlliances` ya soporta tamaño variable |
| Draft | Validado FPEMX | Mismo motor; el asesor de invitación aplica igual (declinar en FRC también bloquea, regla equivalente a T702) |
| Scouting | DECODE forms | `FRCMatchScouting` ya tipado; falta form Reefscape/2027 vía juego declarativo |
| RP/ranking | 3 RP logístico | RPs distintos por juego — reusar `rp-inference` con nuevos targets |

**Usuario piloto natural: FRC 4977** (equipo hermano). Esfuerzo estimado para "FRC usable en un regional": 2-3 semanas de trabajo enfocado, porque los cimientos ya existen.

---

## 3. El mapa de expansión — 8 territorios

Ordenados por (valor para premios × apalancamiento de lo ya construido):

### T1 · Bitácora de ingeniería viva (Engineering Notebook digital)
El portfolio FTC hoy se arma a mano al final. PRIDE ya tiene los datos: cada iteración del robot se refleja en OPR/auto/endgame por evento. **Idea:** entradas de bitácora (texto+foto+decisión) vinculadas a fechas y eventos → la app **grafica el impacto de cada decisión de diseño sobre el rendimiento real**. Nadie más puede mostrar "cambiamos el intake el 12-ene → auto subió 22% en el siguiente evento" con datos oficiales. Auto-genera secciones del portfolio.
→ *Apunta a: Think Award (documentación del proceso), Inspire.*

### T2 · Tracker de outreach e impacto
Registro de actividades (evento, horas, personas alcanzadas, fotos, aliados) con dashboard acumulado y **generador de evidencia** para el portfolio. El reporte grado-sponsor de `/team/30311` ya es el molde: extenderlo a impacto comunitario.
→ *Apunta a: Connect, Motivate, Inspire (FTC); FIRST Impact Award (FRC — el premio máximo, exige exactamente esta documentación sostenida).*

### T3 · Desarrollo de miembros (skills matrix)
Perfil por miembro: habilidades (CAD, programación, electrónica, scouting, liderazgo, outreach) con niveles y evidencia. El **scout reliability score ya es una medición objetiva de habilidad** — generalizar el concepto. Rutas de aprendizaje para novatos, plan de sucesión senior→junior.
→ *Apunta a: Dean's List (evidencia individual documentada), Motivate; y resuelve el problema real #1 de todo equipo: la fuga de conocimiento al graduarse.*

### T4 · Planeación de temporada
Objetivos por evento (rank/RP/OPR objetivo — el insight FPEMX "top-4 seed vale oro" convertido en metas), calendario, presupuesto ligero, Gantt de build season. La app ya sabe qué eventos existen y qué se necesita para avanzar (advancement points).
→ *Apunta a: operación del equipo; demuestra madurez de gestión ante jueces.*

### T5 · Red federada México ("el Statbotics de México")
El scouting federado ya es multi-org. Abrirlo deliberadamente: invitar a los equipos mexicanos (los 31 rookies DECODE, los grandes de la sección 04) a scoutear juntos. Rankings y percentiles nacionales públicos. PRIDE se vuelve **infraestructura de la comunidad FTC México** — y cada equipo que la usa es evidencia de outreach STEM de Iron Lion.
→ *Apunta a: Connect Award directo ("conectar con la comunidad de ingeniería"); es la historia de Inspire.*

### T6 · Open source + historia pública
Publicar el motor (o la app entera) como open source con documentación. Statbotics y The Blue Alliance son proyectos estudiantiles que se volvieron infraestructura mundial de FIRST — ese es el techo. Un README con la validación FPEMX (9/10) es una carta de presentación técnica.
→ *Apunta a: Dean's List del/a líder del proyecto, credibilidad ante jueces y sponsors, reclutamiento.*

### T7 · Análisis post-match con video
Vincular videos de matches (YouTube del evento) con timestamps y anotaciones de estrategia. El bracket y el schedule ya existen; el video es la capa que falta para el review de drive team.
→ *Apunta a: mejora deportiva directa; feature diferenciador vs FTCScout.*

### T8 · CRM ligero de sponsors
Registro de sponsors (contacto, aportación, compromisos) + **generación automática del reporte** que ya construimos para 30311, personalizado por sponsor. Cierra el ciclo: datos → resultados → recursos.
→ *Apunta a: sostenibilidad (Impact/Inspire narrativa), y utilidad inmediata para la mesa directiva.*

---

## 4. La matriz premio ↔ producto

| Premio | Qué exige el juez | Qué evidencia da PRIDE |
|---|---|---|
| **Inspire (FTC)** | Excelencia integral + embajadores FIRST | Toda la plataforma; la red federada (T5) como outreach |
| **Think (FTC)** | Proceso de ingeniería documentado | Bitácora viva (T1) con impacto medido en datos oficiales |
| **Connect (FTC)** | Conexión con comunidad STEM | Red federada MX (T5) + open source (T6) |
| **Motivate (FTC)** | Cultura de equipo, alcance | Skills matrix (T3) + outreach tracker (T2) |
| **FIRST Impact (FRC)** | Impacto sostenido y medible en comunidad | T2+T5+T6 son literalmente el expediente |
| **Dean's List** | Liderazgo individual con evidencia | El/la estudiante líder de PRIDE con el repo como portafolio |

**Regla de oro para el pitch a jueces:** PRIDE no es "software que hizo el equipo" — es *"infraestructura que Iron Lion construyó y regaló a la comunidad FTC de México, validada en el Premier Event con 9/10 de precisión"*. Esa frase gana entrevistas.

---

## 5. Plan de trabajo por horizontes

### H1 · Off-season (ago–oct 2026) — "sembrar el expediente"
El portfolio de la próxima temporada se escribe con lo que se haga AHORA.
1. **T2 Outreach tracker** (1-2 sem) — cada actividad del off-season queda registrada desde el día 1
2. **T1 Bitácora MVP** (2 sem) — entradas simples (texto+foto+tag de evento); la correlación con rendimiento viene después
3. **FRC paridad mínima** (2-3 sem) — completar fetchers TBA, validar Oracle con datos históricos Reefscape de 4977 (backtest = misma validación que hicimos con FPEMX)
4. **T6 preparación open source** (1 sem) — limpiar secretos, README con la historia FPEMX, licencia

### H2 · Pre/build season (nov 2026–feb 2027) — "la nueva temporada nace dentro de PRIDE"
5. **Juego FTC 2026-27 declarativo** (días — la infraestructura ya está; es EL test del diseño `game-definition`)
6. **T4 Planeación** (2 sem) — metas por evento + advancement tracker
7. **T3 Skills matrix MVP** (2 sem) — perfiles, habilidades, evidencia; onboarding de novatos
8. **T1 fase 2** — la gráfica "decisión de diseño → impacto en OPR" (el killer feature del Think Award)

### H3 · Temporada 2027 — "la red"
9. **T5 Red federada MX** — invitar equipos aliados (los Rhinos 31546 son el candidato #1 por la relación FPEMX), percentiles nacionales
10. **FRC en vivo con 4977** en su regional
11. **T7 video** y **T8 CRM** según capacidad

**Principio de foco:** máximo 2 territorios activos a la vez. El Oracle y el scouting son el corazón — nada de lo nuevo puede degradarlos (los 224 tests y la calibración son el guardián).

---

## 6. Riesgos honestos

- **Alcance vs. manos:** esto es un roadmap de 12 meses para un equipo estudiantil. La priorización H1→H3 existe para poder cortar en cualquier punto y aún tener valor completo.
- **Sostenibilidad post-graduación:** T3 (skills matrix + sucesión) no es opcional — es lo que mantiene vivo el proyecto. Documentar > construir.
- **Privacidad de menores:** T3 (perfiles de miembros) exige diseño cuidadoso de permisos (org-only, sin datos públicos de menores). Revisar antes de construir.
- **La trampa del feature creep:** cada territorio nuevo debe responder "¿qué premio o qué problema real del equipo resuelve?" — si no tiene respuesta, no entra.

---

*Relacionado: `docs/PENDING.md` (trabajo técnico pendiente), `docs/memory/decisions.md` (decisiones de algoritmos), `lib/reports/team-30311-decode.ts` (molde del reporte sponsor).*
