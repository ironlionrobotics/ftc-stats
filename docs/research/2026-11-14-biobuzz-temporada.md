# BIOBUZZ 2026-27: qué dicen los datos de la temporada (al 14-nov-2026)

**Fuente.** API oficial de FIRST: `/matches` y `/scores` de las qualys y los playoffs. Son los mismos datos que muestran `ftc-events.firstinspires.org/2026/<evento>/qualifications/<n>` y `/playoff/<serie>/<n>`.
- **Volumen:** 293 eventos con partidos, 5,665 qualys, 267 playoffs y 11,868 filas alianza-partido.
- **Reproducir:**
  - descarga: `scripts/biobuzz-season-pull.ts`;
  - análisis exploratorio: `season.ts` en el scratchpad de la sesión del 14-nov, que se convierte en módulo si se adopta.
- **México:** todavía no hay eventos competitivos. MXTLQ y MXMOQ, el 27-nov, son los primeros, así que todo lo de abajo es nivel mundial (93 % de los eventos son de EE. UU.).

## 1. Cómo se reparten los puntos (qualys, sin penalizaciones)

| Componente | Pts / alianza | % del total |
|---|---|---|
| TIPS en teleop | 19.4 | 39.7 % |
| PARK final | 7.8 | 16.1 % |
| TIPS en auto | 5.7 | 11.6 % |
| Elementos en la CELL al final | 5.4 | 11.0 % |
| PARK en auto | 5.0 | 10.3 % |
| LEAVE | 3.9 | 8.0 % |
| GARDEN | 1.5 | 3.0 % |
| FLOWER | 0.1 | 0.3 % |

- **Puntaje sin penalizaciones:** p50 43, p90 85, máximo 237. En playoffs se duplica: p50 84 y 3.2 TIPS por alianza.
- **TIPS por alianza:** 0 en 31 %, 1 en 38 %, 2 en 17 %, 3 o más en 13 %.

## 2. Qué gana los partidos

- **El TIP decide.** Con un TIP más que el rival se gana el **94.8 %** de las veces; con dos o más, el 99.7 %+. Solo el 2.2 % de los ganadores hizo menos TIPS.
- **31 % de los partidos empatan en TIPS** (40 % de ellos con 0 y 0). Ahí decide **LEAVE + PARK**: el ganador tuvo más en el 72 % de los casos, con un margen medio de 7 puntos. Le siguen los elementos en la CELL y el GARDEN.
- **El TIP en autónomo:** quien lo logra gana el 74 % y hace POLLINATOR 1 el 22 % de las veces; quien no, gana el 41.5 % y hace POLLINATOR 1 el 1 %. Solo el 27 % de las alianzas lo logra.
- **Las FLOWERS casi no se usan** (0.8 % de las alianzas). Cuando se usan dan ~16 puntos, menos que un TIP. Hoy no compensan el tiempo.
- **Fouls:** casi irrelevantes. Solo el 3.4 % de las qualys y el 2.3 % de los playoffs los gana quien hizo menos puntos de juego. Hay 0.08 fouls mayores por alianza-partido, el doble en playoffs, y hubo 84 descalificaciones en la temporada.

## 3. Ranking Points

- **Tasa por RP:** SWARM 62.9 %, POLLINATOR 1 (4 o más TIPS) 6.7 %, POLLINATOR 2 (7 o más) 0.8 %.
- **RP medio por partido: 2.20.** Se compone de 1.50 por victorias, 0.63 por SWARM y 0.07 por POLLINATOR.
- **El SWARM se pierde por el LEAVE.** De los SWARM fallidos, en el 93 % faltó el LEAVE de algún robot (en el 67 %, algún PARK final). Un LEAVE confiable de ambos robots es el RP más barato del juego.
- **Para quedar top 4 en un qualifier** (24 qualifiers con una mediana de 27 equipos):
  - RS del 4º lugar: mediana 3.50 (rango 3.17–3.86); del 8º: 2.80;
  - las alianzas de los top 4 promedian **3.3 TIPS** y **92 puntos** por partido; el promedio del evento es 62.

## 4. Fiabilidad por robot (dato EXACTO, no estimado)

El breakdown marca el LEAVE y el PARK de **cada robot** (`autoRobotNLeave`, `autoRobotNPark`, `teleopRobotNPark`), con la estación 1/2 del schedule. Para estas tareas no hay que estimar con OPR: se sabe exactamente qué robot cumplió.
- En 2,962 robots con 5 o más qualys: LEAVE 65 %, PARK en auto 50 %, PARK final 79 %.
- Solo el 22 % de los robots tiene LEAVE en el 100 % de sus partidos, y el 25 % sale en menos de la mitad.

## 5. Metas concretas por robot (npOPR de la temporada)

| Percentil mundial | npOPR | TIPS/partido aportados | LEAVE | PARK final |
|---|---|---|---|---|
| top 1 % | ≥ 81 | ~3.3 | 96 % | 87 % |
| top 5 % | ≥ 52 | ~1.9 | 87 % | 89 % |
| top 10 % | ≥ 41 | ~1.4 | 80 % | 85 % |
| top 25 % | ≥ 29 | ~0.8 | 77 % | 85 % |
| mediana | ≥ 20 | ~0.4 | 67 % | 81 % |

Los élite se distinguen por los TIPS. El LEAVE, el PARK, la CELL y el GARDEN son casi iguales entre el top 10 % y el resto; el LEAVE es la excepción, porque la mitad inferior falla mucho.

## 6. Tendencia de la temporada (qualys por semana)

| Semana | np p50 | np p90 | TIPS medios | SWARM | POLLINATOR 1 |
|---|---|---|---|---|---|
| S06 (mediados de oct) | 37 | 70 | 0.95 | 55 % | 2.6 % |
| S09 (2.ª semana de nov) | 46 | 91 | 1.42 | 66 % | 8.8 % |

- El nivel sube unos 3 puntos de mediana por semana.
- Los qualifiers son más fuertes que los league meets (np p50 54 contra 43; TIPS 1.91 contra 1.19).
- MXTLQ (27-nov) es un qualifier en la semana 12, pero en un país sin eventos previos esta temporada; el nivel mexicano es una incógnita.

## 7. Lecturas para 30311 (estudio y estrategia)

1. **Prioridad 1: TIPS.** Cada TIP de diferencia vale ~95 % de victoria. Lo que se mide y se entrena es cuántos POLLEN/NECTAR llevamos a la CELL y en cuánto tiempo hacemos TIP.
2. **TIP en autónomo:** es el mayor salto de victoria (41 % → 74 %) y la puerta a POLLINATOR 1.
3. **LEAVE y PARK al 100 %:** dan el SWARM (0.63 RP por partido en promedio) y deciden los partidos empatados en TIPS. Tiene que ser rutina sin fallos, y es lo primero que hay que exigirle a un aliado.
4. **Ignorar FLOWERS** mientras el juego siga así (menos que un TIP y casi nadie las usa). Reevaluar si sube la tasa.
5. **Meta para seed top 4 en MXTLQ:** RS ≥ 3.5, que es ganar ~75 % más SWARM casi siempre. La alianza debe promediar ~3 TIPS y ~90 puntos por partido.
6. **Para elegir aliado:** primero TIPS (npOPR y OPR de TIPS), después fiabilidad exacta de LEAVE/PARK. El SWARM necesita a ambos robots.
