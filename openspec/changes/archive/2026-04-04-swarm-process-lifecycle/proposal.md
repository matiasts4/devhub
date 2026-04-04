# Proposal: Swarm Process Lifecycle & Concurrency Limits

## Intent

Fix memory leaks from orphaned opencode serve processes (~1.8GB RAM each) and add configurable global concurrency limits for swarm agents. Currently, the bot and Next.js independently spawn opencode serve processes on the same port with no coordination, no shutdown on Next.js restart, and no way for users to limit concurrent agents.

## Scope

### In Scope

- Centralized process manager singleton for opencode serve lifecycle (spawn, track, shutdown)
- Proper process cleanup on Next.js exit (SIGTERM/SIGINT handlers)
- Configurable max concurrent swarms (default 5) persisted in SQLite `swarm_config` table
- Settings UI in Ajustes.jsx for swarm limit configuration
- Concurrency enforcement in headless API route — reject/queue when limit reached
- Visual feedback in SwarmControl showing limit status, active count, and queued agents
- Bot ↔ Next.js process coordination to prevent double spawn

### Out of Scope

- Changing OpenCode binary or internal behavior
- Modifying Telegram bot's internal session handling (only process sharing/coordination)
- Performance optimization of individual agents
- Per-project concurrency limits (global only for now)

## Capabilities

### New Capabilities

- `swarm-process-lifecycle`: Centralized management of opencode serve process lifecycle including spawn coordination, tracking, and graceful shutdown across bot and Next.js contexts
- `swarm-concurrency-limits`: Configurable global concurrency limits for swarm agents with persistent settings, enforcement at API level, and UI feedback

### Modified Capabilities

- `swarm-observability`: SwarmControl must now display concurrency limit status (active/max) and queue state alongside existing execution cards

## Approach

1. **Process Manager** (`src/lib/swarm/processManager.js`): Singleton that owns the opencode serve lifecycle — tracks PID, port, spawn state; provides `start()`, `stop()`, `isRunning()`; registers exit handlers for cleanup
2. **SQLite Config** (`swarm_config` table): Key-value store for `max_concurrent_swarms` (default 5); read by API routes, written by settings UI
3. **Headless Route Update**: Import process manager, check concurrency before spawning, reject with 429 + queue position when limit reached
4. **Bot Coordination**: Bot queries `/api/agenthub/opencode/status` before spawning; uses shared process manager instead of independent spawn
5. **Settings UI**: New "Swarm" section in Ajustes.jsx with number input for max concurrent agents
6. **SwarmControl UI**: Show "X/Y agents active" badge, queue indicator when limit reached

## Affected Areas

| Area                                            | Impact   | Description                                                    |
| ----------------------------------------------- | -------- | -------------------------------------------------------------- |
| `src/lib/swarm/processManager.js`               | New      | Centralized opencode serve lifecycle manager singleton         |
| `src/app/api/agenthub/headless/route.js`        | Modified | Use process manager, add concurrency check (429 when at limit) |
| `src/app/api/agenthub/opencode/status/route.js` | New      | GET endpoint for bot to check process state                    |
| `src/lib/db/localDb.js`                         | Modified | Add `swarm_config` table (key, value, updated_at)              |
| `src/app/api/settings/swarm/route.js`           | New      | GET/PUT for swarm config                                       |
| `src/views/Ajustes.jsx`                         | Modified | Add Swarm settings tab/section with limit input                |
| `src/views/SwarmControl.jsx`                    | Modified | Show concurrency status badge and queue indicator              |
| `telegram-bot/services/opencode.js`             | Modified | Use shared status endpoint instead of independent spawn        |

## Risks

| Risk                                                | Likelihood | Mitigation                                                                             |
| --------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| Breaking existing running sessions during migration | Medium     | Process manager detects existing process on port 4153 and adopts it instead of killing |
| Orphan detection false positives                    | Low        | Verify process is actually opencode serve via `/health` endpoint before killing        |
| SQLite write contention on config                   | Low        | Single-row updates, WAL mode already enabled                                           |
| Bot spawn race condition with Next.js               | Medium     | Use file lock or atomic port check before spawning                                     |

## Rollback Plan

1. Process manager is additive — existing independent spawn behavior remains as fallback if `processManager.js` import fails
2. `swarm_config` table is additive — no data loss on rollback
3. Concurrency check can be disabled by setting `max_concurrent_swarms = 0` (unlimited)
4. Git revert modified files; new files can be safely deleted
5. Orphaned processes can be manually killed: `lsof -ti:4153 | xargs kill`

## Dependencies

- `better-sqlite3` already installed and configured in `src/lib/db/localDb.js`
- OpenCode binary must be available in PATH
- Port 4153 must be available for opencode serve

## Success Criteria

- [ ] Only one opencode serve process runs on port 4153 regardless of how many components try to start it
- [ ] Process is properly killed when Next.js shuts down (no orphan consuming RAM)
- [ ] Concurrency limit enforced — 6th agent receives 429 with queue position
- [ ] User can change max concurrent swarms from 1-20 in Ajustes.jsx
- [ ] Setting persists across restarts (stored in SQLite)
- [ ] SwarmControl shows "3/5 agents active" status badge
- [ ] Bot detects existing process and does not double-spawn
