# Design: CLI agents command

## Technical Approach

Add `devhub agents` command that queries the shared SQLite `agent_registry` table, LEFT JOINs the latest `agent_workspaces` row per agent, computes heartbeat age, and renders output via the existing `table()` helper (TTY) or pipe-delimited format (non-TTY). Follows the exact patterns established by `queue.js` and `status.js`.

## Architecture Decisions

| Decision | Option A | Option B | Choice | Rationale |
|----------|----------|----------|--------|-----------|
| Query location | New function in `compactReads.js` | Inline SQL in command handler | `compactReads.js` | Follows proposal spec; keeps DB logic in shared core for MCP reuse |
| Latest workspace | Subquery with `MAX(updated_at)` | ORDER BY + LIMIT 1 in JOIN | Subquery | Deterministic, single row per agent; matches spec requirement |
| Heartbeat threshold | 5 minutes | 10 minutes | 5 min | Matches existing heartbeat semantics (`heartbeat_agent` called every 1 min; 5 min = 5 missed heartbeats) |
| Empty message | "No agents registered" | "No agents found" | "No agents registered" | Matches proposal and spec requirement |
| Exit code on empty | 0 | 1 | 0 | Spec requires exit 0 for empty state (not an error) |

## Data Flow

```
  CLI (agents.js)
       │
       ├─ parse flags (--status, --active)
       │  └─ validate mutual exclusion → exit 2 if both
       │
       ├─ getDb() → shared SQLite (~/.devhub/data/devhub.db)
       │
       ├─ readAgentRegistrySummary(db, { statusFilter?, activeOnly? })
       │    │
       │    ├─ SELECT from agent_registry
       │    │   LEFT JOIN (latest agent_workspaces per agent)
       │    │   WHERE status = ? (optional filter)
       │    │
       │    └─ compute heartbeat age per row
       │
       ├─ rows.length === 0 → "No agents registered\n", exit 0
       │
       └─ table(headers, rows) → stdout
            ├─ TTY: aligned columns with header + separator
            └─ non-TTY: pipe-delimited, no header
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/db/compactReads.js` | Modify | Add `readAgentRegistrySummary(db, opts)` — query + heartbeat computation |
| `devhub-cli/lib/db.js` | Modify | Re-export `readAgentRegistrySummary` (barrel already spreads `compactReads`) |
| `devhub-cli/commands/agents.js` | Create | Command handler with flag parsing, TTY/non-TTY output |
| `devhub-cli/commands/agents.test.js` | Create | Jest tests: flags, TTY/non-TTY, empty data, exit codes |
| `devhub-cli/cli.js` | Modify | Register `agents` command, remove from `STUB_COMMANDS` |

## Interfaces / Contracts

### `readAgentRegistrySummary(db, opts)`

```js
/**
 * @param {Database} db - better-sqlite3 instance
 * @param {object} opts
 * @param {string} [opts.statusFilter] - exact status match (e.g. "idle")
 * @param {boolean} [opts.activeOnly] - filter to active statuses
 * @returns {{ rows: Array<{agent_id, nombre, modelo_llm, status, current_task_id, branch_name, heartbeat_age_min, heartbeat_label }>, total: number }}
 */
function readAgentRegistrySummary(db, opts = {})
```

Query pattern:

```sql
SELECT
  ar.agent_id,
  ar.nombre,
  ar.modelo_llm,
  ar.status,
  ar.current_task_id,
  ar.last_heartbeat,
  aw.branch_name,
  aw.status AS ws_status
FROM agent_registry ar
LEFT JOIN agent_workspaces aw
  ON aw.agent_id = ar.agent_id
  AND aw.updated_at = (
    SELECT MAX(aw2.updated_at)
    FROM agent_workspaces aw2
    WHERE aw2.agent_id = ar.agent_id
  )
WHERE 1=1
  -- optional: AND ar.status = ?
ORDER BY ar.agent_id
```

Heartbeat computation (in JS, per row):

```js
function heartbeatLabel(lastHeartbeat) {
  if (!lastHeartbeat) return 'unknown';
  const ms = Date.parse(lastHeartbeat);
  if (Number.isNaN(ms)) return 'unknown';
  const ageMin = Math.round((Date.now() - ms) / 60000);
  if (ageMin < 60) return `${ageMin}m ago`;
  const ageH = Math.round(ageMin / 60);
  if (ageH < 24) return `${ageH}h ago`;
  return 'stale';
}
```

Stale threshold: `ageMin >= 5` → label includes "stale" indicator.

### CLI columns (TTY)

| Column | Source | Notes |
|--------|--------|-------|
| AGENT | `agent_id` | Truncated to 20 chars if needed |
| STATUS | `ar.status` | Registry status |
| TASK | `current_task_id` | Truncated or "—" if null |
| BRANCH | `branch_name` | "—" if no workspace |
| MODEL | `modelo_llm` | "—" if null |
| HEARTBEAT | computed | "2m ago", "3h ago", "stale", "unknown" |

### Non-TTY format

```
agent_id|status|task|branch|model|heartbeat
```

No header row. Empty cells rendered as empty string.

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | `readAgentRegistrySummary` returns correct rows | Seed `agent_registry` + `agent_workspaces`, verify query results |
| Unit | Heartbeat computation (recent, stale, missing, NaN) | Pure function tests with mocked `Date.now` |
| Unit | Flag parsing (--status, --active, mutual exclusion) | spawnSync with various flag combos |
| Integration | TTY output renders table | spawnSync, verify header + separator + data rows |
| Integration | Non-TTY output is pipe-delimited, no ANSI | spawnSync piped to cat, regex check for `\x1b[` |
| Integration | Empty state shows message, exit 0 | Empty DB, verify stdout + status |
| Integration | --active filters to correct statuses | Seed agents with mixed statuses |
| Integration | --status filters exact match | Seed agents, filter by specific status |
| Integration | Multiple workspaces → latest only | Seed 2 workspaces per agent, verify branch |
| Integration | Agent with no workspace → "—" for branch | Seed registry-only agent |

## Migration / Rollout

No migration required. No schema changes. Both `agent_registry` and `agent_workspaces` tables already exist in the canonical DB.

Rollback: Remove `commands/agents.js`, `commands/agents.test.js`. Re-add `agents` to `STUB_COMMANDS` in `cli.js`. Remove `readAgentRegistrySummary` from `compactReads.js`.

## Open Questions

- [ ] Should `--active` also include `active` status (workspace status) or only registry statuses? Proposal says registry statuses: `active, working, running, thinking`. The registry `status` column currently uses values like `idle`, `working`, `running`, `thinking`, `error`, `completed`, `failed`. Confirm the exact set of "active" registry statuses.
