# Spec: team-chat-targeting

## Type: DELTA

## Requirements

**TCT-1**: `team_tell` MCP tool SHALL accept an optional `target_role` string parameter alongside `recipients`. When provided, it resolves to agent IDs from `mission_participants` WHERE `role_in_mission = target_role AND mission_id = ?`.

**TCT-2**: If both `recipients` AND `target_role` are provided, the effective recipients SHALL be the deduped union of both sets.

**TCT-3**: If `target_role` resolves to zero agents, `team_tell` SHALL throw a descriptive error indicating no agents with that role were found in the mission.

## Scenarios

### TCT-S1: Role-based targeting

- **Given**: Mission has participants with role_in_mission='worker' and 'director'
- **When**: `team_tell({ target_role: 'worker', mission_id, ... })` is called
- **Then**: Message is delivered only to agents with role_in_mission='worker'

### TCT-S2: Combined recipients and role

- **Given**: Mission has agent-A (role: director) and agent-B (role: worker)
- **When**: `team_tell({ recipients: ['agent-A'], target_role: 'worker', ... })` is called
- **Then**: Message is delivered to both agent-A (explicit) and agent-B (role-resolved), deduped

### TCT-S3: No agents with target role

- **Given**: Mission has no participants with role_in_mission='observer'
- **When**: `team_tell({ target_role: 'observer', ... })` is called
- **Then**: Error thrown: "No agents found with role 'observer' in mission X"

### TCT-S4: Backward compatibility

- **Given**: Existing `team_tell({ recipients: [...], ... })` calls without target_role
- **When**: Processed normally
- **Then**: Behavior is unchanged — recipients list used as-is

---

# Spec: operator-inbox

## Type: NEW

## Requirements

**OPI-1**: `operator_inbox` table SHALL be created in `ensureRuntimeSchema()` with columns: inbox_id (PK), project_id, actor_id, category (CHECK: approval|alert|info|warning), source_table, source_id, message, status (CHECK: unread|read|dismissed), timestamps.

**OPI-2**: `recordInboxItem(db, {...})` SHALL INSERT a new inbox item and return the inbox_id.

**OPI-3**: `queryOperatorInbox(db, { project_id, category, status, limit })` SHALL return inbox items ordered by created_at DESC, capped at limit (default 100).

**OPI-4**: `dismissInboxItem(db, inbox_id)` SHALL transition status from 'unread'|'read' to 'dismissed' with dismissed_at timestamp.

**OPI-5**: MCP tools `list_operator_inbox` and `dismiss_inbox_item` SHALL be added to devhub-mcp/server.js.

**OPI-6**: `request_supervisor_approval` SHALL write an 'approval' inbox item when creating a new checkpoint.

## Scenarios

### OPI-S1: Record inbox item on approval

- **Given**: A supervisor approval checkpoint is created
- **When**: `request_supervisor_approval` creates a checkpoint
- **Then**: An operator_inbox row is INSERTed with category='approval', source_table='supervisor_approval_checkpoints'

### OPI-S2: Query inbox by status

- **Given**: Inbox has 3 'unread' and 2 'dismissed' items
- **When**: `queryOperatorInbox(db, { status: 'unread' })` is called
- **Then**: Only the 3 'unread' items are returned

### OPI-S3: Dismiss inbox item

- **Given**: An unread inbox item with inbox_id='inbox-1'
- **When**: `dismissInboxItem(db, 'inbox-1')` is called
- **Then**: item status='dismissed', dismissed_at is set

---

# Spec: ops-board-history

## Type: DELTA

## Requirements

**OBH-1**: `task_history` table SHALL be created with columns: history_id (PK), task_id, actor_id, action, from_status, to_status, metadata (JSON), created_at.

**OBH-2**: `recordTaskHistory(db, { task_id, actor_id, action, from_status, to_status, metadata })` SHALL INSERT a new history entry and return history_id.

**OBH-3**: `getTaskHistory(db, task_id)` SHALL return all history entries for a task ordered by created_at ASC.

**OBH-4**: `tasks` table SHALL gain a `tags TEXT DEFAULT '[]'` column via ALTER TABLE.

**OBH-5**: MCP `claim_next_task` SHALL call `recordTaskHistory` with action='claimed', from_status='pending', to_status='in_progress'.

**OBH-6**: MCP `release_task` SHALL call `recordTaskHistory` with action='released', from_status=inferred, to_status=outcome.

**OBH-7**: Schema additions SHALL be mirrored in both `localDb.js` `ensureRuntimeSchema()` AND `devhub-mcp/server.js` `ensureLocalMcpTables()`.

## Scenarios

### OBH-S1: History recorded on claim

- **Given**: A task with task_id='task-1' in status 'pending'
- **When**: `claim_next_task` claims it for agent-A
- **Then**: A task_history row EXISTS with task_id='task-1', actor_id='agent-A', action='claimed', from_status='pending', to_status='in_progress'

### OBH-S2: History recorded on release

- **Given**: An in-progress task with task_id='task-2'
- **When**: `release_task` releases it with outcome='completed'
- **Then**: A task_history row EXISTS with action='released', to_status='completed'

### OBH-S3: Query task history

- **Given**: task_id='task-1' has 3 history entries
- **When**: `getTaskHistory(db, 'task-1')` is called
- **Then**: Returns 3 entries ordered by created_at ASC

### OBH-S4: Tags column default

- **Given**: A new task created without tags
- **When**: `INSERT INTO tasks (...) VALUES (...)`
- **Then**: The `tags` column defaults to `'[]'`
