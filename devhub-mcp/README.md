# DevHub MCP Server

Servidor MCP local que expone herramientas de DevHub a agentes AI (OpenCode, Claude, etc.).

**Sin API key externa** — se conecta directamente a SQLite local (local-first).

---

## Setup: 2 pasos

### 1. Instalar dependencias

```bash
cd devhub-mcp
npm install
```

### 2. Iniciar el servidor

```bash
npm start
# o desde la raíz del proyecto:
node devhub-mcp/server.js
```

Si ves `✅ DevHub MCP Server iniciado (stdio)` el servidor funciona correctamente.

---

## Configuración en clientes MCP

### OpenCode

Registrar el servidor en tu configuración MCP:

```json
{
  "mcpServers": {
    "devhub": {
      "command": "node",
      "args": ["/ruta/a/devhub/devhub-mcp/server.js"]
    }
  }
}
```

---

## Herramientas disponibles (23 total)

Este catálogo es la superficie oficial actual del MCP. Las herramientas de
filesystem, terminal, git y context packs no forman
parte de este servidor todavía. Las operaciones bulk y la cola de ejecución sí
están incluidas para planning/roadmap.

### Proyectos

| Herramienta      | Descripción                                        |
| ---------------- | -------------------------------------------------- |
| `list_projects`  | Lista todos los proyectos (filtro por estado)      |
| `get_project`    | Detalles completos de un proyecto + tareas + hitos |
| `update_project` | Actualiza nombre, estado, progreso, color          |
| `create_project` | Crea un nuevo proyecto                             |
| `delete_project` | Elimina un proyecto con confirmación explícita     |

### Tareas

| Herramienta           | Descripción                                         |
| --------------------- | --------------------------------------------------- |
| `list_tasks`          | Tareas de un proyecto (filtro por estado/prioridad) |
| `create_task`         | Crea una nueva tarea                                |
| `bulk_create_tasks`   | Crea múltiples tareas idempotentes para planning    |
| `update_task`         | Cambia estado, prioridad, título de una tarea       |
| `add_task_comment`    | Añade comentario a una tarea                        |
| `get_next_task`       | Wrapper compatible que reclama la siguiente tarea   |
| `get_execution_queue` | Cola scoreada de tareas disponibles                 |
| `claim_next_task`     | Reclama la siguiente tarea con lease y token        |
| `renew_task_lease`    | Renueva el lease activo de una tarea reclamada      |
| `release_task`        | Libera el lease y aplica outcome operativo          |

### Hitos

| Herramienta              | Descripción                       |
| ------------------------ | --------------------------------- |
| `list_milestones`        | Hitos del roadmap                 |
| `create_milestone`       | Crea un nuevo hito                |
| `bulk_create_milestones` | Crea múltiples hitos idempotentes |
| `update_milestone`       | Actualiza estado/fecha de un hito |

### Dashboard

| Herramienta     | Descripción                           |
| --------------- | ------------------------------------- |
| `get_dashboard` | Resumen global de todos los proyectos |

### Planning / Contexto

| Herramienta           | Descripción                                  |
| --------------------- | -------------------------------------------- |
| `get_project_context` | Lee contexto de planificación de un proyecto |

### Swarm v2 (Agentes)

| Herramienta           | Descripción                           |
| --------------------- | ------------------------------------- |
| `register_agent`      | Registra un agente Worker en el swarm |
| `heartbeat_agent`     | Renueva señal de vida del agente      |
| `unregister_agent`    | Elimina un agente del registry        |
| `update_agent_status` | Actualiza estado visual del agente    |

---

## Arquitectura

- **Base de datos**: SQLite local-first (vía `better-sqlite3`)
- **Protocolo**: MCP sobre stdio
- **Query Builder**: `LocalQueryBuilder` (compatible con API de Supabase)
- **Sin dependencias externas**: No requiere Supabase, OpenAI, ni API keys

---

## Flujo recomendado para agentes

- Ver `AGENT-FLOW.md` para cuándo usar DevHub MCP junto a Engram/Graphify.
- Ver `AGENT-INSTRUCTIONS.md` para instrucciones copiables a agentes.
- Ver `CLIENT-CONFIGS.md` para configurar OpenCode, Codex, VS Code/Windsurf y clientes compatibles.

---

## Tests

```bash
npm test
npm run test:coverage
npm run mcp:smoke
```

---

## Notas

- El servidor usa `localDb` compartido con la app Next.js (`src/lib/db/localDb.js`)
- Las tablas se crean automáticamente al iniciar (`ensureLocalMcpTables`)
- Soporta IDs UUID y IDs legacy (`tipo-timestamp-suffix`)
