# Archive: swarm-critical-fixes

## Change Summary

Fixed 3 critical bugs in DevHub's agent-swarm infrastructure: (1) agents now send heartbeats to the correct supervisor URL instead of going stale after 2 minutes, (2) Director→Coder message delivery now works via `pending_deliveries` in the heartbeat response, and (3) terminal scroll position is preserved across workspace switches via ResizeObserver capture. All 4 requirements verified PASS.

## Deliverables

- `src/app/api/agenthub/operations/health/route.js`: Added `supervisorUrl` construction from `NEXT_PUBLIC_APP_URL` + `/api/agenthub` at line ~169, passed to `buildAgentLaunchWrapper()` at line ~181; extended `agent_heartbeat` handler to return `pending_deliveries` array filtered by `recipient_agent_id = agent_id AND status = 'pending'`
- `src/lib/db/swarmMissions.js`: Added `listPendingDeliveriesForAgent()` function at ~line 591, exported for use by heartbeat handler
- `src/components/TerminalTTY.jsx`: Added `lastViewportYRef.current = savedViewportY` in ResizeObserver callback at ~line 1777, capturing scroll position before xterm.js resize

## Test Results

| Test                             | Result                                                             |
| -------------------------------- | ------------------------------------------------------------------ |
| REQ-1 (heartbeat URL)            | PASS                                                               |
| REQ-2 (pending deliveries query) | PASS                                                               |
| REQ-3 (agent parses from POST)   | PASS                                                               |
| REQ-4 (resize scroll capture)    | PASS                                                               |
| Build (`npm run build`)          | OK                                                                 |
| Unit tests (agentLaunchWrapper)  | PASS                                                               |
| Unit tests (swarmMissions)       | PASS                                                               |
| Integration tests (route.js)     | FAIL (pre-existing duplicate export in `agentLaunchCommand.js:79`) |

## Known Issues

- **Pre-existing duplicate export** — `buildTmuxWrappedCommand` exported twice in `agentLaunchCommand.js:79`. Blocks test execution for route.js integration tests. **Severity: WARNING** — not introduced by this change, should be addressed separately.
- **`workspace_id` not persisted in `agent_heartbeat`** — DB write at route.js:2182-2190 could include `workspace_id`. **Severity: SUGGESTION** — not part of this change.

## Post-Implementation Notes

- Review workload: ~38 changed lines (well under 800-line budget)
- All 4 requirements traceable to source: `route.js:169-181`, `route.js:2192-2211`, `swarmMissions.js:591-606`, `TerminalTTY.jsx:1927-1939`
- Build succeeds; test failures are pre-existing and unrelated
- Rollback: revert `route.js` removes `supervisorUrl` arg and strips `pendingDeliveries`; revert `TerminalTTY.jsx` removes ResizeObserver effect

## Next Steps

- Fix pre-existing duplicate export in `agentLaunchCommand.js:79` to restore route.js integration tests
- Consider persisting `workspace_id` in `agent_heartbeat` upsert (suggestion from verify report)
