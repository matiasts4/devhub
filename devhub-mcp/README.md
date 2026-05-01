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

### Proyectos

| Herramienta      | Descripción                                        |
| ---------------- | -------------------------------------------------- |
| `list_projects`  | Lista todos los proyectos (filtro por estado)      |
| `get_project`    | Detalles completos de un proyecto + tareas + hitos |
| `update_project` | Actualiza nombre, estado, progreso, color          |

### Tareas

| Herramienta              | Descripción                                         |
| ------------------------ | --------------------------------------------------- |
| `list_tasks`             | Tareas de un proyecto (filtro por estado/prioridad) |
| `create_task`            | Crea una nueva tarea                                |
| `update_task`            | Cambia estado, prioridad, título de una tarea       |
| `add_task_comment`       | Añade comentario a una tarea                        |
| `delete_task`            | Elimina una tarea                                   |
| `create_task_dependency` | Crea relación de bloqueo entre tareas               |
| `get_task_dependencies`  | Devuelve dependencias de una tarea                  |
| `get_next_task`          | Siguiente tarea priorizada para un agente           |

### Hitos

| Herramienta        | Descripción                       |
| ------------------ | --------------------------------- |
| `list_milestones`  | Hitos del roadmap                 |
| `create_milestone` | Crea un nuevo hito                |
| `update_milestone` | Actualiza estado/fecha de un hito |

### Dashboard

| Herramienta     | Descripción                           |
| --------------- | ------------------------------------- |
| `get_dashboard` | Resumen global de todos los proyectos |

### Planning / Contexto

| Herramienta           | Descripción                                  |
| --------------------- | -------------------------------------------- |
| `get_project_context` | Lee contexto de planificación de un proyecto |
| `mark_planning_done`  | Marca el planning como completado            |
| `validate_topic_key`  | Valida topic_key para engram                 |
| `build_context_pack`  | Construye Context Pack para documentación    |

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

## Tests

```bash
npm test
npm run test:coverage
```

---

## Notas

- El servidor usa `localDb` compartido con la app Next.js (`src/lib/db/localDb.js`)
- Las tablas se crean automáticamente al iniciar (`ensureLocalMcpTables`)
- Soporta IDs UUID y IDs legacy (`tipo-timestamp-suffix`)
