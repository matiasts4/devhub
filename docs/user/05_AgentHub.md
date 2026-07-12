# AgentHub — Centro de Inteligencia Artificial

> **Revisado:** Mayo 2026 — basado en `src/views/AgentHub.jsx`, `src/components/chat/MCPStatusPanel.jsx`, `src/lib/slashSkills.js` y `devhub-mcp/server.js`

---

## ¿Qué es AgentHub?

AgentHub es la interfaz de chat con IA integrada en cada proyecto de DevHub. No es un chat genérico — está conectado directamente a las herramientas MCP del proyecto y puede despachar sub-agentes OpenCode reales que ejecutan código, leen archivos y modifican el proyecto.

---

## Layout de la interfaz

```
┌─────────────────────────────────────────────────────────────────────┐
│  Header: sesión activa · modelo · tokens · MCP toggle · comprimir  │
├──────────────────────────┬──────────────────────────────────────────┤
│                          │                                          │
│   Panel izquierdo        │   Panel derecho (redimensionable)        │
│   (chat principal)       │                                          │
│                          │   [Live] Vista Markdown del sub-agente   │
│   · Historial de         │   [Trazas] Lista de tool calls con       │
│     conversación         │           filtros y búsqueda             │
│   · Mensajes del LLM     │                                          │
│   · Cards de sub-agentes │   MCPStatusPanel                         │
│     con sus trazas       │                                          │
│                          │                                          │
├──────────────────────────┴──────────────────────────────────────────┤
│  AgentStatusBar: agente · modelo · toolcalls · tiempo · tokens     │
├─────────────────────────────────────────────────────────────────────┤
│  ChatInput: textarea · adjuntar archivos · slash commands          │
└─────────────────────────────────────────────────────────────────────┘
```

### Panel derecho — dos modos

- **Live** (por defecto cuando un sub-agente está corriendo): muestra el output de OpenCode renderizado en Markdown en tiempo real
- **Trazas**: lista estructurada de tool calls del sub-agente activo, con filtros por tipo y estado

El ancho del panel izquierdo (chat) es **drag-resizable** y se persiste en `localStorage` (`agenthub_chat_width`).

---

## MCPs disponibles en AgentHub

AgentHub expone **tres MCPs nativos** que el LLM puede invocar directamente mediante tags especiales en su respuesta.

### MCP 1 — DevHub MCP (`execute_devhub`)

Conectado al servidor MCP local (`devhub-mcp/server.js`). Expone una **superficie env-invariant de 32 tools** para proyectos, tareas, evidencia durable, inbox, operaciones y membresía de workspaces. Telegram runtime queda fuera del contrato MCP público.

**Endpoint interno:** `POST /api/mcp/devhub`

#### Herramientas disponibles (32 tools)

**Proyectos**
| Tool | Descripción |
|------|-------------|
| `list_projects` | Lista todos los proyectos (filtrables por estado) |
| `get_project` | Detalles completos: tasks + milestones incluidos |
| `create_project` | Crea un proyecto |
| `update_project` | Actualiza nombre, estado, progreso, color, planning_status |
| `delete_project` | Elimina un proyecto con confirmación explícita |
| `get_project_context` | Lee el planning_prompt y archivos adjuntos del proyecto |

**Tareas**
| Tool | Descripción |
|------|-------------|
| `list_tasks` | Lista tareas filtradas por estado o prioridad |
| `create_task` | Crea nueva tarea con título, descripción, prioridad, fecha |
| `bulk_create_tasks` | Crea tareas idempotentes en lote |
| `update_task` | Modifica estado, prioridad, título, asignación |
| `add_task_comment` | Agrega comentario/nota técnica a una tarea |
| `get_execution_queue` | Devuelve la cola priorizada con bloqueos |

**Hitos**
| Tool | Descripción |
|------|-------------|
| `list_milestones` | Hitos del roadmap (filtro por estado) |
| `create_milestone` | Crea un nuevo hito con fecha y descripción |
| `bulk_create_milestones` | Crea hitos idempotentes en lote |
| `update_milestone` | Actualiza estado, fecha, descripción de un hito |

**Runs / artifacts / inbox**
| Tool | Descripción |
|------|-------------|
| `get_agent_run` | Lee detalle de un run |
| `list_agent_runs` | Lista runs |
| `list_agent_artifacts` | Lista artifacts del run |
| `get_workspace_evidence` | Resume evidencia de workspace/run |
| `list_operator_inbox` | Lista inbox de operador |
| `dismiss_inbox_item` | Descarta item de inbox |

**Workspaces (SW-2.1A)**
| Tool | Descripción |
|------|-------------|
| `list_agent_workspaces` | Lista workspaces y lifecycle del proyecto |
| `get_agent_workspace` | Lee un workspace puntual por `workspace_id` |

**Operaciones y membresía**
| Tool | Descripción |
|------|-------------|
| `devhub_list_actions` | Lista acciones permitidas para el operador |
| `devhub_operate` | Ejecuta una acción permitida por policy |
| `workspace.list` | Lista workspaces del usuario |
| `workspace.create` | Crea un workspace |
| `workspace.members` | Lista miembros |
| `workspace.add_member` | Añade un miembro directo |
| `workspace.update_member_role` | Actualiza el rol de un miembro |
| `workspace.remove_member` | Quita un miembro |

Notas de contrato:

- AgentHub puede leer y mostrar `agent_workspaces`, pero no usa esos tools para ejecutar branch/worktree directamente.
- `cleanup_pending` significa cleanup intent; el ejecutor hace la mutación Git/worktree real.
- `devhub_agent_runs` sigue siendo observer-only para UI/runtime; no reemplaza el ownership durable del workspace.
- Baseline congelado: `f814998dd05cb491caf8637bf570dbd74b539090`; `observed_dirty='dirty-excluded'` se conserva textual.
- Los consumers de AgentHub/Telegram priorizan `workspace_status` y `evidence_ref` para mostrar outcome auditable del workspace.
- Cuando el `current_tool` contenga verbos Git, AgentHub los oculta: **oculta verbos Git** y deja la mutación real del lado del ejecutor.

Fuera del contrato MCP público actual:

- Telegram MCP helpers.
- Ghost tools viejas (`get_dashboard`, `get_next_task`, `register_agent`, `heartbeat_agent`, `unregister_agent`, `update_agent_status`).
- Mutaciones runtime (`claim_next_task`, `renew_task_lease`, `release_task`, `request_supervisor_approval`, `team_tell`, `create/update/report workspace`, `create/complete run`, `append_agent_artifact`).

**Sintaxis en el prompt del LLM:**

```xml
<execute_devhub tool="list_tasks" args='{"project_id":"uuid","status":"pending"}'></execute_devhub>
```

---

### MCP 2 — Engram MCP (`execute_engram`)

Sistema de memoria persistente entre sesiones. Permite al agente guardar y recuperar observaciones, decisiones técnicas y resúmenes de sesión.

**Endpoint interno:** `POST /api/mcp/engram`

#### Herramientas principales

| Tool                  | Descripción                                                      |
| --------------------- | ---------------------------------------------------------------- |
| `mem_save`            | Guarda una observación con tipo, título y contenido estructurado |
| `mem_search`          | Búsqueda full-text en todas las observaciones del proyecto       |
| `mem_context`         | Recupera el contexto reciente de sesiones anteriores             |
| `mem_get_observation` | Lee el contenido completo de una observación por ID              |
| `mem_session_start`   | Registra el inicio de una sesión                                 |
| `mem_session_end`     | Cierra una sesión con resumen                                    |
| `mem_session_summary` | Guarda un resumen estructurado de la sesión                      |
| `mem_update`          | Actualiza una observación existente por ID                       |

**Sintaxis en el prompt del LLM:**

```xml
<execute_engram tool="mem_search" args='{"query":"auth middleware","project":"devhub"}'></execute_engram>
```

---

### MCP 3 — OpenCode Sub-Agentes (`execute_opencode`)

Despacha un sub-agente OpenCode real que corre de forma headless. Tiene acceso completo al filesystem, puede ejecutar comandos, leer/escribir archivos y usar herramientas del entorno.

**Endpoint interno:** `POST /api/agenthub/headless`

**Perfiles de agente disponibles** (configurados en `opencode.json`):

| Perfil                                        | Descripción                            |
| --------------------------------------------- | -------------------------------------- |
| `worker-claude-1`                             | Agente principal, modelo Claude        |
| `worker-gemini-1`                             | Agente con Gemini, bueno para análisis |
| _(los perfiles dependen de tu opencode.json)_ |                                        |

**Sintaxis en el prompt del LLM:**

```xml
<execute_opencode agent="worker-claude-1">
  Revisá el archivo src/components/Header.jsx y corregí el warning de React key
</execute_opencode>
```

El orquestador detecta este tag en la respuesta del LLM e inicia automáticamente la ejecución headless. Las trazas aparecen en tiempo real en el panel derecho via SSE.

---

## Panel MCPStatusPanel — servidores conectados

El botón **MCP** en el header del chat abre el `MCPStatusPanel`, que muestra:

- Cada servidor MCP conectado (nombre, estado: `connected` / `disconnected` / `error`)
- Cantidad de tools registradas por servidor
- Expandiendo cada servidor: la lista completa de tools con nombre y descripción

Para refrescar el estado: botón **↺** en el panel, o automáticamente al cargar AgentHub (fetch a `/api/agenthub/mcp/status`).

---

## Slash Commands disponibles

Escribí `/` en el chat para abrir el menú de slash commands. Se puede filtrar escribiendo el nombre del comando.

### Categoría: SDD (Spec-Driven Development)

| Comando        | Descripción                                         |
| -------------- | --------------------------------------------------- |
| `/sdd-explore` | Investiga el codebase, compara enfoques             |
| `/sdd-propose` | Crea una propuesta de cambio                        |
| `/sdd-spec`    | Define requisitos y escenarios de aceptación        |
| `/sdd-design`  | Diseño técnico con decisiones de arquitectura       |
| `/sdd-tasks`   | Desglose en tareas atómicas implementables          |
| `/sdd-apply`   | Implementa las tareas siguiendo las specs           |
| `/sdd-verify`  | Valida que la implementación coincida con las specs |
| `/sdd-archive` | Cierra el cambio y sincroniza specs delta           |

> **Aclaración importante para Swarm Workspace:** estas slash commands representan **fases/workflows SDD** y capacidades reutilizables para workers. No equivalen al supervisor persistente del Swarm. El supervisor durable, con leases, claims, workspaces, runs/artifacts y recovery, pertenece al control plane de DevHub.

### Categoría: MCP

| Comando   | Descripción                                   |
| --------- | --------------------------------------------- |
| `/engram` | Invoca el MCP de Engram (memoria persistente) |

### Categoría: Skills

| Comando           | Descripción                                        |
| ----------------- | -------------------------------------------------- |
| `/branch-pr`      | Crea un PR siguiendo el sistema issue-first        |
| `/issue-creation` | Reporta un bug o solicita una feature              |
| `/judgment-day`   | Revisión adversarial con dos jueces independientes |
| `/go-testing`     | Patrones de testing para Go + Bubbletea            |
| `/skill-creator`  | Crea una nueva skill de IA                         |

### Categoría: UX/UI

| Comando                 | Descripción                                                      |
| ----------------------- | ---------------------------------------------------------------- |
| `/ui-ux-pro-max`        | 50+ estilos, paletas, font pairings, 9 stacks                    |
| `/react-best-practices` | 40+ reglas de optimización React/Next.js                         |
| `/senior-frontend`      | React, Next.js, TypeScript, Tailwind — scaffolding y performance |

---

## Ciclo de vida de un sub-agente

```
Usuario envía mensaje
       │
       ▼
LLM genera respuesta con <execute_opencode>
       │
       ▼
AgentHub detecta el tag → dispatchOpenCode()
       │
       ▼
POST /api/agenthub/headless → inicia sesión OpenCode
       │
       ▼
Crea subagent message en DB (status: 'running')
       │
       ▼
SSE stream ← trazas en tiempo real (tool calls)
       │
       ▼
Poll cada 2s → /api/agenthub/sessions/{id}/status
       │
       ▼
Status = 'completed' | 'error' | 'aborted'
       │
       ▼
LLM recibe SYSTEM NOTIFICATION con resultado
       │
       ▼
LLM responde al usuario con resumen de lo ejecutado
```

## Cómo encaja AgentHub con Swarm Workspace

AgentHub puede disparar perfiles OpenCode y fases/workflows SDD como ejecuciones especializadas. Eso sirve para:

- investigación (`sdd-explore`),
- implementación (`sdd-apply`),
- verificación (`sdd-verify`),
- y otras capacidades skill-driven.

Pero esos disparos siguen siendo **subagent/execution profile/package** o **skill/capability**. No son el supervisor persistente del Swarm.

Si una corrida participa de Swarm Workspace, el source of truth operativo debe seguir siendo DevHub: task claim, runtime role, runtime state, `agent_workspaces`, artifacts y recovery. Los mapas runtime como `devhub_agent_runs` son observer-only.

Cuando el estado de QA o ejecución indique `cleanup intent`, AgentHub debe interpretarlo como transición a `cleanup_pending` reportada por DevHub, no como evidencia de que DevHub haya corrido Git.

---

## Ajustes de sesión persistidos en localStorage

| Key                                 | Valor                                            |
| ----------------------------------- | ------------------------------------------------ |
| `agenthub_model_override`           | Modelo LLM seleccionado manualmente              |
| `agenthub_chat_width`               | Ancho del panel de chat en px                    |
| `agenthub_last_session_{projectId}` | ID de la última sesión activa _(sessionStorage)_ |
