# ⚙️ Bitácora de Decisiones Técnicas

Este documento registra el "por qué" detrás de las elecciones técnicas para evitar re-trabajo o confusión.

## 1. Cambio de Python a Next.js
- **Fecha**: 21 Ene 2026
- **Contexto**: El script de Python original solo generaba CSVs.
- **Decisión**: Migrar a una Web App.
- **Razón**: Permite visualización en tiempo real, filtros interactivos y es mucho más accesible para usuarios sin conocimientos de programación durante los eventos.

## 2. Uso del endpoint /points (No documentado)
- **Fecha**: 21 Ene 2026
- **Contexto**: Los puntos detallados de avance (Judging, Playoff) no aparecían en el endpoint principal de `/advancement`.
- **Decisión**: Utilizar la ruta `/v2.0/{SEASON}/advancement/{eventCode}/points`.
- **Razón**: Proporciona el desglose numérico necesario para el Advancement Report que requiere el usuario.

## 3. Promedio vs Suma
- **Fecha**: 21 Ene 2026
- **Contexto**: Diferentes formas de evaluar el rendimiento.
- **Decisión**: 
    - **Qualification**: Promediado (RS, Match Points, etc.) porque refleja consistencia.
    - **Advancement**: Sumado (Judging, Playoff, etc.) porque es un acumulado de méritos.
    - **W-L-T**: Sumado para mostrar el historial total de la temporada.

## 4. High Score Logic
- **Fecha**: 21 Ene 2026
- **Contexto**: `sortOrder5` devolvía números enormes incorrectos para la temporada "Into the Deep".
- **Decisión**: Usar `sortOrder6`.
- **Razón**: Se identificó que `sortOrder5` es un valor de desempate interno, mientras que `sortOrder6` contiene el puntaje real más alto del equipo.

## 6. Carga Secuencial de API
- **Fecha**: 22 Ene 2026
- **Contexto**: `Promise.all` saturaba las conexiones, causando errores "Failed to fetch" en el entorno local.
- **Decisión**: Cambiar a un bucle `for...of` secuencial en `aggregation.ts`.
- **Razón**: Aunque es ligeramente más lento, garantiza que el servidor termine de procesar un regional antes de empezar el siguiente, eliminando el 100% de los errores de red detectados.

## 7. Carga en Servidor (Server Components) para Scouting
- **Fecha**: 22 Ene 2026
- **Contexto**: Los navegadores bloquean peticiones directas a la API de FTC por políticas de CORS.
- **Decisión**: Realizar el `getAggregatedStats` dentro del componente de servidor `app/scouting/page.tsx` y pasarlo como props al cliente.
- **Razón**: El servidor de Next.js no tiene restricciones de CORS, permitiendo una conexión limpia y segura con FIRST Inspires sin necesidad de un proxy externo.

## 8. Persistencia local (localStorage) para Scouting
- **Fecha**: 22 Ene 2026
- **Contexto**: Se requiere una herramienta que funcione en los regionales donde el Wi-Fi es inestable.
- **Decisión**: Guardar el mapa de datos de scouting en `localStorage` en lugar de una base de datos remota inmediata.
- **Razón**: Garantiza que ningún dato se pierda si el scout cierra la pestaña o pierde conexión, permitiendo una sincronización manual o automática futura sin fricción inicial.

## 9. Manejo de Parámetros en Next.js 15+
- **Fecha**: 24 Ene 2026
- **Contexto**: Las páginas dinámicas devolvían 404 debido a un cambio en la API de Next.js donde `params` ahora es una Promesa.
- **Decisión**: Utilizar `await props.params` en los Server Components.
- **Razón**: Asegura retrocompatibilidad y corrige el error donde el ID del regional llegaba como `undefined` al componente.

## 11. Pesos de Premios DECODE 2025-2026
- **Fecha**: 03 Feb 2026
- **Contexto**: El sistema anterior usaba pesos arbitrarios (100, 80, 60).
- **Decisión**: Adaptar el algoritmo `getAwardValue` a los puntos de avance oficiales del manual DECODE (Inspire 60/30/15, Alianzas 40/20, Otros 12/6/3).
- **Razón**: Alinea el Power Score con la realidad competitiva de la temporada, haciendo la proyección nacional matemáticamente relevante.

## 12. Índice de Fortaleza de Evento (Event Strength)
- **Fecha**: 03 Feb 2026
- **Contexto**: Ganar un premio o tener un score alto en un evento de 15 equipos no es igual de difícil que en uno de 30+ equipos con promedios altos.
- **Decisión**: Implementar un multiplicador de fortaleza (0.6x a 1.1x) basado en: Volumen de equipos (30%), Promedio de Puntaje (50%) y Promedio de Auto (20%).
- **Razón**: Normaliza los resultados de la temporada, evitando que equipos que destacaron en regionales "sencillos" dominen artificialmente el ranking nacional.

## 13. Columna "Sticky" en Data Lab
- **Fecha**: 03 Feb 2026
- **Contexto**: Al haber más de 8 regionales, la tabla se volvió muy ancha, perdiendo de vista qué equipo correspondía a cada fila al hacer scroll.
- **Decisión**: Aplicar `sticky left-0` con un fondo sólido y blur a la primera columna.
- **Razón**: Crítico para la usabilidad en dispositivos móviles y para analistas que comparan datos entre sedes distantes.

## 15. Cálculo Híbrido de Ranking Points (RP)
- **Fecha**: 09 Feb 2026
- **Contexto**: Los indicadores de RP aparecían en 0% si no había scouting manual, lo que sesgaba la analítica.
- **Decisión**: Inyectar lógica que analiza los puntajes de la alianza en cada match (Auto > 35, Tele > 75) para inferir la probabilidad de RP desde la API oficial.
- **Razón**: Proporciona una base estadística sólida incluso si el personal de scouting no logra cubrir todos los partidos.

## 16. Re-ponderación del Alliance Oracle
- **Fecha**: 09 Feb 2026
- **Contexto**: Penalizaciones fijas agresivas por disciplina enterraban a equipos TOP que tenían un par de faltas pero score masivo.
- **Decisión**: 
    - Subir peso del OPR al 70%.
    - Cambiar penalización de disciplina a una escala dinámica (` deficit * 0.8`).
- **Razón**: En la temporada *Into The Deep*, la potencia de anotación es el mejor predictor de victoria; una falta menor no debería invalidar a un equipo que anota 40 puntos más que el promedio.

## 17. Inyección de RP Efectivos (Benefit of Doubt)
- **Fecha**: 09 Feb 2026
- **Contexto**: Equipos élite con 0% RP (por falta de datos) bajaban en la recomendación frente a equipos mediocres con 100% RP.
- **Decisión**: Si un equipo tiene 0% RP pero OPRs altos (Auto > 25, Tele > 60), el Oracle inyecta automáticamente una probabilidad base (0.6 - 0.7).
- **Razón**: Corrige el sesgo de datos faltantes, asegurando que los mejores robots siempre aparezcan arriba en las sugerencias tácticas.
## 18. Selección Dinámica de Capitanes (Greedy Oracle)
- **Fecha**: 10 Feb 2026
- **Contexto**: El sistema anterior asumía que los capitanes eran siempre los Top N del ranking, pero en la realidad, si el #1 selecciona al #2, el #9 sube a ser capitán.
- **Decisión**: Implementar un bucle de selección donde el equipo de mayor rango *disponible* se convierte en capitán, consume a su pareja de la bolsa general, y el siguiente disponible toma el liderazgo.
- **Razón**: Modela fielmente el proceso de selección de alianzas de FIRST, permitiendo proyecciones realistas de cómo se verá el bracket final.

## 19. Simulación Monte Carlo para Playoffs
- **Fecha**: 10 Feb 2026
- **Contexto**: Un bracket predeterminado por OPR no captura los "upsets" o la inconsistencia de los robots.
- **Decisión**: Implementar un motor que ejecuta 2,000 torneos independientes aplicando una distribución normal (varianza sigma=30) a los OPRs en cada match.
- **Razón**: Permite dar una probabilidad de campeonato (%) que es mucho más útil para equipos de media tabla que buscan saber sus opciones reales de dar la sorpresa frente a un líder dominante.

## 20. Migración de cache analítico a Upstash Redis
- **Fecha**: 24 May 2026
- **Contexto**: Firestore Web SDK en server (`experimentalForceLongPolling: true`) tenía 200-500ms RTT por lectura. Con ~32 lecturas por aggregation, el cold-start era 6-16s.
- **Decisión**: Reemplazar `api_cache` collection en Firestore por Upstash Redis (`SET ... EX`). firebase-admin SDK para reads de Firestore que sí necesitamos. Quitar `force-dynamic` global del layout. Quitar `enableIndexedDbPersistence` (cacheaba api_cache completa en navegador, saturaba IndexedDB en celulares).
- **Razón**: Redis tiene RTT 5-30ms vs 200-500ms. TTL nativo elimina el circuit breaker manual. Quitar persistence client-side de Firestore evita los crashes mobile que originaron toda la investigación.

## 21. Modelo federado de scouting (multi-org)
- **Fecha**: 24 May 2026
- **Contexto**: Equipo 30311 típicamente tiene 2-3 scouts; no cubren todos los matches de un regional. Múltiples equipos quieren colaborar.
- **Decisión**: Cada entry de `match_scouting` lleva `scoutId` + `orgId`. Aggregation cross-org per (match, team) con reglas distintas por kind: numeric → weighted mean, categorical → majority vote, **subjective (driver/defense ratings) NUNCA se mezcla cross-org** porque escalas 1-5 calibran distinto por equipo.
- **Razón**: Bien común — más equipos participando = mejor cobertura para todos. Sin federación, datos del único equipo activo nunca alcanzan estadística decente.
- **Documentado en**: `docs/architecture/collaborative-scouting-model.md`

## 22. Bayesian inverse-variance blend en match projection
- **Fecha**: 24 May 2026
- **Contexto**: Pesos hardcoded 60/40 (API vs scouting) eran arbitrarios — no escalaban con cantidad de scouting data ni con su consistencia.
- **Decisión**: Posterior bayesiano: `w_scout = (n / σ²_scout) / (n / σ²_scout + 1 / σ²_prior)`. Con n=0 scouts, prior API domina; con n=5+ scouts consistentes, scouting domina.
- **Razón**: Statbotics y la literatura usan esta variante (EWMA con varianza inversa). Adaptativo por construcción, no requiere tunear pesos por temporada.

## 23. Win probability con logística real (no piecewise linear)
- **Fecha**: 24 May 2026
- **Contexto**: La fórmula anterior `0.5 + diff / (avgScore * 0.6)` sobre-saturaba en los tails — a 50 pts de margen clampeaba a 0.98 cuando logistic calibrado daría 0.85.
- **Decisión**: `1 / (1 + exp(-k · diff / avgScore))` con k=1.5. Mismo principio que Statbotics y Caleb Sykes Elo.
- **Razón**: Modelo correcto en el tails; no es solo cosmético — afecta apuestas de estrategia en matches "casi ganados".

## 24. Leave-one-out marginal accuracy en ground-truth validation
- **Fecha**: 24 May 2026
- **Contexto**: La versión inicial atribuía el mismo error pooled a todos los scouts que tocaron una alianza. Un scout cuidadoso en un pool ruidoso era castigado injustamente.
- **Decisión**: Por cada scout en una alianza, recalcular el consensus SIN sus entries. Marginal contribution = error_without − error_with. `signal = clamp(0.5 + marginal/2, 0, 1)`. EWMA hacia ese signal. Caso degenerate (1 scout): fallback al pooled approach.
- **Razón**: Atribución justa. Scout cuyos valores acercan el consensus a la realidad gana reliability; scout que activamente lo aleja, baja.

## 25. Per-team σ en Monte Carlo
- **Fecha**: 24 May 2026
- **Contexto**: σ=30 global en Alliance Oracle trataba equipos consistentes y erráticos por igual.
- **Decisión**: `σ_team = clamp(stddev(events.avgPoints), 8, 60)` con 2+ events; `clamp((max-avg)/2, 8, 60)` con 1 event; fallback 30. Per-alliance σ = `sqrt(Σ σ_team²)` asumiendo independencia.
- **Razón**: Equipos consistentes → menor σ alliance → menos probabilidad de upsets. Equipos erráticos → mayor σ → más realismo en Monte Carlo. Statbotics usa la misma identidad de combinar varianzas.

## 26. Per-RP logistic regression con fallback heurístico
- **Fecha**: 24 May 2026
- **Contexto**: Inferencia de RP usaba thresholds heurísticos (`if autoPoints > 25 then RP = 0.6`).
- **Decisión**: Implementar logistic regression pura TypeScript con gradient descent + L2. Entrenar 3 modelos per season (movement / artifact / pattern compartido). Persistir en Upstash 30d. Inferencia con `inferTeamRpProbability` que cae al heurístico cuando no hay modelo cacheado.
- **Razón**: Continuo vs threshold. Dos alianzas en el mismo "lado" de un umbral arbitrario antes eran iguales; ahora se ranquean fino. Fallback heurístico preserva comportamiento pre-C.3 cuando Redis o entrenamiento aún no están listos.

## 27. Modelo de visibilidad pública vs privada per-org
- **Fecha**: 24 May 2026
- **Contexto**: Webhooks de Discord y notas privadas de scouting necesitaban privacidad cross-org. Firestore rules no soportan field-level read masking.
- **Decisión**: Colecciones separadas: `orgs/{orgId}` (público entre authed), `org_secrets/{orgId}` (admin/lead-only). Pit scouting: `notes` privado por docId scoped al org, `publicSummary` opt-in para cross-org.
- **Razón**: Estructural en lugar de UI-level — un cliente malicioso no puede leer secretos ni con queries arbitrarias.

## 35. Fix M4 + M5: hardening de RBAC de orgs y DoS de analytics
- **Fecha**: 08 Jul 2026
- **M4 (membresía de orgs)**: `users/{uid}` era `allow read, write: if request.auth.uid == uid` → un cliente podía auto-asignarse cualquier `orgId`/`role` (hacerse admin/lead de org rival, inflar su propia `reliability`). Dos capas de fix:
    - **Reglas** (`firestore.rules`): `update` de `users/{uid}` ahora exige rol *sin cambio* O `admin` solo de una org que creaste (`orgs/{id}.createdBy == uid`); `lead` nunca auto-asignable; `reliability`/`matchesScouted` congelados para el cliente (los escribe el flujo ground-truth vía Admin SDK). Razonado que ambos flujos de onboarding pasan (crear org → admin; redimir invitación → rol scout sin cambio). **DEBE testearse post `firebase deploy --only firestore:rules`** en proyecto dev (no hay emulador en el entorno de dev de esta sesión).
    - **Código**: `createOrJoinOrgByTeamNumber` ahora es create-only; unirse a org existente por número lanza error y dirige a invitación.
    - **Residual (fuera de alcance, follow-up)**: unirse como *scout* a una org ajena escribiendo tu propio `orgId` sigue permitido por la rama "rol sin cambio" — para cerrarlo, la redención de invitación debe migrar a un server-action Admin-SDK y la regla prohibir client-set de `orgId` a org ajena. Cierra el vector 2 (leer picklists/estrategia rival). El vector 1 (escalación de privilegios) y el tampering de reliability ya quedan cerrados.
- **M5 (analytics DoS)**: `analyzeMultipleEvents` tenía `forceRefresh` controlado por cliente → saltaba caché y forzaba el fan-out completo a la FTC API en cada llamada. Removido de la firma (ningún cliente lo usaba). `eventCodes` ahora se sanea (dedup + cap 30 + drop de vacíos) vía `lib/analytics-guards.ts`. `getAvailableEvents` des-exportado (dejaba de ser endpoint RPC callable). Data Lab sigue siendo ruta pública por diseño (CLAUDE.md) — no se añadió auth; el cierre del bypass de caché + acotar input basta para el DoS.
- **Tests**: `analytics-guards.test.ts` (5), `orgs.membership.test.ts` (2, con regresión verificada del bare-join). Reglas: solo validación de sintaxis/razonamiento — requieren emulador para test real.

## 34. Fix C5: escrituras de match scouting idempotentes (id determinista)
- **Fecha**: 08 Jul 2026
- **Contexto**: `saveMatchScouting` usaba `addDoc` (id auto de Firestore, no idempotente). En `OnlineSync.drain` la secuencia era `saveMatchScouting` → `markAsSynced`; si el proceso se interrumpía entre ambos (tab cerrada, crash, red que cae tras el commit pero antes del ack), la fila Dexie seguía pendiente y se re-drenaba → **documento duplicado**. Mismo riesgo en re-escaneo de QR y retry de TanStack.
- **Decisión**: `saveMatchScouting(data, docId?)` ahora usa un **id de documento determinista** (el id local de Dexie, ya único y estable por captura) con **create-if-not-exists** (`getDoc` → si existe, no-op; si no, `setDoc`).
    - **Por qué existence-check y no setDoc directo**: las reglas hacen `match_scouting` inmutable (`allow update, delete: if false`, "re-scout = new entry"). Un `setDoc` sobre id existente sería un *update* → rechazado por reglas. El check de existencia respeta la inmutabilidad y logra idempotencia.
    - **Id no derivado de contenido** a propósito: un re-scout legítimo del mismo (team, match) debe ser un doc distinto; solo un *re-envío de la misma captura* colapsa a uno.
    - Call sites actualizados: `OnlineSync.drain` pasa `entry.id` y ya no lo quita; QR-import y sync-manual dejan de borrar el id.
- **Razón**: sin duplicados en red inestable (caso de uso central del evento). El id local viaja de captura a sync. Tests en `scouting-service.idempotency.test.ts` (5; los 5 fallan contra el `addDoc` viejo, verificado).
- **Residual (fuera de alcance)**: drains concurrentes (dos a la vez) siguen pudiendo chocar en el create — lo elimina M3 (ref-lock del drain). Entradas pendientes escritas bajo el esquema auto-id *antes* del deploy podrían duplicar una vez en el primer re-drain (población nula en práctica: sin evento real aún).

## 33. Fix C4: ground-truth validation scopeada por org (IDOR cross-tenant)
- **Fecha**: 08 Jul 2026
- **Contexto**: `validateGroundTruthAction` verificaba rol (admin/lead) pero llamaba `runGroundTruthValidation(season, eventCode)` sin scope de org. La función escribía `users/{scoutId}.reliability` de TODO scout que apareciera en (season, eventCode), cross-org. Un admin/lead de la org A podía pasar cualquier eventCode y sobrescribir la reliability de scouts de orgs B, C… — y la reliability pondera la agregación federada de todos, así que envenenaba analítica ajena.
- **Decisión**: `runGroundTruthValidation` ahora recibe `orgId` (tercer parámetro obligatorio). Dos capas:
    1. La query de `match_scouting` filtra por `orgId` (solo-igualdad de 3 campos → merge de índices de campo único, sin índice compuesto nuevo). Entradas sin orgId (legacy pre-Sprint-1) quedan excluidas — un dato no atribuible no debe permitir writes de reliability a ninguna org.
    2. Guard defensivo en el update: solo escribe el user doc si su `orgId` ACTUAL coincide — bloquea el caso de un scout que cambió de org (sus entradas viejas siguen bajo la org anterior).
    Como la señal de reliability es precisión de entradas propias (M6, decisión #30), el scope no cambia ninguna señal calculada; solo acota qué se lee y escribe.
- **Razón**: aislamiento cross-tenant. Tests de integración en `ground-truth-validation.orgscope.test.ts` con Firestore falso (2 tests; ambos fallan contra la versión sin scope, verificado).

## 32. Unificación de win-probability: un modelo, dos entradas (lib/win-probability.ts)
- **Fecha**: 08 Jul 2026
- **Contexto**: Coexistían dos fórmulas para la misma cantidad: logística k=1.5 normalizada por avgScore (`projections.ts`, decisión #23) y Elo base-10 con divisor fijo 80 (`alliance-utils.ts`). El mismo matchup mostraba probabilidades distintas en tabs distintos (ej. spread 30 con σ=20: 0.86 vs 0.70), y el divisor 80 no escala con el nivel de puntaje de la temporada. Además el bracket analítico del Oracle contradecía a su propio Monte Carlo.
- **Decisión**: nuevo módulo `lib/win-probability.ts` con UN supuesto (scores ~ ruido normal alrededor de la media proyectada) y dos entradas según la información disponible:
    - `winProbabilityFromNormalModel(μr, μb, σdiff)` = Φ((μr−μb)/σdiff) — cuando hay modelo de varianza. Es exactamente la probabilidad que el Monte Carlo de `alliance-utils` muestrea (Box-Muller sobre las mismas normales), así que bracket analítico y simulador convergen al mismo número (test: BO3 empírico ≈ p²(3−2p) analítico). Φ vía aproximación erf A&S 7.1.26 (error ≤1.5e-7).
    - `winProbabilityFromProjections(r, b)` = logística k=1.5 sobre diff/avgScore — cuando solo hay proyecciones de punto (la de #23, sin cambio de comportamiento; `predictMatch` delega aquí).
    - Ambas clampean [0.01, 0.99]. σ inválida → fallback a la logística.
- **Cambios de comportamiento**: solo en el Oracle bracket (`updateBracket`): las probabilidades ahora responden a la consistencia de las alianzas (σ) y escalan con el juego. `predictMatch` idéntico (tests fijan 0.8176).
- **Extra**: fix del Box-Muller `u1 = 1 − Math.random()` (Math.random() puede dar 0 → log(0) = −Infinity corrompía la muestra; hallazgo de auditoría).
- **Razón**: una cantidad, un modelo. 15 tests nuevos (win-probability.test.ts + alliance-utils.test.ts); regresión anti-Elo-80 verificada.

## 31. Fix M8: descomposición compartida train/serve para features RP (modelo v2)
- **Fecha**: 08 Jul 2026
- **Contexto**: Auditoría detectó train-serve skew en la regresión logística de RP. Entrenamiento (`rp-inference.ts`) e inferencia (`analytics.ts`) descomponían el score de alianza en (auto, tele, end) con fórmulas distintas: el fallback de tele en entrenamiento era `final − auto − foul` (SIN restar endgame) mientras inferencia usaba `score − auto − foul − end`. Cuando la API devuelve `scoreXEndgame` pero no `scoreXTeleOp`, el endgame se contaba doble en entrenamiento (dentro de tele Y como feature propia) y el vector servido venía de otra distribución. Que las fórmulas coincidieran dependía de la suerte del payload.
- **Decisión**:
    - Nueva función `allianceScoreComponents(match, side)` en `lib/rp-inference.ts` como única fuente de verdad de la descomposición: `end = scoreEndgame ?? 0`, `tele = scoreTeleOp ?? max(0, final − auto − foul − end)`.
    - `extractObservations` (entrenamiento) y los dos sitios de `analytics.ts` (perfil por equipo que alimenta `inferTeamRpProbability` + agregado por evento) la usan — paridad por construcción, no por convención.
    - **Cache key bumped a `v2`** (`rpModelCacheKey`): los modelos v1 se entrenaron con la descomposición sesgada y no deben servirse contra vectores nuevos. Hasta reentrenar, la inferencia cae transparentemente al heurístico (degradación ya diseñada).
- **Razón**: consistencia train-serve garantizada estructuralmente. Historial de versiones documentado en el docstring de `rpModelCacheKey`. 5 tests nuevos en `rp-inference.test.ts` (regresión de doble conteo verificada contra el código viejo).
- **Operativo**: tras deploy, correr "Entrenar modelos" (sidebar admin) para poblar los modelos v2.
- **Nota**: `pro-scouting.ts` tiene su propia descomposición para display (no alimenta inferencia RP) — fuera de alcance aquí.

## 30. Fix M6: reliability de scouts = precisión de entradas propias (reemplaza LOO marginal)
- **Fecha**: 08 Jul 2026
- **Contexto**: Auditoría detectó que `runGroundTruthValidation` usaba dos escalas incompatibles: path LOO (señal = 0.5 + marginal/2, centrada en 0.5 = "sin impacto") vs fallback single-scout (señal = 1 − error, escala de precisión). Un scout perfecto convergía a 1.0 solo pero a 0.5 acompañado de un compañero igual de bueno → la reliability medía cobertura, no habilidad. Peor: la redundancia es la NORMA del modelo federado, así que a mejor cobertura, todos los marginales → 0 y todas las reliabilities decaían hacia 0.5. Además: entradas super-scouting entraban a la atribución (super solo → error ~100% falso → señal ~0) y entradas anónimas sesgaban el baseline sin recibir nunca señal.
- **Decisión** (v3 del diseño; v1 = pooled, v2 = LOO de decisión #24):
    - Señal única para todos: `signal = 1 − reconstructAllianceError(entradas propias del scout)`. Mismo estimando y misma fórmula solo o acompañado.
    - Entradas super-scouting excluidas de la atribución por completo (espejo del filtro de `aggregateMatchTeam`); su reliability no se mueve aquí.
    - Entradas anónimas: cuentan solo para el display de error de consenso, nunca generan señal.
    - Lógica extraída a `computeAllianceSignals()` (pura, exportada, testeada); `marginalToSignal` eliminada.
- **Razón**: la reliability se consume como PESO en el consenso federado (peso = reliability × confidence) — el estimando correcto es confiabilidad de los datos propios, no contribución única de información. Preserva la meta de equidad de #24 (el ruido del pool no te castiga: te juzgan solo tus datos) mejor que el propio LOO (cuyo marginal dependía de la composición del pool). EWMA y α sin cambios. 8 tests nuevos en `ground-truth-validation.test.ts`; 5 fallan contra el algoritmo viejo (verificado).
- **Nota**: esto re-alcanza el ítem de backlog "Marginal accuracy v2: weight por contribución share" — la contribución share ya no es la métrica de reliability; si se quiere un leaderboard de "quién aporta más información", sería una métrica separada de la reliability-peso.

## 29. Fix C6: estadísticas del blend bayesiano divididas por conteo filtrado
- **Fecha**: 08 Jul 2026
- **Contexto**: Auditoría detectó que `calculateTeamProjection` usaba `n = scoutingEntries.length` (todas las entradas) para dividir estadísticas calculadas solo sobre entradas objetivas (el loop salta super-scouting). Con 1 match + 2 supers, el guard `n>=2` dejaba pasar `variance([x]) = Infinity` → la única observación real se descartaba en silencio y la proyección colapsaba al prior API. Con supers presentes, `scoutMean` quedaba subestimado (÷ n en vez de ÷ scoredCount).
- **Decisión**:
    - Introducir `scoredCount = scoutedScores.length`; toda estadística objetiva (media, varianza, posterior, reliability) usa `scoredCount`. `n` queda solo para el modificador subjetivo driverSkill (los supers legítimamente lo aportan).
    - `reliability` ahora se basa en observaciones objetivas: entradas solo-super → "low" (antes 2 supers daban "medium").
    - Breakdown: si todas las observaciones puntúan 0, cae al split API/default en vez de producir breakdown todo-cero junto a projectedPoints > 0 (el viejo guard `|| 1`).
    - Confianza: CV divide por `hybridBase` (pre-multiplicador) en vez de `projectedTotal` — el multiplicador escala media y sd por igual, así que la penalización mecánica ya no deflacta la confianza.
- **Razón**: correctitud estadística; el descarte silencioso de datos reales era el peor síntoma. Tests de regresión en `lib/projections.test.ts` (24 tests; 3 fallan contra el código viejo, verificado).
- **Pendiente de calibración**: el comentario de `driverSkillImpact` dice "capped ±7.5%" pero el código produce ±15% en los extremos Likert. Comportamiento preservado tal cual; decidir cuál es el intencional.

## 28. Inconsistencia de season default en page-level fallbacks
- **Fecha**: 24 May 2026
- **Contexto**: Bug latente: `app/page.tsx` defaulteaba a `getCurrentSeason()` (calendar-aware) pero `/event/[code]` y `/analytics` hardcoded `|| 2024`. Al rolar `getCurrentSeason()` a 2025, click en eventos 2025 desde home → 404 en `/event/[code]`.
- **Decisión**: Alinear todos los page-level defaults a `getCurrentSeason()`. Event page acepta `?season=` URL param explícito. Si evento no se encuentra en season primaria, fallback automático a `[primary, current, primary-1, primary+1]` antes de mostrar 404. EventList agrega `?season={N}` al href.
- **Razón**: Cookie expira, links se comparten, cambio de año rompe acceso a temporadas anteriores. La búsqueda multi-season es robustez sin costo.

## 36. Fix C2 + M2 + M3 + M7: crash de hooks, poison-pill de sync, race de drain, filtrado de picklist
- **Fecha**: 09 Jul 2026 (modelo: Sonnet, tareas mecánicas ya diagnosticadas en la auditoría del 08 Jul)
- **C2 (crash de hooks)**: `RankingTable.tsx` llamaba 4 `useMemo` (oprData, tableData, sortedData, extremes) DESPUÉS de un early-return condicional (`if (!rankings.length) return ...`). Cuando `rankings` pasaba de vacío a lleno entre renders, React lanzaba "Rendered more hooks than during the previous render". Fix: mover el early-return después de todos los hooks (los memos ya toleran arrays vacíos sin error).
- **M2 (poison-pill bloquea la cola de sync)**: `OnlineSync.drain` hacía `break` en el primer fallo del loop, dejando el resto de entradas pendientes sin intentar hasta el siguiente evento `online`. Una sola entrada corrupta (payload malformado, permiso denegado) bloqueaba indefinidamente a todas las que venían detrás en la cola Dexie.
    - **Decisión**: nueva `getPendingScoutingRows()` en `lib/localDatabase.ts` expone `syncAttempts`/`lastError` (que `getPendingScouting` recorta). `drain` ahora usa `continue` en vez de `break` (sigue intentando las demás entradas) y agrega dead-letter: si `syncAttempts >= MAX_SYNC_ATTEMPTS` (5), la entrada se salta permanentemente en vez de reintentarse cada poll.
- **M3 (drain no tiene lock real + deps inestables)**: `syncing` era estado de React — `setSyncing(true)` no toma efecto hasta el siguiente render, así que dos llamadas a `drain()` en el mismo tick (handler de `online` + tap-to-retry del usuario) pasaban ambas el check `!syncing` y corrían concurrentemente sobre las mismas filas Dexie (el residual documentado en #34/C5). Además `drain` tenía `pendingCount` en sus deps de `useCallback`, recreándose en cada poll de 5s y re-disparando el efecto de listeners.
    - **Decisión**: `drainingRef` (useRef, sincrónico) como mutex real; `pendingCountRef` espeja `pendingCount` para uso dentro de `drain` sin ser dependencia. `drain` ahora solo depende de `[user, refreshPendingCount]`, ambos estables entre polls.
- **M7 (picklist-service filtra campos del cliente)**: `updatePicklist` hacía `{ ...picklist, ...patch, ... }` — el picklist completo (estado de cliente vía listener real-time) se re-escribía en cada update, incluyendo un `id` que no pertenece al documento y un `orgId` que un estado local viejo o manipulado podría divergir del real. Con `merge: true`, spreadear `picklist` era además innecesario: los campos no tocados ya sobreviven en Firestore.
    - **Decisión**: `updatePicklist` ahora escribe solo `{ ...patch, updatedAt, updatedBy }`; la firma acepta `Pick<Picklist, "id">` en vez de `Picklist` completo (ya no necesita más que el id).
- **Tests**: `localDatabase.test.ts` +3 (getPendingScoutingRows, incluida verificación de que el dead-letter no borra la fila), `picklist-service.test.ts` nuevo (2; ambos fallan contra el spread viejo, verificado reintroduciendo el bug temporalmente). `RankingTable.tsx` no tiene infra de test de componentes en este repo (vitest config excluye jsdom a propósito) — verificado por typecheck + revisión manual del orden de hooks.
- **Razón**: los cuatro eran bugs mecánicos ya diagnosticados en la auditoría; ninguno cambia contrato público salvo el estrechamiento de tipo en `updatePicklist` (sin call sites afectados, confirmado por typecheck).

## 37. Barrido de lint: deuda preexistente (no-explicit-any, unused-vars, unescaped-entities)
- **Fecha**: 09 Jul 2026 (modelo: Sonnet, 5 agentes en paralelo por archivo + revisión manual de los diffs de mayor riesgo)
- **Contexto**: `npm run lint` reportaba 311 problemas. De esos, el service worker compilado por Serwist (`public/sw.js`, gitignored, generado) representaba ~98 — nunca debió lintearse. El resto (213) eran deuda real repartida en 46 archivos: 87 `no-unused-vars`, 62 `no-explicit-any`, 18 `react/no-unescaped-entities`, más un puñado de hallazgos nuevos del plugin `react-hooks` orientado a React Compiler (static-components, set-state-in-effect, exhaustive-deps, preserve-manual-memoization, set-state-in-render, purity) que NO estaban en el alcance original de esta tarea.
- **Decisión**:
    - `eslint.config.mjs`: `public/sw.js`/`.map` agregados a `globalIgnores` (artefacto de build, no código fuente).
    - `npx eslint --fix` para lo trivialmente auto-fixable (`prefer-const`, etc).
    - Barrido dividido en 5 lotes de archivos disjuntos, cada uno delegado a un agente con instrucciones idénticas: arreglar solo `no-unused-vars`/`no-explicit-any`/`no-unescaped-entities`; NUNCA renombrar con `_` una variable que se puede simplemente borrar; para `any`, inferir el tipo real del uso (o `unknown` con narrowing solo si genuinamente no hay tipo concreto); NO tocar ningún hallazgo `react-hooks/*` (eso quedó fuera de alcance — ver #38).
    - Revisión manual post-sweep de los diffs de mayor riesgo (cascada de props `alliances` eliminada en `TournamentSimulator`, genéricos `FieldPathByValue` en `ScoutingForm`, tipos nuevos `TeamSeasonRanking`/`FTCTeamInfo`/`FTCMatchScoreEntry` en `lib/ftc-api.ts` compartidos entre 2 agentes concurrentes) — todo verificado consistente por `tsc --noEmit` de proyecto completo (0 errores) y sin regresión visible en el código revisado a mano.
- **Resultado**: 0 `no-unused-vars`, 0 `no-explicit-any`, 0 `no-unescaped-entities` en todo el proyecto. 211/211 tests verdes, typecheck limpio. Quedan 44 problemas — todos `react-hooks/*` + 1 `no-require-imports` preexistente en `lib/firebase.ts` — deliberadamente fuera de este commit.
- **Nota**: `lib/hooks/use-scout-reliabilities.ts` y `use-tip-dismissed.ts` NO fueron tocados por los agentes (su único hallazgo, `set-state-in-effect`, estaba fuera de alcance) — se resolvieron aparte, ver #38.

## 38. Revisión de reglas react-hooks nuevas (React Compiler): 2 resueltas, resto documentado
- **Fecha**: 09 Jul 2026 (modelo: Sonnet)
- **Contexto**: El barrido de lint (#37) excluyó a propósito los hallazgos del plugin `react-hooks` orientado a React Compiler (`reactCompiler: true` en `next.config.ts`) porque varios representan riesgo de comportamiento real, no solo estilo, y requieren verificación en navegador que no está disponible en este entorno.
- **Resuelto**:
    - `lib/hooks/use-scout-reliabilities.ts`: el branch `if (!user) setReliabilities({})` dentro del efecto era un `setState` síncrono innecesario — el valor "sin usuario → {}" se puede derivar en el render (`return user ? fetchedReliabilities : {}`) sin efecto. Cambio verificado equivalente en cada transición de estado (mount sin user, login, logout) — incluso mejora un caso: limpia inmediatamente en logout en vez de esperar el próximo tick del efecto.
- **Documentado, no tocado (requiere trabajo dedicado con navegador)**:
    - `lib/hooks/use-tip-dismissed.ts`: patrón SSR-safe legítimo (leer localStorage tras hidratación para evitar flash del tip). El fix "correcto" sin efecto es `useSyncExternalStore`, pero cambia el mecanismo de actualización de `dismiss()` (requiere disparar el evento `storage` manualmente para notificar al propio tab) — no se reescribe sin poder verificarlo visualmente. `eslint-disable-next-line` con comentario explicando la excepción.
    - **`react-hooks/set-state-in-render` en `AlliancePredictor.tsx` (líneas 34-35)**: riesgo real de loop infinito ("Calling setState from useMemo may trigger an infinite loop") — requiere lectura del componente completo para entender si el memo realmente puede re-disparar el setState en un ciclo; no diagnosticado a fondo esta sesión.
    - **`react-hooks/purity` en `ScoutingForm.tsx:74`**: `Date.now()` llamado durante el render (impuro) — rompe las garantías de memoización del compilador.
    - **`react-hooks/static-components`** (24 hallazgos, `RankingTable.tsx` y `FRC_ReefscapeForm.tsx`): componentes (`SortIcon`, `HeaderWithTooltip`, `HighlightValue`, `Counter`, `Checkbox`) declarados dentro del render — se recrean cada render, reseteando su estado interno y rompiendo la optimización del compilador. Fix correcto: sacarlos a scope de módulo y pasar lo que hoy capturan por closure (`sortConfig`, `handleSort`, `extremes`, setters) como props explícitas — refactor mecánico pero con superficie de UI amplia, mejor con verificación visual.
    - **`react-hooks/set-state-in-effect`** (6 restantes: `Sidebar.tsx`, `TournamentSimulator.tsx` x2, `MatchScoutingForm.tsx`, `ScoutingClient.tsx`, `MatchSimulator.tsx`) y **`react-hooks/exhaustive-deps`** (5) y **`react-hooks/preserve-manual-memoization`** (4, `MatchList.tsx`) — no revisados aún, cada uno necesita evaluarse por separado (algunos pueden ser el mismo patrón SSR-safe de `use-tip-dismissed`, otros pueden ser bugs reales).
- **Razón**: estas reglas nuevas están diseñadas para detectar incompatibilidades con React Compiler que antes no se detectaban — mezclarlas con el barrido mecánico habría arriesgado silenciar bugs reales (loop infinito, impureza) bajo el mismo tratamiento que ruido de estilo. Quedan como ítem de backlog dedicado, con candidatos priorizados por riesgo arriba.

## 39. Fix M1: single-flight (request coalescing) contra cache stampede en lib/ftc-api.ts
- **Fecha**: 16 Jul 2026 (modelo: Opus)
- **Contexto**: Cada fetcher de `ftc-api.ts` seguía el patrón read-through: `getCachedData` (Redis) → si miss, fetch a la API de FIRST → `setCachedData`. El problema (thundering herd): N requests concurrentes con la MISMA key mientras la caché está fría o recién expirada hacen miss simultáneamente y TODOS disparan el fetch a la API rate-limited. Escenario real: docenas de scouts en el Wi-Fi del venue cargando la misma página de evento en el mismo segundo cuando la entrada de Redis está fría — justo cuando la red está peor. `React.cache()` (ya aplicado a `fetchEvents`/`getSmartTTL`) solo dedup DENTRO de un request; no cubre requests concurrentes.
- **Decisión**: single-flight in-process. Nuevo módulo puro testeable `lib/single-flight.ts` con un `Map<key, Promise>` de fetches en vuelo: callers concurrentes con la misma key comparten la misma promesa en vez de arrancar su propio fetch. La entrada se borra al settle (éxito O fallo), así que el Map solo contiene keys corriendo ahora (sin leak) y los fallos NO se memoizan (el siguiente request reintenta limpio).
    - Helper `readThrough(cacheKey, ttl, work)` en `ftc-api.ts`: fast path (caché caliente) = una lectura de Redis y return, sin tocar el Map (cero overhead en hits). Cold path = los callers concurrentes comparten un `work()` vía singleFlight, con re-check de caché dentro del flight (por si otro flight la pobló en el gap).
    - Los 9 fetchers (`fetchRankings`, `fetchAdvancement`, `fetchAdvancementPoints`, `fetchMatches`, `fetchMatchScores`, `fetchTeam`, `fetchTeamEvents`, `fetchEvents`, `fetchEventAwards`, `fetchEventAwardsForTeam`) refactorizados a `readThrough`, preservando EXACTAMENTE su lógica de fetch/error/cache-write (incluido qué resultados se cachean — éxitos sí, fallbacks de error `[]`/`null` no).
    - **Por qué in-process y no lock distribuido (Redis)**: la key ya identifica única (endpoint+season+event/team), sin colisión entre fetchers (prefijos distintos). Un lock distribuido coordinaría entre instancias del server pero añade latencia y modos de fallo (expiración de lock, deadlock) no justificados para el deployment (Firebase App Hosting, pocas instancias). El dedup in-process ya colapsa el burst dominante (una instancia sirviendo un flood concurrente).
- **Razón**: robustez pre-evento. Sin regresión de comportamiento (cada fetcher idéntico salvo el coalescing del cold path). Tests en `single-flight.test.ts` (4; los 2 de dedup fallan contra una versión naive `return fn()` sin Map, verificado). Verificado en navegador con caché real: home + evento (rankings/matches/stats) cargan idénticos, 0 errores de consola/server.
- **No incluido a propósito**: no se migró a lock distribuido (fuera de alcance/innecesario) ni se tocó la semántica de qué se cachea. Los hallazgos `react-hooks/*` de #38 siguen pendientes.

## 40. Fix M4 vector 2: redención de invitación server-side (Admin SDK) + regla que prohíbe client-set de orgId ajeno
- **Fecha**: 16 Jul 2026 (modelo: Opus)
- **Contexto**: El residual documentado en #35. La regla de `users/{uid}` update tenía una rama "rol sin cambio" que NO restringía `orgId`, así que un cliente malicioso podía saltarse `redeemInvite` por completo y hacer directo por el SDK `updateDoc(users/{miUid}, {orgId: "org-rival", role: "scout"})` — rol sin cambio (scout→scout), reliability/matchesScouted congelados → la regla lo permitía. Resultado: auto-unirse a una org ajena y leer su estrategia (picklists, notas privadas de pit; `picklists`/`pit_scouting` permiten lectura a cualquier miembro de la org). El vector 1 (escalación de rol) y el tampering de reliability ya estaban cerrados en #35; esto cierra el vector 2 (lectura cross-tenant).
- **Decisión** (dos capas):
    1. **Server-action `redeemInviteAction`** (`app/actions/redeem-invite.ts`, Admin SDK): verifica el ID token del caller, valida la invitación y escribe `users/{uid}.orgId` con el Admin SDK (que bypassa reglas). Corre en una **transacción de Firestore** (lee invite+org+user, valida, incrementa `uses`, escribe membresía) — atómico, lo que además cierra el race de `maxUses` que el path cliente tenía (documentado como "aceptable" en #34-adyacente; ahora resuelto gratis). Validación pura extraída a `lib/invite-redemption.ts` (`validateInvite` con `nowMs` inyectado para testear expiración de forma determinista) — 9 tests, los de expiración fallan contra el código sin el check (verificado).
    2. **Regla `users/{uid}` endurecida** (`firestore.rules`): la rama "rol sin cambio" ahora TAMBIÉN exige `orgId` sin cambio. Un cliente solo puede cambiar su `orgId` por la rama de creación de org (rol→admin de una org donde `createdBy == uid`). Cualquier otro client-set de `orgId` (a org ajena, como scout) queda rechazado.
    - **Migración del cliente**: `redeemInvite` (cliente) eliminado de `lib/orgs.ts`; `OnboardingModal.handleRedeem` ahora llama `redeemInviteAction({ idToken, code })`. `createInvite` (generación de códigos) SIGUE cliente — un lead/admin generando un código para su PROPIA org no es riesgo cross-tenant (la regla de `org_invites` create ya exige `orgId == myOrgId()` + rol). `createOrJoinOrgByTeamNumber` SIGUE cliente (create-only, la regla verifica `createdBy == uid`, sin riesgo cross-tenant).
- **Verificación de flujos legítimos contra la regla nueva**: (a) crear org → `setUserOrg(admin)`: rol scout→admin + orgId→org recién creada con createdBy==uid → pasa por rama admin ✓. (b) redimir invitación → ahora Admin SDK, bypassa reglas ✓. (c) el ataque (client-set orgId→ajena, rol scout): rama "sin cambio" ahora exige orgId sin cambio → falla; rama admin exige rol admin + createdBy==uid → falla → RECHAZADO ✓.
- **Sintaxis de reglas**: paréntesis balanceados, mismo patrón que la rama admin preexistente. NO se pudo validar contra la Rules API (el project id del env `ironlion-scouting` no resolvió en el MCP; dry-run del CLI requiere proyecto activo). **Semántica real (allow/deny por flujo) DEBE testearse post `firebase deploy --only firestore:rules`** en proyecto dev — ver comentario en la regla. Sin Admin SDK configurado (`FIREBASE_SERVICE_ACCOUNT_KEY` vacío en dev) el server-action tampoco corre end-to-end en dev; se une a la lista de features que fallan silenciosas sin esa credencial (CLAUDE.md).
- **Razón**: aislamiento cross-tenant completo. `users/{uid}.orgId` es la frontera de membresía; ninguna capa cliente puede escribirla hacia una org que el usuario no creó. 224 tests verdes, typecheck + lint limpios, app arranca sin errores de boundary de server-action.
