# PRIDE — Estrategia de producto y modelo de apertura

*2026-07-29 · Documento de decisión. Insumos: auditoría de arquitectura de información, inventario de funcionalidad incompleta, benchmark competitivo y análisis de modelo de apertura.*

> Complementa —no reemplaza— a `docs/VISION-PRIDE.md` (los 8 territorios) y `docs/PENDING.md` (trabajo técnico). Este documento responde tres preguntas distintas: **cómo presentamos la información**, **qué construido a medias vale la pena terminar**, y **cómo se abre la app sin regalar la ventaja competitiva**.

---

## Parte I — Arquitectura de información: el diagnóstico

### El problema de fondo

La app está organizada alrededor de **conjuntos de datos**, no alrededor del **momento en que estás**.

La navegación actual dice: *General Stats · Scouting Form · Estrategia · Data Lab · Precisión del Oracle*. Son nombres de **herramientas** y de **capas técnicas**. Pero un usuario en el pit a las 9 AM del sábado no piensa "quiero ir al Data Lab" — piensa *"¿contra quién juego ahorita?"*, *"¿a quién apunto para la selección?"*, *"¿me van a escoger?"*.

**No existe una vista "mi equipo hoy".** La puerta de entrada (`/`) es una tabla global de la temporada. La personalización existe, pero en bolsillos aislados que el usuario tiene que ir a buscar: `LiveRankingProjection.tsx:58` sí sabe tu número de equipo, `MatchList` sí sabe cuál es tu próximo partido, `lib/draft-odds.ts` sí sabe tu probabilidad de ser seleccionado. Nada de eso está reunido en un solo lugar.

### Síntomas concretos, con evidencia

| # | Síntoma | Evidencia |
|---|---|---|
| 1 | **El Oracle vive en dos lugares con profundidades distintas** | `AlliancePredictor` se monta en `EventViewManager.tsx:418` (2 clics) y en `ComparisonView.tsx:124`, alcanzable solo vía `/analytics` → Data Lab → seleccionar 2+ eventos → Comparación → Oracle (5 niveles) |
| 2 | **Dos simuladores sin relación entre sí** | `MatchSimulator` (partido individual) vive en `/strategy`; `TournamentSimulator` (bracket completo, 1164 líneas — el componente más grande del repo) vive enterrado dentro del `AlliancePredictor` del punto anterior. Un usuario jamás encontraría el segundo |
| 3 | **`/event/[code]` está sobrecargada** | 6 sub-vistas + link "PRO" + `AlliancePredictor` anidado con 3 sub-modos propios + un slider "Historia por Ronda" transversal. Todo bajo una sola URL |
| 4 | **El reporte de equipo está cableado a 30311** | `TeamSeasonReport` (438 líneas) solo renderiza para `teamNumber === 30311`. Cualquier otro equipo ve "No recent match records found" |
| 5 | **`/pro` es delgada, no está en el nav y se llama "Iron Lion Intelligence"** | Alcanzable solo desde `EventViewManager.tsx:346`. El nombre es un problema el día que entren otros equipos |
| 6 | **Idioma mezclado en la navegación** | "General Stats", "Scouting Form", "Data Lab" conviven con "Estrategia" y "Precisión del Oracle" |
| 7 | **`lead` y `admin` son indistinguibles** | Ningún check en todo el repo separa los dos roles: los 9 server actions y los 5 componentes gated usan siempre `role === "admin" \|\| role === "lead"`. Es un rol de más |
| 8 | **Ninguna ruta tiene control de acceso a nivel de navegación** | No hay `middleware.ts`. Todas las rutas devuelven 200 y renderizan para un visitante anónimo; el gating vive solo en componentes y server actions |

### La reorganización propuesta: del catálogo al calendario

La estructura debe seguir el **arco real de una competencia**, que es el modelo mental que el usuario ya tiene:

```
ANTES          →  DURANTE QUALS   →  SELECCIÓN      →  PLAYOFFS      →  DESPUÉS
¿quiénes           capturar y         decidir a         ejecutar         aprender
 vienen?           ajustar            quién             el bracket
```

**Cambio de mayor palanca: `/` deja de ser una tabla global y se vuelve "Hoy".**

Un tablero que responde, de un vistazo y sin navegar:

- ¿En qué evento estoy? (o el próximo en el calendario)
- ¿Cuál es mi próximo partido, a qué hora, con quién y contra quién?
- ¿Cómo voy en el ranking y hacia dónde proyecto?
- ¿Qué me falta scoutear? (cobertura por equipo)
- ¿Cuál es mi probabilidad de terminar en una alianza?

**Ninguno de esos cinco números requiere matemática nueva.** Todos existen ya en el código: `LiveRankingProjection`, el `nextMatch` de `MatchList`, `draftOdds()`, `lib/consistency.ts`. Es un trabajo de **ensamblaje y jerarquía**, no de modelado. Ese es precisamente el argumento para hacerlo: es la mejora de percepción más grande por unidad de esfuerzo que queda en la app.

La tabla global de temporada no desaparece — se **degrada de puerta de entrada a material de referencia**. Es lo que consultas cuando investigas, no lo que necesitas cuando compites.

**Consolidaciones que siguen:**

- **Un solo Oracle.** Una superficie canónica; desde `/event/[code]` se enlaza, no se duplica el montaje.
- **Un solo "Simulación" con dos alcances** (partido / torneo), en vez de dos componentes que no se conocen.
- **Reporte de equipo genérico.** Des-cablear 30311. Además de ser lo correcto, es **requisito** para abrir la app: hoy el resto de los equipos ven una página vacía.
- **Renombrar "Iron Lion Intelligence"** antes de que la vea otro equipo.
- **Nav en un solo idioma**, con nombres de momento y no de herramienta.

---

## Parte II — Funcionalidad a medias: qué terminar y qué matar

Inventario verificado archivo por archivo. La columna "LOC" es código ya escrito que hoy no ejecuta nada.

### Matar ahora

| Qué | Dónde | Por qué |
|---|---|---|
| **Datos FRC fabricados** | `app/scouting/page.tsx:20-51` | Asigna OPRs inventados (45.2 / 52.4 / 60.1) a **equipos mexicanos reales e identificables**: Cerbotics 4400, PrepaTec LamBot 3478, Botbusters 4635. Corre en producción cuando se activa el toggle FRC. Incompatible con una narrativa de "cada número es auditable" |
| **El toggle FTC/FRC visible** | `Sidebar.tsx` | Promete un modo que no tiene datos reales detrás. Ocultarlo hasta que TBA esté conectado de verdad |
| **`share_target` del manifest** | `public/manifest.webmanifest:54-62` | Declara recibir `title`/`text`/`url`; `app/scouting/page.tsx` no lee `searchParams` en absoluto. Compartir a la app descarta el contenido en silencio. Quitarlo del manifest (2 min) o implementarlo |
| **Sección react-hooks de PENDING** | `docs/PENDING.md:194-197` | Ya resuelto en el commit `deab1f6` (42 → 0 hallazgos, decisión #41). Es un pendiente fantasma conviviendo con los reales |

**Conservar sin activar** (barato, es la semilla real de FRC): `lib/tba-api.ts` (116 loc) y `lib/frc-alliance-utils.ts` (137 loc). No ejecutan nada hoy, pero son 253 líneas correctas que valen más que su costo de mantenimiento.

### Terminar — y una es urgente por calendario

**El motor de juego declarativo es la pieza estratégica del año.**

`lib/games/ftc-decode-2025.ts` + `types/game-definition.ts` + `zod-from-definition.ts` + `DynamicGameForm.tsx` son ~600 líneas ya escritas y con tests, que hoy **nadie importa**. `MatchScoutingForm.tsx` sigue usando el formulario hecho a mano.

Lo que falta es un cambio de import más una pasada de QA de paridad.

El argumento no es de limpieza, es de **calendario**: el juego FTC 2026-27 se anuncia en septiembre. Con el motor conectado y validado, adaptarse al juego nuevo cuesta *escribir un archivo*. Sin conectarlo, cuesta *reescribir formularios* en plena pretemporada — que es exactamente cuando menos tiempo hay. **La ventana para cobrar esta inversión se cierra en ~6 semanas.**

Va acompañado de `docs/architecture/game-schema-migration.md`, un documento citado tres veces (`CLAUDE.md:83`, `docs/PENDING.md:137` y `:229`) que **nunca se escribió**.

Menores, del mismo lote: `HydrateAndCache` en `/analytics` (offline; ya está en `/` y `/event`), y los splash screens iOS por resolución.

### Los 8 territorios de VISION-PRIDE: cero código

T1–T8 (bitácora, outreach, skills matrix, planeación, red federada, open source, video, CRM) no tienen **ni una línea** de implementación. Eso no es un problema —es un documento de visión y se etiqueta como tal— pero conviene decirlo sin ambigüedad para que no se confunda inventario con intención.

El propio documento fija la regla correcta: **máximo 2 territorios activos a la vez**. La Parte IV de este documento argumenta cuál debe ser el primero, y por qué la respuesta cambió.

---

## Parte III — Benchmark competitivo

*Investigación de julio 2026: sitios oficiales, repos de GitHub, App Store y Chief Delphi (vía su API JSON pública, lo que permite citar textualmente).*

### El ecosistema está partido en tres capas que casi nunca se cruzan

| Capa | Quién la ocupa | Qué NO hace |
|---|---|---|
| **Datos oficiales** | The Blue Alliance (FRC), FTCScout, The Orange Alliance, ftc-events | No capturan scouting propio |
| **Captura de scouting** | The Purple Warehouse, Scoutradioz, WikiScout, QRScout/Maneuver | No predicen nada |
| **Modelo predictivo** | **Statbotics, y nadie más** | No captura scouting, y **es solo FRC** |

**No existe ninguna herramienta que capture scouting propio, lo fusione con datos oficiales y produzca una predicción calibrada.** Ese es exactamente el espacio de PRIDE.

### Fichas de los actores que importan

**FTCScout** (`ftcscout.org`) — El estándar de datos de FTC, del equipo 16321 X-Drive. Su fortaleza es la granularidad (por componente del juego: total, promedio, OPR, mín, máx y desviación estándar) más la mejor API de FTC que existe (GraphQL + REST). **No captura scouting, no predice, no hace picklist, no colabora.** Señal de fragilidad: un solo contribuidor tiene 1.073 de ~1.250 commits.

**Statbotics** (`statbotics.io`) — El modelo EPA, de **una sola persona** (Abhijit Gupta), que paga el hosting de su bolsillo. **Es el único actor del ecosistema que publica evaluación rigurosa de su propio modelo**: 160.000 partidos desde 2002, accuracy y Brier score, comparado contra OPR y el Elo de Caleb Sykes, con los datos crudos en una hoja pública y admisión honesta de dónde falla. Es el listón de honestidad estadística. **Dos huecos enormes: es FRC solamente, y el blog de validación no se actualiza desde marzo de 2023.**

**The Blue Alliance** — La infraestructura canónica de FRC desde 2006, hoy 501(c)(3). Statbotics, Scoutradioz y QRScout se alimentan de su API. **Dato que fija la expectativa de costos de toda la comunidad: opera con ~$5.000 USD/año**, casi todo Google Cloud, financiado con donaciones y sin patrocinador corporativo.

**The Purple Warehouse** (`thepurplewarehouse.com`) — **El competidor conceptual más directo, y el único caso probado de scouting federado a escala.** Del equipo FRC 1072 (Harker). Cifras publicadas: 55.000+ entradas, 719.000 data points, 1.000+ scouts, **323 equipos, 41 estados, 15 países**. Implementan un *accuracy score* por entrada — el mismo problema que resuelve tu `ground-truth-validation.ts`. **Pero: es FRC solamente**, no tiene reconciliación por tipo de campo (es un *pool + filtro*, no un motor de consenso), no predice ni publica calibración, y su offline es un workaround — su propia documentación sugiere **copiar los datos a un bloc de notas** para pegarlos después.

**Scoutradioz** (FRC 102) — "Scouting-as-a-Service" multi-tenant desde 2018, con constructor de formularios y un *Scouter Performance Rating*. Verificado ene-2024: 118 equipos en 31 estados más Canadá, México, Brasil, Turquía e Israel. Importante para tu posicionamiento: **su "scouting alliance" no es federación** — es una sola organización con varios números de equipo y **una contraseña compartida**. Sin identidad por org ni atribución entre orgs. Afirma 80-85% de acierto **sin publicar backtest**.

**WikiScout** (`wikiscout.org`) — Cubre FRC *y* FTC, open source, onboarding sin contraseñas. Es el más cercano a PRIDE en features de UI para FTC. **Nota de diferenciación importante: ya hace una forma de compartición cross-org en FTC** — *"Private notes are only visible to your team. Public notes are shared with all teams using WikiScout at the same event."* Es texto cualitativo, no datos numéricos con consenso, pero el concepto público/privado por org **ya está en el mercado FTC**.

**FTC Tracker** (`ftctracker.org`) — App iOS de un estudiante (FTC 19198), con widgets, Siri Shortcuts, scouting por voz y un chat AI sobre el Game Manual. **Rompe dos suposiciones nuestras: sí cobra ($1,99/mes, FTC Tracker Pro) y sí está localizada al español** (más 7 idiomas). Pero es diminuta: 12 ratings en App Store, solo iOS, sin predicción ni colaboración.

**El "cero código"** — La alternativa mayoritaria real sigue siendo Google Sheets y Tableau. FIRST publica una guía oficial de scouting elaborada con el equipo 1678 Citrus Circuits que enseña justamente eso. En FRC, el patrón dominante es clonar QRScout: 30 stars pero **159 forks**.

### Los siete huecos del ecosistema

1. **FTC no tiene modelo predictivo. Ninguno.** Statbotics resolvió esto para FRC en 2023 y nunca cruzó a FTC. FTCScout, Orange Alliance, PickListFTC y WikiScout muestran OPR — una estadística descriptiva, no un modelo. **Ninguna herramienta FTC predice un partido con probabilidad.** Es el hueco más grande y más limpio.
2. **Nadie en FTC publica calibración**, y en FRC solo lo hace uno, congelado desde 2023. Tu página `/oracle` **no tiene comparación en FTC** — no porque sea difícil, sino porque nadie lo ha hecho nunca.
3. **Federación con atribución y consenso por campo no existe en ningún programa.** El pool existe (Purple Warehouse); la atribución por scout+org, las reglas por tipo de campo y los buckets subjetivos separados por org, no.
4. **Offline-first es la queja #1 de la comunidad y casi nadie lo resuelve.** Las soluciones reales son códigos QR, memorias USB con corredores humanos, y servidores a batería de $300. FIRST además prohíbe hotspots cerca del campo.
5. **Nadie combina las tres capas** (datos + captura + modelo).
6. **Mercado hispanohablante desatendido.** Un competidor tiene español como localización de UI; cero herramientas pensadas para FIRST México.
7. **Fragilidad estructural del ecosistema entero.** Statbotics: una persona. FTCScout: un contribuidor con el 85% de los commits. Purple Warehouse: una subteam de prepa con rotación anual. Orange Alliance: 13 stars, sin licencia. TBA: $5.000/año pidiendo ayuda a Google en un foro público. **La continuidad es en sí misma un diferenciador.**

### Lo que pide la comunidad, en sus propias palabras

De un hilo de Chief Delphi donde un usuario lista lo que no encontró en ninguna herramienta:

> *"No requirement for internet access during the scouting process… Metric of robot alliance compatibility… **Ease of linking data sets together between many scouters even on different teams** (so multiple teams can work together to input data)… a (possibly AI driven) analysis of teams that would optimize alliance compatibility."*

Es, casi literalmente, la especificación de PRIDE — escrita por alguien que buscó y no encontró nada.

Y una objeción documentada que **valida directamente** tu decisión de arquitectura de no fusionar subjetivos entre orgs, de un mentor de FRC 1706:

> *"storing things like qualitative notes and picklists on another team's platform would give me a little pause"*

### Dónde ellos son mejores (esto suma credibilidad ante jueces, no resta)

- **Cobertura y madurez**: FTCScout y TBA cubren todos los eventos globalmente con años de histórico y APIs battle-tested. Tu base es regional.
- **Escala de federación probada**: Purple Warehouse tiene 323 equipos; tú tienes uno.
- **Integración nativa móvil**: los widgets y Siri Shortcuts de FTC Tracker no tienen equivalente aquí.
- **Visualización**: los mapas de campo 3D de FTCScout siguen siendo superiores.

### Lección de diseño: estandarizar fracasó

Purple Warehouse publicó **The Purple Standard** (2024), un formato JSON abierto para interoperar entre apps de scouting. Adopción: **6 stars, 1 fork.** La interoperabilidad vía estándar abierto no prendió; el pool con app propia sí. Conviene no gastar esfuerzo ahí.

---

## Parte IV — Cómo abrir la app sin regalar la ventaja

### La premisa que hay que corregir primero

> *"Si la abro al público, pierdo valor y competitividad."*

Es **parcialmente falso**, y la parte falsa es la más importante. La ventaja de PRIDE no es una sola cosa; son cinco, y se comportan de forma muy distinta al compartirse:

| Capa de ventaja | ¿Se pierde al compartir? | Comentario |
|---|---|---|
| **El software** | **No** | No es rival: que otro lo use no te lo quita. Y el software solo no gana partidos |
| **La analítica de datos públicos** (OPR, predicciones) | **Casi no** | Ya está *commoditizada*: FTCScout y Statbotics la regalan. Tu ventaja aquí es pequeña y decreciente |
| **Tus datos de scouting** | **Sí — este es el foso real** | Lo único genuinamente rival. Tus observaciones en un evento no las tiene nadie más |
| **Tu habilidad para usarla** | **No** | La ventaja más durable y la que nadie te copia |
| **Operar la red** | **Aumenta** | Rendimientos crecientes: mientras más equipos entran, mejores datos para todos — y el hub es quien más gana |

### La inversión que cambia la decisión

**Tu problema no es de secreto. Es de escasez.**

30311 tiene 2-4 scouts. Un evento tiene ~40 equipos y ~60 partidos de qualifying. **No puedes cubrirlo tú solo** — ni con la mejor app del mundo. La calidad de tus proyecciones está limitada por cuántos ojos tienes, no por qué tan buena es tu matemática.

Cada equipo que entra a la red **multiplica tu cobertura**. Diez equipos con 3 scouts cada uno son 30 observadores. Guardarte la herramienta te mantiene pobre en datos, que es justo la variable que sí importa.

Y hay un segundo efecto, ya medido en tu propio expediente: el hallazgo de FPEMX fue que **estar en el top-4 y ser "pickeable" vale más que capitanear**. Ser pickeable depende de que los capitanes *vean* tu capacidad. Una red donde tu desempeño es visible y está bien medido **te conviene deportivamente**.

### El modelo: abrir la herramienta, cerrar el dato por reciprocidad

Cuatro anillos. La ventaja no vive en el acceso al software, vive en qué dato ves y cuándo.

**Anillo 0 — Público, sin cuenta.** Stats de la API oficial, `/oracle` (calibración pública), rankings y percentiles nacionales. Costo competitivo: **cero** — son datos públicos con mejor presentación. Beneficio: reputación, evidencia de Connect/Inspire, y el gancho de adquisición. Ya funciona así hoy.

**Anillo 1 — Equipo registrado (gratis).** Su propio scouting, sus propias herramientas, su propia picklist. **Lo que capturan es suyo.** Sin acceso al dato crudo ajeno.

**Anillo 2 — Red federada (gratis, con reciprocidad).** Acceso al consenso cross-org de un evento, **proporcional a lo que aportas**. Scouteas 20 partidos → ves el consenso de 20. Es la regla que hace que cooperar sea la estrategia dominante, y es exactamente el gate que **hoy no existe** (ver "El bloqueante" abajo).

**Anillo 3 — Iron Lion.** Lo que se queda tuyo, sin necesidad de esconder nada: tus notas privadas de pit, tus ratings subjetivos (que por diseño **nunca se fusionan entre orgs**), tu picklist y tu DNP, tus briefings, tu histórico de calibración — y la fluidez de tu equipo con una herramienta que ustedes construyeron.

### La línea ética, explícita

La asimetría del Anillo 3 tiene que ser **"mis datos privados son míos"**, nunca **"el operador lee en secreto los datos de sus rivales"**.

Esto no es un escrúpulo abstracto: es gestión de riesgo. Operar la red *y* competir contra sus miembros es un conflicto de interés real. Si en algún momento se descubre que el operador tenía lectura privilegiada del scouting ajeno durante un evento, se destruye de un golpe toda la narrativa de Connect/Inspire — que es el activo que más vale aquí. Y ese tipo de cosas se descubren.

La mitigación es simple y además es **evidencia de premio**: publicar las reglas de visibilidad como artefacto público, al estilo de la página `/oracle`. Convertir la regla en algo auditable es exactamente el gesto que los jueces premian.

### El bloqueante técnico: hoy la puerta está abierta

**Antes de invitar a nadie**, hay que arreglar esto. Es la precondición de todo lo anterior.

`firestore.rules:139` — para `match_scouting`:

```
allow read: if isAuthed();
```

Y un TODO sin cerrar, en el propio archivo: *"Sprint 1.7+: per-event subscription gating for reads. Today any authed user can read all match_scouting in any event."*

Lo mismo en `pit_scouting:152`. Y ahí está el agravante: el pit scouting guarda `notes` (privadas, 5000 chars) y `publicSummary` (opt-in, 1000 chars) **en el mismo documento** — y las reglas de Firestore **no pueden enmascarar campos** en una lectura. El archivo advierte justo eso para `orgs/`, pero no se aplicó el mismo criterio aquí.

El login es `signInWithPopup` con Google **sin allowlist** (`context/AuthContext.tsx:127`): cualquiera con cuenta de Google entra.

La separación por org que describe `CLAUDE.md` es real, pero vive en la **capa de aplicación** (`lib/scouting-aggregation.ts`). La base de datos no la respalda, y un rival con la consola del navegador abierta no pasa por esa capa.

Hoy el riesgo práctico es bajo: la URL no es pública y hay poco dato ajeno. Pero significa que **la decisión de abrir ya está medio tomada, en la dirección equivocada**. Si se invita a equipos con las reglas actuales, no se comparte "una parte" — se entrega todo, en silencio, incluidas las notas privadas.

Bien protegido, en cambio: `picklists`, `calibration_log` y `org_secrets` sí están correctamente acotados por `orgId`. Tu estrategia de selección no se filtra; tus observaciones crudas sí.

*(Nota menor del mismo lote: `PicklistEditor.tsx:90` y `MatchBriefingCard.tsx:34` hacen `orgId ?? DEFAULT_ORG_ID`, cayendo a `"30311"`. Hoy falla cerrado porque las reglas bloquean la lectura sin org propio, pero es el tipo de default que se convierte en fuga al abrir.)*

### Sobre cobrar: la respuesta no es cultural, es contractual

Empecé este análisis pensando que el argumento contra cobrar era de valores. Lo es, pero hay uno que llega antes y cierra la discusión.

**0. La licencia de tu fuente de datos lo prohíbe.** Verbatim de la página de la API de FIRST, verificada directamente en [ftc-events.firstinspires.org/services/API](https://ftc-events.firstinspires.org/services/API):

> *"The data from this API may not be used for commercial purposes. There can be no financial gain from acquiring an access token."*

PRIDE está construida sobre esos datos. **No es una norma cultural negociable ni una zona gris: es la condición bajo la cual tienes acceso.** Cualquier esquema de suscripción choca de frente con ella. (Nota: FTC Tracker cobra $1,99/mes y usa datos de eventos FTC; no pude verificar de qué fuente exacta los toma, así que no afirmo que incumpla — pero la tensión es evidente y no es un precedente en el que apoyarse.)

**La misma página impone además un requisito que hoy NO estamos cumpliendo**: incluir un enlace de retorno a la página de la API en el footer o el "About" de cualquier aplicación que muestre sus datos. Un grep sobre `app/` y `components/` no encuentra ninguna referencia a `firstinspires.org`. La app lleva desplegada desde el 25 de julio sin esa atribución. Se arregla con una línea; hay que arreglarlo.

Y luego, las razones que ya tenía:

**1. Cultural.** FIRST corre sobre *Gracious Professionalism* y *Coopertition*. Cobrarle a otros equipos por ventaja competitiva es lo contrario de los valores que los jueces califican. Sacrificarías Connect e Inspire, que valen incomparablemente más para 30311 que cualquier ingreso plausible. **"Construimos infraestructura y se la regalamos a la comunidad FTC de México"** gana entrevistas. *"Se la vendemos"* no gana nada.

El benchmark lo respalda: **todo el ecosistema serio es gratis y de donación.** The Blue Alliance opera con ~$5.000 USD/año y pide ayuda en público. Statbotics lo paga su autor de su bolsillo. Scoutradioz registró su marca como broma y remató con *"And, it's completely free!"*.

**2. Económica.** El mercado es diminuto. El Mexico Championship 2025 tuvo 52 equipos; FIRST México organiza 5 zonas con 7 torneos regionales. Cualquier penetración y precio realistas dan ruido frente al costo de operar.

**3. Operativa.** Cobrar te obliga a facturación, impuestos, soporte y SLA. Y la seria: te vuelve **procesador pagado de datos sobre menores de edad**. Es responsabilidad legal que un equipo estudiantil no quiere.

**4. Estratégica.** El ingreso convierte una historia de "regalo a la comunidad" en una de "proveedor". La primera es el expediente de Inspire; la segunda te deja sin expediente.

*Matiz honesto:* busqué precedentes de rechazo comunitario al software de pago en FIRST y **no encontré ninguna polémica**. FTC Tracker cobra hoy sin generar controversia. La conclusión justa es que nadie lo ha intentado a escala suficiente para saberlo — pero eso no cambia el punto 0, que es el que manda.

### Lo que sí resuelve la sostenibilidad

**Patrocinio de la infraestructura — esta es la respuesta al dinero.** Los costos son reales (Upstash, Firebase, dominio) y modestos. Un patrocinador que financia *"la plataforma de analítica que usan N equipos mexicanos de FTC"* obtiene una visibilidad muchísimo mejor que un logo en una playera — y cierra el ciclo del territorio T8. El reporte grado-sponsor de `/team/30311` ya es el molde del entregable.

**Apoyo voluntario**, si acaso: sin gating, sin fricción, sin promesas.

**Opcionalidad post-graduación.** Si en algún momento quieres que esto sea un negocio, el activo no es la suscripción: es el **dataset y el modelo calibrado**. Y el cliente natural no son los equipos — son los **organizadores de eventos y los socios regionales**. Basta con mantener la licencia limpia hoy para no cerrarte esa puerta.

**Qué abrir como código.** Recomiendo partirlo: **abrir la capa de modelo** (`lib/projections`, `win-probability`, `alliance-utils`, `logistic-regression`, `scouting-aggregation`) junto con la metodología de `/oracle`. Es la jugada de credibilidad estilo Statbotics/TBA, es lo que un juez puede auditar, y **nadie gana ventaja competitiva con tus fórmulas** — la ganan con tus datos. La instancia hospedada y su base de datos siguen siendo el activo.

### Qué te hace realmente distinto (según el benchmark, no según nosotros)

Vale separar lo que **creíamos** que nos diferenciaba de lo que el benchmark confirma:

| Diferenciador | Veredicto |
|---|---|
| **Predicción calibrada en FTC** | **Único, y por un margen enorme.** Ninguna herramienta FTC predice partidos con probabilidad. `/oracle` no tiene comparación en FTC y solo un análogo en FRC, congelado desde 2023 |
| **Offline-first de verdad** | **Mucho más valioso de lo que asumíamos.** Es la queja #1 de la comunidad, y las soluciones reales del ecosistema son USBs con corredores humanos y servidores a batería |
| **Consenso por tipo de campo + subjetivos separados por org** | **Único en ambos programas.** Y responde a una objeción documentada: los equipos no quieren sus notas cualitativas en la plataforma de otro |
| **Scouting federado** | **El concepto ya existe** (Purple Warehouse, 323 equipos) — pero **solo en FRC**, y como *pool + filtro*, no como motor de consenso. En FTC no existe nada |
| **Español / foco México** | Menos único de lo que creíamos (FTC Tracker ya está localizado), pero **cero herramientas pensadas para el contexto de FIRST México** |
| **Continuidad y mantenimiento** | Diferenciador real: todo el ecosistema tiene *bus factor* de 1 |

### Secuencia recomendada

1. **Cerrar el gate de lectura** — reciprocidad por evento + separar pit público/privado en documentos distintos. *Precondición de todo lo demás.*
2. **Añadir la atribución a la API de FIRST** (footer o About). Requisito de la licencia, incumplido hoy en producción. Una línea.
3. **Quitar los datos FRC fabricados** y ocultar el toggle.
4. **Des-cablear el reporte de equipo de 30311** — hoy el resto ve una página vacía.
5. **Renombrar "Iron Lion Intelligence".**
6. **Piloto con 2-3 equipos aliados** en un evento (los Rhinos 31546 son el candidato natural por la relación de FPEMX).
7. **Publicar las reglas de visibilidad** como página pública.

Y el ajuste de prioridad que se desprende de todo esto: **el primer territorio a construir ya no es T2 (outreach), es T5 (red federada México)** — porque T5 *es* el modelo de apertura, no un proyecto paralelo a él. T2 viene incluido: cada equipo que entra a la red es evidencia de alcance comunitario, registrada automáticamente.

---

## Parte V — La inversión del scouting: autorreporte federado

*Propuesta de Héctor, 2026-07-29. Es un cambio de primitivo, no una feature.*

### El cambio

| | Modelo actual (y el de Purple Warehouse) | **Autorreporte federado** |
|---|---|---|
| Qué aportas | Tus observaciones **sobre otros equipos** | **Datos sobre ti mismo** |
| Costo de cobertura | Cada equipo necesita muchos scouts | N equipos × 1-2 scouts cubren a N equipos |
| Qué expones | Tu juicio sobre rivales | Hechos sobre tu propio robot |
| Pregunta que responde | *"¿A quién elijo?"* | *"¿Por qué deberían elegirme?"* |

### Por qué es más fuerte de lo que benchmarkeamos

- **Colapsa el costo de cobertura.** Es la diferencia entre 20 scouts y 2. Ataca directamente la queja documentada de los equipos chicos (*"How do small teams do scouting at regional competitions?"*, 42 posts en Chief Delphi).
- **Disuelve la objeción de privacidad que sí encontramos.** El mentor de FRC 1706: *"storing things like qualitative notes and picklists on another team's platform would give me a little pause."* Aquí no compartes tu **juicio sobre otros** — compartes **hechos sobre ti**. No hay estrategia que filtrar.
- **Nadie lo hace.** Purple Warehouse hace pooling de observaciones ajenas. Esto es otro primitivo, y no existe en FTC ni en FRC.
- **Propiedad emergente: participar es una señal costosa.** Un equipo fuerte gana con ser visto; uno débil gana con esconderse. No compartir se lee como "no tengo nada que mostrar". La red se refuerza sin necesidad de imponer nada.

### El problema central: el autorreporte es *cheap talk*

Todo equipo tiene incentivo a verse pickeable. Si declarar es gratis, todos declaran alto y la señal vale cero. Es el problema del mercado de limones, y es la razón por la que este diseño sería ingenuo en cualquier otra app.

**PRIDE tiene el antídoto, y probablemente es la única del ecosistema que lo tiene.**

`lib/ground-truth-validation.ts` compara la reconstrucción del scouting contra el **puntaje oficial de la FIRST API** — una verificación objetiva e infalsificable. No puedes declarar 8 artifacts en auto si tu alianza anotó 30 puntos totales. La inflación sistemática aparece como error de reconstrucción, el EWMA baja tu confiabilidad, y tu peso en el consenso cae solo.

Purple Warehouse tiene un *accuracy score* por entrada, pero lo aplica donde el error es **ruido aleatorio** (gente observando a otros). Aquí se aplicaría donde el sesgo es **direccional** — que es exactamente donde ese mecanismo vale más.

### Regla de diseño: qué se puede autorreportar

La línea es *¿se puede verificar contra el puntaje oficial?*

| Categoría | Ejemplos | Razón |
|---|---|---|
| **Autorreporte sí** | Conteos por partido, rutina de auto, parking, ciclos, specs del robot, bitácora de fallas | Acotados por el score oficial. Verificables |
| **Autorreporte nunca** | Driver skill, rating de defensa, would-pick | Juicio ajeno por naturaleza, no verificable, incentivo puro a inflar. Siguen observados y por-org, como hoy |
| **Preferencia declarada** | "En qué somos buenos / qué buscamos en un aliado" | Autorreportado, pero como **preferencia**, no como afirmación de desempeño. Es matchmaking honesto |

Encaja con las reglas por tipo de campo que ya existen en `lib/scouting-aggregation.ts`.

### El ataque real es la omisión, no la mentira

Más fácil y menos detectable: no reportar los partidos malos.

Pero el autorreporte tiene algo que scoutear a otros nunca tuvo: **un denominador conocido.** El calendario es público. Si jugaste 12 quals y reportaste 7, la app sabe cuáles faltan.

**Por eso la métrica de reputación y el gate deben ser cobertura %, no volumen.** Es la defensa natural contra la selección de casos, y sale gratis.

### No reemplazar: agregar una fuente

Riesgo de umbral: en un evento de 40 equipos con 5 participantes, el autorreporte cubre 5/40 — peor que tus propios scouts. Planteado como sustituto, el primer evento sale mal y mata la idea.

El autorreporte debe ser **aditivo**: mi observación de ti + tu autorreporte + observaciones de terceros. **No requiere matemática nueva** — el blend bayesiano de varianza inversa de `lib/projections.ts` está diseñado para combinar fuentes de distinta varianza. El autorreporte entra como fuente con su propia clase de confiabilidad, aprendida.

### El gate: natural, no artificial

Capar features a propósito se siente punitivo y obliga a defender una política. **El gate natural no requiere política porque es simplemente cierto: el pool solo contiene lo que la gente aportó.** Quien no comparte ve datos oficiales y sus propias herramientas; quien comparte ve el consenso. Se aplica solo.

Y el pedido es notablemente bajo: **siempre tienes tus propios datos.** Contribuir cuesta 1-2 scouts, no 20.

### El costo para 30311

Reduce la ventaja informativa — la información se vuelve más simétrica. A cambio: el hallazgo de FPEMX ya decía que **ser pickeable vale más que la ventaja informativa**, y la diferencia se muda a la calidad del análisis (el Oracle), que es donde nadie del ecosistema puede seguirnos.

Como narrativa de premios es mucho más fuerte que "hicimos una buena app": *"diseñamos un sistema donde compartir tus datos es la estrategia dominante"* es **diseño de mecanismos**. Eso apunta a Innovate y Think.

---

## Parte VI — Internacionalización: inglés por defecto

Decisión: la app pasa a **inglés por defecto** y se vuelve multilenguaje. El modelo de autorreporte lo hace más urgente — una red que funcione no se queda mexicana.

### La trampa: no es un refactor de UI

**Trece módulos de `lib/` tienen strings en español dentro de la capa de análisis**, no solo en componentes:

`event-selector.ts` · `projections.ts` · `draft-odds.ts` · `invite-redemption.ts` · `constants.ts` · `orgs.ts` · `schemas/scouting.ts` · `alliance-utils.ts` · `games/ftc-decode-2025.ts` · `consistency.ts` · `briefings/briefing-data.ts` · `reports/growth-curves.ts` · `reports/team-30311-decode.ts`

Casos concretos: `draft-odds.ts` **genera frases explicativas** (el campo `basis`), `consistency.ts` escribe notas interpretativas, y `schemas/scouting.ts` tiene los mensajes de validación de Zod. Si se trata i18n como "traducir componentes", el Oracle sigue hablando español desde el motor.

El patrón correcto es que la capa de análisis devuelva **claves + parámetros**, no prosa. Eso es un cambio de contrato en funciones que hoy retornan strings ya formados.

### Secuenciación

No es lo primero (el gate de lectura y el motor de juego pesan más), pero **el andamiaje va antes de construir las superficies nuevas** ("Hoy", las vistas de red). Si no, esos strings se escriben dos veces.

**Regla desde hoy: ningún string nuevo hardcodeado.** Extraer al tocar cada archivo.

Herramienta sugerida: `next-intl` (el estándar para App Router en Next 16). Idiomas iniciales: `en` (default) y `es`.

---

*Relacionado: `docs/VISION-PRIDE.md`, `docs/PENDING.md`, `docs/APP-OVERVIEW-Y-PREMIOS-DECODE.md`, `docs/architecture/collaborative-scouting-model.md`.*
