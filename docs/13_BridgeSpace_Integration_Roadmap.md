# BridgeSpace Integration Roadmap

Este documento detalla el progreso y las tareas pendientes para integrar las características, arquitectura y estética inspiradas en la aplicación "BridgeSpace" dentro de DevHub. Sirve como punto de control para futuras sesiones o agentes.

## 1. Visión General y Arquitectura

La filosofía principal extraída de BridgeSpace es la **separación estricta de responsabilidades** combinada con una **interfaz de usuario premium**:

- **DevHub (El Cliente / Interfaz)**: Actúa estrictamente como un gestor de estado pasivo (Jira/Kanban) y un multiplexor de terminales visual. **No** manipula archivos ni ejecuta comandos Git directamente.
- **OpenCode / Gentleman IA (El Trabajador)**: Es el único encargado de tocar código, buscar archivos y hacer commits. Se ejecuta de forma interactiva dentro de la grilla de terminales de DevHub.
- **MCP (El Puente)**: El servidor MCP de DevHub solo expone herramientas de _gestión de proyectos_ (`get_next_task`, `update_task`, `update_agent_status`) para que el Agente informe lo que está haciendo, pero no le da herramientas de sistema operativo.

---

## 2. Lo que ya está implementado (Completado)

1.  **Terminal Multiplexer (Grid 2D Estilo VS Code)**:
    - Se reemplazó el sistema de árbol recursivo por una grilla de columnas y filas predecible usando `react-resizable-panels`.
    - Atajos globales: `Ctrl+Shift+R` (Split Right), `Ctrl+Shift+D` (Split Down), `Ctrl+Shift+W` (Cerrar).
    - Persistencia de estado con `localStorage` (sobreviven las vistas abiertas a los recargos).
2.  **Soporte Nativo para TUI Apps (OpenCode / Vim)**:
    - Inyección de `.xterm { height: 100% !important; }` globalmente para que las interfaces de consola ocupen todo el espacio disponible y no colapsen visualmente.
3.  **Persistencia de PTY en Background (Sesiones Inmortales)**:
    - Se modificó el servidor de Node (`ttyServer.js`) para que mantenga el proceso PTY vivo (con un Session ID) aunque el WebSocket de React se desconecte al recargar la página (F5). Al reconectar, se inyecta el historial completo de la terminal.
4.  **UI Bridge y Telemetría Pasiva**:
    - Los botones de "Ejecutar con Worker" en Kanban, el ChatAgente y el BannerIA abren automáticamente la grilla de terminales.
    - Se fuerza el inicio en modo interactivo (`opencode --agent <perfil> --prompt "..."`) inyectando un ID de telemetría para el SwarmControl.
    - SwarmControl y WorkspaceSidebar leen directamente de la base de datos vía WebSockets para mostrar "puntitos verdes" y estados reales de ejecución.

---

## 3. Implementaciones Pendientes (To-Do)

Para completar la transición al modelo BridgeSpace en futuras conversaciones, estas son las tareas que deben continuarse:

### A. Limpieza Definitiva del MCP (Purge)

Aunque el flujo cambió, el archivo `devhub-mcp/server.js` aún podría contener herramientas legacy (exploración de archivos, git branch, etc.).

- **Acción requerida**: Hacer una auditoría final del código del servidor MCP y borrar cualquier herramienta que compita con las capacidades nativas de OpenCode. El MCP debe ser 100% solo lectura/escritura hacia Supabase (gestión de proyecto y memoria).

### B. Ciclo de Vida de la Terminal PTY (Garbage Collection)

Actualmente, logramos que los procesos de terminal vivan en background (inmortales). Esto es excelente para no perder tareas, pero puede llenar la memoria RAM si se acumulan.

- **Acción requerida**: Implementar un sistema de limpieza (Garbage Collection) en `ttyServer.js`. Por ejemplo, si un ID de terminal no recibe reconexión de WebSocket en más de 2 horas, hacer un `.kill()` seguro. O añadir un botón en la UI de DevHub para "Matar proceso de terminal" forzadamente.

### C. Aesthetic y UX Premium (Estilo BridgeSpace)

BridgeSpace tiene un layout muy pulido. En DevHub ya armamos el `Settings Layout`, pero falta unificar otras vistas.

- **Acción requerida**:
  - Mejorar las transiciones y _glassmorphism_ de los paneles flotantes (Swarm Control, modales de tareas).
  - Revisar los colores de acento para que el tema general se sienta más unificado (menos contrastes duros, más degradados sutiles).

### D. Agent Feedback Loop Automatizado (Auto-Merge)

Hoy en día el Agente termina su tarea, cambia el estado a `completed` en la base de datos, pero la terminal se queda esperando.

- **Acción requerida**: Detectar en la UI cuando un proceso de terminal finaliza su prompt (exit signal) y, si la tarea fue reportada como completada, dar la opción de cerrar ese split de terminal automáticamente o limpiarlo para la próxima tarea, imitando el panel de "Ejecutores Múltiples" de BridgeSpace.

---

## 4. ¿Cómo continuar en una nueva sesión?

Para retomar este hilo en el futuro, dile a la IA:

> "Revisa el archivo `docs/13_BridgeSpace_Integration_Roadmap.md`. Quiero que sigamos trabajando en el punto X (por ejemplo: la limpieza definitiva del MCP o el Garbage Collection de la terminal)."
