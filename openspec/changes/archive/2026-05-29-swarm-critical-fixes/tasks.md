# Tasks: swarm-critical-fixes

## Review Workload Forecast

| Field                   | Value     |
| ----------------------- | --------- |
| Estimated changed lines | 45–60     |
| 400-line budget risk    | Low       |
| Chained PRs recommended | No        |
| Suggested split         | Single PR |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Low

## Suggested Work Units

| Unit | Goal            | Likely PR | Notes                                   |
| ---- | --------------- | --------- | --------------------------------------- |
| 1    | All 3 bug fixes | PR 1      | Self-contained, low-risk, all in one PR |

---

## Phase 1: Bug Fixes

### Task 1: Pass `supervisorUrl` to `buildAgentLaunchWrapper()`

**File**: `src/app/api/agenthub/operations/health/route.js`
**Lines**: ~168–176
**What**: Add `supervisorUrl` parameter constructed from `process.env.NEXT_PUBLIC_APP_URL + '/api/agenthub'` to the `buildAgentLaunchWrapper()` call at line 168. Fallback to `'http://localhost:3000'` if env var is unset.
**Verify**: Run existing agent-launch tests; confirm `DEVHUB_SUPERVISOR_URL` appears in wrapper output.

- [x] 1.1 Add `supervisorUrl` variable before the `buildAgentLaunchWrapper()` call (lines ~165–167)
- [x] 1.2 Pass `supervisorUrl` to the `buildAgentLaunchWrapper()` options object

---

### Task 2: Implement `listPendingDeliveriesForAgent()` in swarmMissions

**File**: `src/lib/db/swarmMissions.js`
**Lines**: ~569 (after `listPendingMessageDeliveriesForMission`)
**What**: Add `listPendingDeliveriesForAgent(db, agentId, options)` function that queries `message_deliveries` directly by `recipient_agent_id`, filters `status IN ('pending', 'retry_pending')`, orders by `updated_at DESC`, and respects `limit`. Export it.
**Verify**: Unit test: seed a delivery for agent-123 with status=pending, call function, assert delivery returned.

- [x] 2.1 Implement `listPendingDeliveriesForAgent()` function after `listPendingMessageDeliveriesForMission`
- [x] 2.2 Add to module exports at bottom of `swarmMissions.js`

---

### Task 3: Include `pending_deliveries` in `agent_heartbeat` response

**File**: `src/app/api/agenthub/operations/health/route.js`
**Lines**: ~2186–2191
**What**: In the `agent_heartbeat` handler, after `upsertAgentPresence()`, call `listPendingDeliveriesForAgent()` and return the mapped array as `pending_deliveries` in the JSON response. Map to minimal shape: `{ delivery_id, message_id, sender_agent_id, payload, created_at, status }`.
**Verify**: Integration test: seed pending delivery for agent, POST heartbeat, assert `pending_deliveries` array appears in response.

- [x] 3.1 Import `listPendingDeliveriesForAgent` from `@/lib/db/swarmMissions` at top of route.js (check existing imports)
- [x] 3.2 Call `listPendingDeliveriesForAgent(writeDb, agent_id, { status: 'pending', limit: 50 })` after `upsertAgentPresence()`
- [x] 3.3 Map result to minimal shape and add `pending_deliveries` to the return JSON

---

### Task 4: Capture `lastViewportYRef` before `sendResize()` in ResizeObserver

**File**: `src/components/TerminalTTY.jsx`
**Lines**: ~1927–1938
**What**: In the ResizeObserver callback, add `lastViewportYRef.current = savedViewportY` BEFORE calling `sendResize()`. This ensures the ref always holds the latest scroll position for the `isVisibleInLayout` effect to restore on workspace switches.
**Verify**: Add unit test: mock ResizeObserver callback, verify `lastViewportYRef.current` is set before `sendResize` is called.

- [x] 4.1 Add `lastViewportYRef.current = savedViewportY;` line after `const savedViewportY = getTerminalViewportScrollOffset(termRef.current);` and before `sendResize()`
