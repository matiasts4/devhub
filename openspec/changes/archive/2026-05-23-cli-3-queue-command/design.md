# Design: CLI `devhub queue` command — execution queue display

## Technical Approach

Add `devhub queue` command that reads pending tasks via `readExecutionQueueSummary` from the shared core (`lib/db.js` → `compactReads.js`), merges cross-project results, and formats output using a new `table()` helper in `lib/format.js`. Follows the exact same pattern as `commands/status.js`: direct SQLite, no MCP/HTTP, `process.exit(0)`.

## Architecture Decisions

| Decision | Option A | Option B | Decision | Rationale |
|----------|----------|----------|----------|-----------|
| Cross-project query | Single JOIN across all projects | Iterate active projects, call `readExecutionQueueSummary` per project | **B** | `readExecutionQueueSummary` requires `projectId`; reusing shared core avoids duplicating priority scoring logic |
| Table format | `table(headers, rows)` helper in `format.js` | Inline formatting in command | **A** | Reusable; `status.js` already uses `section/row/divider` pattern — `table` is the natural next helper |
| Non-TTY output | Pipe-separated (`\|`) | Tab-separated | **Pipe** | Easier to parse with `awk -F'|'`; tabs break with variable-width content |
| Active projects cap | No cap | Cap at 10 most recently active | **Cap at 10** | Prevents N+1 with many projects; matches spec requirement |
| Title truncation | 40 chars + `...` | No truncation | **40 chars** | Prevents table column blowout; spec requires it |

## Data Flow

```
  cli.js
    │
    ▼
  commands/queue.js
    │
    ├── isTTY? ──yes──► lib/format.js: table(headers, rows) ──► stdout
    │
    └── isTTY? ──no───► pipe-separated rows ──► stdout
    │
    ├── --project given? ──yes──► readExecutionQueueSummary(db, { projectId, limit, includeBlocked })
    │
    └── --project given? ──no──► SELECT id, name FROM projects WHERE status='active' LIMIT 10
                                   │
                                   ├── readExecutionQueueSummary per project
                                   ├── deduplicate by task.id
                                   ├── sort by priority_score DESC
                                   └── slice(0, limit)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `devhub-cli/commands/queue.js` | Create | Command handler: flag parsing, queue query, TTY-aware output |
| `devhub-cli/commands/queue.test.js` | Create | Jest tests: exit codes, sections, filters, TTY/non-TTY, empty queue |
| `devhub-cli/cli.js` | Modify | Replace `'queue'` in `STUB_COMMANDS` with real `require('./commands/queue.js')` registration |
| `devhub-cli/lib/format.js` | Modify | Add `table(headers, rows)` function for aligned column output |

## Interfaces / Contracts

### `table(headers, rows)` — `lib/format.js`

```js
/**
 * Renders aligned tabular output.
 * @param {string[]} headers - Column headers
 * @param {string[][]} rows - Array of row arrays (each same length as headers)
 * @returns {string} Formatted table string
 */
function table(headers, rows) {
  // TTY: aligned columns with header separator
  // Non-TTY: pipe-separated, no header row
}
```

### `commands/queue.js` — exported function signature

```js
function queueCommand(opts) {
  // opts: { limit: number, project: string|undefined, blocked: boolean }
  // Called by Commander action
}
module.exports = queueCommand;
```

### Queue row shape (from `readExecutionQueueSummary`)

```js
{
  id: string,
  title: string,
  status: 'pending' | 'blocked',
  priority: 'low' | 'medium' | 'high' | 'critical',
  priority_score: number,
  project_name: string,       // resolved by caller
  blocked_reason: string|null,
  lease_expires_at: string|null,
}
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — exit code | `devhub queue` exits 0 | `spawnSync` with seeded DB |
| Unit — sections | Output contains "Queue" header | Regex match on stdout |
| Unit — columns | Output shows priority, status, title, project | Regex for column patterns |
| Unit — `--limit` | Respects `--limit N` | Seed >N tasks, verify row count |
| Unit — `--project` | Filters to single project | Seed multi-project, verify isolation |
| Unit — `--blocked` | Shows only blocked with reason | Seed blocked + non-blocked tasks |
| Unit — TTY | Uses `table()` format | Mock `process.stdout.isTTY` |
| Unit — non-TTY | No ANSI codes, pipe-separated | `spawnSync` (piped by default) |
| Unit — empty | "No tasks in queue", exit 0 | Clear DB, run command |
| Unit — cross-project | Merged + sorted + deduplicated | Seed 2+ projects, verify ordering |
| Unit — `--help` | Prints usage, exit 0 | `spawnSync` with `--help` |

## Migration / Rollout

No migration required. Pure CLI addition — no database schema changes, no shared core modifications.

**Rollback**: Remove `queue` from `cli.js` registration, delete `commands/queue.js` and `commands/queue.test.js`, remove `table()` from `format.js`.

## Open Questions

- None
