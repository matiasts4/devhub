# Proposal: swarm-bidirectional-optimizations

## Intent

Improve Swarm agent-to-director reliability through 8 targeted optimizations covering delivery lifecycle completion, heartbeat robustness, background loop survival, event delivery, circuit breaking, broadcast fan-out, token reuse, and crash recovery.

## Scope

### In Scope
- Add `consumed` as terminal delivery state (swarm-durable-queue)
- Agent-side heartbeat backoff + Director stale/offline tracking (swarm-process-lifecycle, supervisor-daemon)
- Background loops (`_devhub_heartbeat_loop`, `_devhub_pending_deliveries_loop`) survive HUP via `nohup`/`disown` (swarm-process-lifecycle)
- Long-poll optimization for `/events` (agent-events)
- Circuit breaker on `_devhub_tell_director` with 3 retries and persistence (swarm-process-lifecycle)
- Director broadcast fan-out via `recipient_agent_ids: ['*']` (swarm-durable-queue)
- Reconnection token reuse within 24h grace period (agent-hmac-auth)
- Wrapper auto-restart on non-zero exit (swarm-process-lifecycle)

### Out of Scope
- SSE channel migration (deferred to future change)
- Modifying delivery retry logic beyond adding `consumed` state

## Capabilities

### New Capabilities
- **delivery-consumed-state**: Add `consumed` as terminal delivery state in `swarm_delivery_log`. `ack_delivery` transitions to `consumed`; no further transitions allowed. Affects `swarm-durable-queue`.
- **heartbeat-backoff**: Agent-side exponential backoff (120s→240s→480s, max 15min) on heartbeat failures. Director tracks `stale`/`offline` status. Affects `swarm-process-lifecycle`, `supervisor-daemon`.
- **background-loop-survival**: Background loops use `nohup` + `disown` so they survive opencode exit. Affects `swarm-process-lifecycle`.
- **event-long-poll**: `GET /events?since=<timestamp>` with 30s server timeout reduces polling load. Affects `agent-events`.
- **director-circuit-breaker**: `_devhub_tell_director` retries 3x with exponential backoff (1s/2s/4s); circuit state persisted to `/tmp/devhub-circuit-{agent_id}`. Affects `swarm-process-lifecycle`.
- **broadcast-fan-out**: `recipient_agent_ids: ['*']` or empty array fans out to all active mission participants. Affects `swarm-durable-queue`.
- **token-reuse-grace**: Reuse non-expired tokens within 24h on reconnect; add `expires_at` to `agent_auth_tokens`. Affects `agent-hmac-auth`.
- **agent-auto-restart**: Wrapper self-restart loop re-executes inner command on non-zero exit, max 3 restarts, 5s delay. Affects `swarm-process-lifecycle`.

### Modified Capabilities
- None — all are net-new capabilities or behavioral extensions to existing specs.

## Approach

Implement per-capability in individual code files. Auto-restart and background loop survival modify `agentLaunchWrapper.js` and `agentLaunchCommand.shared.js`. Circuit breaker and heartbeat backoff live in swarm library modules. Token reuse requires `agent_auth_tokens` schema update. Delivery state extends the queue status enum. Long-poll is an API route parameter change.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `src/lib/agentLaunchWrapper.js` | Modified | Auto-restart loop, background loop survival |
| `src/lib/agentLaunchCommand.shared.js` | Modified | Wrapper bootstrap with nohup/disown |
| `src/lib/swarm/agentEvents.js` | Modified | Long-poll support, consumed state handling |
| `src/lib/db/swarmMissions.js` | Modified | Broadcast fan-out, consumed state |
| `src/lib/db/constants.js` | Modified | New `consumed` delivery state |
| `src/app/api/agenthub/operations/health/route.js` | Modified | Stale/offline tracking on Director side |
| `src/app/api/agenthub/presence/heartbeat/route.js` | Modified | Heartbeat backoff response headers |
| `src/app/api/agenthub/events/route.js` | Modified | Long-poll timeout support |
| `src/lib/swarm/auth.js` | Modified | Token expiry check and grace period |
| `src/lib/swarm/withAuth.js` | Modified | Token reuse logic |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Auto-restart loop causes infinite crash cycle | Low | Max 3 restarts enforced; exponential backoff between attempts |
| Token reuse creates auth freshness gap | Low | 24h grace period is well within typical session duration; token still expires |
| Circuit breaker state file corruption | Low | JSON.parse with try/catch; default to open circuit on error |
| Long-poll holds server connections | Medium | 30s timeout + connection limit per agent |

## Rollback Plan

1. Revert `agentLaunchWrapper.js` and `agentLaunchCommand.shared.js` to prior state — removes auto-restart and nohup changes
2. Drop `consumed` from delivery state enum in `constants.js`
3. Remove circuit breaker file at `/tmp/devhub-circuit-{agent_id}` on next startup
4. Revert `agent_auth_tokens` schema: drop `expires_at` column
5. Revert heartbeat backoff changes in `heartbeat/route.js` to simple no-delay ACK
6. Remove long-poll parameters from `events/route.js`

## Dependencies

- `agent-hmac-auth` (AUTH-1, AUTH-4) — token table schema underpins reconnection token reuse

## Success Criteria

- [ ] `consumed` state accepted by `ack_delivery` and transitions are terminal
- [ ] Heartbeat backoff doubles interval on failure; Director marks agent `stale` at 2 missed, `offline` at 3
- [ ] Background loops survive opencode exit via nohup/disown
- [ ] `GET /events?since=<timestamp>` returns immediately with events after timestamp; empty array if none
- [ ] `_devhub_tell_director` retries 3x with 1s/2s/4s backoff before throwing
- [ ] `recipient_agent_ids: ['*']` fans out to all active mission participants
- [ ] Reconnect within 24h reuses existing token; after 24h generates new token
- [ ] Non-zero exit triggers restart within 5s; after 3rd failure, wrapper exits with error