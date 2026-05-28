# Plyrium reference inventory and DevHub coverage

Esta carpeta ahora usa una baseline reality-first.

**Baseline soportado hoy: 24 tools MCP y 20 comandos CLI.** Telegram queda fuera del contrato público MCP. Los gaps grandes de paridad siguen diferidos y NO bloquean esta baseline.

## Quick path

1. Leé la baseline soportada hoy.
2. Revisá qué quedó explícitamente diferido.
3. Usá `comparacion_devhub.md` para backlog de paridad, no para cuestionar el contrato actual.

## Baseline soportada hoy

| Superficie       | Estado actual | Nota                                           |
| ---------------- | ------------- | ---------------------------------------------- |
| MCP público      | 24 tools      | Env-invariant; Telegram MCP removido           |
| CLI top-level    | 20 comandos   | Documentados como superficie ejecutable actual |
| Runtime Telegram | Interno       | Storage/runtime queda fuera del contrato MCP   |

## MCP soportado hoy

Las categorías vigentes del MCP público son:

- `crud`
- `portable-contract`
- `external-integration`

Las mutaciones runtime de leases, approvals, workspaces, runs, artifacts y team messaging quedan fuera del contrato público MCP.

No forman parte del contrato soportado:

- Telegram MCP helpers.
- Ghost tools duplicadas de CLI (`get_dashboard`, `get_next_task`, `register_agent`, `heartbeat_agent`, `unregister_agent`, `update_agent_status`).

## CLI soportado hoy

```text
status
queue
agents
swarm
task
ws
heartbeat
update-status
claim
release
tell
swarm-launch
auth
events
inbox
presence
mission
run
worktree
supervisor
```

## Qué sigue explícitamente diferido

Estos temas siguen siendo backlog, no defectos del baseline actual:

- retrieval/indexing CLI parity
- physical DB split
- explicit worktree manifest
- larger orchestration redesign

## Regla de lectura

Cuando compares DevHub con Plyrium:

1. Primero validá la baseline soportada hoy.
2. Después separá backlog diferido de contrato actual.
3. No vuelvas a contar Telegram como MCP soportado.

## Evidencia de repo usada

- `devhub-mcp/tests/integration/tools-list.test.js`
- `devhub-mcp/README.md`
- `devhub-cli/cli.js`
- `devhub-cli/README.md`
- `docs/31_MCP_Decomposition_Plan.md`
- `docs/33_CLI_Enhancement_Plan.md`
- `docs/34_Execution_Roadmap.md`

## Next step

Usar `comparacion_devhub.md` para decidir si alguno de los ítems diferidos merece un SDD nuevo.
