# Plan: todo con la API oficial de FIRST (incluido el pasado) y PRIDE para FRC

Fecha: 16-nov-2026. Lo pidió Héctor: "cambiar todo a la API de First incluyendo lo pasado" y "que PRIDE también funcione para FRC: estadísticas, proyecciones de partidos y playoffs, Oracle, buscador de partners… y que lo vayamos calibrando". Ejecución autónoma; solo hay intervención humana donde es indispensable.

## Lo que dicen las investigaciones (16-nov)

### API oficial de FTC (probada con nuestras credenciales, ~106 llamadas, sin 429)

- **Cobertura:** completa para 2020–2026, con eventos, partidos, desgloses, rankings, alianzas, premios y equipos con `rookieYear` oficial.
- **2019:** solo ~40 % de los eventos trae datos.
- **Eventos remotos 2020/21:** no tienen playoffs ni alianzas (flag `remote`).
- **Sin endpoint masivo:** hay que hacer una llamada por evento y recurso. Respaldar 2019–2025 son ~7.8k eventos y ~40–47k llamadas: ~1 h y ~100 MB comprimidos.
- **Premios:** se identifican por `awardId` + `series` (el nombre cambia por temporada y patrocinador).
  - Ids: 11 Inspire, 13 Ganador, 12 Finalista, 9 Think, 6 Design, 7 Innovate, 4 Control, 8 Connect, 25 Reach, 26 Sustain, 5 Motivate, 3 Promote, 2 Compass, 1 Judges.
- **Lo único que FIRST no da es el OPR,** y ya lo calculamos nosotros (`lib/component-opr.ts`).

### FRC

- **API:** `frc-api.firstinspires.org` v3, con autenticación Basic (usuario:token).
  - **El token es aparte del de FTC** y requiere registro en https://frc-events.firstinspires.org/services/API, así que lo tiene que hacer Héctor.
  - Términos: igual que en FTC, **prohibido el uso comercial** y hay que mostrar la atribución "Event Data provided by FIRST" con enlace.
- **Juego:** REBUILT 2026 (FUEL al HUB, TOWER).
  - RP: victoria 3 y empate 1, más 3 RP extra: ENERGIZED, SUPERCHARGED y TRAVERSAL. Los umbrales están en el Game Manual.
  - BIOCORE 2027 se revela el 9-ene-2027.
- **México:** Regional Monterrey `MXMO` (11–14 mar 2026, 43 equipos) y Regional Laguna (código por confirmar).
- **Estructura:**
  - 3v3 en qualys, con 8–12 partidos por equipo.
  - Selección de alianzas en serpiente 1→8 y 8→1; quien rechaza no puede volver a ser elegido.
  - Playoffs de doble eliminación con 8 alianzas de 3 más un reserva (13 series, final al mejor de 3) y sin RP.
- **Referencia de modelos:** Statbotics EPA (72 % de acierto 2016–22; 77.5 % en 2022).
  - Su punto de partida es 0.7 de la temporada pasada + 0.3 de la anterior, con 40 % de reversión a la media y una penalización para novatos.
  - Es el mismo enfoque que validamos en FTC (#117).

### Código (auditoría)

- **`OrgProgram` ya admite "FRC",** pero casi todo lo demás está atado a FTC:
  - `lib/ftc-api.ts`;
  - las estaciones Red1/Red2;
  - `getCurrentSeason` con corte en septiembre (FRC usa el año calendario);
  - las reglas de temporada y RP;
  - `gameDefinitionFor` devuelve `undefined` para FRC.
- **Código muerto:** `lib/tba-api.ts` y `lib/frc-alliance-utils.ts` no tienen importadores.
- **Ya genérico:** las alianzas de 3 en `generateAlliances` y el tablero de draft.
- **Riesgo de datos:** `orgs/{id}` usa el número de equipo sin el programa, así que FRC 4977 y un FTC 4977 chocarían. Se necesita una clave compuesta.
- **FTCScout** solo se usa en `scripts/` y en datos congelados de `lib/reports/*` y `lib/data/*`.

## Fases

### Fase A · FTC solo con FIRST (no depende de nadie)

- **A1 · Archivo de temporadas** (`scripts/first-archive-pull.ts` → `data/first-archive/ftc/<S>/`, ignorado por git). **En curso:** 2022–2025 y 2026.
- **A2 · Tabla de historial desde FIRST:**
  - `scripts/build-history-table.ts` lee el archivo, calcula el OPR propio y usa `rookieYear` oficial y los premios por id;
  - se regenera `lib/data/starting-history-2026.json`;
  - se valida contra la versión de FTCScout con el backtest de #117 y debe quedar a ±0.003 de log loss.
- **A3 · Punto de partida con eventos previos de la temporada (#114) desde FIRST, en vivo:**
  - `fetchTeamEvents` + `fetchMatches` de los eventos anteriores (en caché) más ridge propio;
  - presupuesto de tiempo y caché por evento;
  - backtest esperado: 2025 log loss 0.543 → ~0.520.
- **A4 · Scripts de análisis y reportes congelados leen el archivo de FIRST:**
  - scripts: `oracle-backtest`, `growth-curves`, `draft-science`, `live-quals`, `playoff-update`, `pre-event-prior`;
  - reportes en `lib/reports/*`.
  - Se documenta cuánto cambian las cifras (el OPR propio no es igual al de FTCScout).
- **A5 · Fuera FTCScout:** cero referencias en código y scripts; queda solo como mención histórica en docs.
- **A6 · Atribución** "Event Data provided by FIRST" con enlace en el pie de las páginas con datos (FTC y FRC).

### Fase B · Base multiprograma (hilo principal: arquitectura)

- **B1 · Interfaz `ProgramProvider`:** eventos, equipos, ranking, partidos, programa, desgloses, alianzas, premios, eventos de un equipo. El proveedor FTC envuelve `ftc-api.ts`; las cachés llevan clave `${program}:${season}:${evento}`.
- **B2 · Tipos neutros:** alianza de 2 o 3, estaciones Red1–3/Blue1–3, `capabilities` por programa (tamaño de alianza, número de alianzas, formato de playoffs).
- **B3 · Calendario por programa:** `getCurrentSeason(program)`, con FRC en año calendario.
- **B4 · Identidad:** clave de org compuesta (`FRC-4977`) con migración de Firestore y reglas. Es un cambio de datos en producción y **requiere OK** para desplegar reglas.
- **B5 · Rutas:** prefijo `/frc/...` (eventos, evento, equipo) y Hoy según el programa del equipo seguido.

### Fase C · FRC: datos y modelos (necesita el token de FRC)

- **C1 · `lib/frc-api.ts`:** proveedor FRC v3, solo en el servidor, misma caché y TTL que FTC.
- **C2 · Archivo FRC** 2023–2026 (doble eliminación desde 2023).
- **C3 · Definición de juego REBUILT 2026:** puntaje, RP extra, desempates y formulario de scouting. BIOCORE se agrega después del 9-ene-2027.
- **C4 · Modelos FRC con backtest en eventos no vistos:**
  - fuerza del evento (OPR de 3 robots con ridge) y probabilidad de victoria (calibrar σ y k);
  - punto de partida por historial al estilo #117/EPA, con `rookieYear`;
  - proyección de ranking con los RP de REBUILT;
  - bracket de doble eliminación de 8 alianzas (verificado contra el manual) con Monte Carlo del Oracle;
  - simulador de selección (serpiente, rechazos, reserva) y buscador de partners por componentes (auto, teleop, TOWER).
- **C5 · UI FRC:** eventos, evento, equipo, Hoy, picklist y Oracle reutilizando los componentes de FTC.
- **C6 · Calibración continua:** registro de pronósticos (#111) para FRC; meta ≥ 72 % en qualys (nivel EPA) y calibración a ±3 pp.

### Fase D · Cierre

- Re-auditoría y documentación (`CLAUDE.md`, `PENDING.md`, decisiones #118+).
- **Despliegues por hito, cada uno con el OK de Héctor:** A2–A3, A4–A6, B y C.

## Intervención humana (solo lo indispensable)

1. **Token de la API de FRC** (registro con correo). Bloquea la Fase C. Se agrega a `.env.local` y a los secretos de App Hosting como `FRC_API_USERNAME` / `FRC_API_KEY`.
2. **OK de despliegue** en cada hito (regla vigente).
3. **OK para desplegar las reglas de Firestore** de la migración de identidad (B4).

## Cómo se reparte

- **Hilo principal:** arquitectura (B), núcleos de modelo (A2, A3, C4) y revisión.
- **`mecanico` (Sonnet), en worktrees aparte cuando corre en paralelo:**
  - port de scripts (A4);
  - limpieza (A5);
  - atribución (A6);
  - cableado de rutas y UI siguiendo un patrón ya puesto.
- **`revisor` (Sonnet):** antes de cada commit.
- **Investigación puntual** (manual REBUILT, bracket): agentes con tope de búsquedas, sin subagentes.
