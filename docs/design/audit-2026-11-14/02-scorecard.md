# 02 · Scorecard (Dieter Rams), móvil 390 / 820

Reglas aplicadas: si hay duda entre dos calificaciones se toma la menor, y se califica el peor caso, no el promedio.

1. **Innovador: 1/3**
   - Evidencia: E21 y E24. El lenguaje visual es un dashboard genérico de escritorio comprimido (tarjetas de KPI, hero degradado, tablas).
   - Justificación: lo innovador de PRIDE (scouting federado, forma en playoffs, préstamos) no tiene una forma propia en la interfaz, que imita el patrón de cualquier app de estadísticas.
2. **Útil: 1/3**
   - Evidencia: E11, E12, E13, E21.
   - Justificación: las tareas principales se pueden hacer, pero con desvíos. Ver a un rival desde el evento obliga a pasar por Equipos (3 o más toques, sin contexto). Capturar un partido toma 4 o 5 toques, con el número tecleado. Hoy abre con un mensaje vacío en lugar del próximo partido.
3. **Estético: 0/3**
   - Evidencia: E1–E9, E17 y E18.
   - Justificación: los tokens existen, pero no se obedecen. Hay 12 tamaños de letra, una escala de espacios irregular, 147 tarjetas hechas a mano, 5 estilos de h1, 4 escalas de semáforo y colores fuera de tokens. El rojo y el azul cargan 6 o más significados, lo que es ruido activo: el usuario no puede leer el color.
4. **Comprensible: 1/3**
   - Evidencia: E5, E14, E25, E26.
   - Justificación: hay jerga sin ayuda táctil (OPR, RS, σ, Brier), "Oracle" nombra 3 cosas, la pantalla Evento mezcla idiomas y el color contradice su significado (azul = empate, enlace y alianza).
5. **Discreto: 1/3**
   - Evidencia: E20 y E21.
   - Justificación: 113 px fijos de header y tab bar, más el botón flotante del chat y el banner de instalación de 99 px, tapan contenido. El hero y las tarjetas de promedios compiten con lo que importa.
6. **Honesto: 1/3**
   - Evidencia: E27.
   - Justificación: no hay dark patterns, pero sí 2 o más inflaciones o etiquetas falsas: "alta precisión", "Predictor IA", un "OPR" que es el promedio de puntos, "proyección lineal" y "Acceso exclusivo" sin candado.
7. **Duradero: 1/3**
   - Evidencia: E30 y E21 (blur o glow decorativo con `animate-pulse`, hero degradado, `EventStats` con `blur-3xl`).
   - Justificación: tiene 2–3 marcadores de moda (glows difusos, degradados de hero, tarjetas `rounded-3xl`) en lugar de 0–1.
8. **Minucioso: 1/3**
   - Evidencia: E22 y E23.
   - Justificación: el foco existe y hay estados vacíos. Pero la carga casi no tiene skeleton, el error no ofrece ninguna acción (y responde 200), no se ven los estados de éxito ni sin red, faltan landmarks y skip link, y la mayoría de los objetivos táctiles mide menos de 44 px (E19).
9. **Ecológico: 1/3**
   - Evidencia: E29 y E30.
   - Justificación: el peor caso, Scouting, transfiere 583 KB de JS (más de 500), y hay una animación infinita que no respeta reduced-motion. El modo oscuro existe, pero la app ignora la preferencia del sistema.
10. **Lo menos posible: 1/3**
    - Evidencia: E14, E15 y E20.
    - Justificación: hay más de 5 elementos removibles o duplicados (5 selectores de evento, 3 campos para seguir equipo, el botón flotante del chat por defecto, el banner, el hero y 6 pestañas más los submodos).

**Total: 9/30.** Los principios de carga (#2, #4 y #6) están en 1, y el #3 en 0.
