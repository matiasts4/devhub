# 34 — Execution Roadmap

## Supported baseline now: 32 MCP tools and 20 CLI commands.

Ese baseline ya está soportado y documentado. Este roadmap NO reabre Telegram como MCP ni vuelve a tratar trabajo ya shippeado como gap activo.

## What is done

| Area                                                | Status |
| --------------------------------------------------- | ------ |
| MCP public contract cleanup                         | Done   |
| Telegram removal from MCP public surface            | Done   |
| CLI documentation aligned to implemented commands   | Done   |
| Plyrium comparison docs aligned to current baseline | Done   |

## Deferred roadmap items

Los próximos cambios grandes, si se priorizan, salen desde backlog explícito:

- retrieval/indexing CLI parity
- physical DB split
- explicit worktree manifest
- larger orchestration redesign

## Reading rule

1. Verificá primero el baseline soportado.
2. Tomá los ítems diferidos como trabajo futuro opcional.
3. No mezcles cleanup ya completado con backlog nuevo.

## Verification anchors

- `devhub-mcp/tests/integration/tools-list.test.js`
- `devhub-mcp/README.md`
- `devhub-cli/README.md`

## Next step

Crear SDDs separados sólo para items diferidos que realmente aporten valor.
