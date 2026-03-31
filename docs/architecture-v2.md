# DevHub Architecture V2: El IDE Supremo + Agentes

Este documento plasma la decisión arquitectónica y el roadmap para la evolución de DevHub, integrándolo armónicamente con **Gentleman AI** y **Engram** sin solapar responsabilidades.

## 1. La Filosofía (Separación de Responsabilidades)

Para evitar que DevHub se convierta en un monstruo redundante, aplicamos el principio DRY a nivel de sistema. Cada pieza tiene un rol estricto:

### 📱 DevHub (La Interfaz / El "Jira" + Multiplexor)

- **Rol:** Front-end, IDE visual, gestor de proyectos.
- **Responsabilidades:**
  - Mostrar Tareas, Kanban, Hitos y progreso visual.
  - Proveer el Grid dinámico de Terminales (`react-resizable-panels`) para trabajar.
  - Ofrecer botones/UI para **disparar** agentes, no para ejecutarlos internamente.

### 🧠 Gentleman AI / Engram (El Cerebro y el Ejecutor)

- **Rol:** El motor de inteligencia, persistencia técnica y ejecución de código.
- **Responsabilidades:**
  - Gestión de memoria a largo plazo (FTS5, Knowledge Graph).
  - Ejecución del pipeline Spec-Driven Development (SDD).
  - Lectura, escritura de archivos, y ejecución de bash nativo/Git.

### 🌉 DevHub MCP (`devhub-mcp/server.js`)

- **Rol:** El "Teléfono" de gestión. Una API que Gentleman AI consume.
- **Responsabilidades:**
  - **SOLO** exponer herramientas de gestión de proyectos (`create_task`, `update_task`, `list_projects`, `update_milestone`).
  - _Debe purgarse_ de herramientas como `read_file`, `write_file`, `git_commit` (que ahora son exclusivas de Gentleman).

---

## 2. El Flujo de Trabajo (Workflow)

¿Cómo colaboran todas estas piezas cuando el usuario quiere hacer algo?

1.  **Planificación (UI):** El usuario crea una tarea en la UI de DevHub: _"Hacer componente de Login"_.
2.  **Delegación:** El usuario hace click en **"Delegar a Agente"**.
3.  **Ejecución (Terminal Grid):** DevHub hace un "Split" automático en el mosaico de terminales y lanza un proceso nativo (Ej: `gentleman task start --sdd --id=login-task`).
4.  **Trabajo (Gentleman):** En ese panel nuevo, vemos a Gentleman AI trabajando: leyendo código, escribiendo y usando la memoria Engram de fondo.
5.  **Cierre (MCP):** Cuando Gentleman termina el código, invoca la herramienta MCP de DevHub: `update_task({ id: "login-task", status: "completed" })`.
6.  **Reflejo Visual:** La UI de DevHub se actualiza mágicamente mostrando la tarea completada en el tablero.

---

## 3. Roadmap de Implementación Inmediata

- [x] **Grid de Terminales V1:** Split Horizontal/Vertical estable (`react-resizable-panels`).
- [x] **Arreglo CSS TUI:** Modificación global de Xterm.js para soportar OpenCode, Vim, etc.
- [ ] **Fase 1: Persistencia UI.** Implementar `localStorage` en `TerminalWorkspacesManager` para no perder las divisiones al recargar (F5).
- [ ] **Fase 1.1: Reopen Session.** Listar sesiones persistentes de OpenCode y permitir reabrirlas en su directorio original desde la UI terminal.
- [ ] **Fase 2: Purga del MCP.** Limpiar `devhub-mcp/server.js` eliminando herramientas de archivos/sistema y dejando solo las de Base de Datos/Proyectos.
- [ ] **Fase 3: El Puente UI-Agente.** Crear el componente de UI en las tareas para ejecutar el subproceso de Gentleman directamente en un panel nuevo de terminal.
