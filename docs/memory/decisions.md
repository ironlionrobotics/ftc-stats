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

## 41. Resolución del backlog react-hooks / React Compiler (cierra #38)
- **Fecha**: 16 Jul 2026 (modelo: Opus para las judgment calls; Sonnet en paralelo para la extracción mecánica de `static-components`)
- **Contexto**: Los 42 hallazgos `react-hooks/*` catalogados en #38 (del barrido de lint). Se resolvieron todos, verificando en navegador los de mayor riesgo. Efecto cascada observado: arreglar un error (p.ej. `purity`) hace que el compilador avance y revele más hallazgos en el mismo archivo, así que se resolvió archivo por archivo hasta dejarlo limpio.
- **Judgment calls (Opus)**:
    - **`AlliancePredictor.tsx`** `set-state-in-render` (setState dentro de un `useMemo` para sincronizar el prop `initialTeam` al estado local): reemplazado por el patrón React "ajustar estado cuando cambia un prop" (comparar el prop contra su valor previo durante el render, guardado, sin loop). El prop opcional se normaliza a `null` primero para que la comparación no oscile `undefined↔null`. Verificado en navegador: seleccionar equipo desde la tabla del Data Lab sincroniza el Oracle, memoria plana 3s (sin loop). También su `exhaustive-deps`: `calculateScoutingMetrics` → `useCallback([scoutingData])` + agregado a las deps de los 2 memos.
    - **`MatchSimulator.tsx`** `set-state-in-effect` + `exhaustive-deps`: el efecto DERIVABA `projection` de sus inputs → setState (anti-patrón). Convertido a `useMemo`. El `exhaustive-deps` revelaba un **bug real**: `manualAdjustments` se leía pero faltaba en deps, así que ajustar manualmente NO recalculaba la predicción — arreglado al incluirlo en las deps del memo.
    - **`TournamentSimulator.tsx`** 2× `set-state-in-effect`: (1) `bracket` era estado derivado vía efecto → `useMemo`; `handleReset` que hacía `setBracket([])` ahora solo hace `setAlliances([])` y el bracket derivado se limpia solo (verificado en navegador: reset vuelve a config, bracket desaparece). (2) carga de `scenarios` desde localStorage en efecto → initializer lazy de `useState` con guard `typeof window` (el componente solo se monta por click cliente en "Tournament", nunca SSR, así que no hay hydration mismatch).
    - **`Sidebar.tsx`** `set-state-in-effect`: el flag `mounted` (useState(false) + setState en efecto de mount) → hook `useHydrated()` basado en `useSyncExternalStore` (getServerSnapshot=false, getSnapshot=true) — mismo comportamiento SSR-safe sin setState en efecto. De paso se eliminó `interface SidebarProps {}` vacío (no-empty-object-type preexistente).
    - **`ScoutingClient.tsx`** `set-state-in-effect`: `setLoading(true)` en efecto de fetch, pero `loading` era estado MUERTO (destructurado como hueco, nunca leído) — eliminado por completo.
    - **`MatchScoutingForm.tsx`** `set-state-in-effect`: el efecto llamaba `loadPending()` (función que hace setState tras await); el compilador la marcaba. Inline del fetch en el efecto con guard de cancelación (patrón `.then` callback sancionado + evita setState post-unmount). `loadPending` se mantiene para el `onSaveSuccess` del form (event handler, no marcado).
    - **`ScoutingForm.tsx`** `purity` (`Date.now()` en `onSubmit`, que el compilador no distingue de render): reubicado a un helper a nivel de módulo `nowFirestoreTimestamp()`. Al arreglarlo el compilador avanzó y reveló `set-state-in-effect` (el `setIsEditing(false)` del efecto de re-init, redundante — estado inicial false + onSubmit lo pone false + remonta por key → removido) y `static-components` (`SectionTitle`/`Label`, sin closure → hoisted a módulo). También su `exhaustive-deps`: `[team.teamNumber, ...]` → `[team, ...]` (team es referencia estable por selectedTeamId, se deriva de un array fijo + remonta por key).
    - **`MatchList.tsx`** `preserve-manual-memoization` ×4 + `exhaustive-deps`: `calculateComponentOPR` (recreada cada render, usada en el memo `oprData`) → `useCallback([matches, rankings])` + memo depende de ella (mismo fix que AlliancePredictor).
- **Mecánico (Sonnet, 2 agentes paralelos, verificado en navegador)**: `static-components` — componentes definidos dentro del render se recrean cada vez. Hoisted a nivel de módulo convirtiendo capturas de closure en props explícitas:
    - **`RankingTable.tsx`** (10): `SortIcon` (prop `sortConfig`), `HeaderWithTooltip` (props `sortConfig` + `handleSort`), `HighlightValue` (prop `extremes`). Verificado: tabla renderiza, sorting por header funciona (reordena), HighlightValue colorea extremos.
    - **`FRC_ReefscapeForm.tsx`** (14): `Counter`/`Checkbox` — NO capturaban closure (solo sus params + imports de módulo), extracción directa con props interfaces.
- **Excepción documentada, NO tocada**: `lib/hooks/use-tip-dismissed.ts` (set-state-in-effect) sigue con `eslint-disable` justificado (patrón SSR-safe de localStorage; el fix correcto `useSyncExternalStore` cambia el mecanismo de `dismiss()` y necesita verificación visual dedicada). Y `lib/firebase.ts:47` `no-require-imports` (preexistente, deliberado, fuera de alcance desde #37).
- **Resultado**: 0 hallazgos `react-hooks/*` en todo el proyecto (de 42). 224 tests verdes, typecheck limpio, 0 errores de consola en navegador. Único lint restante: el `no-require-imports` preexistente de firebase.ts.
- **Razón**: compatibilidad plena con React Compiler (`reactCompiler: true`) — elimina hazards reales (un bug de proyección obsoleta encontrado y arreglado; componentes que se remontaban perdiendo estado) además del ruido de estilo.

## 42. Caché FTC API: fallos nunca memoizados + fin-de-evento en UTC con buffer de 24 h
- **Fecha**: 25 Jul 2026 (modelo: Fable 5)
- **Contexto**: Auditoría del 24-25 jul (día final del Premier FPEMX). (a) `fetchMatches`/`fetchMatchScores` convertían errores HTTP no-404 y JSON malformado en `{matches:[]}/{scores:[]}` y **lo escribían a Redis** con el smart TTL — violando el contrato documentado en `readThrough` ("failures are never memoised"). (b) `getSmartTTL` parseaba `dateEnd` ("YYYY-MM-DD" → medianoche UTC) pero ajustaba el fin de día con `setHours()` **local**: con servidor UTC y venue UTC-6, el evento se marcaba "completado" desde las ~18:00 del último día (alliance selection/playoffs). Combinadas: un fallo transitorio de la API esa tarde cacheaba "no hay partidos" con TTL de 30 días.
- **Decisión**: (a) tracking `fetchFailed` por sub-fetch (helper `handleLevel`): 404 = "no publicado aún" (cacheable), cualquier otro fallo → se devuelve lo obtenido pero SIN `setCachedData`, el siguiente request reintenta. (b) toda la aritmética de fechas en UTC (`setUTCHours`) + `COMPLETED_BUFFER_MS = 24h` tras el fin del último día antes de aplicar el TTL de 30 días — cubre cualquier timezone de venue y ediciones tardías de scores; el costo es 24 h extra de TTL de 60 s (irrelevante). Mismo patrón UTC aplicado a la ventana "activo" de `lib/aggregation.ts` (que ya tenía +3 días de buffer).
- **Razón**: en evento en vivo, un caché envenenado de 30 días es catastrófico e invisible; el fix se desplegó a producción el mismo día ANTES del cierre del evento.

## 43. Identidad de datos unificada: cookie única `ftc_season` + eventCode real de FIRST + `guessActiveEventCode`
- **Fecha**: 25 Jul 2026 (modelo: Fable 5)
- **Contexto**: Dos bugs críticos de la auditoría hacían el scouting invisible en el estado por defecto. (a) **Season split-brain**: el store Zustand tenía `season: 2024` hardcodeado (persistido en localStorage) y escribía la cookie `active_season`, que solo leía `/scouting`; el resto de páginas leía `ftc_season` (escrita por EventFilter). Dispositivo limpio en julio 2026: las vistas de evento buscaban scouting season=2025, los formularios lo guardaban con 2024. (b) **Namespace de eventCode**: `aggregation.ts` etiquetaba `events[].eventCode` con la abreviatura display ("CTN") mientras `/event/[code]` y la API usan el código FIRST ("MXCIQ"); además los formularios/tabs adivinaban el evento con `teams[0].events[0]` (= primer evento del equipo mejor rankeado, no el evento actual) y Live Ranking consultaba la API con la abreviatura → 404 → "sin matches" siempre.
- **Decisión**:
    1. `ftc_season` es la única cookie de temporada. El store: default `getCurrentSeason()` (calendario), `setSeason` escribe `ftc_season`, persist `version: 1` con `migrate` que descarta el season persistido viejo, y `onRehydrateStorage` reconcilia contra la cookie (cookie gana; si no hay cookie se escribe desde el estado). EventFilter sincroniza el store al aplicar filtros. Todos los fallbacks `|| 2024` de páginas → `getCurrentSeason()`; `SUPPORTED_SEASONS` derivado del calendario; `/event/[code]/pro` deja de hardcodear `season={2024}`.
    2. `events[].eventCode` = código FIRST real; la abreviatura pasa a campo display `abbr` (chips de StatsTable/EventList). Cache key de agregación bump a `aggregation_v3`. Se añaden `dateStart/dateEnd` a las entradas y un helper `lib/active-event.ts` (`guessActiveEventCode`): prefiere el evento cuyas fechas contienen HOY (±1 día inicio, +2 fin, UTC), luego el más reciente, luego el más frecuente — usado por los 2 formularios FTC, las 4 tabs de estrategia y como default del selector de Live Ranking.
- **Razón**: la identidad (season, eventCode) es la clave de partición de TODO el scouting federado; si escritura y lectura no comparten namespace, los datos existen pero nadie los ve. Verificado: Firestore aún no tenía entradas de scouting (colecciones solo `api_cache`/`users`), así que no hizo falta migración de datos.

## 44. Captura FTC offline-first (fallback a cola Dexie) + presupuestos de payload/render en el home
- **Fecha**: 25 Jul 2026 (modelo: Fable 5)
- **Contexto**: (a) Los formularios FTC iban directo a Firestore sin try/catch: sin red, la entrada se perdía sin aviso (toda la maquinaria OnlineSync/Dexie solo la usaba el form FRC). (b) El home serializaba el catálogo mundial de eventos (1,849 eventos × 25 campos = 1.12 MB medidos) como prop de EventFilter → HTML de 1.8 MB; el filtro "All Regions" agregaba ~1,800 eventos × 4 endpoints (~7,200 llamadas API) y mandaba ~7,000 equipos al navegador, renderizados sin virtualización y re-ordenados en cada keystroke (sin useMemo) — la causa más plausible del síntoma "se congela la computadora". (c) `train-rp-models` iteraba los 1,849 eventos del mundo (comentario esperaba "~10-30").
- **Decisión**:
    1. `useSaveMatchScouting` intenta Firestore y ante error hace `saveToLocal` (cola Dexie que OnlineSync drena) devolviendo `{savedTo: "remote"|"local"}`; los formularios muestran toast diferenciado ("guardado offline — se sincronizará") y toast.error solo si además falla Dexie. `retry: false` (el fallback ya cubre transitorios). Pit scouting queda con toast.error correcto pero sin cola (PENDING #15).
    2. Home: proyección `EventFilterOption` (6 campos) server-side (~1/6 del peso), lista del tab "Specific Events" capada a 150 nodos con contador "+N más", StatsTable con `useMemo` + paginación de 100 filas ("Mostrar más"), opción "All Regions" eliminada de la UI y degradada a "MX" en el servidor (URLs viejas), RP trainer filtrado a eventos mexicanos, `cachePruneOlderThan()` invocado al montar OnlineSync (antes no tenía ningún caller — IndexedDB crecía sin límite), listeners `onSnapshot` con error callback (scouting-service, picklist-service) y `PicklistEditor` con catch (antes "Cargando…" eterno ante permission-denied).
- **Razón**: presupuesto de datos proporcional a lo que la UI muestra; una captura de scouting jamás se pierde en silencio; ningún click de usuario debe poder disparar trabajo O(mundo).

## 45. Optimización móvil: master-detail en scouting, tab bars con scroll propio, tabla compacta
- **Fecha**: 25 Jul 2026 (modelo: Fable 5)
- **Contexto**: Auditoría móvil con navegador real (390×844): (a) la barra de 7 tabs de /event forzaba scroll horizontal de TODA la página (933px de docWidth); (b) /scouting apilaba lista de equipos + formulario en una columna con doble scroll inusable; (c) StatsTable con celdas p-4 daba filas de ~125px y páginas de 14,250px; (d) el menú lateral NO tenía link a /strategy (la página era inalcanzable por navegación); (e) el header del pit form desbordaba su tarjeta.
- **Decisión**: tab bars scrollean dentro de sí mismas (`overflow-x-auto` + `shrink-0` en triggers — patrón aplicado a EventViewManager y ui/Tabs); /scouting usa patrón master-detail en <md (elegir equipo → formulario a pantalla completa con botón "← Equipos"; desktop sin cambio); StatsTable con `p-2.5 md:p-4`; link Estrategia añadido al Sidebar; headers con flex-wrap + truncate. La lista del tab "Specific Events" del filtro quedó capada a 150 nodos DOM (con "+N más — usa el buscador").
- **Razón**: el scouting en venue es 100% móvil/tablet; el layout de dos paneles simultáneos no cabe en 390px.

## 46. Rediseño visual "Modern technical" (ejecuta la dirección guardada pre-Premier)
- **Fecha**: 25 Jul 2026 (modelo: Fable 5; barrido mecánico por 2 agentes Sonnet supervisados)
- **Contexto**: Convivían DOS temas hardcodeados incompatibles — scouting en "dark glass" (text-white, bg-white/5) y event/analytics en claro (bg-white, slate-*) — parchados con `!important` en globals.css; el toggle claro/oscuro rompía la mitad de la app. Además `@theme` referenciaba `--font-inter`/`--font-outfit` que NUNCA se cargaban (el layout monta Geist con otras variables) → toda la tipografía caía al default del navegador.
- **Decisión** (dirección ya acordada en memoria de proyecto: Linear/Vercel/Statbotics, violet/cyan, sin neon):
    1. **Tokens semánticos completos** en :root/.dark: primary violeta (#6d5ce8 / #8f85f3), secondary/accent cyan (#0891b2 / #22d3ee), success/warning/danger, superficies en 3 niveles (background→card→muted) con hairlines; alias `--color-input`. El naranja/ámbar anterior desaparece como color de marca.
    2. **Tipografía**: Geist (cuerpo) + Archivo (display: títulos y números grandes) + Geist Mono con `tabular-nums` global en tablas/datos; kickers en mono uppercase tracking ancho.
    3. **Flat en vez de glassmorphism**: .glass/.glass-card ahora superficies planas con borde (blur = ruido con luz de venue + costo GPU en tablets); sombras grandes → shadow-sm; textura única permitida: `.bg-grid` (grid blueprint con máscara radial) en heros.
    4. **Un solo acento para estados activos** (tabs de evento eran naranja/azul/morado/amarillo → violeta único, PRO en cyan; stat cards de EventStats unificadas violet/cyan).
    5. **Barrido de re-tokenización** (~900 reemplazos en ~40 archivos, 2 agentes Sonnet con spec + revisión): scouting, strategy, analytics, auth, event, ui. Excepciones deliberadas documentadas: subtree imprimible del briefing (claro fijo para papel), chrome de cámara del QRScanner, tooltips/popovers fixed-dark (contraste garantizado), scrims de modal (bg-black/70), fondo blanco del QR (contraste de escaneo). La capa de `!important` en globals.css se conserva como red de seguridad transicional.
- **Verificado**: 224 tests, tsc y lint limpios, build de producción ok; verificación visual en navegador de home/scouting/event/strategy en claro+oscuro y móvil+desktop.
- **Razón**: consistencia de marca y un toggle de tema que funciona en toda la app por primera vez; la estética "instrumento de precisión" comunica lo que la app es — una herramienta de análisis en vivo.

## 47. Soporte de alianzas de 3 robots (Championship/Premier) con semántica de "mejor par"
- **Fecha**: 25 Jul 2026 (modelo: Fable 5)
- **Contexto**: Investigación de reglas en fuentes primarias (Competition Manual DECODE TU32, secciones 13 y 15, PDFs oficiales + FTC Events API en vivo). Hallazgos que CORRIGEN la premisa inicial: (a) el 2do pick en el Championship NO es backup puro — regla 15.3: la alianza alinea "any 2 of the 3 ROBOTS" en cada match, a discreción del capitán, sin rotación obligatoria; (b) la ronda 2 de selección va en orden INVERTIDO (alianza 8 elige primero — serpentina); (c) los Premier Events NO tienen formato obligatorio: cada organizador decide (European/İstanbul/Michiana 2026 usaron 3 robots; New England/Cowtown/Canada Cup usaron 2; FPEMX 2025 usó 6×2); (d) con 29 equipos la Table 13-2 manda 6 alianzas, no 4; (e) T702: un equipo que declina no puede ser elegido después (un capitán que declina sigue eligiendo pero no puede ser invitado); (f) T703: sin backups en eventos regulares; C301: los replays usan los mismos robots.
- **Decisión**:
    1. `generateAlliances(teams, count, allianceSize: 2|3 = 2)`: ronda 2 en orden invertido (15.3); el pick2 se elige maximizando el `bestFieldedPair` (cubre tanto valor de backup como de flexibilidad estratégica).
    2. **Semántica de proyección**: para alianzas de 3, `projectedScore`/σ/Monte Carlo usan el MEJOR PAR de los 3 (nuevo helper exportado `bestFieldedPair`), nunca la suma — solo 2 robots juegan. Mismo fix en el "Estimated Alliance Score" del AllianceSelector (sumaba los 3: inflaba ~50%).
    3. **Auto-detección, no configuración**: nuevo `fetchAlliances` (endpoint `/alliances/{code}`); `round2 != null` ⟹ formato de 3. La página del evento muestra el panel "Alianzas oficiales" con el formato detectado en cuanto el API publica la selección (TTL 60 s en evento activo). No se asume formato para Premier antes de que publique — es decisión del organizador.
    4. TournamentSimulator: toggle "2 — Estándar / 3 — Championship/Premier" en la configuración.
- **Razón**: predecir playoffs con la suma de 3 OPRs sobreestimaría ~50% la fuerza de cada alianza; y asumir formato fijo para Premier Events contradice los datos (varían por organizador). La fuente de verdad es el API del evento.

## 48. Corrección de semántica de fouls del API + capa de realidad del bracket (falla por robot, foul points, import automático)
- **Fecha**: 28 Jul 2026 (modelo: Fable 5)
- **Contexto**: Al importar resultados reales de playoffs de FPEMX y contrastarlos con el display oficial de FIRST (capturas del Upper Bracket R1 M1: 230–82, "Penalty Points Committed" 35/20), se descubrió que **`scoreXFoul` del API = puntos de penalización COMETIDOS por X** (otorgados al rival), y NO "recibidos por X" como asumía el código del event page. El comentario erróneo vivía en MatchList y se había propagado a EventViewManager, RankingTable, EventStats, pro-scouting y rp-inference. `lib/aggregation.ts` y `lib/ftc-api.ts` (live-projection) ya usaban la semántica correcta — la app tenía DOS convenciones contradictorias.
- **Decisión**:
    1. **Semántica única verificada**: np/clean de X = `scoreXFinal − scoreYFoul` (se resta lo RECIBIDO, que viene del campo del oponente). Drawn foul (provocados) de X = `scoreYFoul`; committed (indisciplina) de X = `scoreXFoul`. Corregido en MatchList (OPR overall, residuales de predicción, tele approx, "Penalty In"), EventViewManager (np del ranking simulado, OPRs del Oracle, trend, teleScore), RankingTable, EventStats (Highest Clean), pro-scouting, rp-inference (+ fixtures de tests actualizados; efecto: driza drawn/committed que estaban intercambiados y OPRs np ligeramente distintos).
    2. **Capa de realidad del bracket** (`MatchAdjustment`): falla de robot POR EQUIPO (`failedTeamRed/Blue` — el que murió puede ser el fuerte o el débil; la alianza proyecta con el sobreviviente), **foul points generales** (`foulPointsRed/Blue`, igual que "Penalty Points Committed" oficial; botones rápidos +5 minor/+15 major), resultados reales que definen al ganador y se propagan, tabla "Estimado vs Real" (compara contra la proyección BASE sin incidentes + contador de aciertos), todo persistido en escenarios.
    3. **"Importar resultados (API)"**: mapea los matches reales de playoffs a los slots del bracket por composición de alianzas (iterativo para que cada resultado resuelva el pairing de la siguiente ronda) e importa marcadores + foul points cometidos. Verificado contra FPEMX: 10 matches importados, 8/10 aciertos de ganador del modelo, fouls exactos vs el display oficial.
- **Razón**: los datos de fouls por partido son la materia prima de la estadística de disciplina (committedFoul OPR ya alimenta el netDiscipline del Oracle y el score de sinergia del draft); con la semántica invertida, la app premiaba a los indisciplinados. El import automático convierte cada evento terminado en un dataset de validación del modelo sin captura manual.

## 49. Calendario híbrido con predicción de partidos + análisis explicable + rebrand a PRIDE
- **Fecha**: 25-28 Jul 2026 (modelo: Fable 5 / Opus 4.8)
- **Contexto**: El usuario quería ver TODOS los matches (jugados y por jugar) con predicción de resultado, y mejorar el nombre + branding de la app.
- **Decisión**:
    1. **`fetchHybridSchedule`** (`lib/ftc-api.ts`): endpoint "hybrid" de FIRST (`/schedule/{code}/{level}/hybrid`) que trae calendario + resultados inline; matches no jugados = `scoreRedFinal null`. Mismo contrato de caché seguro que los demás fetchers. Nuevo tipo `FTCHybridScheduleMatch`.
    2. **Pestaña Matches rediseñada** (`components/event/MatchList.tsx`): sección "Próximos partidos" (tarjetas con hora, alianzas clickeables, marcador proyectado = suma de OPR, barra de win probability) + sección "Resultados". La σ para el modelo normal se estima de los **residuales del propio evento** (cuánto se desvían las alianzas reales de su suma de OPR); con <4 obs cae al logístico.
    3. **Análisis explicable por match** (`buildMatchAnalysis` en MatchList): botón "¿Por qué este pronóstico?" que genera narrativa DESDE los componentes OPR — dónde se construye la ventaja (auto vs teleop), quién la impulsa (si un robot aporta ≥60%), disciplina de fouls, y confiabilidad vs ruido del evento ("ventaja sólida" / "partido abierto" / "alta volatilidad").
    4. **Rebrand a PRIDE** ("PRIDE — FTC Analytics por Iron Lion"): manada de leones = metáfora del scouting federado. Atribución "por Iron Lion Robotics · FTC #30311" en sidebar/metadata/manifest/onboarding/Discord bot. El usuario eligió PRIDE entre 4 candidatos (PRIDE/ROAR/Iron Oracle/mantener FTC Stats).
- **Razón**: convierte cada evento en curso en una herramienta de predicción en vivo; el análisis explicable diferencia un 76% con σ alta de uno estable. Verificado con los 12 pendientes reales de FPEMX (Q42 de 30311: 99%, coincide con el Monte Carlo).

## 50. Draft en vivo (asistente de selección) + asesor de invitación con inferencia de scouting rival
- **Fecha**: 25-28 Jul 2026 (modelo: Fable 5 / Opus 4.8)
- **Contexto**: El Oracle tenía Partner Finder y Tournament en pestañas separadas; el usuario quería ver AMBOS a la vez (armar alianzas + ver quién es su mejor partner disponible), y modelar la decisión "aceptar invitación vs declinar y capitanear" cuidando la relación con el equipo rechazado.
- **Decisión**:
    1. **`LiveDraftBoard.tsx`** (tercer modo del Oracle, "Draft en vivo"): tablero de alianzas + panel "Mi equipo" con recomendaciones de partner que comparten UN estado — asignar un equipo lo quita de disponibles al instante. Persistencia localStorage por evento, tracking T702 (declinaron), botón "Importar oficial", proyección del mejor par de mi alianza.
    2. **Proyecciones por alianza**: cada fila muestra fuerza (mejor par) + F%/C% (Monte Carlo ×1500 automático cuando el tablero está completo).
    3. **Asesor de invitación** (`simulateInvitationScenario`): compara aceptar vs declinar-y-capitanear, ambas ramas completando el draft greedy y simulando el torneo. Respeta T702 (al declinar nadie puede reinvitarte). Veredicto pondera ganancia competitiva vs costo relacional cuando son equivalentes.
    4. **Inferencia de calidad de scouting del capitán rival**: si su mejor opción según el modelo era otro equipo (por >8 pts) y aun así te invitó, están drafteando POR TABLA DE RANKING, no por scouting → al declinar NO te quitan tu objetivo (toman al siguiente del ranking). Toggle "Por ranking / Por modelo" (pre-selecciona el inferido). Validado con el caso real FPEMX: Rhinos (A5, rank 5) invitó a 30311 (rank 7) cuando su mejor opción era 15912/Tesla (rank 14) → señal clara de draft por ranking.
- **Razón**: la invitación misma es información sobre el scouting del rival; el asesor evita rechazos innecesarios (protege relaciones) cuando declinar no da ventaja real, y detecta el caso peligroso donde declinar + no alcanzar capitanía = quedar fuera (T702).

## Validación del modelo contra FPEMX (playoffs reales, 28 Jul 2026)
- El modelo acertó **9 de 10 ganadores** de playoffs (importados vía API). El único upset del torneo fue de 30311: A5 107-89 sobre A3 (el modelo lo daba ~24%).
- A1 (12887+32753) campeón como el favorito absoluto (~256 pts proyectados, doble que A5/A6). A4 protagonista secundario como predijo el MC; la Lower Final se volteó 198-180 por major fouls de A4 (impronosticable — cubierto por la capa de realidad).
- **Insight estratégico**: en un campo con súper-equipo, el boleto ganador no era capitanear sino ser pick de A1 (32753, rank 16, campeón por buen scouting del capitán). El top-4 de seed vale desproporcionadamente por los byes en doble eliminación; ser "pickeable" para capitanes top es estrategia válida.
- **Posicionamiento vs ecosistema** (investigado 25 jul): ninguna herramienta FTC pública combina scouting federado + blend bayesiano + Monte Carlo + regresión RP + calibración Brier. FTC Scout = OPR estándar sin predicción. FTC Secrets (equipo 31000) es lo más cercano en predicción pero sin scouting colaborativo. Nadie publica accuracy/Brier de predicción FTC — PRIDE tiene el instrumental para ser el primero.

## #51 · Backtest del Oracle contra el World Championship Houston 2026 (2026-07-28)

Metodología idéntica a la validación FPEMX (OPR Gauss-Seidel de quals → suma de robots en cancha → Φ((μA−μB)/σ_diff), σ de residuales ×√2), corrida sobre las 6 divisiones + Finals vía FTCScout GraphQL.

| Ámbito | Resultado |
|---|---|
| 6 divisiones (84 matches de playoffs) | **55/84 = 65.5%** de aciertos; calibración sana (P media al ganador real 0.634 ≈ 65.5% realizado) |
| Mejor división | Ross **85.7%** (alianza dominante 14270/3565, invicta en división) |
| Peores | Lovelace y Franklin 57.1% — paridad real (σ_diff más bajos del set), no falla del modelo |
| Finals (17 matches, OPR pooled de 847 quals) | **8/17 = 47.1%** — moneda al aire; el campeón mundial ([30030,21087,11228]) era el **#5** por OPR pooled y venció al favorito del modelo (98.7%→perdió) en el mayor upset del backtest |
| Campeón = favorito del modelo | Solo 3/6 divisiones; Finals NO |

**Lecturas:** (1) 65.5% en Worlds vs 90% en FPEMX es esperado — el field mundial comprime los márgenes de OPR hacia el piso de ruido y las eliminatorias tienden a 50/50 genuino; la calibración se sostuvo, que es lo que importa. (2) Se confirma a mayor escala el insight FPEMX: el OPR lineal de quals no captura factores de playoffs (defensa, sinergia, mejora del driver) — "el mejor por OPR" solo fue campeón en la mitad de las divisiones. (3) Mejora futura candidata: ajuste específico de eliminatorias (peso a consistencia/σ propio y defensa) antes del Championship 2027. La app ya renderiza las divisiones nativamente (§15.3 auto-detectado) + navegación agregada.

## #52 · Backtest del Oracle contra los 7 Premier Events 2026 (2026-07-28)

Metodología idéntica a #51 (OPR quals → robots en cancha → Φ(Δμ/σ)). Global: **107/153 = 69.9%**, P media al ganador 0.676 (levemente subconfiado, calibración sana). Por evento: FPEMX 8/10 (80%), FPENE 18/23 (78%), FPECAR 10/14 (71%), FPEWE 22/31 (71%), FPEEUR 20/30 (67%), FPERR 15/23 (65%), FPEIST 14/22 (64%). El favorito por OPR fue campeón solo en 2/7.

Hallazgos clave: (1) curva de dificultad esperada Regional 90% → Premier 70% → Worlds 65% → Finals 47% — el modelo pierde precisión exactamente donde el field se comprime, con calibración sostenida en todos los niveles. (2) Control FPEMX: 8/10 score-only vs 9/10 in-app — el match que difiere es el upset de 30311 (p=0.11), que el blend bayesiano con scouting vivo SÍ atrapó: evidencia directa de que el scouting agrega señal real. (3) Estructural: los códigos `*FP` de Premiers son placeholders vacíos; el ruteo real es `divisionCode`/`relatedEvents` (FPEEUR: quals en 2 divisiones + 30 playoffs en el padre; IST/NE/WE/RR: divisiones autocontenidas + mini-Finals). Nota para soporte futuro de divisiones en la app. (4) FPEEUR cross-división tiene grafo de OPR desconectado — retomar si se modela ese caso.

## #53 · Backtest cross-temporada: Into The Deep 2024-25 (2026-07-28)

Misma metodología (#51/#52) sobre season 2024: Worlds tenía 4 divisiones (Ochoa/Edison/Jemison/Franklin) + Einstein; los Premier SÍ existían (FPEMX/FPECA/FPECR jugados). Resultados: divisiones **38/58 = 65.5%** (idéntico a 2025), Einstein 3/6 = 50% (vs 47.1%), Premiers 22/37 = 59.5% (arrastrado por FPECA: 16 equipos, σ=129, el más volátil del muestreo), FPEMX-2024 9/10 = 90%, MXCMP 11/14 = 78.6%.

**Conclusión clave: la jerarquía de calibración se replica entre temporadas** — mean-P Premier 0.617 > Divisiones 0.559 > Finals 0.474, mismo orden que DECODE — con juego distinto. El Oracle generaliza por diseño (OPR+σ residual es season-agnostic), no por suerte de una temporada. El favorito por OPR fue campeón en 2/4 divisiones y 1/3 Premiers: cuarta confirmación del límite conocido (eliminatorias ≠ quals). Caveats: N chico por evento hace ruidosa la precisión cruda (la calibración no); Einstein usa super-alianzas de 3 pooled cross-división (extrapolación estructuralmente más ruidosa ambas temporadas).

## #54 · Backtest histórico: CenterStage 2023, PowerPlay 2022, Freight Frenzy 2021 (2026-07-28)

Misma metodología (#51-#53). Divisiones de Worlds: 2023 **73.3%** (22/30, mean-P 0.645), 2022 **46.4%** (13/28, 0.508 — outlier real), 2021 **92.3%** (12/13, 0.812; solo 2 divisiones post-pandemia). Finals: 50% / 16.7% / 33.3%. MXCMP: 100% / 66.7% / 50%. Premiers no existían pre-2024 (confirmado). Pooled 3 temporadas divisiones: **66.2%** — dentro de la banda 60-70%.

**Conclusiones del expediente completo (5 temporadas, 5 juegos, ~470 matches):** (1) La jerarquía divisiones > Finals se replica **5/5 temporadas** (brecha de 25-40pp cada año) — propiedad estructural del modelo, no de un juego. (2) La banda ~60-70% de Worlds es promedio multi-temporada (pooled 65-66% en las 3 eras); una temporada individual oscila 46-92%. (3) **PowerPlay 2022 es el outlier explicable**: meta defensivo (bloqueo de ciclos/junctions) que el OPR ofensivo de quals no ve — el campeón de Edison venció a alianzas de mayor OPR en 6/8 matches. Refuerza la tesis del scouting: los juegos con defensa fuerte NECESITAN señal humana. (4) #1-OPR fue campeón de división solo 2/10 en estas 3 temporadas (4/16 sumando todas) y jamás ganó unas Finals — la selección de alianzas domina sobre el OPR individual. Caveat: N por bracket es chico (3-8 matches); las cifras por evento tienen intervalos anchos.
