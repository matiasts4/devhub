# Design: CLI-6 Task and Workspace Detail Commands

## Technical Approach

Implement two read-only CLI detail commands that query SQLite directly via the shared compact durable core (`lib/db.js`). The `task` command adds a new `readTaskById` reader to `compactReads.js`; the `ws` command reuses the existing `readWorkspaceEvidenceSummary`. Both use `lib/format.js` for TTY/non-TTY output differentiation. `cli.js` registers both commands and removes them from `STUB_COMMANDS`.

## Architecture Decisions

| Decision | Option A (chosen) | Option B (rejected) | Rationale |
|----------|-------------------|---------------------|-----------|
| Task lookup location | Add `readTaskById` to `compactReads.js` | Direct SQL in command handler | Keeps all durable reads in one module; follows existing pattern (`readAgentRegistrySummary`, `readWorkspaceEvidenceSummary`) |
| WS lookup | Reuse `readWorkspaceEvidenceSummary` | New dedicated function | Already returns workspace + latest_run + latest_artifact; no duplication needed |
| TTY detection | `FORCE_TTY` env var (existing pattern) | `--tty` flag | Matches `agents.js` test pattern; zero API surface change |
| Description truncation | 120 chars with `...`, `--verbose` for full | No truncation | Prevents terminal overflow on long descriptions; spec requires it |

## Data Flow

```
cli.js
  ├── task <id> ──→ commands/task.js
  │                    ├── readTaskById(db, id)  ← compactReads.js → tasks table
  │                    └── format helpers        ← lib/format.js → stdout/stderr
  │
  └── ws <id>   ──→ commands/ws.js
                       ├── readWorkspaceEvidenceSummary(db, id)  ← compactReads.js
                       │     ├── agent_workspaces table
                       │     ├── agent_runs table (latest)
                       │     └── agent_artifacts table (latest)
                       └── format helpers        ← lib/format.js → stdout/stderr
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/db/compactReads.js` | Modify | Add `readTaskById(db, id)` — single task lookup by ID |
| `devhub-cli/commands/task.js` | Create | Task detail handler with TTY/non-TTY output |
| `devhub-cli/commands/task.test.js` | Create | Tests: found/not-found/missing-id/truncation/verbose |
| `devhub-cli/commands/ws.js` | Create | Workspace detail handler via `readWorkspaceEvidenceSummary` |
| `devhub-cli/commands/ws.test.js` | Create | Tests: found/not-found/missing-id/no-runs/with-artifacts |
| `devhub-cli/cli.js` | Modify | Import/register both commands; remove from `STUB_COMMANDS` |

## Interfaces / Contracts

### `readTaskById(db, taskId)` — new in `compactReads.js`

```js
/**
 * Query a single task by ID.
 * @param {Database} db - better-sqlite3 instance (or null for singleton)
 * @param {string} taskId - Task UUID/legacy ID
 * @returns {object|null} Task row or null if not found
 */
function readTaskById(dbOrNull, taskId) {
  const db = resolveDb(dbOrNull);
  return db.prepare('SELECT * FROM tasks WHERE id = ? LIMIT 1').get(taskId) || null;
}
```

### TTY output format (both commands)

```
═══ TASK ═══
  Title:        Fix N+1 query in UserList
  Status:       completed
  Priority:     high
  Project:      proj-abc
  Assigned To:  worker-claude-1
  Due Date:     2026-06-01
  Description:  Replace nested SELECT with JOIN to eliminate...
```

### Non-TTY output format

```
id=task-123
title=Fix N+1 query in UserList
status=completed
priority=high
project=proj-abc
assigned_to=worker-claude-1
due_date=2026-06-01
description=Replace nested SELECT with JOIN...
```

### Exit codes

| Condition | Exit Code |
|-----------|-----------|
| Success (found) | 0 |
| Not found | 1 |
| Missing ID argument | 2 |

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit — task | Found → TTY formatted output | `spawnSync` with `FORCE_TTY=1`, assert sections |
| Unit — task | Found → non-TTY key=value | `spawnSync` without FORCE_TTY, assert `key=` pattern, no ANSI |
| Unit — task | Not found → exit 1, stderr message | Seed empty DB, assert exit code + stderr |
| Unit — task | Missing ID → exit 2, "ID required" | `spawnSync` with no arg |
| Unit — task | Long description truncated at 120 chars | Seed task with 200-char description |
| Unit — task | `--verbose` shows full description | Same seed, add `--verbose` flag |
| Unit — ws | Found → TTY with workspace fields | `spawnSync` with `FORCE_TTY=1` |
| Unit — ws | Found → non-TTY key=value | No FORCE_TTY, assert `workspace_id=` etc |
| Unit — ws | Not found → exit 1 | Empty DB |
| Unit — ws | Missing ID → exit 2 | No arg |
| Unit — ws | No runs → `latest_run=none` | Workspace with no agent_runs rows |
| Unit — ws | With runs/artifacts → shows latest | Seed workspace + run + artifact |

## Migration / Rollout

No migration required. Both commands are read-only additions. `cli.js` change is additive (new registrations) plus removing from stub list (no functional regression — stubs already exit 1).

## Open Questions

- None
