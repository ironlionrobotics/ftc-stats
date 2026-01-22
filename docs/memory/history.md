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

### Sesión 4: Sistema de Scouting y Estabilidad (22 Ene 2026)
- **Objetivo**: Crear una herramienta de campo robusta y persistente.
- **Logros**:
    - **Formulario de Scouting**: Implementación completa de campos para Robot Data, Autónomo, Teleop y Endgame, redactados en español ("ustedes").
    - **Persistencia Local**: Uso de `localStorage` para guardar datos automáticamente por equipo, permitiendo uso sin internet estable.
    - **Optimización de Red**: Cambio de carga paralela a secuencial para evitar errores de conexión ("Failed to fetch").
    - **Arquitectura de Datos**: Migración de la carga de API a *Server Components* para evitar problemas de CORS en el navegador.
    - **Limpieza de Proyecto**: Eliminación del script de Python original y reestructuración de carpetas para un entorno de desarrollo profesional.

---

## 💡 Decisiones de Diseño Importantes
1. **Identidad Visual**: Uso de color Naranja (Primary) y Violeta/Indigo (Secondary) para diferenciar "Stats" de "Advancement".
2. **Abreviaturas de Eventos**: Uso de códigos amigables como MTY, GDL, CDMX para mejorar la legibilidad.
3. **Filtro Advanced**: Inclusión de un toggle rápido para visualizar solo a los clasificados al nacional.
4. **Scouting Traducido**: Se decidió mantener las opciones internas del formulario en español para facilitar la captura rápida por parte de los scouts en México.

---

## 🚀 Próximos Pasos (Prioridad Alta)
1. **GitHub Setup**: Vincular el proyecto al nuevo repositorio `ftc-stats`.
2. **Detalle por Regional**: Poblar las páginas de eventos con rankings específicos y listas de partidos.
3. **Subida de Fotos**: Integrar un sistema para que la URL de la foto del robot se guarde junto con el JSON del equipo.
4. **Exportación**: Posibilidad de exportar los datos de scouting acumulados para análisis en Excel.
