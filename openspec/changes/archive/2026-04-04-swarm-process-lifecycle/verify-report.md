# Verification Report: swarm-process-lifecycle

**Change**: swarm-process-lifecycle
**Version**: N/A
**Mode**: Standard (no Strict TDD — no test runner detected for these modules)

---

## Completeness

| Metric                       | Value                                |
| ---------------------------- | ------------------------------------ |
| Tasks total                  | 31                                   |
| Tasks complete (code exists) | ~25/31                               |
| Tasks incomplete             | 6 (all Phase 5 testing/manual tasks) |

**Incomplete tasks** (all Phase 5 — testing & manual verification):

- 5.1 Test: swarm_config table exists, default=5
- 5.2 Test: ensure() idempotency
- 5.3 Test: Concurrency enforcement — mock active>=limit
- 5.4 Test: Settings API — valid PUT=200, invalid PUT=400
- 5.5 Test: Bot coordination — mock health=200
- 5.6 Manual: orphan adoption verification
- 5.7 Manual: SIGINT shutdown verification

---

## Build & Tests Execution

**Build**: ➖ Not run (per AGENTS.md rules: "Never build after changes")
**Tests**: ➖ No unit tests exist for swarm-process-lifecycle modules
**Coverage**: ➖ Not available

---

## Spec Compliance Matrix (Behavioral Validation)

| Requirement                    | Scenario                          | Test   | Result      |
| ------------------------------ | --------------------------------- | ------ | ----------- |
| swarm-process-lifecycle REQ-1  | Singleton returns same instance   | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-1  | Process state is tracked          | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-2  | First component spawns process    | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-2  | Second component detects existing | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-2  | Orphaned process detected         | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-3  | Next.js shuts down normally       | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-3  | User presses Ctrl+C               | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-3  | Process already exited            | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-4  | Process on port is OpenCode       | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-4  | Process on port is NOT OpenCode   | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-5  | Process running and healthy       | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-5  | No process running                | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-6  | Bot starts when Next.js spawned   | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-6  | Bot starts first, Next.js later   | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-7  | start() called when running       | (none) | ❌ UNTESTED |
| swarm-process-lifecycle REQ-7  | stop() called when no process     | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-1 | Default value on first init       | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-1 | Valid value persisted             | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-1 | Invalid value rejected            | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-2 | Spawn within limit                | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-2 | Spawn at limit → 429              | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-2 | Unlimited mode (limit=0)          | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-3 | User changes limit via settings   | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-3 | Out-of-range value rejected       | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-3 | Settings load on page open        | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-4 | Normal operation below limit      | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-4 | All slots occupied                | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-4 | No agents running                 | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-5 | GET returns current config        | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-5 | PUT updates with valid value      | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-5 | PUT rejects invalid value         | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-6 | Agent spawn increments count      | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-6 | Agent completion decrements       | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-6 | Agent failure decrements          | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-7 | Limit reduced below active count  | (none) | ❌ UNTESTED |
| swarm-concurrency-limits REQ-7 | Limit increased                   | (none) | ❌ UNTESTED |
| swarm-observability            | Active below limit                | (none) | ❌ UNTESTED |
| swarm-observability            | All slots + queued                | (none) | ❌ UNTESTED |
| swarm-observability            | No agents running                 | (none) | ❌ UNTESTED |

**Compliance summary**: 0/38 scenarios have behavioral test evidence (all UNTESTED)

---

## Correctness (Static — Structural Evidence)

| Requirement                                                       | Status         | Notes                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **swarm-process-lifecycle REQ-1** (Singleton)                     | ✅ Implemented | `ProcessManager` exported as singleton instance (line 492). `getInstance()` static method exists.                                                                                                                                       |
| **swarm-process-lifecycle REQ-2** (Spawn coordination)            | ✅ Implemented | `ensure()` checks PID lock, adopts existing, or spawns. Health check before adoption.                                                                                                                                                   |
| **swarm-process-lifecycle REQ-3** (Graceful shutdown)             | ⚠️ Partial     | SIGTERM→3s→SIGKILL chain implemented. Uses `/global/dispose` first. **BUT**: spec requires 5s timeout, implementation uses 3s. `beforeExit` handler registered.                                                                         |
| **swarm-process-lifecycle REQ-4** (Health verification)           | ✅ Implemented | `healthCheck()` queries `/global/health` with 3s timeout. `adoptExisting()` verifies health before adoption.                                                                                                                            |
| **swarm-process-lifecycle REQ-5** (Status API)                    | ✅ Implemented | `GET /api/agenthub/opencode/status` returns `{process, concurrency, queue}` with all required fields.                                                                                                                                   |
| **swarm-process-lifecycle REQ-6** (Bot coordination)              | ✅ Implemented | Bot's `ensureServer()` checks `isServerRunning()` via `/global/health` before spawning.                                                                                                                                                 |
| **swarm-process-lifecycle REQ-7** (Manual control)                | ⚠️ Partial     | `ensure()` is idempotent. `shutdown()` returns early if nothing running. **BUT**: no explicit `start()`/`stop()` methods — uses `ensure()`/`shutdown()` instead.                                                                        |
| **swarm-concurrency-limits REQ-1** (Persistent config)            | ⚠️ Partial     | `swarm_config` table created. `getSwarmConfig()`/`setSwarmConfig()` exist. **BUT**: key is `max_concurrent` (not `max_concurrent_swarms` as spec requires). No validation in `setSwarmConfig()` itself — validation only in API routes. |
| **swarm-concurrency-limits REQ-2** (API enforcement)              | ✅ Implemented | Headless route checks `activeCount >= maxConcurrent`, returns 429 with queue info. Queue exists with polling.                                                                                                                           |
| **swarm-concurrency-limits REQ-3** (Settings UI)                  | ⚠️ Partial     | Swarm tab in Ajustes.jsx has slider (1-20), save button, toast feedback. **BUT**: calls `/api/agenthub/config` instead of `/api/settings/swarm`.                                                                                        |
| **swarm-concurrency-limits REQ-4** (Visual feedback)              | ✅ Implemented | SwarmControl.jsx shows concurrency badge "X/Y activos", server status indicator.                                                                                                                                                        |
| **swarm-concurrency-limits REQ-5** (Settings API)                 | ⚠️ Partial     | `/api/settings/swarm` route exists with GET/PUT and validation. **BUT**: UI uses `/api/agenthub/config` instead. Also, PUT allows value 0 (unlimited) but spec says range 1-20.                                                         |
| **swarm-concurrency-limits REQ-6** (Active agent tracking)        | ⚠️ Partial     | `getActiveAgentCount()` queries `agent_hub_sessions WHERE status='active'`. **BUT**: function is DUPLICATED (lines 913-919 and 925-931) and NOT EXPORTED in module.exports.                                                             |
| **swarm-concurrency-limits REQ-7** (Limit change during sessions) | ✅ Implemented | No agents are terminated when limit is lowered — new limit only affects new spawns.                                                                                                                                                     |
| **swarm-observability** (Concurrency display)                     | ✅ Implemented | Badge shows "X/Y activos" in SwarmControl header and process status row.                                                                                                                                                                |

---

## Coherence (Design)

| Decision                                         | Followed?   | Notes                                                                                                                                                                                                            |
| ------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Process Manager as singleton with PID lock       | ✅ Yes      | `data/.opencode.pid` file used. Singleton exported.                                                                                                                                                              |
| Concurrency enforcement at headless route        | ✅ Yes      | Headless route checks `getSwarmConfig()` + `getActiveAgentCount()` before spawning.                                                                                                                              |
| Queue as deferred launch (in-memory, 2s polling) | ✅ Yes      | `SwarmQueue` class with `setInterval` every 2s.                                                                                                                                                                  |
| Bot uses HTTP status endpoint                    | ✅ Yes      | Bot checks `/global/health` before spawning.                                                                                                                                                                     |
| `swarm_config` table with key `max_concurrent`   | ⚠️ Deviated | Design says key is `max_concurrent`, but spec says `max_concurrent_swarms`. Implementation uses `max_concurrent`. Config API route uses `max_concurrent_swarms` as field name. Inconsistent naming across files. |
| File changes table                               | ⚠️ Partial  | All files listed in design exist. **BUT**: `src/app/api/agenthub/config/route.js` was created but not in the design's file changes table.                                                                        |

---

## Issues Found

### CRITICAL (must fix before archive)

- [ ] **Duplicate `getActiveAgentCount()` in `localDb.js`** — Function defined twice (lines 913-919 and 925-931) and **NOT EXPORTED** in `module.exports`. The headless route and status route import it via `import { getActiveAgentCount } from '@/lib/db/localDb.js'` — this will cause a **runtime error** at import time since it's not in the exports.
- [ ] **Duplicate `ensureServer()` in `headless/route.js`** — Function defined twice (lines 24-27 and 30-33) with a stray closing brace `}` on line 28. While `node -c` passes (JS allows redeclaration in non-strict mode), this is dead code and the stray brace is a symptom of a bad merge/edit.
- [ ] **Duplicate state declarations in `Ajustes.jsx`** — `swarmConfig`/`swarmStatus`/`savingSwarm`/`loadingSwarm` declared twice (lines 358-364 and 367-373). `loadSwarmSettings()` and `saveSwarmSettings()` also duplicated (lines 472-492/522-542 and 494-520/544-570). Second declarations will shadow first ones — React will throw "Cannot redeclare block-scoped variable" at runtime.
- [ ] **Duplicate state declarations in `SwarmControl.jsx`** — `swarmProcessStatus` and `swarmConfig` declared twice (lines 539-543 and 546-550). Same shadowing issue — will cause runtime error.
- [ ] **`getActiveAgentCount` not exported** — The function is used by `headless/route.js`, `status/route.js`, and `queue.js` via destructured import, but it's absent from `module.exports`. This is a **hard runtime crash** waiting to happen.
- [ ] **Concurrency limit validation allows 0** — The spec (swarm-concurrency-limits REQ-1) says valid values are 1-20, or 0 for unlimited. The `/api/settings/swarm` PUT validates 1-20 but rejects 0. The `/api/agenthub/config` PUT also validates 1-20. The spec says 0 should mean unlimited, but both APIs reject it.

### WARNING (should fix)

- [ ] **Naming inconsistency: `max_concurrent` vs `max_concurrent_swarms`** — DB table uses key `max_concurrent` (design), but spec says `max_concurrent_swarms`. The config API (`/api/agenthub/config`) uses `max_concurrent_swarms` as the JSON field, while settings API (`/api/settings/swarm`) uses `maxConcurrent`. The UI (`Ajustes.jsx`) sends `max_concurrent_swarms` to `/api/agenthub/config`. This creates confusion and potential bugs.
- [ ] **UI calls wrong API endpoint** — `Ajustes.jsx` and `SwarmControl.jsx` call `/api/agenthub/config` for swarm settings instead of `/api/settings/swarm`. Both endpoints exist and do similar things but with different field names.
- [ ] **Shutdown timeout mismatch** — Spec REQ-3 says "wait up to 5 seconds" for SIGTERM, but implementation uses 3 seconds. Design also says 3s, so this is a spec/design inconsistency.
- [ ] **No `start()`/`stop()` public methods** — Spec REQ-7 requires explicit `start()`, `stop()`, and `isRunning()` methods. Implementation has `ensure()` (which acts as start) and `shutdown()` (which acts as stop), but no `isRunning()` method on the exported singleton.
- [ ] **No queue depth limit** — The queue is unbounded. Design's open question about max queue depth was never resolved.
- [ ] **`/api/agenthub/config` not in design file changes** — This route was created but not listed in the design document.
- [ ] **SwarmControl.jsx lacks queue indicator** — Spec (swarm-observability) requires "N agents queued" when `queue.length > 0`. The UI shows server status but no queue length indicator for pending agents.
- [ ] **No polling for live badge sync** — Task 4.5 requires polling the status endpoint every 5s for live badge/queue sync. `SwarmControl.jsx` fetches swarm status on mount but has no periodic polling for the concurrency badge.
- [ ] **Duplicate ALTER TABLE statement** — `localDb.js` line 223-225 duplicates the `idx_agent_hub_sessions_parent` index creation (also on line 219-221). Harmless but sloppy.
- [ ] **Bot's `shutdownServer()` doesn't SIGKILL fallback** — The bot's shutdown (line 156-166) sends SIGTERM and waits 3s, but doesn't send SIGKILL if the process is still running. Spec REQ-3 requires SIGKILL fallback.

### SUGGESTION (nice to have)

- [ ] **Add `isRunning()` method** to ProcessManager for clarity, matching the spec's REQ-7 API contract.
- [ ] **Add validation in `setSwarmConfig()`** at the DB helper level, not just at API routes, to prevent invalid values from being written by any caller.
- [ ] **Add queue depth indicator** to SwarmControl.jsx header when `queue.length > 0`.
- [ ] **Add periodic polling** (every 5s) in SwarmControl.jsx for live concurrency badge updates.
- [ ] **Consolidate the two config API routes** (`/api/agenthub/config` and `/api/settings/swarm`) into one, or clearly differentiate their purposes.
- [ ] **Add `max_concurrent_swarms` key seeding** in `ensureRuntimeSchema()` — currently the table is created but no default seed is inserted. The default of 5 relies on `parseInt(config.max_concurrent, 10) || 5` fallback logic.

---

## Verdict

**FAIL**

The implementation has **5 CRITICAL issues** that will cause runtime failures:

1. **`getActiveAgentCount` not exported** — headless route, status route, and queue will crash on import
2. **Duplicate variable declarations in `Ajustes.jsx`** — React will throw on component render
3. **Duplicate variable declarations in `SwarmControl.jsx`** — React will throw on component render
4. **Duplicate `ensureServer()` with stray brace in `headless/route.js`** — dead code, potential confusion
5. **Duplicate `getActiveAgentCount()` in `localDb.js`** — dead code, maintenance burden

These are not edge cases — they are **hard crashes** that will prevent the application from starting or rendering. The code passes `node -c` syntax checks because JavaScript allows redeclaration in non-strict mode, but the ESM imports (`import { getActiveAgentCount }`) will fail at runtime when the name is not in `module.exports`.

**Fix these 5 critical issues before this change can be archived.**
