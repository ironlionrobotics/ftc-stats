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

## #55 · Backtest global DECODE 2025: 662 eventos, 5,772 matches, todas las regiones (2026-07-28)

Primera corrida del script `scripts/oracle-backtest.mjs` (reanudable, FTCScout GraphQL). Global: **75.8% acc, meanP 0.731, Brier 0.180** — calibración a 2.7pp de lo realizado a escala mundial. Por tipo: Qualifier 76.1%, Championship 75.7%, LeagueTournament 76.9%, Premier 75.5% (200 matches), **FIRSTChampionship 65.5%** — replica EXACTA e independiente del backtest #51 (misma cifra por otro camino). SuperQualifier el más difícil (66.4%). México: 10 eventos, 92 matches, 72.8% (meanP 0.715). La jerarquía completa queda: regional ~76% > Premier 75.5% > Worlds 65.5%, con calibración sana en todos los niveles.

## #56 · Backtest global COMPLETO: 5 temporadas, 2,463 eventos, 19,161 matches (2026-07-28)

Corrida completa de `scripts/oracle-backtest.mjs` sobre todas las regiones: 2025 DECODE 75.8% (0.731) · 2024 ITD 75.9% (0.732) · 2023 CS 75.6% (0.729) · 2022 PP 72.3% (0.704) · 2021 FF 73.3% (0.700, tipo MatchScores2021Trad). **Conclusiones definitivas:** (1) La "constante del Oracle" ≈ 76% (banda 72-76%) con calibración a <3pp de lo realizado en TODAS las temporadas — el modelo sabe cuánto sabe, a escala de 19k matches. (2) PowerPlay 2022 confirmado como outlier estructural también globalmente (meta defensivo; el modelo se auto-ajustó: meanP 0.704). (3) México: 80→81→77→73% en 4 temporadas — field crecientemente competitivo, no degradación del modelo. (4) Jerarquía por tipo estable: regionales/leagues ~76% > Premier 75.5% > SuperQual/Worlds ~66% > Finals ~47%. Los datos crudos en data/oracle-backtest/ (gitignored, regenerables); base lista para la síntesis pública de validación.

## #57 · Backtest extendido a 2019-2020 + caso de uso "selector de eventos" (2026-07-28)

Expediente final: **7 temporadas, 2,793 eventos, 21,436 matches**. 2019 Skystone 71.4% (0.684) — la más baja: era pre-moderna del juego con datos más ruidosos. 2020 Ultimate Goal 83.6% (0.790) sobre solo 54 eventos tradicionales — el field COVID auto-seleccionado era chico y predecible. La banda del Oracle queda 71-76% en temporadas normales, calibración <3.5pp siempre. Nuevo caso de uso identificado: los datos por evento (σ del field, tamaño, precisión histórica por región) sirven como **selector de eventos** ("¿me conviene el Premier de Europa o el de Canadá?") — candidato a feature del territorio T4; la comparación se hace hoy con `data/oracle-backtest/*.jsonl`.

## #58 · Contrafactual 30311 en Worlds/Premiers 2025 + confirmación pre-2019 (2026-07-28)

FTCScout no tiene datos pre-2019 (verificado) — el expediente de 7 temporadas es el máximo. Proyección de 30311 (OPR temporada 63.4 / pico FPEMX 80.8) insertado en fields reales: **Worlds: fuera de playoffs en las 6 divisiones incluso en forma pico** (percentil 21-34%; el top OPR de Worlds 201-238 casi triplica el pico); **Premiers: en forma pico llega a burbuja en 4/5** (mejor: Run for the Robots seed 23/72 p69%, luego New England p66%; Western Edge el único fuera incluso en pico). En forma de temporada (63.4): fuera en TODOS. Lección estratégica anotada: la palanca es la CONSISTENCIA de temporada, no el pico de un evento; y elegir fields con OPR medio ~73-75 (RR/NE) sobre 85 (WE). Caveat: OPR FTCScout de 30311 en FPEMX = 59.96 vs 80.8 interno — metodologías distintas, direccional no exacto.

## #59 · Modelo de eliminatorias: σ de playoffs inflada 2.4× — aprendida, no supuesta (2026-07-28)

Fit logístico sobre **10,800 matches reales de playoffs** (2024+2025, todas las regiones; `scripts/oracle-backtest.mjs matches/fit`, split 80/20 por evento): features [z, consDiff, level]. Resultado en held-out: log-loss 0.685→**0.500 (−27%)**, Brier −9%, sin overfitting (train 0.487). El efecto dominante es shrinkage de z (peso 0.666 vs ~1.7 de equivalencia probit↔logit) ⇒ **la σ efectiva de playoffs ≈ 2.4× la derivada de quals**. La precisión casi no cambia (74.7→75.0%): lo que se corrige es la SOBRECONFIANZA en los extremos (ej. el miss de 98.7% en Finals, #51).

Integración: `PLAYOFF_SIGMA_INFLATION = 2.4` + `playoffWinProbability()` en lib/win-probability.ts; cableado en updateBracket (ambas ramas) y en el muestreo del Monte Carlo (consistencia analítico↔MC preservada). Los caminos de QUALS (MatchList próximos) mantienen la σ sin inflar — correcto, el shrinkage es fenómeno de eliminatorias. Tests actualizados al nuevo contrato (Φ(30/28.28·2.4)≈0.671 vs 0.856 previo). Hallazgo secundario: consDiff. **⚠ El −0.13 registrado aquí era un estimado SIN CONVERGER** — ver #73, el valor real es −0.696 y ya está integrado. El peso de z (0.666) sí estaba convergido, así que la σ×2.4 de esta decisión se mantiene.

## #60 · Feature "Selector de eventos" (territorio T4) (2026-07-28)

Nueva pestaña en /analytics: compara fields históricos de eventos ("¿dónde me conviene competir?") contra el OPR proyectado del usuario. Datos: `lib/data/event-profiles.json` (1,213 perfiles 2024-2025 curados del backtest global vía `scripts/oracle-backtest.mjs profiles/export-profiles`: equipos, OPR medio/σ/top del field, σ del evento). Lógica pura en `lib/event-selector.ts` (+8 tests): percentil por aproximación normal del field, seed esperado, veredicto por umbrales de #58 (capitán ≤ alianzas; pick ≤ 2×; burbuja ≤ 2.5×), clase de volatilidad (σ≤40 ordenado / ≥60 caótico) con nota estratégica por combinación. Validación en vivo: con OPR 80, FPEMX → "Pick probable #8/29" (30311 fue pick real), RR/NE → burbuja (coincide con #58), Carolinas → caótico σ92. Etiquetado explícito como estimación direccional. Regenerar dataset por temporada: `profiles <season>` + `export-profiles`.

## #61 · Tracker de consistencia: la dispersión de 30311 es CRECIMIENTO, no volatilidad (2026-07-28)

Refina la conclusión de #58 ("la palanca es la consistencia de temporada"). "Inconsistente" escondía dos situaciones con estrategias **opuestas**, así que `lib/consistency.ts` (+24 tests) las separa ajustando una recta sobre la serie cronológica y midiendo cuánto de la dispersión explica: `r²` alto ⇒ crecimiento; residual alto ⇒ volatilidad real. Las dos σ se reportan como desviaciones poblacionales (no n−1 / n−2) para que se cumpla exacto `(residualSigma/rawSigma)² = 1 − r²` y sean comparables en la UI; `adjustedR2` lleva la corrección de muestra chica.

**Resultado en 30311 (4 eventos):** pendiente **+8.4 OPR/evento**, **r² 0.77** (adj 0.65) ⇒ diagnóstico `crecimiento`. La σ bruta de 10.7 baja a **±5.2 de volatilidad real**. Conclusión que cambia la estrategia: no son volátiles, están mejorando — y su **OPR público de temporada (63.4) va 15.2 puntos por detrás de su forma actual (78.6)**. Como los capitanes scoutean por ese número atrasado, la brecha cuesta posición de draft. La palanca es *hacer visible la forma actual*, no reducir varianza.

**Descomposición por fase (contradice el "learning" previo del reporte):** el autónomo es la fase que *crece* (+1.9/evento, r² 0.65, ruido ±1.5); el **teleoperado es el driver de volatilidad real** (r² 0.01, ruido ±5.1). Subir el piso pasa por teleop, no por auto.

Traducción a decisiones vía `projectFormBands` sobre perfiles reales: en FPEMX su forma actual proyecta **pick seed #8/29** — fueron pick real con seed 7. Desde el número público están a **1.8 OPR de pasar de burbuja a pick** ahí (`pointsToNextTier`, resuelto por bisección sobre `projectAtEvent` en vez de invertir la normal, porque el veredicto es escalonado y un inverso analítico discreparía en los bordes). UI: sección 02 del reporte de equipo (`components/team/ConsistencyTracker.tsx`), con los 6 fields curados inline para no cargar los 1,213 perfiles en la página de equipo.

## #62 · Los helpers puros no viven en módulos "use server" (2026-07-28)

Al arreglar `app/actions/pro-scouting.ts` (#10 de PENDING) se exportaron dos helpers **síncronos** desde un módulo `"use server"`. Next.js trata cada export de esos módulos como server action y exige que sean `async`, así que rompe el build — pero **`tsc`, `vitest` y `eslint` los tres pasan**: sólo `next build` lo detecta. Se movieron a `lib/scoring-utils.ts` (+7 tests) y `pro-scouting.ts` los importa. **Regla operativa: cualquier cambio bajo `app/actions/` exige correr `npm run build`, no basta con tests + typecheck.**

## #63 · Ground-truth validation idempotente por entrada consumida (2026-07-29)

`runGroundTruthValidation` actualizaba reliability con `await userRef.update()` secuencial por scout, sin registro de corrida: re-ejecutar sobre un evento **volvía a aplicar la EWMA** (mueve el score dos veces) y un fallo a media lista dejaba la org medio actualizada sin forma de saber hasta dónde llegó.

Fix con marcador en la colección server-only `ground_truth_runs/{orgId}__{season}__{eventCode}` que guarda **los IDs de las entradas ya incorporadas**:
- Re-ejecutar es **incremental**, no un rechazo: validar a media competencia y otra vez al final cuenta cada entrada exactamente una vez. Un "ya corrió, me niego" habría roto ese flujo, que es el normal.
- Sólo se registran entradas que **produjeron señal**. Las de matches no jugados quedan sin marcar para que una corrida posterior las tome cuando exista score.
- El marcador se commitea **en el mismo `WriteBatch`** que los updates de usuario ⇒ "el marcador reclama una entrada" ⟺ "esa entrada se aplicó". Un commit fallido no aplica nada. Guard explícito si se superara el límite de 500 ops de Firestore (falla ruidoso en vez de partir el batch y perder atomicidad).
- Semántica deliberada: las entradas de un scout saltado por el guard cross-org **sí** cuentan como consumidas — el guard es una decisión de seguridad permanente, no un fallo transitorio, así que re-escanearlas nunca produciría escritura.

De paso: el mapeo era `{ id: d.id, ...d.data() }` — el spread iba **después**, así que un campo `id` guardado en el payload sobrescribía el id real del documento. Como el dedup usa ese id, se invirtió el orden. `ValidationReport` gana `entriesConsumed` / `entriesAlreadyCounted` / `previousRunAt`. Regla `ground_truth_runs` cerrada en ambos sentidos (`if false`) — un cliente que pudiera escribirla podría replicar o suprimir actualizaciones de reliability. 4 tests nuevos (277 total).

## #64 · Server actions fallan cerrado cuando falta firebase-admin (2026-07-29)

`getAdminDb()` lanza si no hay `FIREBASE_SERVICE_ACCOUNT_KEY` — un estado esperado en dev. Estaba fuera de todo try en 4 actions (`calibration`, `validate-ground-truth`, `notify-discord`, `train-rp-models`), así que la promesa se rechazaba en vez de devolver el `{ok:false}` que esas mismas funciones ya usan en todos sus otros caminos. Ahora cada call site del Admin SDK cae al shape de resultado propio de su archivo (`error` o `reason: "no-admin"`). Mensaje deliberadamente honesto — "No se pudo acceder a Firestore (¿falta configurar Firebase Admin?)" — porque el catch también atrapa fallos de red o permisos, y afirmar "no está configurado" mandaría a depurar lo que no es. `CalibrationDashboard.refresh()` ya distingue "cargó vacío" de "falló al cargar". Además `fetchTeam` dejó de escribir `null` a Redis: `readThrough` trata falsy como miss, así que era una escritura sin ningún beneficio.

## #65 · Firebase fuera de la carga inicial de las rutas públicas (2026-07-29)

`/event` bajaba **1271 KB de JS inicial, 380 KB de ellos Firebase**, en la página que más se abre en competencia y sobre wifi de venue. La hipótesis registrada en PENDING ("mover AuthProvider a rutas con login") era inviable: `Sidebar`, `OnboardingModal` y `OnlineSync` son globales y consumen auth. El problema real no era *dónde se monta* el provider sino *qué se importa estáticamente* desde el layout raíz.

Trazando el grafo de imports estáticos (script en scratchpad, sigue `import` y excluye `import type`/`import()`) el camino resultó ser uno solo y nada obvio:

```
app/layout.tsx -> components/Sidebar.tsx -> components/auth/InviteGenerator.tsx -> lib/orgs.ts -> lib/firebase.ts
```

Un panel de invitaciones **de admin** metía el SDK entero de Firebase en el chunk que descarga toda página pública. `lib/firebase.ts` inicializa app+auth+firestore+analytics a nivel de módulo, así que un único import estático basta.

Cortes aplicados: los 4 paneles admin del Sidebar y los globales diferidos (`OnboardingModal`, `OnlineSync`, `AssistantChat`) pasan por `next/dynamic({ssr:false})` — `DeferredGlobals` existe porque `ssr:false` no se permite en un Server Component; `AuthContext` importa firebase dinámicamente (API pública intacta: `user` sigue empezando en `undefined` y `loading` en `true`); `EventViewManager` importa `lib/scouting-service` dentro del effect ya condicionado por tab; y **`DEFAULT_ORG_ID` (el string `"30311"`) se movió a `lib/constants`** porque importarlo desde `lib/orgs` hacía que toda la capa offline (`lib/localDatabase`) arrastrara Firestore.

Medido sirviendo el build y sumando los `<script>` del HTML (los chunks de `next/dynamic` no aparecen ahí — es exactamente la carga inicial):

| ruta | antes | después | Firebase |
|---|---|---|---|
| `/event/FPEMX` | 1271 KB | **762 KB** | 380 → **0** |
| `/` | — | 776 KB | 0 |
| `/team/30311` | — | 645 KB | 0 |
| `/analytics` | — | 682 KB | 0 |
| `/scouting` | — | 1819 KB | 397 (legítimo) |
| `/strategy` | — | 1154 KB | 397 (legítimo) |

**−40% en la página de evento.** Las dos rutas autenticadas conservan el SDK, que es lo correcto. Nota de método: la primera medición (`rootMainFiles` del build-manifest) dio un falso negativo — ese es el bundle de framework compartido, no el grupo de chunks del layout; sólo la lista de `<script>` del HTML servido responde la pregunta.

## #66 · Cola offline: dead-letter visible + pit scouting encolado (2026-07-29)

Dos huecos del contrato offline-first, ambos con la misma consecuencia: **captura real perdida en silencio**.

**(a) Dead-letter invisible.** `drain()` salta filas con `syncAttempts >= 5` (guarda antipoison correcta), pero `getPendingScouting()` filtraba sólo por `syncedAt === 0`, así que esas filas **seguían contando en el badge "N pend."**. El scout veía un contador que nunca bajaba y asumía lentitud. Y no había forma de ver qué estaba atascado, por qué, reintentarlo ni sacar los datos: si la causa era transitoria (token vencido, deploy de reglas a media competencia), la captura estaba perdida de facto. Ahora el badge cuenta sólo filas dentro de su presupuesto de reintentos, las atascadas tienen su propio indicador y un panel con equipo/match/evento/error, **Reintentar**, **Reintentar todas** y **Exportar JSON** — el export funciona sin red, que es lo que importa para el runbook de failover.

**(b) Pit scouting sin cola.** `useSavePitScouting` escribía directo a Firestore sin fallback… y además **era código muerto**: `ScoutingClient.handleSavePitData` llamaba `savePitScouting` directamente. La entrevista de pit se hace una vez por equipo, normalmente en la zona del venue con peor señal. Ahora sigue el mismo patrón remote-first/local-fallback del match scouting, con tabla Dexie `pendingPits` (esquema v2).

Detalle de diseño que simplifica el pit respecto al match: su doc de Firestore ya tiene id determinista `${season}_${teamNumber}_${orgId}`, así que **esa misma string es la primary key en Dexie**. Recapturar offline sobreescribe la fila encolada en vez de duplicar (correcto: hay exactamente un registro de pit por equipo/org/temporada) y el drain no necesita el truco de id local estable que sí requiere `pendingMatches`. El constructor del id vive en `lib/constants` (`pitRecordId`) y lo importan **ambos** lados, así que no pueden derivar — y `localDatabase` sigue sin tocar el grafo de Firebase, que es lo que mantiene el bundle limpio (#65).

Migración Dexie v1→v2: `pendingMatches` NO se redeclara — una versión sólo describe el delta, y una tabla omitida conserva esquema y filas. Cubierto por un test que abre una conexión Dexie v1 cruda, inserta una fila, y verifica que sobrevive al abrir el esquema real v1+v2. Perder scouting encolado en una migración sería peor que el bug que se arregla. 13 tests nuevos entre ambos items (290 total).

**Pendiente de verificación**: el pill y el panel sólo renderizan con sesión iniciada, así que no se pudieron ver en navegador — falta revisión visual en dev con usuario autenticado (incluye confirmar que no chocan con la burbuja del AssistantChat, que ocupa la misma esquina).

## #67 · Fallback offline en /event + renderers de caché todos lazy (2026-07-29)

`/event/[code]` no tenía el patrón offline: si la API de FIRST no respondía, `fetchEvents` devolvía `[]`, `event` quedaba `undefined` y la página mostraba **"Event Not Found"** — el peor mensaje posible, porque afirma que el evento no existe cuando lo que falla es la red. Ahora escribe su render a Dexie (`CacheWriter`) y, cuando la API no responde, sirve lo cacheado con banner de "datos cacheados".

Dos decisiones de diseño:
- **Clave por código de evento, no por código+temporada** (`event:FPEMX`). Offline no sabemos qué temporada vio el usuario la última vez; "muéstrame lo que tenía de FPEMX" es lo que espera. La temporada viaja dentro del payload.
- **El fallback sólo se dispara si NINGUNA temporada devolvió eventos**, señal inequívoca de API caída. Si el evento se encontró pero no tiene partidos, se renderiza normal: eso es legítimo para un evento futuro, y servir caché ahí sería peor que mostrar el calendario vacío.

Hallazgo de bundle al medir: `HydrateAndCache` lo importan **home y event**, así que un import estático de un renderer mete el de una página en el bundle de la OTRA — medido **+199 KB en /event** por `StatsTable`/`EventList`. Ahora TODOS los renderers son `next/dynamic`. Además `lib/client-cache` (Dexie, ~170 KB) se importa dinámicamente dentro de los effects: `CacheWriter` no renderiza nada y `OfflineFallback` muestra primero un estado de carga, así que IndexedDB no tiene por qué bloquear el primer pintado. Neto: **`/` 776 → 677 KB** (mejora de 99 KB) y `/event` 762 → 845 KB (costo real de la funcionalidad).

Verificado end-to-end en navegador: se puebla la caché con servidor sano, se reinicia con credenciales FTC y Redis inválidas → el servidor renderiza el fallback (no "Event Not Found") y el cliente pinta el evento completo desde IndexedDB con el banner. **Nota de método**: hubo que desregistrar el service worker para probarlo — Serwist sirve el HTML cacheado y es la PRIMERA línea de defensa; este fallback es la segunda (servidor vivo pero sin datos de la API).

## #68 · `FTC_IntoTheDeepForm` → `FTC_DecodeForm` (2026-07-29)

El form capturaba campos DECODE desde hace temporadas pero conservaba el nombre del juego anterior. Renombrado el archivo y, para no dejarlo a medias, también los identificadores: `ftcIntoTheDeepFormSchema` → `ftcDecodeFormSchema`, `FTCIntoTheDeepFormValues` → `FTCDecodeFormValues`, `FTCIntoTheDeepData` → `FTCDecodeData`. Renombre puro verificado por typecheck; las referencias a IntoTheDeep que quedan son históricas y correctas (formas de `scoreBreakdown` por temporada en `analytics.ts`).

## #69 · Página pública de calibración del Oracle (`/oracle`) (2026-07-29)

Publica en abierto y sin autenticación qué tan bien predice el Oracle. Razón: una herramienta de predicción que no enseña su tasa de error está pidiendo una confianza que no se ha ganado. Sirve además al objetivo de "informar al público" y da material citable ante jueces y patrocinadores.

**Todas las cifras se RECOMPUTARON desde `data/oracle-backtest/*.jsonl`**, no se transcribieron de la prosa de decisiones previas — el módulo `lib/reports/oracle-calibration.ts` se generó por script para eliminar el riesgo de transcripción. Reproduce el expediente: 7 temporadas, 2,793 eventos, **21,436 partidos, 74.8%** global.

Hallazgo nuevo que la prosa no tenía: **el diagrama de fiabilidad**. Sobre los 10,800 partidos de 2024-2025 (el conteo cuadra exacto con #59 tras filtrar 1,326 marcadores `{skipped:true}` que NO son partidos), el modelo original resulta fuertemente sobreconfiado en los extremos — decía 98% y ganaba 86%; decía 85% y ganaba 69% — mientras que su calibración *promedio* era ligeramente infra-confiada (73.1% declarado vs 75.8% logrado). Ambas cosas a la vez, que es justo lo que un promedio esconde y un diagrama revela. Con la σ×2.4 de #59 todos los tramos caen dentro de 3pp. La página muestra **las dos curvas**: ocultar la mala sería marketing, no evidencia.

Detalle de honestidad en la tabla: cada modelo lleva **su propio conteo de partidos por tramo**, porque corregir la incertidumbre reordena predicciones entre tramos (el 90-100% pasa de 6,241 a 2,400 partidos). Una sola columna de conteo compartida daría a entender que ambos porcentajes describen los mismos partidos — no lo hacen. Se detectó revisando la página en navegador, no en el código.

Enlazada desde el nav principal: una página que nadie encuentra no es transparencia. Server Component sobre datos estáticos ⇒ no agrega JS de cliente.

## #70 · Detector de meta defensivo: hipótesis FALSIFICADA, no se construye (2026-07-29)

PENDING proponía "ensanchar σ automáticamente cuando los residuales huelen a defensa", nacido de que Power Play 2022 fue la temporada menos precisa (72.3% vs ~75.7%). Antes de construirlo se probó la premisa. **No se sostiene, y construirlo habría empeorado el modelo.** Script reproducible: `scripts/oracle-noise-analysis.mjs`.

**Prueba 1 — ¿la σ por evento ya absorbe la dificultad?** Agrupando los eventos de cada temporada por su propia σ ajustada: al subir σ, la precisión baja *y la confianza declarada baja con ella*. La brecha de calibración se mantiene en una banda de ~1 punto (ej. 2024: −1.8 / −2.8 / −3.3). Es decir, el mecanismo que el detector iba a añadir **ya existe**: σ se ajusta por evento y el modelo ya reporta menos confianza donde acierta menos.

**Prueba 2 — ¿queda señal después de normalizar?** La σ cruda está confundida con cuánto se anota en cada juego. Con un índice libre de escala (σ / marcador típico de alianza) la precisión queda **plana** entre cuartiles: 2024 → 74.6 / 77.3 / 74.8 / 76.7; 2025 → 75.4 / 76.6 / 76.2 / 75.7. El "ruido" de un evento no predice nada que el modelo no esté usando ya.

**Y el signo va al revés.** Todas las brechas son negativas: el modelo ya es ligeramente **infra**-confiado. Ensanchar σ lo alejaría más de la calibración, no la acercaría.

**Relectura de Power Play:** su baja precisión no fue un fallo de calibración que el modelo no vio — fue **la temporada mejor calibrada de las siete** (−1.9 pp, la brecha más chica). Perdió precisión, no honestidad. La conclusión estratégica correcta no es "desconfía más del modelo en metas defensivos" sino "en un meta defensivo el marcador explica menos, así que el scouting humano aporta más" — que es la tesis que la app ya sostiene. Se añadió ese matiz a `/oracle`.

Lección de método: el ítem llevaba meses en el backlog como algo obviamente bueno. Dos consultas sobre datos que ya teníamos bastaron para descartarlo. Vale la pena probar la premisa antes que la implementación.

## #71 · Curvas de crecimiento rookie→veterano (México) (2026-07-29)

Responde la pregunta de planeación "¿a qué ritmo mejora un programa como el nuestro y dónde deberíamos estar en dos años?". Script: `scripts/growth-curves.mjs` (FTCScout, `teamsSearch` por región + `quickStats` por temporada, 10 equipos por request vía alias). Datos en `data/growth-curves/MX.json`, curados a `lib/reports/growth-curves.ts`; UI en la sección 05 del reporte de equipo.

**Decisión metodológica que cambia el resultado: se mide en PERCENTIL, no en OPR.** El OPR no es comparable entre temporadas — cada juego de FTC anota distinto, así que graficar OPR crudo contra "años desde rookie" mezcla unidades e **inventa** una tendencia. Cada equipo se rankea primero dentro de su cohorte (temporada, región). Además es la cantidad más útil: competitivamente importa si subes respecto a los equipos que enfrentas.

**Curva de México (189 equipos con año rookie conocido):** mediana p33.8 (T1) → p52.7 (T2) → p48.1 (T3) → p54.6 (T4) → p59.3 (T5) → p80.4 (T6) → p87.5 (T7).

Dos lecturas accionables:
1. **El salto grande es el año 2**: +18.9 puntos de percentil, el mayor de toda la curva y el mejor medido (140 y 86 equipos). Luego hay meseta en T3-T5.
2. **La cola engaña.** Se pasa de 140 equipos a 19: el repunte de T6-T7 es en parte attrition, no mejora. Se añadió un **control de sesgo de supervivencia**: una segunda curva sobre la cohorte fija de los 20 programas con 5+ temporadas. Los que duran ya arrancaban **~10 puntos de percentil por encima** en su T1 — o sea, buena parte del "crecimiento" tardío es selección desde el inicio. Ambas curvas se muestran juntas; cualquiera sola engaña.

**Posición de 30311**: percentil **79.2** de México en su temporada rookie (28º de 131 equipos con datos 2025), contra una mediana rookie de 33.8. Es el nivel que el programa mexicano típico alcanza hasta su **sexta temporada**.

Caveat documentado en la UI: la ventana 2019-2025 trunca por la izquierda (un programa anterior a 2019 sólo aparece desde temporadas tardías), lo que adelgaza los primeros años de la cohorte fija (T1 descansa en 4 equipos) — indicativo, no asentado.

## #72 · Ciencia del draft: priors medidos, no supuestos (2026-07-29)

Los umbrales de selección de alianzas que usaba la app venían de mirar unos pocos eventos (#58: "capitán ≈ top `alliances`, pickeable ≈ top 2×"). Ahora hay medición: **606 eventos, 15,186 observaciones equipo-evento** de la temporada 2025. Scripts: `scripts/draft-science.mjs` (recolección) y `scripts/draft-analysis.mjs` (análisis).

FTCScout no expone selección de alianzas, así que se **reconstruyen** desde la composición de los matches de playoffs: equipos que salen a la cancha del mismo lado están en la misma alianza (componentes conexos, sólo `onField`). Validación: en cada evento de la muestra `picked` = alianzas × 2 exacto y capitanes = nº de alianzas. Al capitán se le infiere como el mejor seed de su alianza — es la regla en la práctica, pero es inferencia, no un campo del dato.

**Hallazgo 1 — la probabilidad por seed** (fields de 20+): seed 1-4 ~99%, seed 7 92%, seed 8 87%, seed 9 76%, seed 10 63%, seed 12 46%, seed 14 33%, seed 16 17%. El acantilado está entre el 8 y el 12.

**Hallazgo 2, el importante — el seed NO es destino.** Entre equipos que no pueden capitanear y están en el tercio alto de la tabla, controlando por una banda estrecha de seed (7-12, n=2,238): estar en el decil superior de OPR del evento da **94.1%** de selección; estar bajo el percentil 25 da **50.2%**. A igualdad de seed, ser visiblemente bueno vale más que varias posiciones de ranking. Es la forma cuantificada de lo que FPEMX sugirió anecdóticamente ([[project-fpemx-validacion]]).

**Hallazgo 3** — el 36.7% de los equipos que seedearon por encima del último seleccionado se quedaron fuera: los capitanes sí alcanzan hacia abajo de la tabla, así que un umbral puro por seed nunca iba a ser correcto.

Dos correcciones estadísticas que el código hace explícitas:
- **Regresión isotónica (PAVA)** sobre la curva por seed. Las tasas crudas oscilan en la cola (el seed 14 midió por encima del 13) y una curva donde seedear peor mejora tus odds es ruido vendido como consejo. La monotonía se conoce a priori, así que imponerla es el estimador de máxima verosimilitud, no un maquillaje. Se conservan ambas series (`pickRate` cruda y `pickRateSmoothed`); se calcula con la suavizada.
- **Ajuste en espacio de odds, no de probabilidad.** Multiplicar una probabilidad por un factor >1 se desborda cuando la base ya es alta: un seed 8 (87%) × 1.22 pasa de 100% y hay que clampear, lo que esconde el problema y borra la distinción entre p75 y p95. Con odds ratios ambos quedan ordenados y dentro de (0,1) por construcción.

`lib/draft-odds.ts` (+12 tests) expone `draftOdds(seed, alliances, oprPct)` y `seedNeededFor(target)`. Cableado en la tabla de bandas del reporte de equipo como columna "Prob. de alianza" con el ajuste por OPR visible — porque el veredicto "burbuja" se lee igual al 45% que al 85% y son situaciones que se planean distinto.

## #73 · consDiff integrado — y el −0.13 de #59 era un bug de convergencia (2026-07-29)

Al ir a integrar el efecto de consistencia salieron dos cosas antes que el código.

**1. La duda teórica estaba equivocada, y probarla valió la pena.** "La varianza ayuda al que va perdiendo" implica una *interacción* (consDiff × z), no un efecto lineal: ser volátil debería ayudarte cuando eres underdog y perjudicarte cuando eres favorito. Se ajustaron cuatro modelos sobre los mismos 10,800 matches con idéntico split:

| modelo | log-loss held-out |
|---|---|
| z + level (sin consDiff) | 0.5012 |
| z + consDiff + level (actual) | **0.4975** |
| + interacción z×consDiff | 0.4975 |
| sólo interacción | 0.5007 |

La interacción **no aporta nada** (peso 0.016, cero mejora). El efecto es genuinamente un efecto principal, no la historia del underdog que parecía. Hipótesis a favor: la σ de residuales de clasificación **no distingue "errático" de "mejorando durante el evento"** — un equipo que sube a lo largo de quals deja residuales tardíos grandes y llega a playoffs realmente más fuerte que su OPR. Cuál de las dos manda no está establecido; se usa la constante y se deja la interpretación abierta.

**2. El −0.13 de #59 era un bug de convergencia, no un hallazgo.** El `fit` corría 400 épocas a lr 0.05 y se detenía ahí:

| épocas / lr | consDiff | z |
|---|---|---|
| 400 / 0.05 (shipped) | −0.1285 | 0.6658 |
| 3000 / 0.3 | **−0.6957** | 0.6568 |
| 20000 / 0.3 | −0.6957 | 0.6568 |

Subestimado **5×**. El peso de z casi no se movió, así que la σ×2.4 de #59 sobrevive intacta; el término secundario no. Se corrigieron los parámetros del `fit` en `scripts/oracle-backtest.mjs` con una nota para que no se bajen sin verificar, y se anotó la corrección en #59.

**Integración.** La derivación sale limpia: con consDiff = (σ̄_blue − σ̄_red)/σ_evento y pesos 0.6568/−0.6956, el modelo equivale a desplazar z en −1.059·consDiff; como z ya es un margen dividido entre σ_evento, esa σ **se cancela** y todo se reduce a sumar `1.059 × (σ̄_red − σ̄_blue)` al margen de red. Sin aproximación de escala. `CONSISTENCY_MARGIN_WEIGHT` + `consistencyMarginAdjustment()` en lib/win-probability.ts; `Alliance.meanSigma` (la MEDIA por equipo, distinta de `totalSigma` que combina en cuadratura) en types/oracle.ts.

Aplicado en el camino analítico **y en el Monte Carlo** con el mismo desplazamiento — un muestreador que no coincide con la forma cerrada es peor que cualquiera de los dos solo. Inerte cuando falta σ de cualquiera de los dos lados: el efecto es una diferencia, y usar medio dato sesgaría hacia la alianza que sí la tenga. 5 tests nuevos (307 total), incluida la equivalencia entre desplazar el margen y pasar consistencia.

---

## #74 · No se monetiza: la API de FIRST lo prohíbe contractualmente (2026-07-29)

Se evaluó cobrar suscripción a otros equipos. **Descartado, y la razón que decide no es cultural.**

La página de la API de FIRST dice, verbatim (verificado directamente en [ftc-events.firstinspires.org/services/API](https://ftc-events.firstinspires.org/services/API)):

> *"The data from this API may not be used for commercial purposes. There can be no financial gain from acquiring an access token."*

PRIDE está construida sobre esos datos. No es una norma cultural negociable: es la condición bajo la cual tenemos acceso. Cualquier esquema de suscripción choca de frente.

Las razones secundarias siguen en pie y apuntan igual: (1) cobrar por ventaja competitiva contradice *Gracious Professionalism* y sacrificaría Connect/Inspire, que valen más que cualquier ingreso plausible; (2) el mercado es diminuto — el Mexico Championship 2025 tuvo 52 equipos; (3) cobrar nos volvería procesador **pagado** de datos sobre menores; (4) convierte la historia de "regalo a la comunidad" en una de "proveedor".

Contexto de escala del ecosistema: **The Blue Alliance opera con ~$5,000 USD/año** y se financia con donaciones, pidiendo ayuda en público. Statbotics lo paga su autor de su bolsillo. La sostenibilidad se resuelve con **patrocinio de infraestructura**, no con suscripciones.

**Hallazgo adjunto, incumplido hoy:** la misma página exige un enlace de retorno a la API en el footer o el "About" de cualquier app que muestre sus datos. Un grep sobre `app/` y `components/` no encuentra ninguna referencia a `firstinspires.org`. La app lleva desplegada desde el 25 jul sin esa atribución. Pendiente en `docs/PENDING.md`.

Ver `docs/ESTRATEGIA-PRODUCTO-Y-APERTURA.md` Parte IV.

---

## #75 · Modelo de apertura: 4 anillos con reciprocidad, y el gate va ANTES de invitar (2026-07-29)

La premisa "si abro la app pierdo competitividad" es parcialmente falsa. La ventaja se descompone en cinco capas y solo una es genuinamente rival: **los datos de scouting**. El software no es rival, la analítica de datos públicos ya está commoditizada (FTCScout, Statbotics), la habilidad de uso no se transfiere, y **operar la red tiene rendimientos crecientes**.

La inversión que decide: **el problema no es de secreto, es de escasez.** 30311 tiene 2-4 scouts para ~40 equipos y ~60 partidos de quals. Guardarse la herramienta mantiene al equipo pobre en el único insumo que importa.

**Modelo: abrir la herramienta, cerrar el dato por reciprocidad.** Cuatro anillos — (0) público sin cuenta: stats oficiales, `/oracle`, rankings nacionales; (1) equipo registrado: sus propios datos y herramientas; (2) red federada: consenso del evento **proporcional a lo que aportas**; (3) Iron Lion: notas privadas, subjetivos por-org, picklist, DNP, calibración.

**Línea ética explícita:** la asimetría debe ser "mis datos privados son míos", **nunca** "el operador lee en secreto a sus rivales". Operar la red y competir contra sus miembros ya es conflicto de interés; lectura privilegiada destruiría la narrativa de Connect/Inspire si se descubre. Mitigación: publicar las reglas de visibilidad como artefacto público, al estilo `/oracle`.

**BLOQUEANTE TÉCNICO — el gate va antes que la invitación.** Hoy `firestore.rules` tiene `allow read: if isAuthed()` para `match_scouting` (línea 139) y `pit_scouting` (152), con un TODO sin cerrar que lo reconoce. Agravante: pit scouting guarda `notes` (privadas) y `publicSummary` (opt-in) **en el mismo documento**, y las reglas de Firestore **no pueden enmascarar campos**. El login es Google **sin allowlist**. La separación por org que describe CLAUDE.md vive solo en la capa de aplicación (`lib/scouting-aggregation.ts`); la base de datos no la respalda. **Invitar equipos con las reglas actuales = entregar todo, en silencio, incluidas las notas privadas.**

Bien protegidos, en cambio: `picklists`, `calibration_log` y `org_secrets` sí están acotados por `orgId`.

Ajuste de prioridad: **el primer territorio de VISION-PRIDE ya no es T2 (outreach) sino T5 (red federada)**, porque T5 *es* el modelo de apertura. T2 viene incluido.

---

## #76 · Autorreporte federado: se invierte el primitivo del scouting (2026-07-29)

Propuesta de Héctor. En vez de *"scouteo a otros y comparto mis observaciones"*, el modelo es *"reporto sobre mí mismo y comparto eso"*. Un equipo pasa de necesitar 20 scouts a necesitar 1-2.

**Por qué es más fuerte que el pooling de Purple Warehouse** (el único federado probado, 323 equipos, y solo FRC): colapsa el costo de cobertura; **disuelve la objeción de privacidad documentada** en Chief Delphi (*"storing qualitative notes and picklists on another team's platform would give me a little pause"*) porque no compartes tu juicio sobre otros sino hechos sobre ti; y nadie lo hace en ningún programa.

**Propiedad emergente:** participar es una **señal costosa**. Un equipo fuerte gana con ser visto, uno débil con esconderse — no compartir se lee como "no tengo nada que mostrar". La red se refuerza sin imponer nada.

**El problema central: el autorreporte es *cheap talk*.** Todos tienen incentivo a verse pickeable; si declarar es gratis, la señal vale cero. **PRIDE tiene el antídoto y probablemente es la única del ecosistema que lo tiene:** `lib/ground-truth-validation.ts` ya contrasta la reconstrucción contra el puntaje oficial de la FIRST API. No puedes declarar 8 artifacts si la alianza anotó 30 puntos. La inflación sistemática sale como error de reconstrucción y el EWMA baja la confiabilidad sola. Purple Warehouse aplica su accuracy score donde el error es **ruido aleatorio**; aquí se aplicaría donde el sesgo es **direccional**, que es donde más vale.

**Regla de diseño — qué se puede autorreportar** (criterio: ¿verificable contra el score oficial?):
- **Sí**: conteos por partido, rutina de auto, parking, ciclos, specs, bitácora de fallas.
- **Nunca**: driver skill, defensa, would-pick. Juicio ajeno, no verificable, incentivo puro a inflar. Siguen observados y por-org.
- **Preferencia declarada** (no es afirmación de desempeño): "en qué somos buenos / qué buscamos en un aliado".

**El ataque real es la omisión, no la mentira** — no reportar los partidos malos. Defensa: el calendario es público, así que existe un **denominador conocido**. La métrica de reputación y el gate deben ser **cobertura %, no volumen**.

**No reemplaza: agrega una fuente.** Con pocos participantes el autorreporte cubre menos que los propios scouts, así que planteado como sustituto el primer evento fracasa. Entra como fuente adicional con su propia clase de confiabilidad — **el blend bayesiano de varianza inversa de `lib/projections.ts` ya está diseñado exactamente para eso**, no hace falta matemática nueva.

**El gate debe ser natural, no artificial.** Capar features a propósito se siente punitivo y obliga a defender una política. "El pool solo contiene lo que la gente aportó" es simplemente cierto y se aplica solo.

Costo para 30311: menos ventaja informativa, pero el hallazgo de FPEMX ya decía que **ser pickeable vale más**, y la diferencia se muda a la calidad del análisis. Como narrativa de premios, *"diseñamos un sistema donde compartir es la estrategia dominante"* es **diseño de mecanismos** — apunta a Innovate y Think.

---

## #77 · Inglés por defecto + i18n, y por qué no es un refactor de UI (2026-07-29)

La app pasa a **inglés por defecto** y se vuelve multilenguaje (`en` default, `es`). El modelo de autorreporte lo hace más urgente: una red que funcione no se queda mexicana.

**La trampa: 13 módulos de `lib/` tienen strings en español dentro de la capa de análisis**, no solo en componentes — `event-selector`, `projections`, `draft-odds`, `invite-redemption`, `constants`, `orgs`, `schemas/scouting`, `alliance-utils`, `games/ftc-decode-2025`, `consistency`, `briefings/briefing-data`, `reports/growth-curves`, `reports/team-30311-decode`.

Casos concretos: `draft-odds.ts` **genera frases explicativas** (campo `basis`), `consistency.ts` escribe notas interpretativas, `schemas/scouting.ts` tiene los mensajes de Zod. Tratar i18n como "traducir componentes" deja al Oracle hablando español desde el motor.

El patrón correcto: la capa de análisis devuelve **claves + parámetros**, no prosa. Es un cambio de contrato en funciones que hoy retornan strings formados.

**Secuenciación:** no es lo primero (el gate de lectura y el motor de juego pesan más), pero **el andamiaje va antes de construir las superficies nuevas** (home "Hoy", vistas de red) o esos strings se escriben dos veces. **Regla desde hoy: ningún string nuevo hardcodeado.** Herramienta sugerida: `next-intl`.

---

## #78 · Gate de lectura de Firestore — Fase 1: lockdown a org propia (2026-07-29)

Primer bloqueante de la apertura (decisión #75), resuelto en dos fases. Antes, `match_scouting` y `pit_scouting` tenían `allow read: if isAuthed()`: cualquier usuario autenticado leía el scouting de toda org, **incluidas las notas privadas de pit** (que comparten documento con el `publicSummary` opt-in, y las reglas de Firestore no pueden enmascarar campos). Invitar a una segunda org con eso puesto habría entregado todo en silencio.

**Por qué dos fases.** Las reglas de Firestore **no son filtros**: una query de lista se evalúa por-documento-devuelto y se rechaza entera si algún doc no pasa. Eso impide que una sola query devuelva "mis docs + los objetivos de otros" cuando la regla ramifica sobre un campo por-doc (orgId, scoutingMode) que la query no fija. La federación cross-org selectiva (pool gateado por contribución, split de pit público/privado, super scouting en colección aparte) necesita maquinaria nueva **y** dos orgs para probarse. Como hoy solo existe 30311 y no hay invitaciones emitidas, se partió:

- **Fase 1 (esta):** lockdown total a org propia. Regla `resource.data.orgId == myOrgId()`; cada query añade `where("orgId","==", miOrg)`. Cierra **todas** las fugas (notas privadas, subjetivos, pool objetivo) de una vez, es pequeña, segura y testeable con una sola org. No pierde nada hoy: no hay org #2.
- **Fase 2 (con la 1ª invitación):** federación selectiva. Se construye cuando haya a quién onboardear y con qué probarla.

**Implementación.** `firestore.rules` (guarda `resource == null` para el existence-probe de `saveMatchScouting` y el fallback de `getPitScouting`; rama legacy para docs pre-1.4 sin `orgId`, implícitamente 30311). `firestore.indexes.json` +2 índices `[orgId, season, eventCode|teamNumber, timestamp]`. `lib/scouting-service.ts`: las 3 lecturas reciben `orgId` y filtran; `getPublicPitSummaries` queda como stub `[]` (seam de Fase 2 — su versión vieja leía el doc completo con notas antes de descartar en JS, así que la nota ya cruzaba el cable). 6 callers cableados con `effectiveOrgId`.

**Caveat legacy:** entradas `match_scouting` sin `orgId` quedan fuera de las **listas** (el filtro no matchea campo ausente); los gets sí las alcanzan. Improbable que existan (las escrituras setean `orgId` desde Sprint 1); si hicieran falta, backfill puntual a `"30311"`.

Verificado: typecheck 0, lint 0, 307 tests, `firebase_validate_security_rules` OK, build de producción OK. **Requiere `firebase deploy --only firestore:rules,firestore:indexes` + test dev cross-org** antes de aplicar (no desplegado — política de no-deploy sin OK). Ver `docs/ESTRATEGIA-PRODUCTO-Y-APERTURA.md` Parte IV y [[project-apertura-y-monetizacion]].

---

## #79 · Motor de juego declarativo conectado (cutover FTC) (2026-07-29)

Segundo bloqueante-por-calendario resuelto. El juego FTC 2026-27 se anuncia en septiembre; el objetivo era que adaptarse cueste *escribir un archivo*, no *reescribir formularios* en pretemporada.

**Hallazgo: la infra estaba a medio construir.** El plan registrado ("cambiar un import de `FTC_DecodeForm` a `DynamicGameForm`") no era real: `DynamicGameForm` es **solo el render de inputs**. No existía el wrapper que hace `useForm` + mapeo `values→MatchScouting` + guardado + lista de observaciones. Se construyó `GameScoutingForm` (genérico, no se toca por temporada) + `lib/games/build-entry.ts` (mapeo, única fuente de verdad testeable sin React).

**Trampa de paridad — `autoParked`.** El form hardcodeado *derivaba* `autoParked: endgameBaseParking !== "None"` y lo persistía, y `lib/scouting-aggregation.ts` lo lee como categórico. La definición declarativa no podía expresar "derivado de otro campo". Se añadió el contrato **`toEntry`** a `GameDefinition`: derivaciones y constantes que viajan con la definición del juego (para DECODE: `autoParked` + `autoPoints:0`). Eso es lo que hace que un juego nuevo sea de verdad un solo archivo — si no, cada temporada repite el bug.

**Cutover ahora, no staging.** La temporada DECODE (2025-26) ya terminó (FPEMX fue en julio), así que no hay scouts en vivo que interrumpir y la advertencia de "no cambiar el form entrenado" no aplica. Cablear la rama FTC a `GameScoutingForm` **prueba el plumbing en vivo** → máxima confianza para septiembre. `FTC_DecodeForm.tsx` queda como referencia (nadie lo importa); borrar tras validar en un evento real.

**Paridad probada** (`lib/games/decode-parity.test.ts`): mismo set de claves de schema, mismos valores parseados en input válido, y `buildEntryGameFields` produce **la entrada idéntica** al `onSubmit` hardcodeado (transcrito a mano en el test para que rompa si cualquiera de los dos deriva). Diferencia intencional documentada: los `max` por campo de la definición son más estrictos que el `counter` compartido (999) — rechaza absurdos, no cambia entradas realistas.

**Trade-offs aceptados:** layout genérico (secciones apiladas vs grid custom de 4 col) y lista de observaciones genérica (cada campo con su valor vs tarjetas bespoke). Ambos son el precio de lo genérico y funcionan para cualquier juego; si una temporada amerita layout a medida, se escribe un componente de ese año.

`docs/architecture/game-schema-migration.md` **escrito** (era citado 3× — CLAUDE.md:83, PENDING, y ahora el comentario en MatchScoutingForm — y no existía). Verificado: typecheck 0, lint 0, 312 tests, build OK. FRC sigue en `FRC_ReefscapeForm` (mismo patrón cuando haga falta; la prioridad FRC es la red).

---

## #80 · i18n: andamiaje next-intl (cookie, sin routing) + patrón de capa de análisis (2026-07-29)

Ejecución de #77 (inglés por defecto + multilenguaje). Detalle: `docs/architecture/i18n.md`.

**Estrategia elegida: cookie-based, sin prefijo de URL.** El locale vive en la cookie `NEXT_LOCALE` (detección: cookie → `Accept-Language` → default `en`); las URLs no cambian. Se descartó el prefijo `/en` `/es` porque obligaba a middleware de routing, reescribir todos los `<Link>`/`push`/`redirect`, y revisar PWA/service worker + deep-links — mucha más superficie y riesgo, para una audiencia que elige idioma una vez. Herramienta: `next-intl` v4 en modo *without i18n routing*.

**Andamiaje conectado:** `i18n/config.ts` (constantes), `i18n/locale.ts` (server actions `get/setUserLocale`), `i18n/request.ts` (`getRequestConfig`), plugin `createNextIntlPlugin` en `next.config.ts` (aplicado al config base, luego Serwist/analyzer/Sentry lo envuelven), `<NextIntlClientProvider>` + `<html lang={locale}>` en el layout, catálogos `messages/{en,es}.json`, y `LocaleSwitcher` en el sidebar.

**El patrón que la memoria marcaba como la trampa, probado en `draft-odds.ts`.** El campo `basis` generaba una de 4 frases en español con params interpolados. Ahora `draftOdds().basis` devuelve un `DraftBasis` **discriminado** (`{ key, ...params }`), y el consumidor (`ConsistencyTracker`) traduce con `useTranslations("DraftOdds")`. El redondeo (`toFixed(0)`) se hace en el análisis (params ya redondeados), no en el mensaje. Regla: la capa de análisis devuelve **clave + params**, nunca prosa; el test asserta la estructura.

**Barrido pendiente = 12 módulos** (delegable a Sonnet con el patrón sentado): `consistency`, `schemas/scouting`, `event-selector`, `projections`, `alliance-utils`, `briefings/briefing-data`, `reports/growth-curves`, `reports/team-30311-decode`, `games/ftc-decode-2025`, `constants`, `orgs`, `invite-redemption`; más los strings de UI en componentes (incremental). **Regla activa: ningún string nuevo hardcodeado.** Verificado: typecheck 0, lint 0, 313 tests, build OK. Ver [[project-i18n-ingles-default]].

---

## #81 · Trading Card: autorreporte de equipo con ancla de ground-truth (2026-07-29)

Primera pieza concreta del autorreporte federado (#76), disparada por el benchmark de WikiScout (competidor directo en la escena FTC mexicana, visto logueado como 30311 en el mismo México Premier Event donde validamos PRIDE). WikiScout tiene una "Trading Card" — perfil de robot autorreportado y compartible — que **es** el modelo #76 ya en producción, pero **sin ancla de verdad** (cheap talk puro; sus columnas de stats salen vacías sin captura manual).

**La jugada de PRIDE: la misma carta, anclada a ground-truth.** La `TradingCardPreview` muestra los rangos de puntos **autorreportados** (lo que el equipo dice) junto a un strip **"Medido · oficial"** (rank, récord, puntos promedio derivados de los scores oficiales de la FIRST API vía `getMeasuredStatsAction`). Reclamo y verdad, lado a lado — exactamente lo que WikiScout no puede hacer.

**Modelo de datos:** colección `team_profiles` (era un stub de reglas sin usar). Es **distinta de pit scouting**: pit es observación PRIVADA por-org (lockdown Fase 1); la Trading Card es autodescripción PÚBLICA de tu propio equipo. La regla ya existía y encaja: `read: if isAuthed()` (público, es autorreporte que quieres que se vea) + `write: teamNumber == myOrgId` (solo tu equipo). Como es público y las reglas no enmascaran campos, el doc lleva **solo campos públicos** — nada privado (las notas privadas siguen en pit).

**V1 (construido):** editor `/card` (capacidades, rangos de puntos auto/teleop/endgame, descripciones, foto por URL) + live-preview + guardado a `team_profiles`. i18n desde el inicio (namespace `TradingCard`, paridad en/es). Archivos: `types/team-profile.ts`, `lib/schemas/team-profile.ts`, `lib/team-profile-service.ts` (+ test de round-trip), `app/actions/team-card.ts`, `app/card/page.tsx`, `components/card/{TradingCardEditor,TradingCardPreview}.tsx`, nav en Sidebar. 338 tests, build OK.

**Fase 2 (con la federación):** vista pública de cartas de OTROS equipos (link/QR compartible como WikiScout), reconciliación formal del autorreporte contra ground-truth (ahora solo se yuxtapone; #76 quiere que la inflación sistemática baje la confiabilidad vía `ground-truth-validation.ts`), OPR/SoS medidos en el strip (necesitan agregación event-wide), y subida de foto real (hoy es URL). Ver [[project-autorreporte-federado]].

---

## #82 · Season Analysis en vivo para cualquier equipo (proxy avgNP + orden cronológico del fetcher) (2026-07-30)

Des-hardcodeo del bloque analítico de `/team/[n]` (bloqueaba la apertura: solo 30311 tenía análisis; el resto, solo historial). Ahora **todo equipo con ≥2 eventos medidos** recibe la descomposición crecimiento-vs-volatilidad + probabilidad de alianza, computada en vivo; el retrospectivo curado queda exclusivo de 30311 (que NO monta la versión viva — doble render).

**Decisión 1 — la serie viva usa `avgNP` como proxy de OPR, no un OPR real.** Un OPR verdadero es un ajuste de mínimos cuadrados sobre todo el evento; solo lo computamos por-evento en `lib/aggregation.ts` y es caro. La app ya equipara ambos para display (`stats.opr = stats.averageNP`, aggregation.ts:272), así que la serie es puntos netos promedio por partido de calificación. Corre alto respecto al OPR de FTCScout (acredita el output de toda la alianza al equipo), pero para una tendencia **intra-equipo intra-temporada** el sesgo es ~constante — válido para pendiente/forma, inválido para comparar entre equipos. La UI lleva nota de metodología; el caveat FTCScout ("59.96 vs 80.8") quedó condicionado al modo curado. `avgNP <= 0` se filtra como "no medido" (0 = sin partidos de calificación, no "anotó cero") para no arrastrar la tendencia.

**Decisión 2 — `fetchTeamRankingsInSeason` ahora devuelve orden cronológico.** Devolvía orden de RESOLUCIÓN de red (`Promise.all` + `push`), ni cronológico ni estable entre requests — el slope de `analyzeSeries` habría leído ruido puro. Se propagó `dateStart` (ya existía en `FTCEvent`) a `TeamSeasonRanking` y se ordena por él (desempate por `eventCode`). Beneficio lateral: el historial de participación ya no sale en orden aleatorio. Sin problema de caché: el compuesto no se guarda en Redis, solo los fetchers subyacentes.

**Estructura:** `lib/team-season-analysis.ts` (mapper puro, 7 tests) → `TeamSeasonAnalysis` (server) → `ConsistencyTracker` parametrizado (`{points, publicNumber, showFtcScoutCaveat?}`, ya sin import de `TEAM_30311_DECODE`); sus strings ES hardcodeados migraron a `Consistency.ui.*` (paridad en/es, 203 claves). `publicNumber` vivo = media de los `avgNP` por evento. Implementado por subagente Opus sobre spec; commit `8cacea3`. Gate: tsc 0, lint 0, 345 tests, build OK.

---

## #83 · Home "Hoy": gate ligero + panel diferido para proteger el bundle de `/` (2026-07-30)

Primera pieza de la re-arquitectura de información ("la app está organizada por conjuntos de datos, no por el momento en que estás"). `/` abre con el momento actual — próximo partido, rank actual→proyectado, prob. de alianza, cobertura de scouting — SOLO para usuario con sesión cuya org compite en un evento en ventana viva; para todos los demás la página pública no cambia ni un byte. Ensamblaje puro: rank del `fetchLiveProjectionAction` existente, odds de `draftOdds` client-side (seed = rank ACTUAL, el proyectado se muestra como dirección), próximo partido del hybrid schedule reducido server-side a un objeto.

**La decisión central es de bundle, no de UI.** El panel importado estáticamente costaba **+18.7 KB** en `/` (draft-priors, event-selector, íconos) para un componente que devuelve `null` a casi todo visitante. Patrón elegido (mismo espíritu que `DeferredGlobals`, #65): `TodayPanelLoader` — gate mínimo en el critical path (`useAuth` + `guessActiveEvent`, ya presentes/puros) que decide elegibilidad ANTES de montar `TodayPanel` vía `next/dynamic({ssr:false})`. Resultado: **+3.6 KB** y el chunk del panel (16.6 KB) jamás se solicita si el gate no abre. El orden importa: lazy-load incondicional lo sacaría del bundle inicial pero cada visitante lo bajaría segundos después para nada. **Firebase sigue en 0 KB en `/`** (cobertura vía `import()` dinámico de `scouting-service`; verificado en chunks servidos: sin `initializeApp`/`getFirestore`, solo el string de error del lazy-loader de Auth).

**Detalles con criterio:** `guessActiveEvent()` nuevo devuelve `{code, live}` (live = ventana [start−1d, end+2d]); `guessActiveEventCode()` queda como wrapper sin cambio de comportamiento. `pickNextMatch` respeta el orden del schedule y solo reordena por `startTime` cuando TODOS los candidatos lo traen parseable (un sort parcial contra timestamps faltantes no es orden total); surrogates excluidos. `computeCoverage` cuenta partidos DISTINTOS (no entradas), excluye playoff del numerador (denominador es qual-only), clamp a 100%, y 0/0 devuelve null ("aún no es pregunta"), no 0%. Sin polling: carga al montar + refresh manual (criterio LiveRankingProjection). Primera ICU plural de los catálogos (`Today.ranking.qualsLeft`). Implementado por subagente Opus sobre spec; commit `e4b9ebb`. Gate: tsc 0, lint 0, 366 tests, build OK. **Pendiente: verificación visual con sesión + evento vivo** (mismo caveat que #66).

---

## #84 · i18n de errores: patrón de códigos estables (los productores no tienen locale) (2026-07-30)

Resuelve la categoría pendiente de #80 ("i18n de mensajes de error — decisión de patrón pendiente"). **Patrón: los errores viajan como códigos, la UI traduce.** Un `ErrorCode` es un dot-path relativo al namespace `Errors` del catálogo (`invite.expired`, `org.alreadyExists`...), así `tErr(code)` resuelve directo por anidamiento sin tabla de mapeo.

**Piezas:** `lib/errors.ts` (union `ErrorCode` + `CodedError` cuyo `message` ES el código —greppable en logs— + `toErrorCode(unknown)` que colapsa lo inesperado a `generic`). Server actions devuelven `{ok:false, code}`; los throws de cliente usan `CodedError` y el catch del consumidor traduce. Para Zod: el mensaje custom es un código y `useZodMessage()` (hook, `t.has()` de next-intl ≥4) traduce si la clave existe con fallback al mensaje crudo — los defaults ingleses de Zod pasan intactos (barrido futuro = errorMap global).

**Dos fugas de seguridad cerradas de paso:** (1) el catch de `redeemInviteAction` devolvía `e.message` crudo al navegador para CUALQUIER excepción (incl. fallos internos de admin-SDK) — ahora solo códigos, y `generic` loggea el original server-side; (2) `InviteGenerator` renderizaba `e.message` verbatim en el sidebar (un permission-denied de Firestore se imprimía tal cual).

**Reglas:** la prosa ES existente se preserva verbatim como valor del código (el usuario ve lo mismo que antes); los tests asertan códigos, no cadenas (coherente con #80). Aplicado en: invite-redemption, redeem-invite, orgs, OnboardingModal, InviteGenerator, schemas/scouting + los 9 sitios de render RHF. **Documentado fuera de alcance:** 5 actions de admin con la misma prosa de auth (las entradas `auth.*` del catálogo ya existen — conversión mecánica delegable), mensajes custom de Zod restantes ("Máx 2000 caracteres" etc. — fluyen por el helper, convertirlos es puro catálogo), y strings de UI del OnboardingModal (extracción incremental). Implementado por subagente Opus sobre spec; commit `927a755`. Gate: tsc 0, lint 0, 366 tests, build OK.
