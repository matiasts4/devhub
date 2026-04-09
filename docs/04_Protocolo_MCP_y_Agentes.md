---
Fecha de Modificación: 28 de marzo de 2026
Changelog:
  - 2026-03-28 v1: Creación del documento base definiendo las reglas del Protocolo MCP.
  - 2026-03-28 v2: Actualización con herramientas completas implementadas. Añadido módulo Planning IA y tabla de tools actualizada con 13 herramientas.
---

# 04 Protocolo MCP y Agentes

Este documento describe la arquitectura y las reglas de integración del **Model Context Protocol (MCP)** en DevHub, así como la división de tareas entre los diferentes Agentes IA para evitar colisiones y asegurar un desarrollo modular.

## 🤖 Arquitectura MCP en DevHub

El Servidor MCP (`devhub-mcp/server.js`) funciona como la espina dorsal del **IDE de Desarrollo Local** propuesto. Expone un conjunto de herramientas locales a cualquier cliente compatible (como Antigravity), permitiendo a la IA interactuar con el ecosistema del proyecto y el entorno del ordenador anfitrión.

El alcance del Servidor MCP se divide en **cinco grandes módulos**:

1. **Gestión de Proyectos (Kanban + Supabase):** Crear, leer, actualizar y borrar proyectos, tareas e hitos. ✅
2. **Sistema de Archivos (File System):** Leer, explorar y escribir archivos en el directorio de trabajo local. ✅
3. **Ejecución de Comandos en Terminal:** Lanzar scripts y herramientas CLI via `child_process`. ✅
4. **Control de Versiones (Git):** Crear ramas aisladas, commitear, revisar diffs para QA. ✅
5. **Planning IA:** Leer contexto completo de un proyecto (archivos + prompt) para generar planificación exhaustiva. ✅

---

## 🛠️ Tabla de Herramientas MCP (13 tools activas)

| Tool                      | Módulo         | Descripción                                                          |
| ------------------------- | -------------- | -------------------------------------------------------------------- |
| `list_projects`           | Proyectos      | Lista todos los proyectos (filtro por estado)                        |
| `get_project`             | Proyectos      | Detalles completos + tareas + hitos                                  |
| `update_project`          | Proyectos      | Actualiza nombre, estado, progreso, color, documentation_policy      |
| `list_tasks`              | Tareas         | Tareas de un proyecto (filtro estado/prioridad)                      |
| `create_task`             | Tareas         | Crea nueva tarea con milestone_id opcional                           |
| `update_task`             | Tareas         | Cambia estado, prioridad, milestone de tarea                         |
| `delete_task`             | Tareas         | Elimina tarea (irreversible)                                         |
| `list_milestones`         | Hitos          | Hitos del roadmap                                                    |
| `create_milestone`        | Hitos          | Crea nuevo hito                                                      |
| `update_milestone`        | Hitos          | Actualiza estado/fecha de hito                                       |
| `get_dashboard`           | Global         | Resumen global de todos los proyectos                                |
| `explore_files`           | FS             | Explora directorio local del proyecto                                |
| `read_file`               | FS             | Lee contenido de un archivo local                                    |
| `write_file`              | FS             | Escribe/sobreescribe archivo local                                   |
| `mkdir_p`                 | FS             | Crea directorio recursivamente                                       |
| `run_terminal_command`    | CLI            | Ejecuta comando shell en background                                  |
| `git_branch`              | Git            | Crea/cambia a rama aislada                                           |
| `git_commit`              | Git            | Hace commit con los cambios actuales                                 |
| `git_diff_review`         | Git            | Revisa diff entre rama y main (QA)                                   |
| `get_project_context`     | Planning IA ⭐ | Lee planning_prompt + documentation_policy + todos los project_files |
| `mark_planning_done`      | Planning IA ⭐ | Marca planning_status = 'completed'                                  |
| `spawn_background_worker` | Swarm          | Despacha proceso en segundo plano                                    |

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
   b. create_milestone() × N               → crea 5-8 hitos
   c. create_task() × 40-60+              → crea tareas exhaustivas
   d. mark_planning_done({ project_id })   → marca completado
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
> `get_project_context` ya devuelve `documentation_policy`, `documentation_policy_summary` y `documentation_policy_metadata` para que el gate pueda decidir sin inferencias.

---

## 🏗️ División de Agents por Módulo

### 1. **Planning Agent (Controller)**

- **Responsabilidad:** Leer contexto completo con `get_project_context`, generar plan exhaustivo de 40-60+ tareas usando `create_milestone` y `create_task`, cerrar con `mark_planning_done`.
- **Restricción:** No modifica código fuente — solo opera sobre Supabase vía MCP.

### 2. **Worker Agent**

- **Responsabilidad:** Ejecutar tareas individuales del plan. Opera en rama Git aislada (`git_branch`), commitea cambios (`git_commit`), actualiza docs.
- **Regla obligatoria:** Debe actualizar `/docs` antes de marcar su tarea como completada.
- **Ámbito:** Código fuente + MCP tools de FS y Git.

### 3. **QA Agent**

- **Responsabilidad:** Inspeccionar el diff de la rama del Worker (`git_diff_review`), verificar que docs estén actualizados, aprobar o rechazar el merge.
- **Ámbito:** Solo lectura de branches + operaciones de merge.

---

> [!CAUTION]
> **Norma de Agentes Múltiples:** Siempre que un Agente comience a trabajar en su módulo, deberá actualizar el documento `06_QA_y_Verificacion.md` bajo el título de la tarea en curso y marcarlo con `[🚧 TRABAJANDO por Agente X]`.
