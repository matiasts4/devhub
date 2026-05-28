# Exploration: swarm-reliability-phase2

## Current State

### Auth: ZERO authentication on all agent API routes
Every endpoint under `/api/agenthub/` is completely open. No middleware, no token validation, no API key checks. Any HTTP client that can reach the server can:
- Impersonate any agent by sending heartbeats with a fabricated `agent_id`
- Inject fake events via `/api/agenthub/events`
- Claim tasks as any agent
- Post director approvals or supervisor snapshots
- Launch swarms, create workspaces, and modify agent presence

The heartbeat route (`presence/heartbeat/route.js`) only validates that `agent_id` and `state` are non-empty strings — no proof of identity. The events route similarly accepts any `agent_id`. The MCP server (`devhub-mcp/server.js`) runs via stdio with no authentication — it trusts whatever process spawns it. There is no `middleware.js` in the project; Next.js middleware does not exist.

### PTY/Session Identity: terminalId exists in-memory only
The `ttyServer.js` manages PTY sessions with a `terminalId` field, and `processManager.js` tracks sessions in-memory via `activeSessions: Map<sessionId, {startTime, agent, project}>`. The DB `agent_workspaces` table has NO `pane_id`, `pty_id`, or `terminal_id` column. The `agent_hub_sessions` table has `opencode_session_id` but no PTY linkage. The `startupRestoreCoordinator.js` correlates terminal sessions to agent registry entries by `opencodeSessionId`, but this is in-memory and evaporates on restart.

The `registered_agents` DB table has `agent_id`, `project_id`, `profile_key`, `status` — but no PID binding. The `swarm_processes` table has `pid` and `port`, but no link to agent identity or workspace.

### Supervisor: Pure function, no daemon
`supervisorLoop.js` exports only `evaluateSupervisorSnapshot` — a pure deterministic function. It takes a snapshot of (task, workspace, run, artifacts) and returns what state the supervisor should be in. It does NOT:
- Run on a timer or interval
- Kill processes
- Enforce lease expiry
- Automatically recover orphans

It is called on-demand: when the health endpoint is polled, or when the MCP supervisor tools are invoked. If nobody polls, orphans accumulate forever. `processManager.js` has `cleanupOrphans()` which cleans dead PID entries, but it only runs during `ensure()` (server startup) or when explicitly called.

### Events: Only mission_messages + agent_traces
Cross-mission coordination uses `mission_messages` with `message_deliveries` for per-recipient tracking. The events route appends to both `mission_messages` (as `message_kind='status'`) and `agent_traces` (as `trace_type='agent_event'`). There is no `agent_events` table. Events are mission-scoped — no cross-mission event bus, no pub/sub, no event replay. The `teamTell.js` module delivers messages through OpenCode sessions (verified binding to a running session).

## Affected Areas

- `src/app/api/agenthub/presence/heartbeat/route.js` — accepts any agent_id without proof; needs auth verification
- `src/app/api/agenthub/events/route.js` — same: any client can inject events as any agent
- `src/app/api/agenthub/operations/health/route.js` — POST actions (launch_swarm_local, claim_next_task, create_local_mission_message) all unauthenticated
- `src/app/api/agenthub/sessions/route.js` — session creation with no auth
- `src/app/api/agenthub/director-approval/route.js` — approval/denial of checkpoints with no verification
- `src/app/api/agenthub/supervisor/snapshot/route.js` — supervisor state writes with no auth
- `src/lib/swarm/supervisorLoop.js` — pure function needs daemon wrapper
- `src/lib/swarm/processManager.js` — has PID tracking but no agent identity binding
- `src/lib/terminal/ttyServer.js` — terminalId/session in-memory, no DB persistence
- `src/lib/swarm/runtimeStatus.js` — diagnoses orphans but doesn't enforce
- `src/lib/db/localDb.js` — schema needs pane_id/terminal_id columns on agent_workspaces; needs agent_events table
- `src/lib/swarm/teamTell.js` — mission-scoped only; needs cross-mission event support
- `devhub-mcp/server.js` — stdio-based with no auth; mirrors local DB with no verification

## Approaches

### 1. Signed Agent Auth with HMAC tokens — **RECOMMENDED**

Provision a shared secret per agent at launch time. Agent signs each request with `HMAC-SHA256(secret, timestamp + body_hash)`. API middleware validates the signature and checks timestamp freshness (±30s). Agent_id is bound to the token — you can't impersonate another agent.

- Pros: No network dependency; secret is provisioned at launch and never transmitted; fast verification; works with local-only deployments; timestamps prevent replay attacks
- Cons: Requires agent launch flow to provision secrets; agents must implement signing (opencode wrapper already runs agent commands, can inject env var); key rotation requires relaunch
- Effort: Medium

**Implementation sketch:**
1. New table `agent_auth_tokens` with `agent_id, token_hash, issued_at, expires_at`
2. New middleware function `verifyAgentAuth(request)` that checks `X-Agent-Id` + `X-Agent-Signature` + `X-Agent-Timestamp`
3. At swarm launch (`launchSwarmLocal`), generate token, store hash, inject `AGENT_AUTH_TOKEN` env var into agent process
4. `agentLaunchWrapper.js` already wraps commands — add token injection there
5. Apply middleware to all `/api/agenthub/*` routes
6. MCP server trusts stdio (local process) — no change needed there

### 2. Mutual TLS with per-agent certs

Each agent gets a unique TLS client certificate at launch. The server validates the cert and extracts the agent identity from the CN field.

- Pros: Cryptographically strong; bidirectional auth; no secret management
- Cons: Massive complexity for a local-first tool; requires PKI infrastructure or self-signed CA; agent processes (opencode CLI) don't natively support client certs; doesn't fit the architecture — most agents run as child processes, not separate network clients
- Effort: High

### 3. API key per agent (simple bearer token)

Generate a long-lived API key per agent registration. Agent includes `Authorization: Bearer <key>` on every request.

- Pros: Trivially simple to implement; well-understood pattern
- Cons: Token is long-lived — if leaked, anyone can impersonate that agent indefinitely; no built-in replay protection; bearer tokens transmitted in headers are visible in logs; no binding to process lifecycle
- Effort: Low

### 4. PID-Bound Authentication (process verification only)

Instead of crypto tokens, bind agent identity to OS process ID. When an API request comes in, verify the source process (e.g., via `/proc/net/tcp` on Linux) matches a registered agent PID.

- Pros: No token management at all; impossible to impersonate from different machine/process
- Cons: Linux-specific; doesn't work for MCP or remote agents; PID recycling creates attack window; complex to implement correctly in Node.js; doesn't work with reverse proxies
- Effort: Medium-High

### For PTY/Session Identity (Gap 2)

**Approach A: Add pane_id + terminal_id columns to agent_workspaces**
- Migration adds `pane_id TEXT`, `terminal_id TEXT`, `opencode_pid INTEGER` to `agent_workspaces`
- `agentLaunchWrapper.js` reports these after launch
- ttyServer session events update the workspace row
- Allows supervisor to link a stale PTY to its workspace for cleanup

- Pros: Minimal schema change; links terminal reality to durable state; enables orphan PTY cleanup
- Cons: Need to update all workspace write paths; pane_id only known after terminal spawn
- Effort: Low

**Approach B: Separate agent_terminal_bindings table**
- New table joining agent_id + workspace_id + terminal_id + opencode_session_id
- More flexible for many-terminals-per-agent scenarios
- Pros: Normalized; doesn't pollute agent_workspaces schema
- Cons: Another table; more JOINs; overkill for current 1:1 agent-terminal mapping
- Effort: Low-Medium

### For Supervisor Daemon (Gap 3)

**Approach A: In-process setInterval daemon in processManager**
- Add `startSupervisorDaemon(intervalMs = 30000)` that runs evaluateSupervisorSnapshot on all active workspaces periodically
- Enforce actions: kill orphan processes, transition expired leases, request approvals
- Already has processManager singleton with signal handlers — add daemon start/stop there

- Pros: Simple; reuses existing code paths; no new dependencies; processManager already manages lifecycle
- Cons: Runs in the Next.js server process; could conflict with request-driven evaluations; needs debouncing to avoid double-acting
- Effort: Medium

**Approach B: Separate supervisor worker process**
- A dedicated `supervisor-worker.js` that runs independently, reads DB, takes enforcement actions
- Can be managed by processManager or as a separate systemd/pm2 service
- Pros: Isolation; can be restarted independently; won't block API responses
- Cons: More complex deployment; inter-process coordination; another process to manage
- Effort: High

### For Cross-Mission Events (Gap 4)

**Approach A: Add agent_events table + mission-scoped event bus is sufficient**
- Current `mission_messages` + `agent_traces` already handle in-mission events
- Add an `agent_events` table for cross-mission events (agent_booted, agent_shutdown, workspace_orphaned, quota_blocked)
- Event producers write to this table; consumers poll or use SSE
- No need for a full pub/sub system yet

- Pros: Extends existing schema naturally; simple polling works; can upgrade to SSE later
- Cons: Polling adds latency; no fan-out to multiple consumers yet
- Effort: Low-Medium

**Approach B: Redis pub/sub or EventEmitter-based event bus**
- Full in-process event emitter or Redis adapter for fan-out
- Pros: Real-time; scalable; proper pub/sub semantics
- Cons: Over-engineering for current needs (1-5 agents per swarm); adds Redis dependency; persistent event ordering complex
- Effort: Medium-High

## Recommendation

**Primary: Signed Agent Auth (Approach 1) + PTY columns (Gap 2 Approach A) + Supervisor daemon (Gap 3 Approach A) + agent_events table (Gap 4 Approach A)**

Rationale:
1. **Auth is CRITICAL and must come first.** HMAC-signed tokens are the right balance — they work locally, require no external dependencies, and bind identity to the launch flow. The agentLaunchWrapper already provisions environment for agents; adding `AGENT_AUTH_TOKEN` is natural.
2. **PTY columns** are a low-risk schema addition that immediately enables orphan PTY detection and cleanup.
3. **Supervisor as in-process daemon** is pragmatic — processManager already manages lifecycle; the 30s interval is enough for local swarms; we can graduate to a separate worker later.
4. **agent_events table** is the minimum viable cross-mission event system. No Redis needed; the current polling architecture (5s intervals in the UI) already works.

Implementation order: Auth → PTY columns → agent_events → Supervisor daemon. Auth blocks everything else — without it, any agent can impersonate any other agent, making all other enforcement moot.

## Risks

- **Auth rollout requires coordinated change**: The agent launch flow, all API routes, and the agent runtime wrapper must all be updated simultaneously. If routes are protected before agents can authenticate, the swarm breaks.
- **HMAC key distribution**: The shared secret must be injected at launch time and never logged. If the wrapper logs environment variables, secrets leak.
- **Supervisor daemon race conditions**: Request-driven evaluations and daemon-driven evaluations could conflict if they run on the same workspace concurrently. Need row-level locking or idempotent actions.
- **Migration safety**: Adding columns to agent_workspaces requires a migration. SQLite `ALTER TABLE ADD COLUMN` is safe, but the CI column CHECK constraint (`status NOT IN ('ready', 'active') OR branch_name IS NOT NULL...`) may need adjustment for nullable pane_id.
- **Backward compatibility**: MCP tools bypass auth (stdio trust). If we later add remote MCP, we'll need a separate auth layer. Current design must not block this.

## Ready for Proposal

Yes — the exploration covers all four gaps with concrete approaches. The recommended order is clear (auth first). The orchestrator should tell the user:

> The four gaps are real and interconnected. Signed agent auth is the critical blocker — without it, all other enforcement is theater. I recommend implementing in this order: (1) HMAC agent auth, (2) pane_id/terminal_id columns on agent_workspaces, (3) agent_events table, (4) supervisor daemon as in-process setInterval. Want me to proceed to the proposal phase?