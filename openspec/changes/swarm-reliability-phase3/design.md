# Design: swarm-reliability-phase3

## Overview

Three medium-priority gap closures: role-based team chat targeting, operator inbox, and ops board history. Approach: minimal schema additions to existing tables, no architectural changes.

## Architecture Decisions

### D1: Role targeting resolves at write time

`target_role` parameter on `team_tell` resolves to agent IDs via `mission_participants` query before writing deliveries. No new tables — just a lookup step.

### D2: Operator inbox is a read projection

`operator_inbox` table is append-only (INSERT only, no UPDATE). Status transitions go: `unread → read → dismissed`. Source events: supervisor approvals, agent boot/crash, workspace orphan detection, lease expiry.

### D3: Task history is append-only

`task_history` table records every claim, release, status change. No UPDATE/DELETE. Writes are triggered from existing MCP tool paths (`claim_next_task`, `release_task`, `update_task`).

### D4: Tags column is JSON array

`tags` column on `tasks` is `TEXT` storing a JSON array of strings. Queryable via `json_each()` in SQLite. No separate tags table.

## Data Model

### operator_inbox

```sql
CREATE TABLE IF NOT EXISTS operator_inbox (
  inbox_id TEXT PRIMARY KEY,
  project_id TEXT,
  actor_id TEXT,
  category TEXT NOT NULL CHECK(category IN ('approval', 'alert', 'info', 'warning')),
  source_table TEXT NOT NULL,
  source_id TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unread' CHECK(status IN ('unread', 'read', 'dismissed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT,
  dismissed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_op_inbox_project ON operator_inbox(project_id);
CREATE INDEX IF NOT EXISTS idx_op_inbox_status ON operator_inbox(status);
CREATE INDEX IF NOT EXISTS idx_op_inbox_category ON operator_inbox(category);
```

### task_history

```sql
CREATE TABLE IF NOT EXISTS task_history (
  history_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  actor_id TEXT,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  metadata TEXT, -- JSON blob
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_task_history_task ON task_history(task_id);
CREATE INDEX IF NOT EXISTS idx_task_history_action ON task_history(action);
```

### tasks ALTER

```sql
ALTER TABLE tasks ADD COLUMN tags TEXT DEFAULT '[]';
```

## API Changes

### teamTell.js

- `teamTell(input)` now accepts optional `target_role` alongside `recipients`
- If `target_role` is provided, queries `mission_participants` WHERE `role_in_mission = target_role AND mission_id = ?` to resolve agent IDs
- If both `recipients` and `target_role` are provided, combines both sets (deduped)

### localDb.js

- `recordInboxItem(db, { project_id, actor_id, category, source_table, source_id, message })` — INSERT
- `queryOperatorInbox(db, { project_id, category, status, limit })` — SELECT
- `dismissInboxItem(db, inbox_id)` — UPDATE status='dismissed', dismissed_at=now
- `recordTaskHistory(db, { task_id, actor_id, action, from_status, to_status, metadata })` — INSERT
- `getTaskHistory(db, task_id)` — SELECT ORDER BY created_at
- ALTER TABLE tasks ADD COLUMN tags

### devhub-mcp/server.js

- `ensureLocalMcpTables()` must mirror: task_history, operator_inbox, tags on tasks
- MCP tools: `list_operator_inbox`, `dismiss_inbox_item`
- Extend `claim_next_task`, `release_task`, `update_task` to call `recordTaskHistory`

## Route Changes

None — all changes are in MCP tools and domain functions.

## Migration Strategy

- Add tables via `ensureRuntimeSchema()` in localDb.js (swarm path)
- Mirror in `ensureLocalMcpTables()` in devhub-mcp/server.js (MCP path)
- ALTER TABLE tasks ADD COLUMN is idempotent (try/catch on SQLite error)

## Rollback Plan

- Each change is independent: role targeting (teamTell param), inbox (new table), history (new table + column)
- Revert order: tags column → task_history table → operator_inbox table → target_role parameter
