# Tasks: Swarm Process Lifecycle & Concurrency Limits

## Phase 1: Foundation — Database & Process Manager

- [ ] 1.1 Add `swarm_config` table to `ensureRuntimeSchema()` in `src/lib/db/localDb.js` with seed `max_concurrent` = `'5'` [swarm-concurrency-limits REQ-1]
- [ ] 1.2 Add `getSwarmConfig(key)` and `setSwarmConfig(key, value)` helpers to `src/lib/db/localDb.js` with validation (int 0-20) [swarm-concurrency-limits REQ-1, REQ-5]
- [ ] 1.3 Create `src/lib/swarm/processManager.js` singleton with `getInstance()`, internal state (pid, port, startTime, status), PID lock file at `data/.opencode.pid` [swarm-process-lifecycle REQ-1]
- [ ] 1.4 Implement `ensure(cwd)`: check PID lock → verify process → health check `/global/health` → adopt or spawn [swarm-process-lifecycle REQ-2, REQ-4]
- [ ] 1.5 Implement `shutdown()`: POST `/global/dispose` → SIGTERM → 3s wait → SIGKILL → delete PID lock [swarm-process-lifecycle REQ-3]
- [ ] 1.6 Implement `getStatus()` returning `{ running, pid, port, uptime, memoryRss, status }` [swarm-process-lifecycle REQ-5, REQ-7]
- [ ] 1.7 Implement `healthCheck()` querying `http://localhost:4153/global/health` [swarm-process-lifecycle REQ-4]
- [ ] 1.8 Register `SIGTERM`, `SIGINT`, `beforeExit` handlers calling `shutdown()` [swarm-process-lifecycle REQ-3]

## Phase 2: Core — Concurrency Queue & API Routes

- [ ] 2.1 Create `src/lib/swarm/queue.js` with `enqueue()`, `dequeue()`, `getQueueLength()`, `getPosition()`, polling loop every 2s [swarm-concurrency-limits REQ-2]
- [ ] 2.2 Create `src/app/api/agenthub/opencode/status/route.js` GET returning `{ process, concurrency, queue }` [swarm-process-lifecycle REQ-5]
- [ ] 2.3 Create `src/app/api/settings/swarm/route.js` with GET/PUT for `max_concurrent` (validate 1-20, 400 on invalid) [swarm-concurrency-limits REQ-3, REQ-5]
- [ ] 2.4 Add `getActiveAgentCount()` to `src/lib/db/localDb.js` — count `agent_hub_sessions WHERE status='active'` [swarm-concurrency-limits REQ-6]
- [ ] 2.5 Modify `src/app/api/agenthub/headless/route.js`: replace `ensureServer()` with `ProcessManager.ensure()`, add concurrency check [swarm-concurrency-limits REQ-2]
- [ ] 2.6 Add 429 response: when `active >= max`, enqueue and return `{ error, active, max, queued, queuePosition }` [swarm-concurrency-limits REQ-2]
- [ ] 2.7 Add queue consumer: on dequeue, proceed with spawn flow, set session status 'active' [swarm-concurrency-limits REQ-2]
- [ ] 2.8 Decrement active count on session completion in SSE consumer `finally` block [swarm-concurrency-limits REQ-6]

## Phase 3: Bot Coordination

- [ ] 3.1 Modify `telegram-bot/services/opencode.js` `ensureServer()`: query `/global/health` first, skip spawn if healthy [swarm-process-lifecycle REQ-6]
- [ ] 3.2 Modify `shutdownServer()`: graceful shutdown (dispose → SIGTERM → 3s → SIGKILL) only if bot owns process [swarm-process-lifecycle REQ-3]
- [ ] 3.3 Add `getServerStatus()` export querying `/api/agenthub/opencode/status` on Next.js [swarm-process-lifecycle REQ-5]

## Phase 4: UI Integration

- [ ] 4.1 Add "Swarm" section to `src/views/Ajustes.jsx`: number input (1-20), pre-filled from API, save via PUT, toast feedback [swarm-concurrency-limits REQ-3]
- [ ] 4.2 Add input validation: disable save for out-of-range values, show inline error [swarm-concurrency-limits REQ-3]
- [ ] 4.3 Add concurrency badge to `src/views/SwarmControl.jsx`: "X/Y agents active" from status endpoint [swarm-observability REQ, swarm-concurrency-limits REQ-4]
- [ ] 4.4 Add queue indicator: show "N agents queued" when `queue.length > 0` [swarm-observability REQ]
- [ ] 4.5 Poll status endpoint every 5s for live badge/queue sync [swarm-concurrency-limits REQ-4]

## Phase 5: Testing & Cleanup

- [ ] 5.1 Test: `swarm_config` table exists, default=5, persists across reads [swarm-concurrency-limits REQ-1]
- [ ] 5.2 Test: `ensure()` idempotency — call twice, one process, same PID [swarm-process-lifecycle REQ-7]
- [ ] 5.3 Test: Concurrency enforcement — mock active>=limit, verify 429 response [swarm-concurrency-limits REQ-2]
- [ ] 5.4 Test: Settings API — valid PUT=200, invalid PUT=400, DB unchanged [swarm-concurrency-limits REQ-5]
- [ ] 5.5 Test: Bot coordination — mock health=200, verify skip spawn [swarm-process-lifecycle REQ-6]
- [ ] 5.6 Manual: kill all opencode, restart Next.js, verify orphan adoption [swarm-process-lifecycle REQ-2]
- [ ] 5.7 Manual: SIGINT on Next.js, verify opencode killed, port 4153 freed [swarm-process-lifecycle REQ-3]
