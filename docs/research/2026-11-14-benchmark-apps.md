# Benchmark de apps FTC (14-nov-2026)

**Método.** Un agente de investigación revisó 9 búsquedas y los sitios, repos y documentación de cada app. Las afirmaciones clave de Control Scout se verificaron después leyendo `controlscout.org/methodology` y `/faq`. Lo marcado [NV] no se pudo verificar.

## Hallazgo principal: Control Scout es un competidor directo, nacido en octubre de 2026

- **Qué es:** `controlscout.org`, de la org ZOGWORK en GitHub, con licencia GPL-3.0. Es gratis, sin anuncios ni planes de pago, y solo está en inglés.
- **Modelo:** rating por robot en 4 componentes (auto, teleop, endgame y penalizaciones) con incertidumbre.
  - Arrastra la temporada anterior: 0.7 × la última + 0.2 × la anterior.
  - A los novatos les asigna z = −0.7 y suma incertidumbre extra a las predicciones previas al evento.
  - Calibra con Platt.
- **Exactitud publicada:**

  | Medición | Aciertos | Brier |
  |---|---|---|
  | 2025-26, motor 3.5 | 74.8 % | 0.168 |
  | 2024-25 (temporada de ajuste) | 76.5 % | 0.158 |
  | Registro en vivo, 41,405 partidos de 2025-26 | 73.8 % | — |

  No hay cifra específica de BIOBUZZ y no se vio un registro partido por partido en la interfaz.
- **Simulación de eventos:** 2,000 a 10,000 corridas, con mediana de puesto y rango 10–90 %. Capitanes y selecciones salen de un modelo softmax ajustado con selecciones reales. El 86.8 % de los equipos quedó dentro de su rango del 80 %.
- **Selección de alianzas:** shortlist, "pick helper" que sugiere compañeros y "What if we pick them?".
- **Scouting:** formularios de partido y de pits, offline, en espacios de equipo (vía Control Point) con export CSV/JSON. **No comparte datos entre equipos.**
- **Avisos:** push 15 minutos antes del partido, avisos de sorpresas y de inicio de evento, y bot de Discord.
- **Lo que le falta:** modelo de RP propio de BIOBUZZ (asume las reglas de 2025-26) y cualquier idioma que no sea inglés.

**Consecuencia:** las premisas de `docs/ESTRATEGIA-PRODUCTO-Y-APERTURA.md` ("FTC no tiene modelo predictivo; nadie publica calibración") ya no son ciertas. Además, `docs/APP-OVERVIEW-Y-PREMIOS-DECODE.md:226` afirma que Statbotics cubre FTC; sigue siendo solo FRC.

## Resto del ecosistema

| App | Fuerte | Predicciones | Scouting | Avisos | Español |
|---|---|---|---|---|---|
| FTCScout | Estadísticas, OPR por componente, récords, percentiles, API abierta | ✗ | ✗ | ✗ | ✗ |
| FTC Events (FIRST) | Datos oficiales y detalle por partido | ✗ | ✗ | ✗ | ✗ |
| The Orange Alliance | Viva: leaderboards, insights, videos | ✗ [NV] | ✗ | ? | ✗ |
| FTCStats.org | OPR por componente de BIOBUZZ y "RS Bonus OPR" | ✗ | ✗ | ✗ | ✗ |
| DepthFTC | Probabilidad logística sobre NP OPR, Monte Carlo, modo Pre-Event | ✓ (sin exactitud publicada) | ? | ✗ | ✗ |
| Control Scout | Todo lo anterior | ✓ con exactitud publicada | ✓ por equipo | ✓ | ✗ |
| WikiScout | Notas públicas y privadas, "trading cards" automáticas (poco activo en 2026) | ✗ | ✓ | ✗ | ✗ |
| FTC Tracker (iOS, $1.99/mes Pro) | Scouting por voz con IA, chat del manual, widgets; su blog midió el OPR de 2025-26 en 71 % | ✗ | parcial | ? | ✓ |
| g-scout | PWA offline con QR entre scouts y un hub; cita la regla **E301** | ✗ | ✓ | ✗ | ✗ |

La regla E301, según g-scout, prohíbe a los equipos usar Wi-Fi propio, hotspot o Bluetooth en la sede [NV en el manual 2026].

## Comparación con PRIDE

### Lo que solo hace PRIDE
1. **Scouting federado entre equipos:** pool seudónimo con reciprocidad, consenso numérico ponderado y **ground truth** para calificar la fiabilidad de cada scout. Nadie más cruza datos entre equipos (WikiScout solo comparte notas).
2. **Autorreporte anclado a la realidad:** el Trading Card contrasta lo que dice cada equipo con los datos oficiales. Las "trading cards" de WikiScout no tienen ancla.
3. **Modelos de RP propios de BIOBUZZ** (#88/#96): Control Scout todavía usa las reglas de 2025-26.
4. **Español, enfocado en México**, gratis y web. FTC Tracker tiene español, pero es iOS y de pago.
5. **Préstamos de pits entre equipos y taller de práctica** con el reloj oficial del partido.
6. **Playoffs que aprenden de los resultados** (#113) y un bracket con escenarios hipotéticos de **fallo de robot y fouls**.
7. **Fiabilidad exacta por robot**, posible con las banderas oficiales de LEAVE y PARK de cada robot. El índice de Control Scout es una estimación.

### Lo que hacemos igual o mejor
- **Exactitud publicada y registro partido por partido**, con ✓/✗ en cada partido y un marcador en vivo de todos los eventos. Lo tiene también Control Scout. En 1,545 partidos del 12 al 14 de noviembre PRIDE acertó 76.8 % (sin contar los "parejo"), con Brier 0.180.
  - **Esa cifra no es comparable con la de Control Scout:** es una sola temporada, temprana, y no cuenta los partidos parejos. Control Scout mide sobre todos los partidos.
- **Seguir equipos y eventos con avisos push**, como Control Scout y TBA.
- **Simulación de ranking (P de ser capitán) y bracket con Monte Carlo condicionado a la realidad.**

### Lo que no hacemos y deberíamos (por valor para 30311)
1. **Punto de partida con eventos anteriores (#114):** ya validado en backtest. Es la razón principal de que Control Scout y DepthFTC pronostiquen desde el primer partido. Es lo más urgente para cerrar la brecha de Brier: nosotros 0.177 en el backtest de 2025 con el prior, ellos 0.168.
2. **Modelo de selecciones calibrado con selecciones reales:** P(ser elegido), P(capitán) y "¿y si elegimos a X?" con probabilidades de avance.
3. **Índice de confiabilidad por equipo:** LEAVE y PARK exactos por robot, no-shows, DQ, penalizaciones y varianza. Que alimente el picklist y el modelo de SWARM.
4. **OPR por componente de BIOBUZZ visible:** TIPS, TIPS en auto, LEAVE/PARK, CELL y GARDEN, más el "RS Bonus OPR".
5. **Percentil o ranking mundial de cada equipo**, como en FTCScout, por ejemplo "top 10 % mundial en TIPS".
6. **Pasar datos de scouting sin red:** QR entre dispositivos, por la regla E301. Hay que verificar la regla para MXTLQ.
7. **Avisos por tiempo** ("tu partido en ~15 min") usando el horario, además del aviso por partidos de distancia.
8. **Vista previa del evento antes de que empiece:** el mejor rendimiento de la temporada de cada inscrito, exportable a CSV.
9. **Contenido de estudio:** "qué gana partidos esta temporada" (ver `2026-11-14-biobuzz-temporada.md`). Nadie lo ofrece así.
