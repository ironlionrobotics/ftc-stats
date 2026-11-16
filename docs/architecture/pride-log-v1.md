# PRIDE Log v1: formato de logs del robot

Decisión #120 ("Salud del robot"). Este documento es el contrato entre el código del robot (la librería `pride-telemetry`, MIT, escrita por los alumnos de FTC 30311 con Héctor) y PRIDE (`/robot`), que lee, analiza y guarda los logs.

**Idea central:** un CSV por corrida. Una columna de tiempo, una columna de batería y luego una columna por señal, con un nombre que dice **de qué dispositivo es, qué mide y en qué unidad**. Con eso PRIDE sabe graficar y diagnosticar sin configuración.

## 1. Archivo

- **Texto CSV:** UTF-8, separado por comas, sin comillas y con una línea de encabezado.
  - `true`/`false` se leen como 1/0.
  - Una celda vacía significa "sin dato".
- **Nombre:**
  - Para PRIDE: `^[a-z0-9_]{1,48}\.csv$`. Al subirlo, PRIDE normaliza cualquier otro nombre.
  - Recomendado: incluir la fecha y hora de inicio, `<algo>_AAAAMMDD_HHMMSS.csv` o `AAAAMMDD-HHMMSS_<etiqueta>`. PRIDE toma de ahí la fecha de la corrida; si no la encuentra, usa la fecha del archivo.
- **Límites en PRIDE:** 5 MB, 20 000 filas, 128 columnas.
  - Un match de 2:30 a 5 Hz son unas 750 filas.
- **Frecuencia sugerida:** 5 Hz (cada 200 ms). Basta para tendencias de corriente y voltaje sin cargar el loop.
  - Lección de la temporada DECODE: loggear a la velocidad del loop afecta la odometría.
- **Dónde guardarlo:** una carpeta por corrida, por ejemplo `/sdcard/FIRST/matchlogs/<fecha>_<tag>/`. Si hay microSD o memoria USB, también ahí, para sacarla sin ADB.
- **Subida:** según la regla E301, en el evento no hay Wi‑Fi propio y el Hub **no** sube nada. El equipo copia el CSV a una laptop (microSD, USB o `adb pull`) y lo sube en PRIDE → Más → Salud del robot.

## 2. Columnas

**Obligatorias:**

| Columna | Qué es |
|---|---|
| `time_s` (primera) | Segundos desde el inicio de la corrida. PRIDE resta el primer valor. |
| `battery_volts` | Voltaje de la batería (`hardwareMap.voltageSensor`). |

**Por dispositivo:** `<dispositivo>_<sufijo>`, con el dispositivo en minúsculas y `_` (`fl`, `intake`, `shooter_p`, `arm`…).

| Sufijo | Magnitud | Unidad | Uso en PRIDE |
|---|---|---|---|
| `_current_a` | corriente | A | define que el dispositivo **es un motor**; picos, media, p95, esfuerzo sostenido |
| `_ticks` | posición | ticks | encoder: detecta encoder mudo y velocidad |
| `_ticks_per_s` / `_tps` | velocidad | ticks/s | encoder |
| `_rpm` | velocidad | rpm | flywheels |
| `_power_w` | potencia | W | gráfica |
| `_volts` / `_v` | voltaje | V | gráfica |
| `_pct` | porcentaje | % | gráfica |
| `_flag` / `_stall_warn` | 0/1 | — | marcadores |
| `_cm`, `_in`, `_deg` | pose | cm / in / deg | trayectoria (próximamente) |
| `_ms` | tiempo | ms | solo `loop_ms` se interpreta como loop |

**Columnas especiales recomendadas:**
- `loop_ms`: duración del loop. Activa el diagnóstico de loop lento.
- `total_current_a`: suma de corrientes. **No** se toma como motor.
- `x_cm`, `y_cm`, `h_deg`: pose de la odometría.

**Reglas de nombres:**
- Si el sufijo no se reconoce, la columna se guarda como "otra" y se grafica, pero no se diagnostica.
- Los dispositivos `total`, `battery`, `robot`, `rest`, `hub_ch` y `hub_ex` nunca cuentan como motor.
- `_peak_current_a` (pico acumulado) se ignora para el diagnóstico porque PRIDE calcula los picos.

## 3. `meta.json` (opcional, futuro)

Junto al CSV, para que la subida no pida datos a mano:

```json
{ "format": "pride-log", "version": 1, "team": 30311, "season": 2026,
  "kind": "match", "event": "MXMOQ", "match": { "level": "QUALIFICATION", "number": 12 },
  "robotVersion": "v3 intake nuevo", "opMode": "MainTeleOp" }
```

PRIDE v1 acepta el nombre en Storage, pero todavía no lee este archivo. Es el siguiente paso de la librería.

## 4. Qué diagnostica PRIDE

| Hallazgo | Regla | Origen |
|---|---|---|
| Brownout | batería < 9.15 V | `plot-match-log.py` de 30311 |
| Voltaje bajo | < 10.5 V por ≥ 2 s | íd. |
| Esfuerzo sostenido | motor ≥ 6 A por ≥ 1 s | `MotorDiagnosticsLogger` (stall goBILDA ≈ 9.2 A) |
| Encoder mudo | el motor consumió > 1 A por ≥ 1 s y su encoder nunca cambió en toda la corrida | RobotHealth (cable de encoder suelto, jul-2026) |
| Loop lento | `loop_ms` ≥ 50 | — |

**Entre corridas** (tendencias, mínimo 3 corridas previas, contra la mediana):
- pico de corriente por motor > 1.3×;
- voltaje mínimo 0.5 V abajo;
- loop máximo > 2×;
- encoder que antes se movía y ahora no.

Es el port de `build-season-report.py`.

## 5. Formatos que PRIDE ya acepta

| Formato | Cómo se reconoce | Notas |
|---|---|---|
| `pride-v1` | primera columna `time_s` | este documento |
| `motor-diag` | `time_s,battery_volts,…_stall_warn` | `MotorDiagnosticsLogger` de 30311 (BIOBUZZ, cada 0.75 s); ya cumple pride-v1 |
| `decode-match` | `match_s,V,Vmin,I_tot,…` | `match_log.csv` de 30311 en DECODE (5 Hz, 32 columnas); se traduce: `I_FL` → `fl` corriente, `vel_FL` → `fl` velocidad, `rpm_LzL` → `launcher_l` rpm |

## 6. Privacidad

- Los logs son **privados del equipo**: solo sus miembros los leen, ni siquiera otros equipos aprobados. Lo garantizan las reglas de Firestore y Storage, con pruebas en `test/firestore-rules/storage.test.ts`.
- No contienen datos personales. No pongas nombres de alumnos en etiquetas ni en columnas.
- Compartir con otros equipos sería opt-in, en una versión futura.
