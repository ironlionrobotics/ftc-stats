# 🤖 FTC Stats México

Plataforma de alto rendimiento para el análisis de estadísticas y proyecciones de **FIRST Tech Challenge Mexico**. Diseñada para scouts, mentores y equipos que buscan una ventaja competitiva basada en datos reales de la API de FIRST.

## ✨ Características Principales

- **Data Lab / Team Evolution**: Seguimiento detallado del progreso de los equipos a lo largo de la temporada.
- **Power Score (DECODE 2025-2026)**: Algoritmo predictivo basado en el manual de avance oficial de la temporada actual.
- **Índice de Fortaleza de Evento**: Ponderación inteligente de resultados basada en la competitividad de cada sede.
- **Visualización de Matches**: Seguimiento en vivo de regionales con marcadores y alianzas.
- **Proyección Nacional**: Estimación matemática del ranking nacional para el regional de México.
- **Diseño Premium**: Interfaz moderna con modo oscuro, visualización de datos dinámica y scroll inteligente.

## 🛠️ Stack Tecnológico

- **Frontend**: Next.js 15, React, TypeScript.
- **Estilos**: Tailwind CSS, Framer Motion.
- **Backend/API**: Integración con `ftc-api.firstinspires.org`.
- **Base de Datos**: Firestore (Caché local/remota).

## 🚀 Comenzando

### Requisitos Previos

Necesitarás las credenciales de la API de FTC (Username y Key) configuradas en tus variables de entorno:

```bash
FTC_API_USERNAME=tu_usuario
FTC_API_KEY=tu_llave
```

### Instalación

1. Clona el repositorio.
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Ejecuta el servidor de desarrollo:
   ```bash
   npm run dev
   ```

## 📖 Documentación de Memoria

Este proyecto utiliza un sistema de memoria interna para registrar el progreso y decisiones técnicas:
- [Resumen de Sesiones](./docs/memory/history.md)
- [Bitácora de Decisiones](./docs/memory/decisions.md)

---
*Desarrollado para la comunidad de FTC en México.*

