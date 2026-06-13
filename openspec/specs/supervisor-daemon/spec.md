# spec: supervisor-daemon
## type: new

In-process 30s evaluation cycle for orphan cleanup, lease expiry, and approval escalation.

### SVD-1: In-Process Evaluation Cycle

**Priority**: P0 | **Status**: approved

The system SHALL implement a `setInterval`-based 30-second evaluation cycle within the processManager singleton. The cycle SHALL call `evaluateSupervisorSnapshot()` each tick, which queries all active workspaces and enforces policies. The daemon SHALL start when `processManager.ensure()` is called and stop during graceful shutdown via `stopSupervisorDaemon()`.

#### Scenario: SVD-S1 — Daemon starts with processManager
- **Given** the processManager is initializing
- **When** `ensure()` is called
- **Then** the supervisor daemon starts a 30-second `setInterval`
- **AND** subsequent `ensure()` calls do not create duplicate intervals

#### Scenario: SVD-S2 — Daemon stops on shutdown
- **Given** the supervisor daemon is running
- **When** `stopSupervisorDaemon()` is called during graceful shutdown
- **Then** the interval is cleared and no further evaluations occur

### SVD-2: Orphan Detection

**Priority**: P0 | **Status**: approved

The system SHALL detect workspaces with `status='active'` where `last_heartbeat` is older than 90 seconds and mark them as `orphaned`. The daemon SHALL emit a `workspace_orphaned` event and trigger cleanup of the orphaned agent process.

#### Scenario: SVD-S3 — Orphan workspace detected and marked
- **Given** a workspace has `status='active'` and `last_heartbeat` older than 90 seconds
- **When** the daemon evaluates workspaces
- **Then** `UPDATE agent_workspaces SET status='orphaned' WHERE status='active' AND id=?`
- **AND** an `agent_events` row with `event_type='workspace_orphaned'` is inserted
- **AND** the orphaned agent process is signaled for cleanup

#### Scenario: SVD-S4 — Recently active workspace not marked
- **Given** a workspace has `status='active'` and `last_heartbeat` within 90 seconds
- **When** the daemon evaluates workspaces
- **Then** no status change occurs for that workspace

### SVD-3: Lease Expiry

**Priority**: P0 | **Status**: approved

The system SHALL detect tasks with `status='in_progress'` and a stale `claim_token` (no heartbeat within the lease period) and release them back to `pending`. The daemon SHALL clear `claim_token`, `assigned_to`, and `started_at`.

#### Scenario: SVD-S5 — Stale lease released
- **Given** a task has `status='in_progress'` with a stale claim (no heartbeat for `lease_period`)
- **When** the daemon evaluates tasks
- **Then** `UPDATE tasks SET status='pending', claim_token=NULL, assigned_to=NULL, started_at=NULL WHERE status='in_progress' AND id=? AND last_heartbeat < ?`
- **AND** a `supervisor_action` event is emitted with `payload_json.action='lease_released'`

### SVD-4: Idempotent Enforcement

**Priority**: P0 | **Status**: approved

All supervisor enforcement actions SHALL use `UPDATE ... WHERE status = ?` (Compare-And-Swap) patterns. If the row status has already changed via API, the UPDATE SHALL match zero rows and no conflicting action occurs.

#### Scenario: SVD-S6 — Concurrent API and daemon evaluation
- **Given** a workspace is `active` and both the daemon and an API handler act on it
- **When** the API sets status to `completed` before the daemon's `WHERE status='active'` runs
- **Then** the daemon UPDATE matches zero rows
- **AND** no conflicting state change occurs

### SVD-5: Configurable Enable/Disable

**Priority**: P2 | **Status**: approved

The system SHALL support `SUPERVISOR_DAEMON_ENABLED` env var. When `false`, `ensure()` SHALL NOT start the evaluation interval. Default is `true`.

#### Scenario: SVD-S7 — Daemon disabled via env var
- **Given** `SUPERVISOR_DAEMON_ENABLED=false`
- **When** `processManager.ensure()` is called
- **Then** no `setInterval` is created
- **AND** a log message indicates the daemon is disabled

### SVD-6: Event Emission for Enforced Actions

**Priority**: P1 | **Status**: approved

The daemon SHALL emit `supervisor_action` events for every enforcement action. The `payload_json` SHALL include `action` (e.g., `orphan_marked`, `lease_released`), `target_id`, and `previous_status`.

#### Scenario: SVD-S8 — Event emitted for orphan marking
- **Given** the daemon marks a workspace as orphaned
- **When** the UPDATE succeeds (matches ≥1 row)
- **Then** an `agent_events` row is inserted with `event_type='supervisor_action'` and `payload_json` containing `action='orphan_marked'`, `target_id`, and `previous_status='active'`

### SVD-7: Stale Agent Detection

**Priority**: P1 | **Status**: approved

The system SHALL detect agents with 2 consecutive missed heartbeats and mark them as `stale`. A `stale` agent SHALL be flagged in the `agent_presence` table and MAY be excluded from broadcast fan-out recipients until it resumes heartbeat.

#### Scenario: SVD-S9 — Agent promoted to stale
- **Given** an agent has missed 2 consecutive heartbeat windows
- **When** the supervisor daemon evaluates presence
- **Then** the agent's presence status is updated to `stale`
- **AND** a `supervisor_action` event is emitted with `action='agent_stale'`

### SVD-8: Offline Agent Detection

**Priority**: P0 | **Status**: approved

The system SHALL detect agents with 3 consecutive missed heartbeats and mark them as `offline`. An `offline` agent SHALL be excluded from broadcast fan-out and its active tasks SHALL be eligible for lease reaping.

#### Scenario: SVD-S10 — Agent promoted to offline
- **Given** an agent has missed 3 consecutive heartbeat windows
- **When** the supervisor daemon evaluates presence
- **Then** the agent's presence status is updated to `offline`
- **AND** a `supervisor_action` event is emitted with `action='agent_offline'`
- **AND** the agent is excluded from `recipient_agent_ids: ['*']` fan-out

#### Scenario: SVD-S11 — Offline agent's tasks reaped
- **Given** an agent is marked `offline`
- **When** the agent has tasks with `status='in_progress'`
- **Then** those tasks are released back to `pending` via lease reaping
- **AND** a `supervisor_action` event is emitted with `action='lease_released'`