# Tasks: Swarm Reliability Phase 2 — Auth, Identity, Events, Supervisor

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~850 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No (direct commits) |
| Suggested split | 5 atomic commits, one per phase |
| Delivery strategy | direct commits on current branch |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Commit | Notes |
|------|------|--------|-------|
| 1 | Schema + auth token provisioning | Phase 1 commit | base: current branch; AUTH-1/AUTH-4/AUTH-5 |
| 2 | Auth middleware + dual mode | Phase 2 commit | depends on Unit 1; AUTH-2/AUTH-3 |
| 3 | PTY identity + agent events | Phase 3 commit | depends on Unit 1 schema; PTY-1–4, EVT-1–5 |
| 4 | Supervisor daemon | Phase 4 commit | depends on Unit 3 (events); SVD-1–6 |
| 5 | Integration verification | Final commit | depends on all; cross-cutting |

## Phase 1: Schema + Auth Token Provisioning (AUTH-1, AUTH-4, AUTH-5)

- [x] 1.1 RED: Write `agentAuth.test.js` — test `generateAuthToken()` returns token+expiresAt, token is crypto-random 32+ bytes, hash matches SHA-256
- [x] 1.2 RED: Write `agentAuth.test.js` — test `storeAuthToken()` inserts row in `agent_auth_tokens`, test `revokeAuthToken()` deletes row
- [x] 1.3 RED: Write `agentAuth.test.js` — test token is NOT logged (redaction check in mock logger)
- [x] 1.4 GREEN: Create `src/lib/swarm/agentAuth.js` — implement `generateAuthToken()`, `storeAuthToken()`, `revokeAuthToken()`, `hashToken()`
- [x] 1.5 RED: Write `localDb.test.js` — test `agent_auth_tokens` table created with correct columns and indexes
- [x] 1.6 GREEN: Add `agent_auth_tokens` CREATE TABLE + indexes to `ensureRuntimeSchema()` in `src/lib/db/localDb.js`
- [x] 1.7 RED: Write `agentLaunchWrapper.test.js` — test `buildAgentLaunchWrapper()` output includes `export DEVHUB_AGENT_TOKEN=...` when token provided
- [x] 1.8 GREEN: Update `src/lib/agentLaunchWrapper.js` — accept `authToken` param, inject `DEVHUB_AGENT_TOKEN` env var, redact from logs

## Phase 2: Auth Middleware + Dual Mode (AUTH-2, AUTH-3)

- [x] 2.1 RED: Write `agentAuth.test.js` — test `signRequest()` produces correct HMAC-SHA256 signature over `timestamp.bodyHash`
- [x] 2.2 RED: Write `agentAuth.test.js` — test `verifyRequest()` accepts valid signature, rejects invalid signature (401), rejects expired timestamp (>30s)
- [x] 2.3 RED: Write `agentAuth.test.js` — test `verifyAgentAuth()` middleware: signed request → passes through, unsigned request + `AGENT_AUTH_ENFORCED=false` → warns + passes, unsigned request + `AGENT_AUTH_ENFORCED=true` → 401
- [x] 2.4 GREEN: Implement `signRequest()`, `verifyRequest()`, `verifyAgentAuth()` in `src/lib/swarm/agentAuth.js`
- [x] 2.5 RED: Write `agentAuth.test.js` — integration test: Next.js Request with headers → middleware injects `req.agentId`
- [x] 2.6 GREEN: Create `src/app/api/agenthub/_middleware.js` — apply `verifyAgentAuth()` to all `/api/agenthub/*` routes
- [x] 2.7 RED: Write test — `POST /api/agenthub/heartbeat` with valid auth headers → 200; without auth headers + enforced → 401
- [x] 2.8 GREEN: Update `src/app/api/agenthub/heartbeat/route.js` — ensure compatibility with `req.agentId` from middleware

## Phase 3: PTY Identity + Agent Events (PTY-1–4, EVT-1–5)

- [x] 3.1 RED: Write `localDb.test.js` — test `agent_workspaces` gains `pane_id TEXT`, `terminal_id TEXT`, `opencode_pid INTEGER` (nullable) after migration
- [x] 3.2 GREEN: Add ALTER TABLE statements for PTY columns in `ensureRuntimeSchema()` in `src/lib/db/localDb.js`
- [x] 3.3 RED: Write test — session activation updates `pane_id`, `terminal_id`, `opencode_pid` on workspace; termination clears to NULL
- [x] 3.4 GREEN: Add `updateWorkspacePtyIdentity(db, { workspaceId, paneId, terminalId, opencodePid })` and `clearWorkspacePtyIdentity(db, workspaceId)` to `localDb.js`
- [x] 3.5 GREEN: Update `src/lib/terminal/ttyServer.js` session-activate → call `updateWorkspacePtyIdentity`; session-terminate → call `clearWorkspacePtyIdentity`
- [x] 3.6 RED: Write `localDb.test.js` — test `agent_events` table created with columns, indexes, and valid `event_type` CHECK constraint
- [x] 3.7 GREEN: Add `agent_events` CREATE TABLE + indexes to `ensureRuntimeSchema()` in `src/lib/db/localDb.js`
- [x] 3.8 RED: Write test — `emitAgentEvent()` inserts row; unknown event_type → 400; duplicate `client_event_id` within 5s → 200 with existing ID
- [x] 3.9 RED: Write test — `queryAgentEvents()` filters by agent_id, type, since; returns capped 100 results ordered DESC
- [x] 3.10 GREEN: Create `src/lib/swarm/agentEvents.js` — implement `emitAgentEvent(db, event)`, `queryAgentEvents(db, filters)`, `VALID_EVENT_TYPES` enum, dedup logic
- [x] 3.11 RED: Write test — `POST /api/agenthub/events` with auth → 201 with event; without valid auth → 401 (enforced)
- [x] 3.12 RED: Write test — `GET /api/agenthub/events?agent_id=...&type=...&since=...` → filtered results; capped at 100
- [x] 3.13 GREEN: Update `src/app/api/agenthub/events/route.js` — POST writes to `agent_events` (dual-write to `mission_messages` for transition), GET queries `agent_events`

## Phase 4: Supervisor Daemon (SVD-1–6)

- [x] 4.1 RED: Write `supervisorLoop.test.js` — test `startSupervisorDaemon()` sets interval (mock setInterval), `stopSupervisorDaemon()` clears it, second `startSupervisorDaemon()` is no-op
- [x] 4.2 RED: Write test — `SUPERVISOR_DAEMON_ENABLED=false` → no interval created, log message emitted
- [x] 4.3 GREEN: Add `startSupervisorDaemon(intervalMs)`, `stopSupervisorDaemon()`, `getSupervisorStatus()` to `src/lib/swarm/processManager.js`; call start in `ensure()`, stop in `shutdown()`
- [x] 4.4 RED: Write test — tick evaluation: workspace `active` + `last_heartbeat` > 90s → `UPDATE ... SET status='orphaned' WHERE status='active'` + emit `workspace_orphaned` event
- [x] 4.5 RED: Write test — workspace `active` + `last_heartbeat` within 90s → no status change
- [x] 4.6 GREEN: Implement orphan detection in daemon tick: query active workspaces with stale heartbeat, CAS update, emit event via `agentEvents.emitAgentEvent()`
- [x] 4.7 RED: Write test — task `in_progress` + stale `claim_token` → `UPDATE ... SET status='pending', claim_token=NULL, assigned_to=NULL, started_at=NULL` + emit `supervisor_action` event
- [x] 4.8 GREEN: Implement lease expiry in daemon tick: query stale-lease tasks, CAS release, emit event
- [x] 4.9 RED: Write test — CAS conflict: API sets `status='completed'` before daemon `WHERE status='active'` → UPDATE matches 0 rows, no conflicting state change
- [x] 4.10 GREEN: Verify all enforcement actions use `WHERE status = ?` CAS pattern (idempotent by design)
- [x] 4.11 RED: Write test — daemon tick emits `supervisor_action` event with `payload_json` containing `action`, `target_id`, `previous_status`
- [x] 4.12 GREEN: Ensure every enforcement action calls `emitAgentEvent()` with proper payload after successful CAS

## Phase 5: Integration Verification

- [x] 5.1 Write integration test: agent launch → token provisioned → heartbeat with valid HMAC → 200; heartbeat without auth + enforced → 401
- [x] 5.2 Write integration test: workspace created → PTY columns NULL → session activated → columns populated → session terminated → columns NULL
- [x] 5.3 Write integration test: daemon detects orphan workspace → marks `orphaned` → emits `workspace_orphaned` event → API rejects stale token on orphaned agent
- [x] 5.4 Verify all import paths resolve correctly (`agentAuth`, `agentEvents`, `processManager` daemon additions)
- [x] 5.5 Run full test suite (`npm test`) — all existing tests pass + all new tests pass
