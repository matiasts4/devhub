# Design: CLI-7 Heartbeat & Status Commands

## Technical Approach

Two mutation commands that write directly to SQLite via `getDb()` from `lib/db.js`. Both follow the existing command pattern: export a function, register in `cli.js` via commander, use `process.exit(code)` for exit codes. No MCP bounce, no HTTP.

## Architecture Decisions

### Decision: Add `task_description` column to `agent_registry`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Add column via `ALTER TABLE` in `lib/db.js` on init | One-time migration, safe for SQLite | **Chosen** — column needed by spec and MCP tool accepts it |
| Skip column, ignore `task_description` arg | Simpler but breaks spec contract | Rejected |

Rationale: The MCP `update_agent_status` tool accepts `task_description` but writes to Supabase only. SQLite schema is missing this column. Adding it keeps CLI and MCP in sync.

### Decision: Exit code for agent-not-found

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Exit 0 with stderr warning (idempotent) | Matches heartbeat idempotent contract | **Chosen for heartbeat** |
| Exit 1 with stderr warning | Distinguishes "agent missing" from "success" | **Chosen for update-status** |

Rationale: Heartbeat is purely idempotent — calling it on a non-existent agent is harmless. Update-status is a targeted mutation — failing to find the agent is a real error.

### Decision: Status validation location

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Hardcode enum in command module | Simple, no extra file | **Chosen** |
| Read enum from DB schema at runtime | Always in sync but slower | Rejected — enum is stable |

Rationale: The status enum is defined in the MCP server and SQLite schema. It changes rarely. Hardcoding is simpler and faster.

## Data Flow

```
  CLI argv ──→ commander parses ──→ command handler
                                        │
                                        ▼
                              validate args (exit 2 if missing)
                                        │
                                        ▼
                              validate status enum (update-status only)
                                        │
                                        ▼
                              getDb() ──→ db.prepare().run()
                                        │
                                        ▼
                              check changes() ──→ 0 rows = agent not found (exit 1)
                                        │
                                        ▼
                              stdout confirmation ──→ process.exit(0)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `devhub-cli/commands/heartbeat.js` | Create | Heartbeat command handler |
| `devhub-cli/commands/heartbeat.test.js` | Create | Jest tests for heartbeat |
| `devhub-cli/commands/updateStatus.js` | Create | Update-status command handler |
| `devhub-cli/commands/updateStatus.test.js` | Create | Jest tests for update-status |
| `devhub-cli/cli.js` | Modify | Register both commands, remove from STUB_COMMANDS if present |
| `devhub-cli/lib/db.js` | Modify | Add `ensureWriteSchema()` helper for `task_description` column migration |

## Interfaces / Contracts

### Status enum (hardcoded in `updateStatus.js`)

```js
const VALID_STATUSES = new Set([
  'active', 'idle', 'working', 'running', 'thinking',
  'asking_questions', 'completed', 'failed', 'error', 'offline',
]);
```

### DB migration (in `lib/db.js`)

```js
// Called once on CLI startup — safe to call repeatedly
function ensureWriteSchema() {
  const db = getDb();
  const cols = db.pragma('table_info(agent_registry)');
  const hasTaskDesc = cols.some(c => c.name === 'task_description');
  if (!hasTaskDesc) {
    db.exec("ALTER TABLE agent_registry ADD COLUMN task_description TEXT");
  }
}
```

### Heartbeat SQL

```sql
UPDATE agent_registry SET last_heartbeat = datetime('now') WHERE agent_id = ?
```

### Update-status SQL

```sql
UPDATE agent_registry SET status = ?, task_description = COALESCE(?, task_description) WHERE agent_id = ?
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — heartbeat | Exit 0 on success, exit 2 on missing arg, exit 1 on unknown agent, DB write verified, idempotency | `spawnSync` against test DB, seed agent, verify `last_heartbeat` changed |
| Unit — update-status | Exit 0 on valid status, exit 2 on missing args, exit 1 on invalid status, exit 1 on unknown agent, DB write verified, optional task_description | `spawnSync` against test DB, seed agent, verify `status` and `task_description` columns |
| Integration | Both commands appear in `devhub --help` | `spawnSync` with `--help`, grep output |

Tests use the same `seedTestData()` pattern as existing test files — create `agent_registry` table, insert test row, verify column changes after command execution.

## Migration / Rollout

No migration required for heartbeat (column `last_heartbeat` already exists). The `task_description` column is added via `ensureWriteSchema()` on first CLI invocation — `ALTER TABLE` is safe and idempotent in SQLite. No feature flags needed.

## Open Questions

- [ ] None
