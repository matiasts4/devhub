---
Fecha de Modificación: 15 de mayo de 2026
Changelog:
  - 2026-03-28 v1: Creación del documento base definiendo las reglas del Protocolo MCP.
  - 2026-03-28 v2: Actualización con herramientas completas implementadas. Añadido módulo Planning IA y tabla de tools actualizada con 13 herramientas.
  - 2026-05-14 v3: Alineación documental con Swarm Workspace: capas runtime, reuso de assets SDD y boundary del supervisor durable.
  - 2026-05-15 v4: MCP redefinido explícitamente como control plane. Git/filesystem/terminal pasan a capability del ejecutor y se actualiza el catálogo operativo real.
---

# 04 Protocolo MCP y Agentes

Este documento describe la arquitectura y las reglas de integración del **Model Context Protocol (MCP)** en DevHub, así como la división de tareas entre los diferentes Agentes IA para evitar colisiones y asegurar un desarrollo modular.

> **Alineación vigente:** DevHub debe **reusar los assets SDD existentes** (fases, subagents/perfiles y skills) como capacidades operativas, pero el orquestador SDD actual de OpenCode **NO es el supervisor persistente del Swarm**. El supervisor real necesita control plane durable propio de DevHub.

## 🤖 Arquitectura MCP en DevHub

El Servidor MCP (`devhub-mcp/server.js`) funciona como el **control plane operacional** de DevHub. Expone herramientas de estado, roadmap, cola, leases, comentarios y registro de agentes a cualquier cliente compatible.

> **Boundary vigente:** Git, filesystem, terminal, tests y PRs **no** viven en el DevHub MCP general. Esas operaciones pertenecen a la capability/skill del ejecutor (OpenCode, Hermes, editor, runner, etc.).

El alcance del Servidor MCP se divide en **cinco grandes módulos**:

1. **Gestión de Proyectos:** CRUD y estado general del proyecto. ✅
2. **Gestión de Tareas/Hitos:** backlog, comments y roadmap. ✅
3. **Planning IA:** contexto completo del proyecto para planificación exhaustiva. ✅
4. **Swarm Runtime State:** cola priorizada, claims, leases y release de tareas. ✅
5. **Agent Registry:** heartbeat, status y presencia de agentes. ✅

---

## 🛠️ Tabla de Herramientas MCP (contrato operativo vigente)

Esta tabla resume el catálogo real del DevHub MCP. La surface general de Git/filesystem/terminal queda fuera de este servidor.

| Tool                     | Módulo         | Descripción                                                 |
| ------------------------ | -------------- | ----------------------------------------------------------- |
| `list_projects`          | Proyectos      | Lista todos los proyectos (filtro por estado)               |
| `get_project`            | Proyectos      | Detalles completos + tareas + hitos                         |
| `update_project`         | Proyectos      | Actualiza nombre, estado, progreso, color y planning_status |
| `create_project`         | Proyectos      | Crea un nuevo proyecto                                      |
| `delete_project`         | Proyectos      | Elimina un proyecto con confirmación explícita              |
| `list_tasks`             | Tareas         | Tareas de un proyecto (filtro estado/prioridad)             |
| `create_task`            | Tareas         | Crea nueva tarea con milestone_id opcional                  |
| `bulk_create_tasks`      | Tareas         | Crea tareas en lote de forma idempotente                    |
| `update_task`            | Tareas         | Cambia estado, prioridad, milestone o asignación de tarea   |
| `add_task_comment`       | Tareas         | Añade comentario técnico o de QA a una tarea                |
| `get_next_task`          | Tareas/Swarm   | Devuelve y marca en progreso la siguiente tarea priorizada  |
| `get_execution_queue`    | Tareas/Swarm   | Devuelve cola scoreada de tareas y bloqueos                 |
| `claim_next_task`        | Tareas/Swarm   | Reclama tarea de forma segura para un agente                |
| `renew_task_lease`       | Tareas/Swarm   | Renueva el lease de una tarea reclamada                     |
| `release_task`           | Tareas/Swarm   | Libera una tarea reclamada con outcome operativo            |
| `list_milestones`        | Hitos          | Hitos del roadmap                                           |
| `create_milestone`       | Hitos          | Crea nuevo hito                                             |
| `bulk_create_milestones` | Hitos          | Crea hitos en lote de forma idempotente                     |
| `update_milestone`       | Hitos          | Actualiza estado/fecha/asignación de hito                   |
| `get_dashboard`          | Global         | Resumen global de todos los proyectos                       |
| `get_project_context`    | Planning IA ⭐ | Lee planning_prompt + todos los project_files               |
| `register_agent`         | Swarm          | Registra o actualiza un agente Worker                       |
| `heartbeat_agent`        | Swarm          | Renueva señal de vida de un agente                          |
| `unregister_agent`       | Swarm          | Elimina un agente del registry                              |
| `update_agent_status`    | Swarm          | Actualiza estado visible del agente                         |

---

## 🧭 Capas operativas canónicas

Para que la documentación no mezcle conceptos, DevHub debe diferenciar estas capas:

| Capa                                   | Definición                                        | Ejemplos                                                                         |
| -------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------- |
| **workflow phase**                     | fase de workflow/metodología                      | `sdd-explore`, `sdd-apply`, `sdd-verify`                                         |
| **subagent/execution profile/package** | perfil o paquete que ejecuta una corrida concreta | perfil OpenCode headless, worker profile, wrapper especializado                  |
| **skill/capability**                   | capacidad reusable que un worker puede cargar     | `sdd-apply`, `frontend-testing`, `go-testing`                                    |
| **canonical runtime role**             | rol canónico dentro del Swarm                     | `supervisor`, `planner`, `implementer`, `reviewer`, `qa`, `docs`, `researcher`   |
| **runtime state**                      | estado vivo persistido/observado por DevHub       | `idle`, `claiming`, `working`, `blocked`, `reviewing`, `failed`, `done`, `stale` |

### Roles runtime canónicos

- `supervisor`: coordina cola, leases, retries, recovery y handoffs.
- `planner`: convierte contexto/producto en milestones, tasks o planes.
- `implementer`: ejecuta cambios de código/docs según tarea reclamada.
- `reviewer`: revisa diffs, contratos y evidencia técnica.
- `qa`: valida tests, criterios de aceptación y evidencia.
- `docs`: mantiene documentación alineada con comportamiento real.
- `researcher`: investiga código, dependencias, riesgos o alternativas.

### Boundary del supervisor

**Do NOT reuse the current OpenCode SDD orchestrator as the persistent Swarm supervisor/control-plane.**

Motivo: el Swarm necesita un **control plane durable** con ownership de DevHub sobre:

- leases y expiración;
- claim tokens;
- workspaces/worktrees;
- agent runs y artifacts;
- recovery/reconciliation;
- políticas de retry/escalation;
- reconstrucción de estado desde DB/eventos.

El orquestador SDD actual sirve como fase o ejecución especializada, pero no como fuente durable de verdad del sistema.

### Reuso práctico de SDD dentro del Swarm

La guía correcta es **reusar los assets SDD existentes** sin copiar/reinventar upstream si se puede evitar:

- usar fases SDD como workflow phase para workers;
- usar perfiles/subagents OpenCode como execution packages;
- usar skills como capabilities cargables;
- agregar adapters/wrappers sólo cuando haya que traducir contexto, contratos o artifacts al modelo DevHub.

Ejemplos sanos:

- `implementer` ejecuta `sdd-apply` dentro de un workspace preparado por DevHub;
- `reviewer` o `qa` ejecuta `sdd-verify` con artifacts/runs guardados en DevHub;
- `researcher` usa `sdd-explore` para producir contexto previo a una claim crítica.

Ejemplo NO permitido:

- tratar al orchestrator SDD de OpenCode como supervisor persistente del Swarm.

---

## 🗂️ Flujo de Uso — Planning IA (Caso de uso principal)

Cuando un usuario crea un proyecto con Planning IA habilitado, el flujo es:

```
1. Usuario crea proyecto → planning_status = 'pending'
2. Sube archivos de contexto → project_files[] en Supabase
3. Escribe planning_prompt detallado
4. Copia el "Prompt de Agente" generado por PlanningMode.jsx
5. Envía el prompt a Antigravity
6. Antigravity ejecuta:
   a. get_project_context({ project_id })   → lee todo el contexto
   b. bulk_create_milestones() o create_milestone() × N → crea 5-8 hitos
   c. bulk_create_tasks() o create_task() × 40-60+    → crea tareas exhaustivas
   d. update_project({ project_id, planning_status: "completed" }) → marca completado
7. Usuario ve Roadmap y Tareas poblados
```

> [!IMPORTANT]
> El planning exhaustivo debe generar **mínimo 40 tareas** distribuidas en los milestones. Si el proyecto es complejo, se deben hacer múltiples rondas de `create_task` hasta cubrir todas las áreas: Setup, Arquitectura, DB, Backend, Frontend (por pantalla), Integraciones, Testing, DevOps, Documentación, Performance, Seguridad, Monitoreo.

### Gate de clasificación documental

Antes de reescribir documentación, el agente debe respetar `documentation_policy`:

- `personal` / `DevHub` → aplica el flujo DevHub de documentación y planning.
- `shared_legacy` → preserva la documentación legacy y no la transforma por defecto.
- `archive_only` → primero archiva la documentación legacy y después crea docs DevHub nuevas.

Si la policy falta o es ambigua, el agente debe preguntar antes de seguir.
Los proyectos compartidos no se fuerzan al formato DevHub por defecto.
Los docs legacy importados se archivan, no se sobrescriben.

> [!NOTE]
> `get_project_context` devuelve `planning_prompt`, `planning_status` y los
> archivos de contexto. El gate documental avanzado debe validarse en el flujo
> de planning o agregarse explícitamente al MCP si se necesita como contrato.

---

## 🏗️ División de Agents por Módulo

> Nota histórica: la división siguiente describe una vista temprana. Para Swarm Workspace, los roles runtime canónicos y el control plane durable de DevHub tienen prioridad interpretativa.

### 1. **Planning Agent (Controller)**

- **Responsabilidad:** Leer contexto completo con `get_project_context`, generar plan exhaustivo de 40-60+ tareas usando `create_milestone`/`bulk_create_milestones` y `create_task`/`bulk_create_tasks`, cerrar con `update_project({ planning_status: "completed" })`.
- **Restricción:** No modifica código fuente — solo opera sobre Supabase vía MCP.

### 2. **Worker Agent**

- **Responsabilidad:** Ejecutar tareas individuales del plan usando la capability del ejecutor para código/docs/Git/tests y DevHub MCP para task state, comments, claims y leases.
- **Regla obligatoria:** Debe actualizar la documentación relevante y registrar comments operativos (`[git:start]`, `[git:checkpoint]`, `[git:qa-ready]`).
- **Ámbito:** Branch/workspace aislado + control plane DevHub. Git no sale del MCP general.

### 3. **QA Agent**

- **Responsabilidad:** Inspeccionar branch/diff/PR/artifacts del Worker, validar docs, checks y chronology, y emitir veredicto antes de la integración.
- **Ámbito:** DevHub comments/task state + capability del ejecutor para diff/checks. La integración a `main` requiere aprobación humana y la ruta aprobada por el repo.

---

> [!CAUTION]
> **Norma de Agentes Múltiples:** Toda tarea en curso debe quedar reflejada en el control plane de DevHub (estado, comments, agent status, leases). `06_QA_y_Verificacion.md` puede usarse como apoyo documental, pero no reemplaza la cronología operativa canónica.
