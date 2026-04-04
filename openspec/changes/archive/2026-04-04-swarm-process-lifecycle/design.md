# Design: Swarm Process Lifecycle & Concurrency Limits

## Technical Approach

Centralize opencode serve lifecycle into a singleton `ProcessManager` module (`src/lib/swarm/processManager.js`) shared by both the Telegram bot and Next.js headless route. Add a `swarm_config` SQLite table for persistent concurrency limits, enforced at the headless API entry point with a queue fallback. The bot transitions from independent spawn to HTTP-based coordination via a new status endpoint. Orphan detection runs on every Next.js startup and periodically via health checks.

References: proposal `sdd/swarm-process-lifecycle/proposal`

## Architecture Decisions

### Decision: Process Manager as Node.js singleton with file-based PID lock

| Option                               | Tradeoff                                     | Decision |
| ------------------------------------ | -------------------------------------------- | -------- |
| In-memory singleton only             | Lost on Next.js HMR/restart, orphans persist | ❌       |
| File-based PID lock + adoption       | Survives restarts, can adopt orphans         | ✅       |
| External daemon (systemd/supervisor) | Overkill for local-first app                 | ❌       |

**Rationale**: Next.js dev server restarts frequently. A file lock (`data/.opencode.pid`) lets a restarted server find and adopt the existing process instead of spawning a duplicate.

### Decision: Concurrency enforcement at headless route level

| Option                            | Tradeoff                            | Decision |
| --------------------------------- | ----------------------------------- | -------- |
| Hardcoded constant (current)      | No runtime config, requires restart | ❌       |
| SQLite swarm_config + route check | Persistent, configurable via UI/API | ✅       |
| Redis-based distributed lock      | Overkill for single-machine         | ❌       |

**Rationale**: The app is local-first with better-sqlite3. SQLite is already the single source of truth. A simple `active_count` query before launch is sufficient.

### Decision: Queue as deferred launch (not a separate worker)

| Option                        | Tradeoff                                    | Decision |
| ----------------------------- | ------------------------------------------- | -------- |
| In-memory queue with polling  | Simple, no extra deps, fits current pattern | ✅       |
| BullMQ/Redis queue            | Heavy dependency, overkill                  | ❌       |
| Reject immediately (429 only) | Bad UX, user must retry manually            | ❌       |

**Rationale**: The headless route already uses fire-and-forget background SSE consumers. An in-memory queue with periodic polling (every 2s) to check if a slot opened is consistent with existing patterns.

### Decision: Bot uses HTTP status endpoint, not shared module

| Option                             | Tradeoff                                                        | Decision |
| ---------------------------------- | --------------------------------------------------------------- | -------- |
| Shared require() of processManager | Bot runs in separate Node process, can't import Next.js modules | ❌       |
| HTTP status endpoint on port 4153  | Bot already talks to opencode server, reuse same pattern        | ✅       |
| Unix socket IPC                    | Complex, platform-dependent                                     | ❌       |

**Rationale**: The bot and Next.js are separate processes. The bot already communicates with opencode via HTTP on port 4153. Adding a `/global/health` check + process info endpoint requires zero new infrastructure.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js Server                        │
│                                                              │
│  ┌──────────────────────┐    ┌────────────────────────────┐ │
│  │  /api/agenthub/      │    │  ProcessManager (singleton)│ │
│  │  headless/route.js   │───►│  - PID lock file           │ │
│  │  (launch entry)      │    │  - spawn/shutdown          │ │
│  │                      │    │  - orphan adoption         │ │
│  │  1. check concurrency│    │  - health checks           │ │
│  │  2. check/launch     │    │  - process tracking        │ │
│  │  3. consume SSE      │    └────────────┬───────────────┘ │
│  └──────────────────────┘                 │                  │
│                                           │ spawn            │
│  ┌──────────────────────┐    ┌────────────▼───────────────┐ │
│  │  /api/settings/      │    │   opencode serve           │ │
│  │  swarm/route.js      │    │   (port 4153)              │ │
│  │  (CRUD swarm_config) │    │                            │ │
│  └──────────────────────┘    │  /global/health            │ │
│                               │  /global/dispose           │ │
│  ┌──────────────────────┐    │  /session                  │ │
│  │  SwarmControl.jsx    │    │  /event (SSE)              │ │
│  │  (dashboard)         │    └────────────────────────────┘ │
│  │  Shows: "3/5 activos"│                                   │
│  │  Queue indicator     │                                   │
│  └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Telegram Bot (separate process)           │
│                                                              │
│  ┌──────────────────────┐    ┌────────────────────────────┐ │
│  │  services/           │    │  HTTP coordination          │ │
│  │  opencode.js         │───►│  1. GET /global/health     │ │
│  │                      │    │  2. If running → use it    │ │
│  │  Checks health first │    │  3. If not → spawn own     │ │
│  │  before spawning     │    └────────────────────────────┘ │
│  └──────────────────────┘                                   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     SQLite (devhub.db)                       │
│                                                              │
│  swarm_config          agent_hub_sessions    agent_traces    │
│  ──────────────        ──────────────────    ────────────    │
│  key (PK)              id (PK)               id (PK)         │
│  value                 project_id            session_id      │
│  updated_at            status                trace_type      │
│                        opencode_session_id   ...             │
└─────────────────────────────────────────────────────────────┘
```

## Sequence Diagrams

### Launch Flow (with concurrency check)

```
Client          Headless Route       ProcessManager        SQLite           OpenCode
  │                  │                     │                  │                │
  │──POST prompt───►│                     │                  │                │
  │                  │──SELECT value──────►│                  │                │
  │                  │  FROM swarm_config  │◄──max_concurrent │                │
  │                  │                     │                  │                │
  │                  │──SELECT count(*)    │                  │                │
  │                  │  FROM agent_hub_    │◄──active_count   │                │
  │                  │   sessions          │                  │                │
  │                  │  WHERE status='active'                 │                │
  │                  │                     │                  │                │
  │                  │◄── if active >= max ─│                  │                │
  │                  │   enqueue & return   │                  │                │
  │◄──202 {queued}── │                     │                  │                │
  │                  │                     │                  │                │
  │                  │── if slot available ─│                  │                │
  │                  │                     │──health check───►│                │
  │                  │                     │◄──not running────│                │
  │                  │                     │──spawn───────────────────────►│   │
  │                  │                     │◄──ready──────────────────────│   │
  │                  │                     │                  │                │
  │                  │──create session─────────────────────►│                │
  │                  │◄──sessionID──────────────────────────│                │
  │                  │──insert session (active)────────────►│                │
  │                  │──start SSE consumer (background)     │                │
  │◄──200 {sessionID, messageID}                            │                │
```

### Shutdown Flow (graceful)

```
Next.js exit     ProcessManager        OpenCode
     │                  │                  │
     │──process exit──►│                  │
     │                  │──POST /global/dispose──►│
     │                  │◄──200 OK──────────────│
     │                  │──SIGTERM (PID)───────►│
     │                  │     (wait 3s)         │
     │                  │──if still alive──────►│
     │                  │──SIGKILL (PID)───────►│
     │                  │──delete PID lock file │
     │                  │──update sessions      │
     │                  │   status='terminated' │
     │◄──clean exit──── │
```

### Bot Coordination Flow

```
Bot              OpenCode Server (4153)     Next.js ProcessManager
 │                      │                          │
 │──GET /global/health─►│                          │
 │◄──200 OK──────────── │                          │
 │  (server running)    │                          │
 │                      │                          │
 │──use existing server │                          │
 │  (no spawn needed)   │                          │
 │                      │                          │
 │──if health fails────►│                          │
 │  spawn own instance  │                          │
 │  (fallback)          │                          │
```

## Data Model

### swarm_config table

```sql
CREATE TABLE IF NOT EXISTS swarm_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Default: max_concurrent = 5
INSERT OR IGNORE INTO swarm_config (key, value) VALUES ('max_concurrent', '5');
```

| key              | value | Description                    |
| ---------------- | ----- | ------------------------------ |
| `max_concurrent` | `"5"` | Max active swarm agents (1-20) |

### Process tracking (in-memory, not persisted)

```js
// ProcessManager internal state
{
  pid: number,
  startTime: Date,
  port: number,
  status: 'starting' | 'healthy' | 'unhealthy' | 'stopped',
  lastHealthCheck: Date,
  memoryRss: number,  // from process.memoryUsage()
}
```

## File Changes

| File                                            | Action     | Description                                                                              |
| ----------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| `src/lib/swarm/processManager.js`               | **Create** | Singleton process manager with PID lock, spawn, shutdown, orphan adoption, health checks |
| `src/app/api/agenthub/opencode/status/route.js` | **Create** | GET endpoint returning process status, active count, concurrency limit, queue length     |
| `src/app/api/settings/swarm/route.js`           | **Create** | GET/PUT swarm config (max_concurrent)                                                    |
| `src/lib/db/localDb.js`                         | **Modify** | Add `swarm_config` table creation in `ensureRuntimeSchema()` + helper functions          |
| `src/app/api/agenthub/headless/route.js`        | **Modify** | Replace inline spawn with ProcessManager, add concurrency check + queue logic            |
| `src/views/Ajustes.jsx`                         | **Modify** | Add "Swarm" tab with number input for max_concurrent (1-20, default 5)                   |
| `src/views/SwarmControl.jsx`                    | **Modify** | Show current/limit badge ("3/5 activos"), queue status, limit-reached indicator          |
| `telegram-bot/services/opencode.js`             | **Modify** | Check `/global/health` before spawning, use shared server when available                 |

## Interfaces / Contracts

### ProcessManager API

```js
// src/lib/swarm/processManager.js

class ProcessManager {
  // Singleton access
  static getInstance() → ProcessManager

  // Lifecycle
  async ensure(cwd: string) → Promise<{ pid: number, port: number }>
  async shutdown() → Promise<void>

  // Orphan detection
  async adoptOrphans() → Promise<{ adopted: number, killed: number }>

  // Health
  async healthCheck() → Promise<{ healthy: boolean, pid: number, memoryRss: number }>

  // Status
  getStatus() → {
    running: boolean,
    pid: number | null,
    port: number,
    uptime: number | null,
    memoryRss: number | null,
    status: 'starting' | 'healthy' | 'unhealthy' | 'stopped'
  }
}
```

### API: GET /api/agenthub/opencode/status

```json
{
  "process": {
    "running": true,
    "pid": 12345,
    "port": 4153,
    "uptime": 3600000,
    "memoryRss": 1887436800,
    "status": "healthy"
  },
  "concurrency": {
    "active": 3,
    "max": 5,
    "atLimit": false
  },
  "queue": {
    "length": 0,
    "estimatedWaitMs": 0
  }
}
```

### API: GET /api/settings/swarm

```json
{
  "max_concurrent": 5
}
```

### API: PUT /api/settings/swarm

**Request:**

```json
{
  "max_concurrent": 8
}
```

**Response:**

```json
{
  "success": true,
  "max_concurrent": 8
}
```

**Validation:** `max_concurrent` must be integer 1-20. Returns 400 if invalid.

### Concurrency enforcement response (429)

```json
{
  "error": "Límite de concurrencia alcanzado",
  "active": 5,
  "max": 5,
  "queued": true,
  "queuePosition": 2,
  "estimatedWaitMs": 30000
}
```

### Queue response (202 Accepted)

```json
{
  "success": true,
  "queued": true,
  "queuePosition": 1,
  "estimatedWaitMs": 15000,
  "sessionID": null
}
```

## Error Handling Strategy

| Scenario                      | Behavior                                 | HTTP Status      |
| ----------------------------- | ---------------------------------------- | ---------------- |
| Concurrency limit reached     | Enqueue request, poll for slot           | 202 (queued)     |
| OpenCode fails to start       | Return error, do not enqueue             | 503              |
| Health check timeout (15s)    | Kill process, retry spawn once           | 503              |
| Orphan detected on startup    | Adopt if healthy, kill if zombie         | N/A (internal)   |
| SIGTERM not responding (3s)   | Force SIGKILL                            | N/A (internal)   |
| Invalid swarm_config value    | Reject with 400, keep previous value     | 400              |
| Queue position timeout (5min) | Remove from queue, notify client via SSE | N/A              |
| Process dies mid-session      | Mark session as 'error', attempt respawn | N/A (background) |

### Graceful shutdown chain

1. **POST `/global/dispose`** — tells opencode to clean up sessions
2. **SIGTERM** — graceful OS-level termination (3s timeout)
3. **SIGKILL** — force kill if SIGTERM fails

### Orphan detection algorithm

```
On Next.js startup:
  1. Read PID from data/.opencode.pid
  2. If PID file exists:
     a. Check if process is running (process.kill(pid, 0))
     b. If running → check /global/health
        - healthy → adopt (update internal state, don't spawn)
        - unhealthy → kill + clean up
     c. If not running → stale PID, delete file
  3. If no PID file:
     a. Scan for opencode processes on port 4153
     b. If found → adopt (write PID file, update state)
     c. If not found → clean start
```

## Testing Strategy

| Layer       | What to Test                            | Approach                                                           |
| ----------- | --------------------------------------- | ------------------------------------------------------------------ |
| Unit        | ProcessManager spawn/shutdown lifecycle | Mock `child_process.spawn`, verify PID lock file creation/deletion |
| Unit        | Orphan adoption logic                   | Mock `process.kill`, `fs.existsSync`, simulate stale PID           |
| Unit        | Concurrency check (active >= max)       | Mock SQLite queries, verify 429 vs 200                             |
| Unit        | Queue polling mechanism                 | Mock setInterval, verify dequeue when slot opens                   |
| Integration | Headless route with ProcessManager      | Start real opencode serve (if available), end-to-end launch        |
| Integration | Settings API CRUD                       | PUT/GET swarm_config, verify persistence in SQLite                 |
| E2E         | Bot coordination flow                   | Start bot, verify it detects running server, doesn't double-spawn  |

## Migration / Rollout

**No data migration required.** The `swarm_config` table is created with `CREATE TABLE IF NOT EXISTS` and seeded with `INSERT OR IGNORE` on first access.

**Rollout phases:**

1. Deploy `processManager.js` + `swarm_config` table (no behavior change yet)
2. Update headless route to use ProcessManager (orphan cleanup on first restart)
3. Add settings UI + concurrency enforcement
4. Update bot to check health before spawning

**Rollback:** If issues arise, the headless route falls back to its existing inline `ensureServer()` logic via feature flag `SWARM_PROCESS_MANAGER=false`.

## Open Questions

- [ ] Should the queue have a maximum depth (e.g., max 20 queued requests) or unbounded?
- [ ] Should orphan detection also scan for opencode processes on ports other than 4153 (in case of port conflicts)?
- [ ] Does the bot need write access to swarm_config, or is read-only (via status endpoint) sufficient?
