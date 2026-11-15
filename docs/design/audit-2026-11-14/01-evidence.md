# 01 · Evidencia consolidada

Los informes completos, con citas `file:line`, están en este mismo directorio:
- `evidence-structural.md`: estructura, toques por tarea y patrones repetidos.
- `evidence-visual.md`: 31 capturas en `shots/`; escalas, contraste, objetivos táctiles y accesibilidad.
- `evidence-color.md`: tokens, conteos y conflictos de significado.
- `evidence-copy.md`: textos, jerga, inflaciones y etiquetas que no corresponden a lo que hacen.
- `evidence-weight.md`: JS, red, TBT, LCP, animaciones y modo sin red; datos crudos en `perf/`.

Las anclas de abajo (E1…E30) son las que cita el scorecard.

## Color (#3, #4, #6)
- **E1.** `secondary` = `accent` = azul de alianza, y `danger` = rojo de alianza (`app/globals.css:29-38`, `:53-62`).
- **E2.** `secondary` tiene 283 usos en 35 archivos y `danger` 245 en 47. Las clases `*-alliance-red/blue` tienen 0 usos; `var(--color-alliance-*)` solo 8.
- **E3.** El azul se usa en botones (`MatchScoutingForm:150`), pestañas (`StatsTable:104`), enlaces, empates (`RankingTable:355`), el bucket "Disponibles" (`PicklistEditor:431`) y el botón flotante del chat en las 10 pantallas.
- **E4.** El rojo se usa en errores, borrar, derrotas (`RankingTable:353`), "EN VIVO" (`TodayPanel:177`), el bucket DNP (`PicklistEditor:453`) y en cifras negativas en `/team`.
- **E5.** Victoria, derrota y empate van en verde, rojo y azul (`StatsTable:224-228`). Hay 4 escalas de semáforo con umbrales distintos.
- **E6.** El contraste rojo/azul es de 1.13:1 en oscuro y 1.27:1 en claro: solo se distinguen por el tono.
- **E7.** Texto blanco sobre `danger` en oscuro da 3.26:1 y sobre `secondary` 3.69:1. Los chips de `/team` dan 3.14–3.35:1.
- **E8.** `.text-white` está forzado a `foreground` con `!important` (`globals.css:220`), lo que pone texto negro sobre rojo en tema claro.
- **E9.** Hay 125 clases de la paleta Tailwind fijas y 23 literales hex en 4 archivos, fuera de tokens: violeta, esmeralda, índigo (`ComparisonView`, `AllianceSelector:263`, `pro/page.tsx`).
- **E10.** No hay `@custom-variant dark`, así que las 5 clases `dark:` siguen al sistema operativo y no al botón de la app (verificado: grep sin resultados).

## Estructura y tareas (#2, #4, #5, #10)
- **E11.** En el evento, tocar un equipo solo filtra (`EventViewManager.tsx:423-436`). No existe enlace a `/team/N` desde el evento.
- **E12.** La búsqueda por número de equipo solo está en el riel de escritorio (`AppShell.tsx:83-85`). "Más" vive dentro del panel de cuenta (`AppShell.tsx:282`).
- **E13.** Empezar a capturar un partido toma 4 o 5 toques: la pestaña por defecto es Pit (`ScoutingClient.tsx:238`) y el número de partido se escribe a mano, con 1 por defecto. El formulario BIOBUZZ tiene unos 47 controles.
- **E14.** Hay 5 selectores de evento distintos y 3 campos para seguir equipo. "Oracle" nombra 3 cosas.
- **E15.** Pestañas: Estrategia 6, Evento 6 + PRO + 3 submodos. En `MatchList` hay tablas de `min-w-[900px]` (`MatchList.tsx:476,513`).
- **E16.** El picklist no tiene sensor táctil (solo puntero) y el agarre mide 32 px.
- **E17.** Los primitivos de UI casi no se usan (Card en 14 archivos) frente a ~147 tarjetas hechas a mano. Hay 5 estilos de h1 y radios mezclados. Código muerto: `TodayPanel` (528 líneas) y `Tooltip`.

## Visual y accesibilidad (#3, #5, #8)
- **E18.** Hay 12 tamaños de letra entre 9 y 36 px. Los textos de 9–11 px son 98 en `/event` y 161 en `/team`. La escala de espacios no es de 4 en 4 (por ejemplo, 6 px aparece 164 veces).
- **E19.** Objetivos táctiles de menos de 44 px: home 20/27, evento 17/59, equipo 17/25.
- **E20.** Siempre fijos en pantalla: header de 56 px, tab bar de 57 px, botón flotante del chat de 56 px y banner "Install PRIDE" de 99 px, que tapa contenido en 5 pantallas (`shots/phone-dark-home.png`).
- **E21.** Hoy arranca con un mensaje vacío ("No events registered…"). En la página del evento, las tarjetas de promedios van antes que los partidos, y en la del equipo el hero degradado ocupa media pantalla (`shots/phone-dark-*.png`).
- **E22.** No hay skip link. Falta `<main>` en 6 pantallas, las pestañas del evento no tienen `role=tab` y el chat no tiene nombre accesible. El anillo de foco sí está presente.
- **E23.** Estados: hay vacíos en 5 pantallas. `/event/ZZZZZZ` responde 200 sin ninguna acción. Casi no hay skeletons (Skeleton se usa en 1 archivo) y no se observaron los estados de éxito ni sin red.
- **E24.** En tablet de 820 px hay un riel fijo de 224 px y una columna de 596 px; Estrategia no usa varias columnas.

## Textos (#4, #6)
- **E25.** La pantalla Evento no pasa por el catálogo: MatchList (~76 textos) y RankingTable (~40) están fijos y mezclan inglés y español. El idioma por defecto es inglés.
- **E26.** Jerga sin ayuda táctil: OPR, RS, NP, TBP, σ, Brier, seed, "forma". Las ayudas de columna solo aparecen al pasar el mouse (`RankingTable.tsx:55`, `MatchList.tsx:416`).
- **E27.** Inflaciones: "Predicción de alta precisión" se activa con ≥ 4 capturas (`projections.ts:238`); "Predictor IA" son reglas fijas; "OPR" en AllianceSelector es en realidad el promedio de puntos; "proyección lineal" es en realidad Monte Carlo; "Acceso exclusivo" en `/pro` no tiene candado; el long-press del picklist no existe.
- **E28.** Términos inconsistentes (qualys/quals/calificación…) y formatos distintos (73 % / 73%, 1–2 decimales, "–", "-" o "/" en los récords).

## Peso (#9)
- **E29.** JS inicial transferido: 383–583 KB (descomprimido 1.2–1.9 MB). TBT: 129–298 ms. LCP en Estrategia: 2.75 s (una sola corrida). SW y modo sin red funcionan.
- **E30.** Un `animate-pulse` infinito en `/team` (`app/team/[teamNumber]/page.tsx:135`) que no respeta `prefers-reduced-motion`. La app abre siempre en oscuro, sin importar el tema del sistema.
