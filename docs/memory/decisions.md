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

## 10. Cuadrícula de 4 Columnas para Alianzas
- **Fecha**: 24 Ene 2026
- **Contexto**: Los nombres de equipos y números se desalineaban verticalmente cuando se usaba una sola celda por alianza.
- **Decisión**: Dividir cada alianza en 2 celdas de tabla independientes (Total 4 columnas de equipos).
- **Razón**: Obliga a que la información de cada equipo ocupe una ranura fija, garantizando una alineación perfecta de arriba a abajo independientemente de la longitud del nombre del equipo.
