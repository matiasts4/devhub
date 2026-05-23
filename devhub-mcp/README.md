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

## Ownership Matrix (45 tools)

Every MCP tool is classified into exactly one category. This table is the authoritative source for the MCP vs CLI ownership boundary.

| Tool | Category | CLI Equivalent | Notes |
|------|----------|----------------|-------|
| `list_projects` | crud | — | MCP-owned |
| `get_project` | crud | — | MCP-owned |
| `create_project` | crud | — | MCP-owned |
| `update_project` | crud | — | MCP-owned |
| `delete_project` | crud | — | MCP-owned |
| `list_tasks` | crud | — | MCP-owned |
| `create_task` | crud | — | MCP-owned |
| `bulk_create_tasks` | crud | — | MCP-owned |
| `update_task` | crud | — | MCP-owned |
| `add_task_comment` | crud | — | MCP-owned |
| `list_milestones` | crud | — | MCP-owned |
| `create_milestone` | crud | — | MCP-owned |
| `bulk_create_milestones` | crud | — | MCP-owned |
| `update_milestone` | crud | — | MCP-owned |
| `get_execution_queue` | portable-contract | — | Stable across CLI changes |
| `claim_next_task` | portable-contract | — | Stable across CLI changes |
| `renew_task_lease` | portable-contract | — | Stable across CLI changes |
| `release_task` | portable-contract | — | Stable across CLI changes |
| `request_supervisor_approval` | portable-contract | — | Stable across CLI changes |
| `team_tell` | portable-contract | — | Stable across CLI changes |
| `get_dashboard` | deprecated | `devhub status` | Advisory — still functional |
| `get_next_task` | deprecated | `devhub claim` | Advisory — still functional |
| `register_agent` | deprecated | `devhub agents register` | Advisory — still functional |
| `heartbeat_agent` | deprecated | `devhub heartbeat` | Advisory — still functional |
| `unregister_agent` | deprecated | CLI (future) | Advisory — still functional |
| `update_agent_status` | deprecated | `devhub update-status` | Advisory — still functional |
| `record_telegram_adapter_intent` | external-integration | — | Telegram integration |
| `record_telegram_delivery` | external-integration | — | Telegram integration |
| `set_telegram_subscription` | external-integration | — | Telegram integration |
| `respond_telegram_approval` | external-integration | — | Telegram integration |
| `get_telegram_channel_snapshot` | external-integration | — | Telegram integration |
| `prepare_agent_workspace` | external-integration | — | Workspace lifecycle |
| `list_agent_workspaces` | external-integration | — | Workspace lifecycle |
| `get_agent_workspace` | external-integration | — | Workspace lifecycle |
| `create_agent_workspace` | external-integration | — | Workspace lifecycle |
| `update_agent_workspace` | external-integration | — | Workspace lifecycle |
| `report_agent_workspace` | external-integration | — | Workspace lifecycle |
| `create_agent_run` | external-integration | — | Run lifecycle |
| `get_agent_run` | external-integration | — | Run lifecycle |
| `list_agent_runs` | external-integration | — | Run lifecycle |
| `complete_agent_run` | external-integration | — | Run lifecycle |
| `append_agent_artifact` | external-integration | — | Artifact tracking |
| `list_agent_artifacts` | external-integration | — | Artifact tracking |
| `get_workspace_evidence` | external-integration | — | Downstream consumers |
| `get_project_context` | external-integration | — | Planning context |

### Category Definitions

- **crud**: MCP-owned project/task/milestone management. These tools wrap direct database operations and are the canonical surface for data access.
- **portable-contract**: Stable integration points for portable clients (execution queue, claim/release, approvals, team communication). These remain stable across CLI changes.
- **deprecated**: Duplicated by CLI commands. Still fully functional but clients should migrate to the CLI equivalent. No tools removed — deprecation is advisory only.
- **external-integration**: Telegram, workspace, run, and artifact tracking tools. MCP-owned because they coordinate with external systems or internal control-plane state.

### Deprecation Policy

- **Advisory only**: No tools are removed, renamed, or have their signatures changed.
- **Detection**: Clients can detect deprecated tools via `description.startsWith('[DEPRECATED]')`.
- **Rollback**: A simple `git revert` restores original descriptions. No data migration required.
- **Runtime**: Deprecated tools execute identically to before — no warnings, no errors, no behavioral changes.

### Portable Client Contract

If you are building a portable client that integrates with DevHub, these tools form the stable contract:

| Tool | Purpose |
|------|---------|
| `get_execution_queue` | Get prioritized task queue with dependency blocking info |
| `claim_next_task` | Atomically claim next task with lease token |
| `renew_task_lease` | Extend lease on claimed task |
| `release_task` | Release lease with outcome (completed/paused/failed) |
| `request_supervisor_approval` | Create approval checkpoint for supervisor review |
| `team_tell` | Send durable directives to team members |

These tools are stable across CLI changes and form the core execution coordination surface.

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
