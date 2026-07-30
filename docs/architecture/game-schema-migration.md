# Migrar al juego de la siguiente temporada

**Estado:** el motor declarativo está **conectado en producción para FTC** desde
sesión 19 (29 jul 2026). La rama FTC de `MatchScoutingForm` ya no usa el form
hardcodeado; renderiza `GameScoutingForm` con la definición `FTC_DECODE_2025`.
Adaptarse al juego 2026-2027 es **escribir un archivo de definición y cambiar un
import** — sin tocar React.

Este documento es el runbook para ese cambio (septiembre, cuando FIRST anuncia
el juego nuevo).

---

## Cómo encaja el motor

| Pieza | Archivo | Rol |
|---|---|---|
| Tipos de la definición | `types/game-definition.ts` | Forma declarativa: secciones + campos (`counter`/`boolean`/`stars`/`enum`/`text`/`textarea`) + `toEntry` para campos derivados |
| Definición del juego | `lib/games/ftc-decode-2025.ts` | El juego como datos. **Lo único que se escribe por temporada.** |
| Schema de validación | `lib/games/zod-from-definition.ts` | Genera el Zod de la definición (coerce numérico incluido) |
| Mapeo a entrada | `lib/games/build-entry.ts` | `values → campos de juego del match_scouting` (+ `toEntry`) |
| Render de inputs | `components/scouting/games/DynamicGameForm.tsx` | Una `Card` por sección, campos en orden |
| Wrapper de captura | `components/scouting/games/GameScoutingForm.tsx` | `useForm` + `matchNumber` + guardado + lista de observaciones. **Genérico, no se toca.** |
| Punto de cableado | `components/scouting/MatchScoutingForm.tsx` | Elige qué definición renderizar según `program` |

`GameScoutingForm` hace todo lo que hacía el form hardcodeado (header, toggle
"Nuevo Registro", `matchNumber`, guardado offline-first vía
`useSaveMatchScouting`, toasts, reset con auto-incremento, lista de
observaciones) manejado por la definición.

---

## El contrato que hace esto seguro

1. **El `id` de cada campo == la clave persistida en `match_scouting`.** La
   agregación (`lib/scouting-aggregation.ts`), las proyecciones y los reportes
   leen por esas claves. Reusa el mismo `id` cuando el concepto sobrevive entre
   temporadas (`autoPoints`, no `decode2025AutoArtifacts`).

2. **Campos derivados van en `toEntry`, no en un componente.** Cualquier valor
   persistido que no sea un input directo —derivado de otro campo o una
   constante— se computa ahí. DECODE deriva `autoParked` de `endgameBaseParking`
   (lo lee la agregación) y fija `autoPoints: 0`. Si un juego nuevo necesita
   derivaciones, viven con su definición.

3. **`matchNumber` es universal**, lo aporta el wrapper — no lo pongas como
   campo de la definición.

4. **Los subjetivos (driverSkill, defenseRating, wouldPick)** siguen su ruta:
   `driverSkill` es un campo normal del match; los de super-scouting viven en
   `SuperScoutingForm` con `scoutingMode:"super"` y no se mezclan cross-org.

5. **Los strings de display de la definición son CLAVES i18n, no prosa.**
   `section.label`, `field.label`, `field.helpText`, `field.placeholder` y
   `option.label` son dot-paths relativos al namespace `Games` del catálogo
   (`decode.sections.auto`, `decode.fields.driverSkillHelp`,
   `decode.options.endgameBaseParking.Partial`...). El renderer
   (`DynamicGameForm`/`GameScoutingForm`) los resuelve con el mismo idiom
   `t.has()` + fallback que `useZodMessage`
   (`lib/hooks/use-zod-message.ts`): si la clave existe en el catálogo se
   traduce, si no se pinta el string tal cual — **degradación, no error**. Una
   definición nueva de septiembre debe:
   - usar claves `<juego>.sections.*` / `<juego>.fields.*` /
     `<juego>.options.<field>.<value>` (ver `lib/games/ftc-decode-2025.ts`
     como plantilla del patrón `decode.*`);
   - añadir la entrada correspondiente en **ambos** catálogos
     (`messages/en.json` y `messages/es.json`, namespace `Games`) con
     paridad exacta de claves;
   - si se omite el catálogo, el form no truena — muestra la clave/prosa
     cruda, así que un campo custom de usuario sin traducir sigue siendo
     usable.
   El `label` top-level del `GameDefinition` (p. ej. `"FTC DECODE"`) es
   nombre propio y NO sigue esta convención — queda como dato literal.

---

## Pasos para septiembre (juego 2026-2027)

1. **Crear `lib/games/ftc-<nombre>-2026.ts`** exportando una `GameDefinition`.
   Copia `ftc-decode-2025.ts` como plantilla. Define secciones/campos con el
   set real del juego nuevo. Añade `toEntry` si hay derivados o constantes.
   Bumpea `CURRENT_GAME_SCHEMA.FTC` en `types/scouting.ts` (a 3) si la forma de
   datos cambia de forma incompatible.

2. **Cambiar el import en `MatchScoutingForm.tsx`:**
   ```diff
   - import { FTC_DECODE_2025 } from "@/lib/games/ftc-decode-2025";
   + import { FTC_GALACTIC_2026 } from "@/lib/games/ftc-galactic-2026";
   ...
   - <GameScoutingForm definition={FTC_DECODE_2025} team={team} entries={programEntries} />
   + <GameScoutingForm definition={FTC_GALACTIC_2026} team={team} entries={programEntries} />
   ```

3. **QA de paridad** — solo si estás *reemplazando* campos que la agregación ya
   lee. Para un juego nuevo con campos nuevos no hay paridad que romper; basta
   verificar que la definición valida y guarda (ver `decode-parity.test.ts` como
   patrón: mismo set de claves, mismos valores en input válido).

4. **`npm test` + `npm run build`** y capturar una entrada de prueba en dev.

Eso es todo. Sin componentes nuevos.

---

## Trade-offs conocidos (decididos, no bugs)

- **Layout genérico.** `DynamicGameForm` apila secciones (1 col móvil, 2 en lg);
  el viejo `FTC_DecodeForm` tenía un grid custom de 4 columnas. Si una temporada
  amerita un layout a medida, escribe un componente de ese año — sigue ahorrando
  todos los demás. Para el caso común, genérico basta.
- **Lista de observaciones genérica.** Muestra cada campo declarado con su valor
  (booleans → Sí/—, stars → N/max, etc.) en vez de las tarjetas de stats
  bespoke de DECODE. Funciona para cualquier juego.
- **Bounds más estrictos.** La definición pone `max` por campo (p. ej.
  `autoPurpleArtifacts` ≤ 50); el `counter` compartido del schema viejo era
  ≤ 999. En inputs realistas las entradas son idénticas; el camino declarativo
  solo rechaza valores absurdos que el viejo aceptaba. Es mejor, no un regreso.

## Limpieza pendiente

- `components/scouting/games/FTC_DecodeForm.tsx` queda como **referencia** hasta
  validar el camino declarativo en un evento en vivo. Ya no lo importa nadie;
  borrar tras la primera validación real.
- **FRC** sigue en `FRC_ReefscapeForm` hardcodeado. Migrar a
  `GameScoutingForm` + una definición `frc-reefscape-2025.ts` es el mismo patrón
  cuando haga falta (no urgente: la prioridad FRC es la red, no el form).
