# Delta Spec: swarm-critical-fixes

> **Status**: Implemented — 2026-05-29
> All 4 requirements verified PASS. Change archived.

## Overview

Three critical bugs that break multi-agent swarm operation: (1) agents go stale after 2 minutes due to missing supervisor URL in heartbeat launch wrapper, (2) Director→Coder message delivery fails due to missing pending_deliveries in heartbeat response, and (3) terminal scroll resets on every workspace switch due to missing resize-event scroll capture. All are bug fixes to existing `agent-swarm` capability.

---

## System Behavior

### Before

| Bug       | Behavior                                                                                                                                                       |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heartbeat | `buildAgentLaunchWrapper()` called without `supervisorUrl`; heartbeat loop never POSTs to correct endpoint; agents marked stale after 2 min                    |
| Polling   | `agent_heartbeat` endpoint returns only `{ ok, agent_id, mission_id, last_seen_at }`; no pending deliveries; Director messages queue but never reach Coder     |
| Scroll    | `lastViewportYRef` updated only on visibility toggle (`isVisibleInLayout`); resize events do not save scroll; xterm.js reinitialize causes scroll reset to top |

### After

| Bug       | Behavior                                                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Heartbeat | `supervisorUrl` passed from `NEXT_PUBLIC_APP_URL/api/agenthub`; heartbeat POSTs every 30s; TTL 120s keeps agents alive                                                     |
| Polling   | `agent_heartbeat` returns `pending_deliveries` filtered by `recipient_agent_id = agent_id AND status = 'pending'`; agent parses from same POST response                    |
| Scroll    | `lastViewportYRef` captured on ResizeObserver events BEFORE xterm.js processes resize; restoration after 120ms debounce; existing `reactivateTerminalViewport` as fallback |

---

## Requirements & Scenarios

### REQ-1: Heartbeat loop POSTs to supervisor with correct URL

The system MUST pass `supervisorUrl` to `buildAgentLaunchWrapper()` at the call site in `route.js:168`. The URL value MUST be constructed from `process.env.NEXT_PUBLIC_APP_URL` + `/api/agenthub`.

- Scenario: Agent starts → `supervisorUrl` derived from env var → `buildAgentLaunchWrapper()` receives URL → heartbeat loop POSTs to `{supervisorUrl}/presence/heartbeat` every 30s
- Scenario: Env var missing → agent logs warning, uses fallback URL derived from `NEXT_PUBLIC_APP_URL` + `/api/agenthub`

### REQ-2: Agent heartbeat endpoint returns pending deliveries for calling agent

The `agent_heartbeat` POST handler at `route.js` MUST query `pending_deliveries` filtered by `recipient_agent_id = callingAgentId AND status = 'pending'` and include the results in the response.

- Scenario: Coder agent POSTs heartbeat → endpoint returns `{ ok, agent_id, mission_id, last_seen_at, pending_deliveries: [...] }` filtered for Coder's agent_id
- Scenario: No pending deliveries → endpoint returns empty array `pending_deliveries: []`
- Scenario: Agent not found → endpoint returns `{ ok: false, error: "agent_not_found" }` with 404

### REQ-3: Agent heartbeat loop parses pending deliveries from POST response

The agent-side heartbeat loop MUST parse `pending_deliveries` from the same POST response it already receives, without issuing a separate GET request.

- Scenario: Coder receives heartbeat response with pending deliveries → Coder processes each delivery → messages delivered to Coder's terminal
- Scenario: Empty deliveries array → no action taken, loop continues

### REQ-4: Terminal scroll position saved on resize events

`TerminalTTY.jsx` MUST capture scroll position via `lastViewportYRef` on ResizeObserver events, BEFORE xterm.js resize processing. The restoration MUST occur after resize completes using the existing 120ms debounce pattern.

- Scenario: User switches workspace → ResizeObserver fires → `lastViewportYRef` saved BEFORE xterm.js resize → resize completes → scroll restored to saved position
- Scenario: Non-resize visibility toggle → existing `isVisibleInLayout` effect handles save/restore (unchanged)
- Scenario: xterm.js resize completes before restore → existing `reactivateTerminalViewport` safety net activates

---

## Acceptance Criteria

- [ ] `route.js:168` calls `buildAgentLaunchWrapper()` with `supervisorUrl` argument
- [ ] `supervisorUrl` value = `process.env.NEXT_PUBLIC_APP_URL` + `/api/agenthub`
- [ ] Heartbeat POSTs every 30s to `/api/agenthub/presence/heartbeat` with TTL 120s
- [ ] `agent_heartbeat` response includes `pending_deliveries` array filtered by `recipient_agent_id = agent_id AND status = 'pending'`
- [ ] Agent heartbeat loop parses deliveries from same POST response (no extra GET)
- [ ] `lastViewportYRef` updated on ResizeObserver events before xterm.js resize
- [ ] Scroll restoration fires after resize completes (120ms debounce pattern)
- [ ] `reactivateTerminalViewport` fallback still functions for edge cases
- [ ] Rollback: revert `route.js` removes `supervisorUrl` arg and strips `pendingDeliveries` from response; revert `TerminalTTY.jsx` removes ResizeObserver effect
