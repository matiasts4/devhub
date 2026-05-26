# DevHub MCP Server

Servidor MCP local para el control plane de DevHub.

**Baseline soportado:** 36 tools MCP. Telegram queda fuera del contrato público MCP; cualquier runtime o storage interno de Telegram sigue fuera de esta superficie.

---

## Setup rápido

```bash
cd devhub-mcp
npm install
npm start
```

Desde la raíz del repo también podés ejecutar:

```bash
node devhub-mcp/server.js
```

Si ves `✅ DevHub MCP Server iniciado (stdio)`, el servidor arrancó bien.

---

## Configuración en clientes MCP

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

## Supported MCP Contract (36 tools)

Esta tabla es la fuente de verdad del contrato MCP soportado hoy.

| Tool                          | Category             | CLI Equivalent | Notes                     |
| ----------------------------- | -------------------- | -------------- | ------------------------- |
| `list_projects`               | crud                 | —              | MCP-owned                 |
| `get_project`                 | crud                 | —              | MCP-owned                 |
| `create_project`              | crud                 | —              | MCP-owned                 |
| `update_project`              | crud                 | —              | MCP-owned                 |
| `delete_project`              | crud                 | —              | MCP-owned                 |
| `list_tasks`                  | crud                 | —              | MCP-owned                 |
| `create_task`                 | crud                 | —              | MCP-owned                 |
| `bulk_create_tasks`           | crud                 | —              | MCP-owned                 |
| `update_task`                 | crud                 | —              | MCP-owned                 |
| `add_task_comment`            | crud                 | —              | MCP-owned                 |
| `list_milestones`             | crud                 | —              | MCP-owned                 |
| `create_milestone`            | crud                 | —              | MCP-owned                 |
| `bulk_create_milestones`      | crud                 | —              | MCP-owned                 |
| `update_milestone`            | crud                 | —              | MCP-owned                 |
| `get_execution_queue`         | portable-contract    | —              | Stable execution contract |
| `claim_next_task`             | portable-contract    | —              | Stable execution contract |
| `renew_task_lease`            | portable-contract    | —              | Stable execution contract |
| `release_task`                | portable-contract    | —              | Stable execution contract |
| `request_supervisor_approval` | portable-contract    | —              | Stable execution contract |
| `team_tell`                   | portable-contract    | —              | Stable execution contract |
| `prepare_agent_workspace`     | external-integration | —              | Workspace lifecycle       |
| `list_agent_workspaces`       | external-integration | —              | Workspace lifecycle       |
| `get_agent_workspace`         | external-integration | —              | Workspace lifecycle       |
| `create_agent_workspace`      | external-integration | —              | Workspace lifecycle       |
| `update_agent_workspace`      | external-integration | —              | Workspace lifecycle       |
| `report_agent_workspace`      | external-integration | —              | Workspace lifecycle       |
| `create_agent_run`            | external-integration | —              | Run lifecycle             |
| `get_agent_run`               | external-integration | —              | Run lifecycle             |
| `list_agent_runs`             | external-integration | —              | Run lifecycle             |
| `complete_agent_run`          | external-integration | —              | Run lifecycle             |
| `append_agent_artifact`       | external-integration | —              | Artifact tracking         |
| `list_agent_artifacts`        | external-integration | —              | Artifact tracking         |
| `get_workspace_evidence`      | external-integration | —              | Evidence projection       |
| `get_project_context`         | external-integration | —              | Planning context          |
| `list_operator_inbox`         | external-integration | —              | Operator inbox            |
| `dismiss_inbox_item`          | external-integration | —              | Operator inbox            |

### Category definitions

- **crud**: gestión MCP-owned de proyectos, tareas y hitos.
- **portable-contract**: contrato estable para cola, leases, aprobaciones y team messaging.
- **external-integration**: workspaces, runs, artifacts, inbox y contexto operativo que no vive como comando CLI portable.

### Explicitly not part of the supported MCP contract

- Telegram MCP helpers.
- Legacy CLI-duplicate ghost tools (`get_dashboard`, `get_next_task`, `register_agent`, `heartbeat_agent`, `unregister_agent`, `update_agent_status`).

Si alguna de esas superficies vuelve, debe hacerlo como cambio nuevo de contrato, no como comportamiento implícito por variables de entorno viejas.

---

## Portable client contract

Si estás construyendo un cliente portable, esta es la parte más estable del contrato:

| Tool                          | Purpose                                              |
| ----------------------------- | ---------------------------------------------------- |
| `get_execution_queue`         | Obtener cola priorizada con dependencias bloqueantes |
| `claim_next_task`             | Reclamar la siguiente tarea con lease                |
| `renew_task_lease`            | Renovar lease activo                                 |
| `release_task`                | Liberar lease con outcome                            |
| `request_supervisor_approval` | Crear checkpoint de aprobación                       |
| `team_tell`                   | Enviar directivas durables al equipo                 |

---

## Agent workflow recomendado

1. Orientarte con `list_projects` o `get_project_context`.
2. Revisar la cola con `get_execution_queue`.
3. Reclamar trabajo con `claim_next_task`.
4. Preparar `agent_workspace` / `agent_run` si el flujo lo necesita.
5. Reportar progreso con `add_task_comment`, `report_agent_workspace`, `append_agent_artifact` y `update_task`.

La registración runtime del agente, heartbeats y cualquier integración Telegram viven fuera de este contrato MCP público.

---

## Tests

```bash
npm test
npm run mcp:smoke
```

---

## Notas

- El servidor usa `src/lib/db/localDb.js` como capa compartida.
- El smoke test valida el catálogo exacto de 36 tools.
- El contrato público es env-invariant: `TELEGRAM_BOT_TOKEN` ya no cambia `tools/list`.
