# 🧠 Memoria del Proyecto: FTC Stats México

Este documento centraliza el progreso, las decisiones técnicas y el estado actual del desarrollo para asegurar continuidad y claridad en el futuro.

## 📝 Resumen Ejecutivo
Transformación de un script de automatización en Python (`ftc_event_advancement.py`) a una plataforma web de alto rendimiento (Next.js) para el análisis de estadísticas de FIRST Tech Challenge en México.

---

## 🛠️ Stack Tecnológico
- **Frontend**: Next.js 14, React, TypeScript.
- **Estilos**: Tailwind CSS (Dark Mode, Glassmorphism).
- **Animaciones**: Framer Motion.
- **API**: Integración directa con `ftc-api.firstinspires.org`.
- **Iconografía**: Lucide React.

---

## 🗓️ Registro de Sesiones y Progreso

### Sesión 1: Cimentación (21 Ene 2026)
- **Objetivo**: Inicializar el proyecto y conectar con la API.
- **Logros**: 
    - Creación de la estructura Next.js.
    - Implementación del cliente de API con autenticación Base64.
    - Definición de tipos de datos para Rankings y Advancement.

### Sesión 2: Inteligencia de Datos y UI (21 Ene 2026)
- **Objetivo**: Implementar el reporte de avance y promedios de calificación.
- **Logros**:
    - **Descubrimiento Crítico**: Se encontró el endpoint `/points` para obtener puntajes numéricos exactos de Judging, Playoff, etc.
    - Implementación de lógica de agregación (suma para avance, promedio para calificación).
    - Creación de la tabla interactiva con resaltado para equipos que ya tienen pase al nacional.
    - Corrección de bugs en el cálculo del High Score (usando `sortOrder6`).

### Sesión 5: Monitoreo en Vivo y Refinamiento (24 Ene 2026)
- **Objetivo**: Implementar la visualización de partidos en vivo y mejorar la experiencia de usuario en regionales.
- **Logros**:
    - **Página de Eventos**: Creación de la ruta dinámica `/event/[eventCode]` con fetching de datos en servidor (SSR) para evitar bloqueos de la API.
    - **Visualización de Matches**: Implementación del componente `MatchList` que muestra alianzas rojas/azules, marcadores dinámicos y ganadores resaltados.
    - **Alineación Premium**: Rediseño de la tabla de alianzas a un sistema de 4 columnas individuales para asegurar alineación vertical perfecta entre equipos.
    - **Vínculo de Equipos**: Integración de nombres oficiales de equipos dentro de la lista de partidos mediante el mapeo de datos de rankings.
    - **Abreviación Inteligente**: Optimización de descripciones (ej. "Upper Bracket R1 M1") para maximizar el espacio en pantalla.
    - **Expansión de Calendario**: Inclusión de los regionales de Toluca y San Luis Potosí, y corrección de la temporada a 2025 para sincronización de datos.

---

## 💡 Decisiones de Diseño Importantes
1. **Identidad Visual**: Uso de color Naranja (Primary) y Violeta/Indigo (Secondary) para diferenciar "Stats" de "Advancement".
2. **Abreviaturas de Eventos**: Uso de códigos amigables como MTY, GDL, CDMX para mejorar la legibilidad.
3. **Filtro Advanced**: Inclusión de un toggle rápido para visualizar solo a los clasificados al nacional.
4. **Scouting Traducido**: Se decidió mantener las opciones internas del formulario en español para facilitar la captura rápida por parte de los scouts en México.
5. **Nomenclatura Híbrida**: En los matches, se decidió mantener los nombres de brackets oficiales ("Upper/Lower Bracket") completos pero abreviar términos técnicos ("Round/Match" a "R/M") por estética y espacio.

---

## 🚀 Próximos Pasos (Prioridad Alta)
1. **GitHub Setup**: Vincular el proyecto al nuevo repositorio `ftc-stats`.
2. **Ranking en Vivo**: Implementar una tabla de estadísticas de desempeño (Average Score, RP) dentro de la página de cada regional.
3. **Subida de Fotos**: Integrar un sistema para que la URL de la foto del robot se guarde junto con el JSON del equipo en Scouting.
4. **Exportación**: Posibilidad de exportar los datos de scouting acumulados para análisis en Excel.
