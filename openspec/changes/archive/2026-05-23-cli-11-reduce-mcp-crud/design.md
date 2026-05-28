# Design: Reduce MCP Server to CRUD + Portable Contracts

## Technical Approach

Mark 6 MCP tools as `@deprecated` in their descriptions only — no signature changes, no behavior changes, no tool removal. Update `devhub-mcp/README.md` with an ownership matrix table that classifies every tool into: `crud`, `portable-contract`, `deprecated`, or `external-integration`. This is a documentation-only change; all 45 tools remain fully callable.

## Architecture Decisions

### Decision: Deprecation via description prefix

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `@deprecated` text prefix in description | Machine-readable, standard convention, zero runtime impact | **Chosen** |
| Add `deprecated: true` to tool schema | Requires SDK changes, breaking for older clients | Rejected |
| Runtime warning on tool call | Breaks backward compatibility, noisy logs | Rejected |
| Remove tools immediately | Breaks all existing MCP clients | Rejected |

**Rationale**: Description prefix is the lowest-risk approach. Clients can detect deprecation via string matching (`description.startsWith('@deprecated')`). No SDK changes needed. Rollback is a simple `git revert`.

### Decision: CLI equivalent reference format

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `Use \`devhub <command>\` instead.` | Clear, actionable, matches existing CLI naming | **Chosen** |
| `Deprecated — see CLI` | Too vague, no actionable guidance | Rejected |
| Link to CLI documentation | Docs may not exist yet for all commands | Rejected |

**Rationale**: The prefix `[DEPRECATED] Use \`devhub <command>\` instead.` is consistent, actionable, and works even when CLI docs are incomplete.

### Decision: README ownership matrix as single table

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Single table with category column | Easy to scan, one source of truth | **Chosen** |
| Separate tables per category | More verbose, harder to see full surface | Rejected |
| JSON machine-readable file | Overkill for this scope, README is canonical | Rejected |

**Rationale**: A single markdown table with columns (Tool, Category, CLI Equivalent, Notes) is the simplest format that serves both humans and machine parsing.

## Data Flow

No data flow changes. This is a metadata-only change:

    Tool Definition ──→ Description String ──→ MCP Client
         │                                        │
         └── (unchanged logic) ───────────────────┘

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `devhub-mcp/server.js` | Modify | Prefix descriptions of 6 tools with `[DEPRECATED] Use \`devhub <command>\` instead.` |
| `devhub-mcp/README.md` | Modify | Add ownership matrix table, deprecation policy section, portable client contract docs |

## Deprecation Mapping (concrete changes)

| Tool | Current Description | New Description Prefix |
|------|-------------------|----------------------|
| `get_dashboard` | `Obtiene un resumen global...` | `[DEPRECATED] Use \`devhub status\` instead. Obtiene un resumen global...` |
| `get_next_task` | `Devuelve la siguiente tarea priorizada...` | `[DEPRECATED] Use \`devhub claim\` instead. Devuelve la siguiente tarea priorizada...` |
| `register_agent` | `Registra un agente Worker...` | `[DEPRECATED] Use \`devhub agents register\` instead. Registra un agente Worker...` |
| `heartbeat_agent` | `Renueva la señal de vida...` | `[DEPRECATED] Use \`devhub heartbeat\` instead. Renueva la señal de vida...` |
| `unregister_agent` | `Elimina un agente del registry...` | `[DEPRECATED] Use CLI instead. Elimina un agente del registry...` |
| `update_agent_status` | `Actualiza el estado del agente...` | `[DEPRECATED] Use \`devhub update-status\` instead. Actualiza el estado del agente...` |

## Interfaces / Contracts

No interface changes. Tool schemas (zod definitions), parameters, and return types remain identical.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Deprecated tools still execute correctly | Run existing unit tests — no changes expected |
| Integration | MCP server starts with all 45 tools | `npm run mcp:smoke` — verify no startup errors |
| Manual | Description prefix is present | Grep server.js for `@deprecated` — count 6 matches |
| Regression | No behavioral changes | Compare tool output before/after for each deprecated tool |

## Migration / Rollout

No migration required. This is advisory deprecation only:
1. Update 6 tool descriptions in `server.js`
2. Update `README.md` with ownership matrix
3. Commit and push — no feature flags, no data migration
4. Rollback: `git revert` the commit

## Open Questions

- None
