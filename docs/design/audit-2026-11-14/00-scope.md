# Auditoría de diseño PRIDE: alcance (14-nov-2026)

**Qué se audita:** la PWA PRIDE, rama `etapa1/foundations` (commit a1fd7ff), servida en producción local en `http://localhost:3108` con `next start`.

**Pantallas y viewports:** smartphone de 390×844 y tablet de 820×1180, en tema claro y oscuro.

| Pantalla | Ruta | Notas |
|---|---|---|
| Hoy | `/` | Equipo seguido 30311 y sección "Siguiendo" |
| Eventos | `/events` | |
| Evento en vivo o terminado | `/event/USMIRHQ` | Partidos, ranking y Oracle |
| Equipos | `/teams` | |
| Equipo | `/team/30311` | |
| Scouting | `/scouting` | Sin sesión; las vistas con sesión se revisan en el código |
| Estrategia | `/strategy` | Sin sesión; las vistas con sesión se revisan en el código |
| Taller | `/workshop` | |
| Préstamos | `/lending` | |
| Trading Card | `/card` | |

**El shell de la app:**
- `components/shell/AppShell.tsx` y `nav.ts`;
- una barra inferior en móvil y un riel lateral en escritorio;
- un panel de cuenta.

**Usuarios y tareas principales:**
- **Estudiantes de equipos FTC** (scouts y drive team) en el evento, con el celular en una mano, mucho ruido, poca red y pocos segundos. Sus tareas son:
  1. ver el próximo partido de su equipo y la probabilidad de ganarlo;
  2. capturar scouting de un partido;
  3. consultar a un rival o aliado.
- **El estratega o capitán**, en tableta o laptop: picklist, Oracle y selección de alianzas.

**Restricciones:**
- El rojo y el azul quedan reservados para las alianzas y se mantienen.
- La dirección vigente es "Transmisión" (decisión #93, fuentes del sistema), y Héctor dice que no le gusta del todo.
- El rendimiento va antes que la estética.
- Usuarios principales: mexicanos, interfaz en español e inglés.
- Uso al aire libre o en gimnasio, a veces sin red.
- Next 16, React 19, Tailwind v4 con tokens en `app/globals.css`.
- El móvil no necesita todas las herramientas de escritorio.

**Referencias:** Control Scout (controlscout.org), FTCScout y The Blue Alliance; los prototipos en `docs/design/direcciones-2026-11.html` y `docs/design/plan-y-paletas.html`.

**Meta:** una mejora "10x" de la interfaz y la experiencia en móvil, empezando por el sistema de color.
