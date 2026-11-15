# 03 · Veredicto: REDISEÑO

**La experiencia móvil de PRIDE se rediseña desde las tareas del evento y con un sistema de color nuevo.** Hay que rehacer la capa de interfaz: la arquitectura de navegación, los componentes base y los tokens. El motor y los datos se quedan, porque esos sí funcionan.

**Por qué rediseño y no refinar:** el total es 9/30, menos de 20. El principio estético (#3) está en 0 porque el sistema de color está mal definido desde la raíz: secondary y danger son los colores de alianza. Los principios de carga (útil, comprensible y honesto) están en 1. Retocar pantallas sin cambiar los tokens ni la arquitectura de navegación dejaría la misma confusión con otra pintura.

**Lo que NO es rediseño:** algoritmos, server actions, caché, modo sin red (SW y Dexie), catálogos i18n, scouting federado y avisos. Todo eso se preserva.

## Las 5 jugadas de mayor palanca
1. **#3/#4 Color: un sistema semántico nuevo.**
   - Un acento de marca que no sea rojo ni azul.
   - Neutros con 3 niveles de superficie.
   - Colores de estado propios: éxito, aviso y error, distintos del rojo y el azul de alianza.
   - Rojo y azul solo para alianzas, siempre con forma o etiqueta además del tono.
   - Una sola escala de semáforo y la paridad claro/oscuro arreglada (`@custom-variant dark`, quitar el `!important` de `.text-white`).
   - Evidencia: `globals.css:29-38`, E2–E10.
2. **#2 Útil: arquitectura móvil alrededor de 4 tareas del evento.**
   - Las tareas: mi próximo partido, capturar, consultar un equipo y avisos.
   - Un solo "evento activo" global en lugar de 5 selectores.
   - Cada número de equipo enlaza a su perfil, con el contexto del evento.
   - Búsqueda de equipo en el shell móvil.
   - Evidencia: `EventViewManager.tsx:423-436`, `AppShell.tsx:83-85`, E14.
3. **#2 Captura en ≤ 2 toques desde el partido o la asignación.**
   - El partido y el equipo llegan precargados, con Match como pestaña por defecto.
   - Formulario por fases (auto, teleop, final) con contadores de 48 px o más.
   - Evidencia: `ScoutingClient.tsx:229,238`, E13.
4. **#5/#10 Contenido primero, chrome mínimo.**
   - Hoy abre con el próximo partido y su probabilidad, no con un mensaje vacío.
   - El evento abre con el partido en vivo o el próximo, no con promedios.
   - El botón flotante del chat solo si el usuario lo activa, y la instalación como tarjeta inline una sola vez.
   - Sin hero degradado.
   - Evidencia: `lib/app-config-schema.ts:36`, `shots/phone-dark-home.png`, E20 y E21.
5. **#4/#6/#8 Base táctil y textos honestos.**
   - Objetivos de 44 px o más y texto de 12 px o más.
   - Ayudas al tocar: un glosario de OPR, RS, etc., en lugar de hover.
   - i18n completo en Evento y un idioma por defecto según el navegador o México.
   - Corregir las etiquetas falsas de E27 y unificar la terminología y los formatos numéricos.
   - Skeletons y estados de error con una acción.
   - Evidencia: E19, E22, E23 y E25–E28.
