# Design: Swarm Reliability Phase 2 — Auth, Identity, Events, Supervisor

## Technical Approach

Four independent but coordinated changes close critical reliability gaps:

1. **HMAC Auth**: Shared-secret HMAC-SHA256 signing on all `/api/agenthub/*` routes, provisioned at swarm launch, dual-mode rollout (accept unsigned with warnings → reject unsigned).
2. **PTY Identity**: Nullable columns (`pane_id`, `terminal_id`, `opencode_pid`) on `agent_workspaces`, populated at launch and on tty session attach — survives restart.
3. **Agent Events**: New `agent_events` table for cross-mission lifecycle events, replacing ad-hoc `mission_messages` + `agent_traces` inserts in `/api/agenthub/events`.
4. **Supervisor Daemon**: In-process `setInterval` in `processManager` singleton, evaluates `evaluateSupervisorSnapshot` every 30s against active workspaces, enforces idempotent actions.

All changes follow existing patterns: `better-sqlite3` via `localDb.js` for DB, `withDbWriteQueue` for writes, Next.js route handlers for API, singleton pattern for lifecycle daemons.

## Architecture Decisions

### Decision: HMAC-SHA256 with shared secret per launch

| Option | Tradeoff | Decision |
|--------|----------|----------|
| HMAC-SHA256 shared secret | Simple, no PKI, requires secret distribution per launch | **Chosen** |
| API key per agent | More granular revocation but bigger key management surface | Rejected — agent count is small, launch-time provisioning is natural |
| JWT per agent | Allows stateless verification but heavier, overkill for local swarm | Rejected — no external consumers |

**Rationale**: Swarm agents are local processes spawned by `launchSwarmLocal`. The secret is injected via `AGENT_AUTH_TOKEN` env var at spawn — no network exposure. HMAC signing is deterministic, trivial to implement client-side in bash (via `openssl`), and timestamp validation prevents replay.

### Decision: Nullable columns for PTY identity

| Option | Tradeoff | Decision |
|--------|----------|----------|
| Nullable ALTER TABLE columns | Backward compatible, no migration downtime, NULL for existing rows | **Chosen** |
| New join table `workspace_pty_sessions` | Normalized but more complex queries, over-engineering for 3 columns | Rejected |
| Separate `workspace_identity` table | Clean separation but joins on every workspace read | Rejected — 3 nullable columns are simpler |

**Rationale**: SQLite `ALTER TABLE ADD COLUMN` is safe and idempotent (wrapped in try-catch like existing columns). NULL means "not yet populated" — natural for workspaces created before PTY awareness.

### Decision: Dedicated `agent_events` table instead of reusing `mission_messages`

| Option | Tradeoff | Decision |
|--------|----------|----------|
| New `agent_events` table | Dedicated schema, indexed queries, clean event types enum | **Chosen** |
| Continue using `mission_messages` + `agent_traces` | Overloaded schema, LIKE-based event_type queries, no JSON metadata column | Rejected — current events route hacks two tables |
| SQLite triggers on workspace/run changes | No API control, hard to debug, couples DB to business logic | Rejected |

**Rationale**: Current `/api/agenthub/events/route.js` stores events as `mission_messages` with `message_kind='status'` and body like `"agent_booted: summary"`, then also inserts an `agent_traces` row for the payload. This is fragile (LIKE query for type filtering). A dedicated table with proper columns is cleaner and faster.

### Decision: In-process supervisor daemon (setInterval in processManager)

| Option | Tradeoff | Decision |
|--------|----------|----------|
| `setInterval` in processManager | Zero extra process, shares DB connection, simple lifecycle | **Chosen** |
| Separate worker process | Better isolation but IPC overhead, process management complexity | Rejected — YAGNI for current scale |
| Cron-based evaluation | External dependency, harder to control cycle | Rejected |

**Rationale**: `evaluateSupervisorSnapshot` is already a pure function. The daemon just needs to: query active workspaces → evaluate each → enforce actions. `processManager.getInstance()` already manages the OpenCode lifecycle — adding a 30s tick there is natural. Idempotent `UPDATE ... WHERE status = ?` prevents race conditions with API-driven evaluations.

## Data Flow

```
Agent Launch Flow (authenticated):

  launchSwarmLocal() ──→ generate auth token ──→ store token hash in DB
       │                        │
       │                        └──→ inject AGENT_AUTH_TOKEN env var
       │
       └──→ agentLaunchWrapper.sh
              │
              ├── cd + path validation (phase 1)
              ├── export DEVHUB_AGENT_ID, AGENT_AUTH_TOKEN, ...
              ├── curl heartbeat (signed: X-Agent-Signature header)
              └── trap EXIT → curl events (signed)

Request Auth Flow:

  Agent → /api/agenthub/* ──→ verifyAgentAuth() middleware
       │                         │
       │                    ├─ dual-mode: X-Agent-Signature present?
       │                    │   NO  → log warning, allow (transition period)
       │                    │   YES → validate HMAC + timestamp ±30s
       │                    │
       │                    └──→ proceed to route handler

Supervisor Daemon Flow:

  processManager.ensure() ──→ startSupervisorDaemon(30000)
       │
       └──→ every 30s:
              │
              ├── query active workspaces (status IN ('ready','active','paused','orphaned'))
              ├── for each workspace:
              │     ├── fetch latest run + artifact + snapshot
              │     ├── evaluateSupervisorSnapshot(task, workspace, run, artifact, ...)
              │     └── enforce action (UPDATE ... WHERE, or insert event)
              └── log cycle stats
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/swarm/agentAuth.js` | **Create** | Token generation, HMAC signing helpers, middleware `verifyAgentAuth()` |
| `src/lib/swarm/agentAuth.test.js` | **Create** | Unit tests for token gen, signing, verification, timestamp validation |
| `src/lib/db/localDb.js` | **Modify** | Add `agent_auth_tokens` + `agent_events` tables, PTY columns on `agent_workspaces` |
| `src/lib/db/localDb.test.js` | **Modify** | Tests for new tables and columns |
| `src/lib/swarm/processManager.js` | **Modify** | Add `startSupervisorDaemon()` / `stopSupervisorDaemon()`, call in `ensure()` / `shutdown()` |
| `src/lib/swarm/supervisorLoop.test.js` | **Modify** | Tests for daemon lifecycle (start, stop, tick evaluation) |
| `src/lib/agentLaunchWrapper.js` | **Modify** | Accept `authToken` param, inject `AGENT_AUTH_TOKEN` env var, sign heartbeat/exit curl |
| `src/lib/terminal/ttyServer.js` | **Modify** | Update `agent_workspaces` row with pane_id/terminal_id/opencode_pid on session attach |
| `src/app/api/agenthub/events/route.js` | **Modify** | Write to `agent_events` table, keep backward compat with mission_messages for transition |
| `src/app/api/agenthub/_middleware.js` | **Create** | Next.js middleware applying `verifyAgentAuth()` to all `/api/agenthub/*` routes |
| `src/app/api/agenthub/heartbeat/route.js` | **Modify** | Validate signed requests (or pass-through in dual-mode) |

## Interfaces / Contracts

### `agentAuth.js`

```js
// Token provisioning (called at launch time)
generateAuthToken(agentId: string, missionId: string): { token: string, expiresAt: string }
storeAuthToken(db, { agentId, tokenHash, issuedAt, expiresAt }): void
signRequest(token: string, timestamp: string, bodyHash: string): string  // HMAC-SHA256
verifyRequest(db, { agentId, signature, timestamp, bodyHash }): { valid: boolean, reason?: string }

// Next.js middleware
verifyAgentAuth(handler: Function): Function  // wraps route handler, injects req.agentId
```

### `agent_events` table schema

```sql
CREATE TABLE IF NOT EXISTS agent_events (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  workspace_id TEXT,
  run_id TEXT,
  mission_id TEXT,
  event_type TEXT NOT NULL CHECK(event_type IN (
    'agent_booted', 'agent_shutdown', 'workspace_orphaned',
    'quota_blocked', 'process_exit', 'heartbeat_missed',
    'cwd_verified', 'task_started', 'task_progress',
    'task_completed', 'needs_help', 'handoff_ready',
    'workspace_created', 'workspace_error', 'crash_detected'
  )),
  event_data TEXT,  -- JSON blob
  status_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (workspace_id) REFERENCES agent_workspaces(id),
  FOREIGN KEY (run_id) REFERENCES agent_runs(run_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_type ON agent_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_events_mission ON agent_events(mission_id, created_at DESC);
```

### `agent_auth_tokens` table schema

```sql
CREATE TABLE IF NOT EXISTS agent_auth_tokens (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  mission_id TEXT,
  token_hash TEXT NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT,
  revoked_at TEXT,
  FOREIGN KEY (agent_id) REFERENCES agent_workspaces(agent_id)
);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_agent ON agent_auth_tokens(agent_id, issued_at DESC);
CREATE INDEX IF NOT EXISTS idx_auth_tokens_hash ON agent_auth_tokens(token_hash);
```

### PTY identity columns on `agent_workspaces`

```sql
ALTER TABLE agent_workspaces ADD COLUMN pane_id TEXT;
ALTER TABLE agent_workspaces ADD COLUMN terminal_id TEXT;
ALTER TABLE agent_workspaces ADD COLUMN opencode_pid INTEGER;
```

### Supervisor daemon interface

```js
// Added to processManager instance
startSupervisorDaemon(intervalMs = 30000): void  // idempotent, no-op if already running
stopSupervisorDaemon(): void                      // clears interval, logs stats
getSupervisorStatus(): { running: boolean, lastTickAt: string, tickCount: number, errors: number }
```

## Testing Strategy

| Layer | What to Test | Approach |
|-------|-------------|----------|
| Unit | Token generation, HMAC signing, verification | `agentAuth.test.js` — pure functions, no DB needed for sign/verify |
| Unit | Timestamp validation (±30s window, future rejection) | `agentAuth.test.js` — mock clock |
| Unit | Dual-mode middleware (signed accepted, unsigned warned, unsigned rejected after cutoff) | `agentAuth.test.js` — mock Next.js Request |
| Unit | `agent_events` table creation, insert, query | `localDb.test.js` — in-memory DB |
| Unit | PTY column addition, null handling, update | `localDb.test.js` — in-memory DB |
| Unit | Supervisor daemon start/stop, tick evaluation | `supervisorLoop.test.js` — mock DB, mock setInterval |
| Integration | Auth middleware + route handler end-to-end | Supertest-style against real route |
| Integration | Agent launch with auth token injection | Test `buildAgentLaunchWrapper` output includes signing |
| Integration | Event POST → `agent_events` table → GET query | Test full route handler |

## Migration / Rollout

### Auth Dual-Mode Transition

1. **Phase A (Deploy auth middleware in warn mode)**: `verifyAgentAuth()` logs warnings for unsigned requests but allows them. All `/api/agenthub/*` routes proceed normally. Agents continue working without tokens.
2. **Phase B (Deploy agent signing)**: `agentLaunchWrapper.js` starts signing requests with `AGENT_AUTH_TOKEN`. New agents send signed requests; old agents still send unsigned (allowed, warned).
3. **Phase C (Enforce auth)**: After all agents are relaunched with tokens, flip config `AGENT_AUTH_ENFORCED=true`. Middleware rejects unsigned requests with 401.

No data migration needed — `agent_auth_tokens` table is new, `agent_events` table is new, PTY columns are nullable.

### PTY Columns

Columns added via `ALTER TABLE` in `ensureRuntimeSchema()`. Existing rows get NULL — this is correct (unknown identity for pre-existing workspaces). Next launch or session attach will populate.

### Agent Events

New table alongside existing `mission_messages` + `agent_traces`. The `/api/agenthub/events` route will write to BOTH during transition, then switch to `agent_events` only after verification.

### Supervisor Daemon

Starts automatically in `processManager.ensure()`. No migration — daemon evaluates existing data structures. Can be disabled with `SUPERVISOR_DAEMON_ENABLED=false` env var.

## Rollback Plan

| Change | Rollback |
|--------|----------|
| Auth middleware | Remove `verifyAgentAuth()` from middleware chain. Delete `agent_auth_tokens` table. Remove `AGENT_AUTH_TOKEN` from agentLaunchWrapper. |
| PTY columns | Stop writing pane_id/terminal_id/opencode_pid. Columns remain nullable, no data loss. |
| Agent events | Route back to `mission_messages` + `agent_traces`. Drop `agent_events` table. |
| Supervisor daemon | Set `SUPERVISOR_DAEMON_ENABLED=false`. Remove `startSupervisorDaemon()` call from `ensure()`. |

Each change is **independently revertible** — no cascading dependencies between the four.

## Open Questions

- [ ] Should `agent_auth_tokens` have a `token_hash` or store plain `token` for simpler debugging during development? (Proposal: hash in production, plain in dev via env var)
- [ ] Event type enum: merge with existing `VALID_EVENT_TYPES` in events route, or define a new canonical enum? (Proposal: new canonical enum in `agentAuth.js` / `agentEvents.js`)
- [ ] Supervisor daemon: should it also emit `agent_events` rows for actions taken (e.g., `workspace_orphaned`)? (Proposal: yes, emit events for enforced actions)