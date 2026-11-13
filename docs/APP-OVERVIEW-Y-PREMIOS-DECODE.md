# FTC Stats México — Especificación técnica y valor como evidencia de premios (DECODE 2025-2026)

> Documento de referencia para el equipo. Dos propósitos:
> 1. **Explicar qué hace la app, cómo lo hace y qué modelos matemáticos usa** para sus predicciones (Oracle de alianzas, probabilidades de playoff, proyección de partidos).
> 2. **Mapear la app contra las rúbricas de premios de la temporada FIRST Tech Challenge DECODE 2025-2026**, para usarla como evidencia concreta en el *Engineering Portfolio* y las entrevistas de jueces.
>
> Todas las fórmulas de este documento están tomadas directamente del código fuente (`lib/*.ts`), no son aspiracionales. Referencias de archivo incluidas para que un juez o mentor pueda auditarlas.

---

## Parte I — Qué es la app

### 1. Resumen en una frase

Una **plataforma de scouting colaborativo y analítica predictiva** para FTC/FRC, offline-first, que combina los datos oficiales de la FIRST API con observaciones de scouting de **múltiples equipos** para producir proyecciones de partido, selección óptima de alianzas y simulación de playoffs — con incertidumbre cuantificada en cada número.

### 2. Especificaciones técnicas

| Aspecto | Detalle |
|---|---|
| Framework | Next.js 16 (App Router), React 19 con React Compiler |
| Lenguaje | TypeScript estricto |
| Estilos | Tailwind v4 |
| PWA / offline | Serwist (service worker), instalable, funciona sin conexión |
| Identidad | Firebase Auth (Google) + modelo de organizaciones (equipos) |
| Persistencia | Tres capas con propósitos distintos (ver abajo) |
| Testing | Vitest (224 tests unitarios) + Playwright (smoke E2E) |
| Observabilidad | Sentry en producción |

**Tres capas de datos, cada una con un rol específico:**

1. **Upstash Redis** — caché analítico de las respuestas de la FIRST API y de las agregaciones calculadas. TTL adaptativo (`getSmartTTL`): eventos terminados 30 días, futuros 1–24 h, activos 60 s. Protegido contra *cache stampede* con *single-flight* (coalescing de peticiones en vuelo, `lib/single-flight.ts`).
2. **Firestore** — datos colaborativos en tiempo real: entradas de scouting, usuarios, organizaciones, invitaciones, picklists y logs de calibración.
3. **Dexie / IndexedDB** — dos bases locales: una cola de scouting capturado **offline** que se drena a Firestore al recuperar conexión (`OnlineSync`), y un caché SWR para navegación offline de páginas ya vistas.

**Acceso a la FIRST API es solo de servidor** (`lib/ftc-api.ts` empieza con `import "server-only"`) porque la API pública bloquea CORS de navegador. El navegador nunca vuelve a pegarle a la API directamente.

### 3. Qué hace, módulo por módulo

- **Scouting (`/scouting`)** — tres modos: *Pit* (specs del robot), *Match* (conteos por partido con React-Hook-Form + Zod) y *Super* (ratings subjetivos: driver, defensa, confiabilidad, would-pick). Captura offline instantánea.
- **Estrategia (`/strategy`)** — 5 pestañas: Picklist con drag-and-drop y colaboración en tiempo real, **Alliance Oracle** (auto-selección), **Simulador** de partido Monte Carlo, *Briefing* imprimible para el drive coach, y ranking en vivo.
- **Analítica (`/analytics`)** — *Data Lab* (comparación multi-evento) y *Calibración* (Brier score, log loss, diagrama de confiabilidad — solo admin/lead).
- **Evento (`/event/[code]`)** — rankings, matches, awards, avance, estadísticas.

### 4. El modelo de scouting federado (diferenciador clave)

**Varios equipos pueden contribuir scouting al mismo evento a una base de datos compartida.** Cada entrada queda atribuida (`scoutId`, `orgId`) y se fusiona con reglas por tipo de campo (`lib/scouting-aggregation.ts`):

- **Numéricos** → media ponderada por (confiabilidad del scout × confianza declarada).
- **Categóricos** → voto de mayoría ponderado; empate se rompe por el más reciente.
- **Subjetivos** (driver skill, defensa) → **nunca se fusionan entre equipos**, se mantienen por-org, porque cada equipo calibra su escala 1-5 distinto.
- **Notas** → se listan todas con atribución completa.

Esto es una decisión de diseño con implicación de *Gracious Professionalism* y *Coopertition®*: la herramienta hace que cooperar produzca mejores datos para todos.

---

## Parte II — Los modelos matemáticos

Aquí está el corazón de la app. Cada modelo reemplazó una heurística ingenua por algo estadísticamente defendible, documentado en `docs/memory/decisions.md`.

### 5. Proyección híbrida de equipo — posterior bayesiano por ponderación de varianza inversa

`lib/projections.ts` → `calculateTeamProjection()`

**Problema:** ¿cómo combinar el promedio histórico de la API (estable pero genérico) con las pocas observaciones de scouting (específicas pero ruidosas)? La versión anterior usaba un split fijo 60/40. Ahora usamos un **posterior bayesiano**.

Se trata la base de la API como un **prior** con varianza, y cada partido scouteado como una **observación** con ruido:

- **Prior (API):** media `μ_api = averageMatchPoints`, varianza `σ²_prior = (μ_api · 0.20)²` (coeficiente de variación del 20%, consistente con el ruido de OPR reportado por la comunidad FTC).
- **Observación (scouting):** media muestral `μ_scout`, varianza muestral `σ²_scout` (con corrección de Bessel, `n−1`). La varianza de la *media* muestral es `σ²_scout / n`.
- **Precisiones** (inverso de la varianza): `τ_prior = 1/σ²_prior`, `τ_scout = n/σ²_scout`.
- **Posterior:**

  ```
  μ_híbrida  = (μ_api · τ_prior + μ_scout · τ_scout) / (τ_prior + τ_scout)
  σ²_post    = 1 / (τ_prior + τ_scout)
  ```

**Por qué importa:** con `n = 0` partidos, domina el prior (usamos la API). Con `n = 5+` observaciones consistentes (varianza baja), domina el scouting. La transición es **automática y sin pesos a mano** — resuelve por sí sola el *cold start* de inicio de temporada y la alta confianza de fin de temporada.

**Modificadores multiplicativos** sobre la base híbrida:
- *Driver skill*: swing de ±7.5% según el promedio Likert 1-5 centrado en 3 → `multiplier += (avgSkill − 3) · (0.15/2)`.
- *Riesgo mecánico*: si las notas de pit marcan "fallo"/"broken", `multiplier ×= (1 − 0.4)`.

**Confianza reportada:** `confidence = clamp(1 − σ_post/μ_híbrida, 0.1, 0.99)` — es literalmente `1 − (coeficiente de variación del posterior)`. Un número que no finge certeza perfecta ni pesimismo absurdo.

### 6. Probabilidad de victoria — una sola fuente de verdad, dos entradas

`lib/win-probability.ts`

Antes había **dos fórmulas distintas** para la misma cantidad en distintas pestañas (una logística y una curva Elo base-10). Se unificaron bajo un solo supuesto — *los puntajes de alianza son ruidosos alrededor de una media proyectada* — con dos puntos de entrada:

**(a) Modelo normal** (cuando tenemos modelo de varianza por alianza):

```
P(gana rojo) = Φ( (μ_rojo − μ_azul) / σ_dif )      con σ_dif = √(σ²_rojo + σ²_azul)
```

donde `Φ` es la CDF normal estándar (aproximación de Abramowitz & Stegun 7.1.26, error < 1.5·10⁻⁷). **Por construcción, esta fórmula coincide con la simulación Monte Carlo** (que muestrea de esas mismas normales): el bracket analítico y el simulador convergen al mismo número.

**(b) Modelo logístico** (cuando solo hay proyecciones de punto, sin varianza):

```
P(gana rojo) = 1 / (1 + e^(−k · Δ/promedio))        con k = 1.5, Δ = μ_rojo − μ_azul
```

Normalizar por el puntaje promedio lo hace **agnóstico al juego**: funciona igual si el meta de la temporada es de 60 o de 400 puntos. Es el modelo estándar usado por Statbotics y el trabajo de Elo de Caleb Sykes.

Ambas se acotan a `[0.01, 0.99]`: nunca se muestra certeza falsa.

### 7. Sigma por equipo y por alianza

`lib/alliance-utils.ts` → `computeTeamSigma()`, `combineSigmas()`

La σ de cada equipo (su volatilidad de puntaje) se estima de su historial:

- **≥ 2 eventos:** desviación estándar muestral (n−1) de `avgPoints` entre eventos.
- **1 evento:** `(maxPoints − avgPoints) / 2` como proxy de rango/2.
- **0 eventos:** fallback a 30 (valor legacy global).
- Siempre acotada a `[8, 60]` para evitar colas patológicas en Monte Carlo.

Las σ por equipo se combinan asumiendo contribuciones independientes: **la varianza suma**, así que `σ_alianza = √(Σ σ²_equipo)` — la misma identidad que usa Statbotics para la varianza de EPA a nivel alianza.

### 8. Alliance Oracle — selección greedy con puntaje de sinergia

`lib/alliance-utils.ts` → `generateAlliances()`, `calculateSynergyScore()`

Emula la lógica real de selección de alianzas de FTC:

1. **Capitán** = el equipo disponible mejor rankeado. (Si el rank 1 elige al rank 2, el rank 3 se vuelve capitán automáticamente — igual que en la vida real.)
2. **Primera selección** = el equipo del pool restante que **maximiza el puntaje de sinergia**:

   ```
   sinergia(A, B) = OPR_combinado
                  + 10   si  (autoOPR_A + autoOPR_B) > 30        [bonus por dominio autónomo]
                  − min(|riesgo|·0.8, 30)   si  disciplina neta < −5   [penalización por faltas]
   ```

Es *greedy* (localmente óptimo por alianza), que es exactamente cómo se juega la selección serpiente en un evento.

### 9. Simulación Monte Carlo de playoffs

`lib/alliance-utils.ts` → `runMonteCarloSimulation()`

Para pronosticar **quién gana y quién avanza**, se simula el bracket completo miles de veces (2000 por defecto):

- Se construye el bracket de **doble eliminación** correcto según el tamaño (2/4/6/8 alianzas), con la lógica oficial de propagación ganador/perdedor entre matches (`initializeBracket`, `setSlotInNextMatch`). Para 2 alianzas es un *Best-of-3*.
- En cada iteración, el puntaje de cada alianza se muestrea de una normal `N(μ, σ²)` vía **transformada de Box-Muller**:

  ```
  puntaje = μ + z·σ,    z = √(−2·ln(u₁)) · cos(2π·u₂),   u₁,u₂ ~ Uniforme(0,1]
  ```

- Gana quien saca más puntos esa iteración; se propaga por el bracket.
- Tras las 2000 corridas:

  ```
  P(campeón)  = veces que la alianza ganó la final / iteraciones
  P(finalista) = veces que la alianza llegó a la final / iteraciones
  ```

Esto responde directamente la pregunta *"¿qué probabilidad tiene mi alianza de ganar el evento / de avanzar?"* con un número calibrado, no una corazonada.

### 10. Inferencia de Ranking Points — regresión logística entrenada

`lib/rp-inference.ts` + `lib/logistic-regression.ts`

Los RP no se predicen con una tasa fija ("si anota más de X, entonces P fija"). Se entrena una **regresión logística por cada tipo de RP** con los resultados reales de la temporada:

- **Vector de features** (mismo orden en entrenamiento e inferencia): `[avgAuto, avgTele, avgEnd]` — el puntaje de la alianza descompuesto en fases. Una sola función (`allianceScoreComponents`) garantiza que entrenamiento y servicio descompongan idéntico (evita *train-serve skew*).
- **Entrenamiento** (`trainLogistic`): descenso de gradiente batch con regularización L2 (λ=0.01), tasa 0.1, features estandarizadas a media 0 / varianza 1, hasta 1000 iteraciones o convergencia por cambio relativo de la log-verosimilitud negativa < 10⁻⁶.
- **Inferencia:** `P(RP=1) = sigmoid(bias + Σ wⱼ · featureⱼ_estandarizada)`.
- **Targets DECODE:** `movement` → RP1, `artifact` → RP2, `pattern` → se aproxima como `artifact × 0.7` (Pattern correlaciona con Artifact pero no 1:1, y no tiene su propio slot de RP en DECODE).
- **Fallback transparente:** si aún no hay modelo entrenado (temporada fresca), cae a la heurística de tasa empírica sin romperse. Los modelos se cachean en Redis con clave versionada (`rp-model:{season}:{target}:v2`).

**Por qué mejora la heurística:** la logística da una `P(RP)` **continua** en función del perfil de puntaje. Dos alianzas del mismo lado de un umbral ya no se tratan idénticas; una que anota 20% arriba del promedio de matches-con-RP obtiene una P mayor que una que apenas lo supera.

### 11. Agregación federada y validación ground-truth

**Ponderación (`lib/scouting-aggregation.ts`):**

```
peso(entrada) = max(0, pesoConfianza · confiabilidadScout)
pesoConfianza:  high = 1.0,  medium = 0.6,  low = 0.3
```

- Numéricos: media y varianza ponderadas; se marca `flagged` si el coeficiente de variación > 0.5 (los scouts se contradicen).
- Categóricos: mayoría ponderada; `flagged` si el ganador tiene < 66% del peso.

**Validación ground-truth (`lib/ground-truth-validation.ts`)** — cierra el ciclo de calidad de datos:

1. Se reconstruye el puntaje de cada alianza desde el consenso de scouting y se compara con el puntaje oficial de la FIRST API.
2. La señal de cada scout es su **precisión de reconstrucción con sus propias entradas**: `señal = clamp(1 − error_propio, 0, 1)` (diseño v3; corrige que versiones previas medían contribución marginal, no confiabilidad, y castigaban al scout cuidadoso en compañía ruidosa).
3. La confiabilidad se actualiza con **media móvil exponencial (EWMA)**: `confiabilidad ← (1 − α)·confiabilidad + α·señal`, con `α = 0.2` (una mala observación no destruye un buen historial).
4. Esa confiabilidad **vuelve a entrar como peso** en la agregación → sistema auto-corrector: los scouts precisos pesan más con el tiempo.

Está **scopeada por `orgId`** (fix de seguridad C4): un lead de un equipo no puede sobrescribir la confiabilidad de scouts de otro equipo.

---

## Parte III — DECODE 2025-2026: referencia de puntaje que modela la app

La app modela el sistema de puntos de DECODE (de `lib/games/ftc-decode-2025.ts` y las fórmulas de reconstrucción):

| Elemento | Auto | TeleOp | Endgame |
|---|---|---|---|
| Artifact púrpura / verde | 3 pts c/u | 2 pts c/u | — |
| Patrón / Motif completado | — | 10 pts | — |
| Base parking | — | — | Full 10 / Parcial 5 |
| Dual parking (aliado) | — | — | 20 pts |

**Ranking Points DECODE modelados:** RP1 = *Movement*, RP2 = *Artifact/Goal*, más *Pattern RP* (derivado). Cada uno con su propia regresión logística (§10).

---

## Parte IV — Benchmark competitivo: cómo nos diferenciamos

El ecosistema de herramientas de FTC se divide en **dos categorías que casi nunca se cruzan**. Nuestra app vive en la intersección y añade una capa que ninguna de las dos tiene.

### Categoría A — Agregadores de estadística (derivados de la API oficial)

Toman los resultados oficiales de match y calculan ratings. **No ingieren scouting humano.**

- **[FTCScout](https://ftcscout.org/about)** — el estándar de facto de stats FTC. Calcula **OPR** (Offensive Power Rating) resolviendo un sistema de ecuaciones lineales por **mínimos cuadrados** sobre los resultados de match; OPR por componente (auto/endgame), filtros avanzados, mapas de campo 3D, y **API pública** (GraphQL + REST). Open source, cobertura global e histórica. Es maduro y confiable.
- **[Statbotics](https://www.statbotics.io/)** — trae el modelo **EPA** (Expected Points Added) de FRC a FTC: un rating tipo Elo pero **en unidades de punto**, con EPA por componente (auto/teleop/endgame) y **EPA de Ranking Points**. Ofrece predicción de match, probabilidad de victoria, **simulación de evento** para pronosticar ranking, y comparación de socios de alianza. API/CSV/Python. Su EPA está **calibrado y validado** (Brier score) a lo largo de temporadas — es el modelo base más sofisticado del ecosistema.
- **[The Orange Alliance](https://theorangealliance.org/)** — plataforma de datos + API para "scout, watch, relive"; foco en acceso a datos oficiales, no en modelado predictivo propio.

### Categoría B — Apps de captura de scouting colaborativo

Recogen observaciones humanas durante el evento. **Analítica delgada o nula.**

- **[FTC Scouting and Scoring](https://apps.apple.com/us/app/ftc-scouting-and-scoring/id1448567515)** — sincronización en tiempo real vía Firebase; varios miembros **del mismo equipo** scoutean simultáneamente.
- **[FTC Decode Scouting](https://apps.apple.com/us/app/ftc-decode-scouting/id6759691940)** — captura con sync a la nube que comparte al instante con el equipo.

Ambas resuelven la *captura* colaborativa (un solo equipo), pero no producen proyecciones bayesianas, simulación de playoffs ni calibración de confiabilidad.

### Dónde encaja FTC Stats México

Somos la única herramienta que **funde ambas categorías** y agrega una capa que no existe en ninguna:

| Capacidad | FTCScout | Statbotics | The Orange Alliance | Apps de scouting (Cat. B) | **FTC Stats México** |
|---|:---:|:---:|:---:|:---:|:---:|
| Fuente de datos | API oficial | API oficial | API oficial | Scouting humano | **API + scouting (fusión)** |
| Rating de puntaje (OPR/EPA) | OPR (mín. cuadrados) | **EPA (Elo, calibrado)** | OPR-ish | — | OPR + proyección híbrida |
| Componente auto/teleop/endgame | ✅ | ✅ | Parcial | — | ✅ |
| Predicción de match + prob. victoria | Parcial | ✅ | Parcial | — | ✅ (modelo unificado) |
| **Simulación Monte Carlo de playoffs** | — | Sim. de evento | — | — | ✅ (bracket doble elim.) |
| Selección de alianzas | Comparar equipos | Comparar socios | — | — | ✅ (Oracle greedy) |
| Captura de match scouting | — | — | — | ✅ | ✅ |
| Pit scouting + ratings subjetivos | — | — | — | Parcial | ✅ |
| Scouting colaborativo (mismo equipo) | — | — | — | ✅ | ✅ |
| **Scouting federado (cross-equipo)** | — | — | — | — | ✅ **único** |
| **Confiabilidad de scout por ground-truth** | — | — | — | — | ✅ **único** |
| Incertidumbre cuantificada (intervalos/flags) | — | Parcial | — | — | ✅ |
| Offline-first (PWA) | — | — | — | Parcial | ✅ |
| API pública | ✅ | ✅ | ✅ | — | Aún no |
| Cobertura de datos (global/histórica) | ✅✅ | ✅✅ | ✅✅ | Solo lo scouteado | Regional/bootstrap |
| Madurez / battle-tested | Alta | Alta | Alta | Media | Nueva |

### Los cuatro diferenciadores estructurales (no son solo "features")

Estos no se pueden copiar añadiendo un botón — son consecuencia de decisiones de arquitectura:

1. **Fusión API + scouting humano.** Los agregadores (Cat. A) *estructuralmente* no pueden usar scouting subjetivo porque solo consumen la API. Nosotros lo mezclamos con un **posterior bayesiano** (§5) que pesa cada fuente según cuánta evidencia y consistencia tiene. Ni FTCScout ni Statbotics hacen esto porque no ingieren datos humanos.
2. **Federación cross-equipo.** Las apps de captura (Cat. B) sincronizan dentro de *un* equipo. Nosotros fusionamos scouting de **varios equipos** con reglas por tipo de campo (§11) — más datos, mejor consenso, y una filosofía de *Coopertition®* incorporada al diseño.
3. **Confiabilidad auto-calibrada por ground-truth.** Nadie más compara la reconstrucción del scouting contra el puntaje oficial para **aprender qué scout confiar** (EWMA, §11). Es un ciclo de calidad de datos cerrado.
4. **Incertidumbre honesta en todos lados.** Cada predicción reporta confianza acotada y marca cuando los scouts se contradicen. Los ratings de punto (OPR) no traen esa señal.

### Dónde ellos son más fuertes (honestidad de ingeniería)

Presentar esto ante jueces **suma** credibilidad:

- **Cobertura y madurez:** FTCScout, Statbotics y TOA cubren *todos* los eventos globalmente con años de histórico y APIs públicas battle-tested. Nuestra base es regional y arranca desde cero.
- **Rating base más sofisticado:** el **EPA de Statbotics** está calibrado y validado por Brier score a lo largo de temporadas; nosotros consumimos OPR como prior, no un rating propio validado a esa escala.
- **Visualización:** los mapas de campo 3D de FTCScout son superiores a nuestra UI actual.

**Nuestra tesis competitiva:** no ganamos siendo un mejor agregador de OPR — ese terreno ya lo dominan. Ganamos en la **capa de fusión y colaboración** que las herramientas de solo-API no pueden ocupar y las apps de solo-captura no saben modelar.

### Por qué este benchmark ES evidencia de premio

Haber hecho este análisis competitivo — identificar dos categorías, ubicar el hueco, y decidir arquitectura para ocuparlo — **es literalmente proceso de ingeniería documentado**. Los jueces de **Think** e **Innovate** buscan exactamente esto: evidencia de que el equipo estudió el estado del arte y justificó por qué su solución es distinta, no reinventada. Incluir esta tabla en el Engineering Portfolio demuestra madurez de análisis de trade-offs.

---

## Parte V — La app como evidencia de premios FTC (DECODE 2025-2026)

Esta es la parte que conviene llevar a la mesa de jueces. **Seré honesto sobre el encaje de cada premio** — sobrevender ante jueces es contraproducente.

### Encaje por premio

| Premio | Encaje | Por qué / qué evidencia aporta la app |
|---|---|---|
| **Think** (Portfolio obligatorio) | ⭐⭐⭐ **Fuerte** | El premio exige mostrar el proceso de ingeniería con **análisis matemático y de trade-offs**. La app *es* un proyecto de ingeniería de software documentado: cada modelo (Bayesiano, logística, Monte Carlo) reemplazó una heurística ingenua con una decisión razonada y registrada en `docs/memory/decisions.md`. Es evidencia literal de "matemática, ciencia y proceso de diseño". |
| **Innovate** | ⭐⭐⭐ **Fuerte** | Solución creativa y única a un problema real (scouting confiable multi-equipo). El **modelo federado con confiabilidad auto-calibrada por ground-truth** no es algo estándar; se puede presentar con narrativa problema→solución y comparación contra el scouting en papel. |
| **Connect** | ⭐⭐⭐ **Fuerte** | El premio valora conectar y compartir con la comunidad de ingeniería/FIRST. La app está **diseñada para que varios equipos mexicanos colaboren** en una base compartida. Compartir la herramienta con otros equipos (FTC 30311, y apertura a otros) es evidencia directa de construcción de comunidad. |
| **Inspire** (overarching) | ⭐⭐⭐ **Fuerte** | Requiere excelencia combinada en MCI + Team Attributes + Think. Una herramienta que demuestra rigor técnico *y* filosofía colaborativa refuerza el paquete completo. |
| **Control** (Portfolio obligatorio) | ⭐ **Débil — no forzar** | El Control Award reconoce sensores y software que mejoran la **funcionalidad del ROBOT durante el juego** (autónomo, asistencias al piloto). Esta app **no controla el robot**. Solo sería relevante si el análisis alimenta directamente decisiones de estrategia ejecutadas (p. ej. qué autónomo correr según el rival previsto) — y aun así es tangencial. **No presentarla como evidencia central de Control.** |
| **Design** | ⭐ **Débil** | Es sobre diseño mecánico/CAD del robot. No aplica. |
| **Reach / Sustain / Motivate** | ⭐⭐ **Medio** | Si compartir la app recluta o sostiene equipos (onboarding de nuevos equipos mexicanos a FIRST, o un plan de sostenibilidad de la herramienta año a año), aporta evidencia secundaria. |

### Cómo presentarla ante jueces (guion sugerido)

1. **Enmarca el problema, no la tecnología.** "El scouting en papel produce datos ruidosos y sesgados. Construimos un sistema que cuantifica cuánto confiar en cada dato."
2. **Muestra una decisión de ingeniería con su trade-off.** Ejemplo perfecto para Think: *"Empezamos con un split fijo 60/40 entre API y scouting. Lo reemplazamos con un posterior bayesiano de varianza inversa porque el peso correcto depende de cuántas observaciones tenemos y qué tan consistentes son — no de un número inventado."* (§5). Los jueces de Think buscan exactamente esto.
3. **Demuestra honestidad estadística.** Toda predicción reporta confianza acotada `[0.01, 0.99]`; el sistema marca cuando los scouts se contradicen. Esto comunica madurez de ingeniería.
4. **Cierra con impacto comunitario** (Connect/Inspire): el modelo federado y la intención de abrirlo a otros equipos mexicanos.
5. **Ofrece auditar el código.** Cada fórmula de este documento apunta a un archivo. La trazabilidad es, en sí misma, evidencia de proceso.

### Qué incluir en el Engineering Portfolio

- Un diagrama del flujo de datos (3 capas) — media página.
- **Una** deep-dive matemática (recomendado: el posterior bayesiano de §5 o el Monte Carlo de §9) con la fórmula, el "antes" (heurística) y el "por qué" del cambio. Esto es oro para Think.
- Una captura del sistema de confiabilidad de scouts marcando un desacuerdo real.
- **La tabla de benchmark competitivo (Parte IV)** con el hueco que ocupamos — evidencia directa de análisis del estado del arte para Think/Innovate.
- Una línea sobre pruebas: *"224 tests unitarios; cada corrección de un bug estadístico incluyó un test que falla contra el código viejo."* — demuestra rigor de proceso.

---

## Parte VI — Limitaciones (honestidad de ingeniería)

Declarar límites **fortalece** el caso ante jueces, no lo debilita:

- La σ entre-eventos es un proxy de cota-superior de la varianza intra-evento real (no tenemos puntajes por-match individuales en `TeamEvolution`).
- Los modelos de RP requieren re-entrenamiento por temporada; sin modelo entrenado, la app usa la heurística empírica (degradación transparente, no falla).
- La reconstrucción de puntaje desde scouting es aproximada (no cuenta mecánicas de solo-RP que no suman al total anotado).
- Los pesos del modelo (`apiPriorCV = 0.20`, `driverSkillImpact`, etc.) están calibrados contra DECODE pero deben re-ajustarse desde el Brier score observado conforme se acumulen logs de calibración reales.

---

## Referencias

**Código fuente (auditable):**
- `lib/projections.ts` — proyección híbrida bayesiana y proyección de partido.
- `lib/win-probability.ts` — modelo unificado de probabilidad de victoria.
- `lib/alliance-utils.ts` — σ por equipo, Oracle greedy, bracket y Monte Carlo.
- `lib/rp-inference.ts` + `lib/logistic-regression.ts` — regresión logística de Ranking Points.
- `lib/scouting-aggregation.ts` — agregación federada ponderada.
- `lib/ground-truth-validation.ts` — validación y confiabilidad EWMA.
- `lib/games/ftc-decode-2025.ts` — definición del juego DECODE.
- `docs/memory/decisions.md` — bitácora de decisiones de modelado.

**Herramientas comparadas en el benchmark (Parte IV):**
- [FTCScout — About](https://ftcscout.org/about) · [API](https://ftcscout.org/api) · [repo](https://github.com/ftc-scout/ftc-scout)
- [Statbotics](https://www.statbotics.io/) · [The EPA Model: A Gentle Introduction](https://www.statbotics.io/blog/intro)
- [The Orange Alliance](https://theorangealliance.org/)
- [FTC Scouting and Scoring (App Store)](https://apps.apple.com/us/app/ftc-scouting-and-scoring/id1448567515) · [FTC Decode Scouting (App Store)](https://apps.apple.com/us/app/ftc-decode-scouting/id6759691940)

**Rúbricas de premios FIRST Tech Challenge:**
- [Team Update 32 — DECODE Competition Manual (firstinspires.org)](https://ftc-resources.firstinspires.org/ftc/game/cm-html/DECODE_Competition_Manual_TU32.htm)
- [Awards (Sección 6) — FIRST Program Resources](https://ftc-resources.firstinspires.org/ftc/game/manual-06)
- [Awards | FIRST Tech Challenge](https://www.firstinspires.org/resources/library/first-tech-challenge-awards)
- [Types of Awards — Game Manual 0](https://gm0.org/en/latest/docs/awards/award-types.html)
- [FTC Judging Summary Sheet (PDF)](https://info.firstinspires.org/hubfs/web/program/ftc/ftc-judging-summary-sheet.pdf)

---

*Documento generado el 2026-07-16. Modelos verificados contra el código de la rama `feat/oracle-alliance_maker-260210`.*
