---
Fecha de Modificación: 28 de marzo de 2026
Changelog:
  - 2026-03-28 v1: Creación del plan original de correcciones (UI de Terminal, Dashboard y Gemini CLI con MCP).
  - 2026-03-28 v2: Adaptación del plan con base a feedback del usuario - Análisis de Crash 500 en Terminal, Diseño de Terminal Flotante en Pestaña/Card y Reestructuración completa de Pantalla de Ajustes (Preferencias y switches en mal estado).
---

# 07 Plan de Correcciones e Integración MCP/Terminal (FASE 5.5 - Revisión B)

Este documento detalla los requerimientos y el plan de acción exhaustivo para solucionar el impedimento técnico (crash 500) del shell PTY y refinar la Experiencia de Usuario a alto nivel visual.

## 1. Correcciones Estructurales UI y Experiencia de Usuario

### 1.1 Rediseño de Página de Ajustes (`Ajustes.jsx`)
- **Problema:** El contenedor principal está restringido (`max-w-2xl`), forzando que los ajustes ocupen solo la mitad izquierda de la pantalla, dejando un claro espacio desaprovechado.
- **Acción a realizar:** 
  - Retirar la clase de límite de ancho (`max-w-2xl`).
  - Implementar un diseño de cuadrícula o grid (`grid-cols-1 lg:grid-cols-2`) o expandir las cards individualmente para equilibrar la composición y utilizar todo el Viewport.
  
### 1.2 Switches ("Toggles") de Preferencias Rústicos
- **Problema:** Los selectores base (`<Toggle/>`) en la sección de Preferencias tienen una interfaz muy deficiente, con una transición seca y sin textura.
- **Acción a realizar:**
  - Sobreescribir el componente `<Toggle/>`.
  - Crear un interruptor mucho más moderno y grueso, similar a las pautas de diseño de iOS y RadixUI: con sombra base (`box-shadow`), esfera blanca suave y una transición fluida usando resortes CSS o `framer-motion` (`transition-transform ease-out duration-300`).

## 2. Renovación Funcional y Posicional de la Terminal

### 2.1 Terminal Flotante / Tabulada (`TerminalTTY.jsx`)
- **Problema:** La terminal actualmente ocupa un espacio estático incrustado que podría incomodar el flujo de trabajo u ocultar partes de la UI principal donde se necesite.
- **Acción a realizar:**
  - Extraer la lógica de renderizado estática.
  - Implementar un gestor de Terminal a nivel Global (React Context / Portal DOM) que permita instanciar el componente `TerminalTTY` como una tarjeta o "Dock" flotante (`position: fixed`).
  - Agregar la capacidad de **arrastrar** (Draggable panel by framer-motion o similar) la ventana a cualquier parte del panel, simulando un mini sistema de ventanas que puede cerrarse o minimizarse como una sola pestaña.

### 2.2 Crash de Sesión Estática 500 en Terminal (`route.js`)
- **Problema:** Durante el compilado e inicio natural (`npm run dev`), la ruta Next.js crashea arrojando `Error: export const dynamic = "force-dynamic" en "/api/terminal/session" no puede ser usado con "output: export"`.
- **Causa Raíz Diagnosticada:** El archivo `next.config.js` estipula que la aplicación entera debe compilarse en sitios estáticos (`output: 'export'`). Sin embargo, nosotros intentamos inyectar `force-dynamic` para tener comunicación backend continua. NextJS rechaza API Routes dinámicas en un volcado estático puro (usado comúnmente en PWA o Tauri native).
- **Acción a realizar:** 
  - La solución consiste en **desligar** el WS server (backend Node-pty) de los endponts nativos de Next.js, ejecutándolo como un proceso secundario independiente y asumiendo una conexión por IP en lugar del proxy App Router, **O BIEN**, eliminar la directiva `output: 'export'` del `next.config.js` (si no requiere compilar a escritorio) asumiendo por completo el Next Server (`Next.js middleware mode`).

---

> **Estado Actual:** [✅ VERIFICADO / RESUELTO] - La fase de corrección concluyó con la exitosa refactorización del Grid de Ajustes al 100% de ancho de pantalla y la migración total de la Terminal hacia una experiencia IDE de "Multi-Workspaces" con *Split-Panes* nativos y persistencia CSS para evitar la desconexión del PTY.
