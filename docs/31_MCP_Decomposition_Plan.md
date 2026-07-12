# 31 — MCP Decomposition Status

## Outcome first

La descomposición MCP ya no está en fase de extracción. El baseline vigente es un servidor modular con **32 supported MCP tools** y sin surface pública de Telegram.

## Current baseline

| Topic                 | Current state                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------- |
| Server shape          | `devhub-mcp/server.js` registra módulos de proyectos, tareas, workspaces, agentes e inbox |
| Supported contract    | 32 supported MCP tools                                                                    |
| Telegram MCP          | Telegram MCP removal is complete                                                          |
| Runtime Telegram data | Sigue interno; no forma parte de `tools/list`                                             |

## Historical context

La idea original de extraer un módulo Telegram condicional ya quedó vieja. El contrato actual es más simple: Telegram no se publica como MCP soportado.

## Deferred follow-up

Esto queda fuera de este documento y del baseline actual:

- retrieval/indexing CLI parity
- physical DB split
- explicit worktree manifest
- larger orchestration redesign

## Verification

- `devhub-mcp/tests/integration/tools-list.test.js` fija el catálogo oficial.
- `npm run mcp:smoke` valida arranque y catálogo.

## Next step

Usar este documento como referencia histórica del cleanup MCP, no como backlog abierto para reintroducir Telegram.
