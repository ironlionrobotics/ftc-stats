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

## 14. Comparación de Tipos en Filtrado de Premios
- **Fecha**: 02 Feb 2026
- **Contexto**: Algunos premios no aparecían en el Data Lab aunque estaban en la base de datos.
- **Decisión**: Cambiar la comparación de `teamNumber` de estricta (`===`) a flexible (`==`).
- **Razón**: La API de FTC a veces devuelve el número de equipo como una cadena y otras como un entero. La comparación flexible elimina este bug silencioso sin necesidad de conversiones costosas en cada iteración.
