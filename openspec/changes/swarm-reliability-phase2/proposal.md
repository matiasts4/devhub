# Proposal: Swarm Reliability Phase 2

## Intent

Close 4 critical reliability gaps in DevHub Swarm: (1) ZERO authentication on all `/api/agenthub/*` routes — any client can impersonate any agent; (2) no PTY identity in the DB — on restart, PTY-session linkage is lost; (3) `supervisorLoop.js` is a pure function with no daemon — orphans accumulate forever if nobody polls; (4) no cross-mission event bus — only `mission_messages` exist, no lifecycle events for agent boot/shutdown/orphan detection.

## Scope

### In Scope
- HMAC-SHA256 signed agent auth: provision shared secret at launch, sign each request, validate timestamp ±30s
- Add `pane_id TEXT`, `terminal_id TEXT`, `opencode_pid INTEGER` columns to `agent_workspaces` (nullable)
- Add `agent_events` table for cross-mission lifecycle events (agent_booted, agent_shutdown, workspace_orphaned, quota_blocked)
- In-process supervisor daemon: `setInterval` in processManager, 30s cycle, enforce actions (kill orphans, expire leases, request approvals)
- Unit tests for all changes (strict_tdd: true)

### Out of Scope
- MCP server authentication (stdio trust model — separate concern)
- SSE/WebSocket event delivery (polling-only for now)
- UI changes for auth, PTY, or events
- Separate supervisor worker process
- Redis or external pub/sub
- Key rotation mechanism (requires relaunch)

## Capabilities

### New Capabilities
- `agent-signed-auth`: HMAC-SHA256 per-agent request authentication — shared secret provisioned at launch, each request signed with `HMAC-SHA256(secret, timestamp+body_hash)`, middleware validates signature and timestamp freshness ±30s on all `/api/agenthub/*` routes
- `agent-events`: cross-mission lifecycle event table with poll-based API — `agent_events` table stores events like agent_booted, agent_shutdown, workspace_orphaned, quota_blocked with timestamp, agent_id, workspace_id, and event metadata
- `supervisor-daemon`: in-process enforcement loop — `setInterval`-based daemon in processManager evaluates all active workspaces every 30s, enforces orphan cleanup, lease expiry, and approval escalation

### Modified Capabilities
- `swarm-process-lifecycle`: processManager singleton gains supervisor daemon lifecycle (start/stop) and PTY column persistence on workspace writes

## Approach

**Auth (1st)**: Add `agent_auth_tokens` table (agent_id, token_hash, issued_at, expires_at). At swarm launch, generate secret, store hash via `withDbWriteQueue`, inject `AGENT_AUTH_TOKEN` env var into agent process via `agentLaunchWrapper.js`. New middleware `verifyAgentAuth()` validates `X-Agent-Id` + `X-Agent-Signature` + `X-Agent-Timestamp` on every `/api/agenthub/*` route. Rollout: initially accept both authenticated and unauthenticated requests (log warnings for unauthenticated) to allow coordinated deployment.

**PTY Columns (2nd)**: `ALTER TABLE agent_workspaces ADD COLUMN pane_id TEXT`, `terminal_id TEXT`, `opencode_pid INTEGER` — all nullable. `ttyServer.js` session events update workspace rows. `agentLaunchWrapper.js` reports pane/terminal/pid after spawn. Existing CHECK constraint verified compatible with nullable columns.

**Agent Events (3rd)**: New `agent_events` table (id, agent_id, workspace_id, event_type, event_data JSON, created_at). Simple insert/query API. Event types enum: `agent_booted`, `agent_shutdown`, `workspace_orphaned`, `quota_blocked`. Poll-based GET endpoint. SSE upgrade path preserved for future.

**Supervisor Daemon (4th)**: Add `startSupervisorDaemon(intervalMs=30000)` / `stopSupervisorDaemon()` to processManager singleton. Each tick: query active workspaces via `evaluateSupervisorSnapshot`, enforce actions (kill orphan processes, transition expired leases, escalate approvals). Actions must be idempotent — daemon and request-driven evaluations can coexist. Start daemon in processManager `ensure()`, stop in graceful shutdown.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/swarm/agentAuth.js` | New | HMAC auth middleware + token provisioning |
| `src/lib/db/localDb.js` | Modified | Add `agent_auth_tokens` + `agent_events` tables, PTY columns on `agent_workspaces` |
| `src/lib/swarm/processManager.js` | Modified | Supervisor daemon start/stop + PTY column writes |
| `src/lib/swarm/supervisorLoop.js` | Modified | Idempotent action enforcement wrappers |
| `src/lib/swarm/agentLaunchWrapper.js` | Modified | Inject `AGENT_AUTH_TOKEN` env var + report pane_id/terminal_id/pid |
| `src/lib/terminal/ttyServer.js` | Modified | Update workspace row with PTY identity on session events |
| `src/app/api/agenthub/*/route.js` | Modified | Apply `verifyAgentAuth()` middleware |
| `src/app/api/agenthub/events/route.js` | Modified | Also write to `agent_events` for lifecycle types |
| `src/lib/swarm/teamTell.js` | Reference | Cross-mission event emission pattern |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Auth rollout breaks swarm if routes protected before agents sign | High | Dual-mode: accept both authenticated and unauthenticated during transition, log warnings |
| HMAC secret leaks via env var logging | Med | Redact `AGENT_AUTH_TOKEN` from all log output; never include in error messages |
| Supervisor race: daemon + request-driven eval conflict | Med | Enforce idempotent actions; use DB-level status transitions (CAS via `UPDATE ... WHERE status = ?`) |
| SQLite CHECK constraint on agent_workspaces rejects nullable columns | Low | Verify constraint allows NULL for new columns; adjust if needed |
| PTY columns always NULL for non-terminal agents | Low | Nullable by design; query filters handle NULL gracefully |

## Rollback Plan

Each change is independently revertible:
- **Auth**: Remove middleware from routes; remove `agent_auth_tokens` table; agents continue without auth
- **PTY columns**: `ALTER TABLE` additions are non-destructive; simply stop writing to the new columns
- **Agent events**: Remove `agent_events` table and GET endpoint; no other code depends on it yet
- **Supervisor daemon**: Call `stopSupervisorDaemon()` and remove the `setInterval`; supervisorLoop returns to on-demand-only

## Dependencies

- swarm-reliability-phase1 (COMPLETE): durable queue, explicit CWD, DB merge
- `agentLaunchWrapper.js` must be updated for both auth token injection AND PTY reporting in the same deploy
- `localDb.js` schema migrations must use `ALTER TABLE ADD COLUMN` pattern (SQLite-compatible)

## Success Criteria

- [ ] All `/api/agenthub/*` routes reject unauthenticated requests after rollout
- [ ] Agents authenticate with HMAC-SHA256 signature; replay attacks within ±30s window fail
- [ ] `agent_workspaces` rows include `pane_id`, `terminal_id`, `opencode_pid` after agent launch
- [ ] `agent_events` table records lifecycle events; poll endpoint returns them
- [ ] Supervisor daemon evaluates all active workspaces every 30s and enforces actions
- [ ] All existing tests pass; new test coverage for auth, PTY columns, events, and daemon