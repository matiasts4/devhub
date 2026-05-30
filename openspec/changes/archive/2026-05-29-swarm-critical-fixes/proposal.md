# Proposal: swarm-critical-fixes

## Intent

Fix 3 critical bugs that break multi-agent swarm operation. Without these fixes, agents go stale after 2 minutes (Bug 1), Director→Coder communication is impossible (Bug 2), and terminal scroll resets on every workspace switch (Bug 3). These must be resolved before any swarm feature work can proceed.

## Scope

### In Scope

- Bug 1 (heartbeat): Pass `supervisorUrl` to `buildAgentLaunchWrapper()` at route.js:168; verify heartbeat loop runs
- Bug 2 (polling): Modify `agent_heartbeat` endpoint to return `pending_deliveries` filtered for calling agent; agent-side consumption logic
- Bug 3 (scroll): Save scroll position on resize events, not only on visibility toggles; ensure xterm.js settles before restore

### Out of Scope

- Any changes to agent role logic, mission assignment, or swarm orchestration beyond the above
- Terminal theme, styling, or non-scroll UX improvements
- Changes to `pending_deliveries` table schema

## Capabilities

### New Capabilities

- None — all three are bug fixes to existing capabilities

### Modified Capabilities

- `agent-swarm` (existing): Bug fixes to heartbeat, message polling, and terminal scroll — no new spec changes required

## Approach

### Bug 1 — Heartbeat

Pass `supervisorUrl` argument to `buildAgentLaunchWrapper()` at `src/app/api/agenthub/operations/health/route.js:168`. The wrapper's `buildHeartbeatLoopCommand()` and `buildInitialHeartbeatCommand()` already handle the URL correctly; they just need it supplied.

### Bug 2 — Message Polling

Modify the `agent_heartbeat` POST handler at `route.js:2163` to query `pending_deliveries` filtered by `target_agent_id = callingAgentId AND status = 'pending'`, then include those records in the heartbeat response JSON. The agent-side heartbeat loop already POSTs; it will consume the returned deliveries on next cycle.

### Bug 3 — Terminal Scroll

Add a `useEffect` on `TerminalTTY.jsx` that saves scroll position via `lastViewportYRef` on `ResizeObserver` events, before the terminal viewport changes. The existing visibility-based effect remains as a fallback for non-resize hide/show cases.

## Affected Areas

| Area                                              | Impact    | Description                                                                |
| ------------------------------------------------- | --------- | -------------------------------------------------------------------------- |
| `src/app/api/agenthub/operations/health/route.js` | Modified  | Add `supervisorUrl` arg; extend heartbeat response with pending deliveries |
| `src/lib/agentLaunchWrapper.js`                   | No change | Already correct; needs param wired at call site                            |
| `src/components/TerminalTTY.jsx`                  | Modified  | Add ResizeObserver scroll capture before viewport changes                  |
| `src/components/TerminalWorkspacesManager.jsx`    | No change | Context provider only; bug is in consumer                                  |

## Risks

| Risk                                                   | Likelihood | Mitigation                                                                     |
| ------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------ |
| Bug 2 response change breaks agent heartbeat consumers | Low        | Add optional `pendingDeliveries` field; existing callers ignore unknown fields |
| ResizeObserver causes performance issues               | Low        | Debounce scroll saves; only capture, don't restore, on resize                  |
| xterm.js resize timing still broken after fix          | Medium     | Keep existing RAF+timeout reactivation logic as safety net                     |

## Rollback Plan

1. Revert `route.js` — remove `supervisorUrl` argument and strip `pendingDeliveries` from heartbeat response
2. Revert `TerminalTTY.jsx` — remove ResizeObserver effect, restore original visibility-only logic
3. No schema migration needed (no DB changes)
4. No state migration needed

## Success Criteria

- [ ] Agent heartbeat POST includes valid `supervisorUrl` curl command (verified via logs)
- [ ] `pending_deliveries` filtered by `target_agent_id` appear in heartbeat response
- [ ] Terminal scroll position is preserved across workspace switch (resize + visibility toggle)
- [ ] All three fixes verified in swarm test (Director→Coder kickoff round-trip completes)
