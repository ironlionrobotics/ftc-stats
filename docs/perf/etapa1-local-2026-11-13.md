# Etapa 1 (build local) vs línea base — 2026-11-13

Origen: http://localhost:3006. Mediana de 3 corridas por ruta, caché del navegador vacía, servidor ya caliente.
Condiciones: 412×823, CPU 4× más lenta, red Slow 4G (150 ms RTT, 1.6 Mbps). Script: `scripts/perf-baseline.mjs`.

| Ruta | TTFB ms | FCP ms | LCP ms | TBT ms | CLS | JS KB | Total KB |
|---|---|---|---|---|---|---|---|
| `/` | 32 | 612 | 628 | 146 | 0.000 | 390 | 464 |
| `/event/FPEMX?season=2025` | 28 | 476 | 840 | 163 | 0.000 | 438 | 497 |
| `/event/AUBRQ1?season=2026` | 24 | 532 | 532 | 171 | 0.000 | 438 | 492 |
| `/team/30311` | 17 | 552 | 1068 | 119 | 0.000 | 432 | 515 |
| `/scouting` | 22 | 472 | 472 | 214 | 0.000 | 607 | 650 |
| `/strategy` | 15 | 472 | 472 | 140 | 0.039 | 472 | 515 |
| `/oracle` | 14 | 524 | 524 | 140 | 0.000 | 375 | 429 |

Umbrales de Google para "bueno": LCP ≤ 2500 ms, CLS ≤ 0.1, TBT ≤ 200 ms (proxy de laboratorio de INP).

## Comparación contra la línea base de producción (`baseline-2026-11-13.md`)

| Ruta | JS KB antes → ahora | Total KB antes → ahora | TBT ms antes → ahora |
|---|---|---|---|
| `/` | 507 → 390 (−23%) | 749 → 464 (−38%) | 197 → 146 |
| `/event/FPEMX` | 520 → 438 (−16%) | 753 → 497 (−34%) | 213 → 163 |
| `/event/AUBRQ1` | 520 → 438 (−16%) | 740 → 492 (−34%) | 227 → 171 |
| `/team/30311` | 509 → 432 (−15%) | 756 → 515 (−32%) | 245 → 119 |
| `/scouting` | 680 → 607 (−11%) | 889 → 650 (−27%) | 377 → 214 |
| `/strategy` | 548 → 472 (−14%) | 756 → 515 (−32%) | 265 → 140 |
| `/oracle` | 458 → 375 (−18%) | 676 → 429 (−37%) | 212 → 140 |

Causas: se dejaron de descargar las dos fuentes (Space Grotesk y JetBrains Mono) y el armazón nuevo pesa menos que el menú lateral anterior. Advertencia: esta medición es contra `next start` local; TTFB y LCP no son comparables con producción. JS y KB sí lo son, salvo por diferencias de compresión del CDN. Repetir contra producción después del deploy de la Etapa 1.
