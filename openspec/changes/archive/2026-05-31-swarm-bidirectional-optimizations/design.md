# Design: swarm-bidirectional-optimizations

## Technical Approach

Eight targeted optimizations to close reliability gaps in agent-to-director communication. Each optimization is self-contained and modifies the minimal surface area. Changes are additive — no existing behavior is broken, only extended with fallback paths and new capabilities.

## Architecture Decisions

| Decision | Choice | Alternatives | Rationale |
|---|---|---|---|
| **1. Delivery state machine** | Add `consumed` as terminal state after `acked` | Extend `ack_delivery` to set `consumed` directly, no intermediate `delivered` | `delivered` is not currently used; `consumed` is explicit terminal state. Route `ack_delivery` to transition to `consumed` directly. |
| **2. Heartbeat backoff** | Exponential backoff on agent (120s→240s→480s→max15min); Director marks `stale` at 2 missed, `offline` at 3 | Server-side only, fixed interval | Agent-side backoff reduces server load during connectivity issues. Director tracks missed count independently. |
| **3. Background loop survival** | `nohup bash -c '...' & disown` for both loops | Daemontools, systemd, separate process | Minimal blast radius — only changes how loops are spawned, no external deps. |
| **4. Long-poll vs SSE** | `GET /events?since=<timestamp>` with 30s server timeout | Full SSE migration | Deferred to future change. Long-poll leverages existing GET endpoint with `since` filter already in `queryAgentEvents`. |
| **5. Circuit breaker location** | Agent-side shell function `_devhub_tell_director` with state file at `/tmp/devhub-circuit-{agent_id}` | Server-side rate limiting, middleware | Local circuit protects agent from hammering a failing server. State file survives wrapper restarts. |
| **6. Broadcast fan-out** | `recipient_agent_ids: ['*']` resolves to all `active` participants from `mission_participants` | Fan-out via separate queue, batch insert | Minimal DB change — extend `upsertMessageDelivery` to resolve `*` at insert time. |
| **7. Token reuse grace** | Check `expires_at` on reconnect; if non-expired and within 24h grace, reuse existing token | Full re-auth on every connect | Adds `expires_at` to `agent_auth_tokens`. `withAuth` looks up existing token first. 24h grace covers typical transient disconnects. |
| **8. Auto-restart** | Wrapper self-restarts inner command on non-zero exit; max 3 restarts, 5s delay | External supervisor, systemd | Self-contained in wrapper script. Uses loop counter env var (`_devhub_RESTART_COUNT`). |

## Data Flow

```
agentLaunchWrapper.js
  ├── exports env vars (DEVHUB_AGENT_TOKEN, etc.)
  ├── buildHeartbeatLoopCommand()
  │     └── (_devhub_heartbeat_loop) & → nohup disown → POST /presence/heartbeat
  ├── buildPendingDeliveriesPollingCommand()
  │     └── (_devhub_pending_deliveries_loop) & → nohup disown → POST /operations/health
  ├── buildDirectorTmuxInjection()
  │     └── /tmp/devhub-bin/_devhub_tell_director → circuit breaker → POST /events
  └── innerCommand → tmux session → opencode

Director API routes:
  /presence/heartbeat    ← heartbeat (tracks stale/offline)
  /operations/health     ← pending_deliveries + ack_delivery
  /events                ← _devhub_tell_director, long-poll GET ?since=
  /events GET            ← queryAgentEvents since=timestamp, 30s timeout

swarmMissions.js:
  upsertMessageDelivery()   → resolves recipient_agent_ids=['*'] to active participants
  markDeliveryConsumed()    → transitions to 'consumed' (terminal)
```

## File Changes

| File | Action | Description |
|------|--------|-------------|
| `src/lib/db/constants.js` | Modify | Add `consumed` to `MISSION_DELIVERY_STATUSES` |
| `src/lib/db/swarmMissions.js` | Modify | `markDeliveryConsumed` → set `consumed`; `upsertMessageDelivery` → resolve `['*']` fan-out |
| `src/lib/agentLaunchWrapper.js` | Modify | Add `buildAutoRestartLoopCommand`; modify `buildHeartbeatLoopCommand` with backoff; wrap loops with `nohup disown` |
| `src/lib/agentLaunchCommand.shared.js` | Modify | No change — auto-restart lives in wrapper |
| `src/lib/swarm/agentEvents.js` | Modify | `queryAgentEvents` already supports `since`; document `?since=` behavior |
| `src/app/api/agenthub/presence/heartbeat/route.js` | Modify | Track consecutive missed heartbeats per agent; expose backoff hint via `Retry-After` header |
| `src/app/api/agenthub/operations/health/route.js` | Modify | `ack_delivery` transitions to `consumed`; expose `stale`/`offline` in heartbeat response |
| `src/app/api/agenthub/events/route.js` | Modify | GET: add 30s server-side timeout on long-poll; POST: handle `recipient_agent_ids: ['*']` fan-out |
| `src/lib/swarm/auth.js` | Modify | `generateAgentSecret` — no change; add `isTokenExpired()` helper |
| `src/lib/swarm/withAuth.js` | Modify | On auth failure, check if token has `expires_at` within 24h grace → reuse existing token |
| `src/lib/db/localDb.js` | Modify | Add `expires_at` column to `agent_auth_tokens`; `provisionAuthToken` sets default 24h expiry |

## Interfaces / Contracts

### API Changes

**`GET /api/agenthub/events?since=<ISO>&agent_id=<id>`**
- `since` parameter: return events with `created_at > since`
- Long-poll timeout: 30s server-side; returns empty `events: []` if no new events
- Response: `{ success, events: [...], count }`

**`POST /api/agenthub/operations/health` — `ack_delivery` action**
```json
{ "action": "ack_delivery", "delivery_id": "<id>" }
```
- Transitions delivery to `consumed` (terminal)
- Returns `{ success, delivery_id, status: 'consumed' }`

**`POST /api/agenthub/events` — broadcast**
```json
{
  "event_type": "status_update",
  "agent_id": "...",
  "mission_id": "...",
  "recipient_agent_ids": ["*"],
  "payload": { "summary": "..." }
}
```
- `recipient_agent_ids: ['*']` fans out to all `active` mission participants
- Creates one delivery per participant

**Heartbeat response (Director → Agent)**
```json
{
  "success": true,
  "agent_id": "...",
  "state": "idle",
  "ttl_ms": 120000,
  "expires_at": "...",
  "retry_after_ms": 120000,
  "presence_state": "online|stale|offline"
}
```
- `retry_after_ms`: agent should wait this long before next heartbeat (backoff hint)
- `presence_state`: current tracked state on Director side

### Shell Functions

**`_devhub_tell_director` with circuit breaker**
```bash
_devhub_tell_director() {
  # Reads /tmp/devhub-circuit-{agent_id} for circuit state
  # Retries 3x: 1s, 2s, 4s backoff
  # Opens circuit after 3 consecutive failures
  # Circuit resets on success
}
```

**Background loop survival**
```bash
nohup bash -c '(_devhub_heartbeat_loop) & disown' >/dev/null 2>&1
```

**Auto-restart loop** (inside wrapper after innerCommand exits)
```bash
MAX_RESTARTS=3
RESTART_DELAY=5
_devhub_restart_if_needed() {
  if [ "$_devhub_RESTART_COUNT" -ge "$MAX_RESTARTS" ]; then
    echo "Max restarts reached. Exiting."
    exit 1
  fi
  sleep $RESTART_DELAY
  _devhub_RESTART_COUNT=$((_devhub_RESTART_COUNT + 1))
  exec bash "$0" "$@"  # re-exec wrapper script
}
```

### Token Schema Change

```sql
ALTER TABLE agent_auth_tokens ADD COLUMN expires_at TEXT; -- ISO timestamp, NULL = no expiry
```

- On provision: set `expires_at` to `datetime('now', '+24 hours')`
- `withAuth` reuse: if token exists and `expires_at > now()`, reuse it instead of rejecting

## Testing Strategy

| Layer | What | How |
|-------|------|-----|
| Unit | `markDeliveryConsumed` → `consumed` | `node --test` on swarmMissions unit tests |
| Unit | Circuit breaker state file read/write | Mock `/tmp/devhub-circuit-*` |
| Unit | `since` filter in `queryAgentEvents` | Unit test with known timestamps |
| Integration | Auto-restart: verify restart count env var | Spawn wrapper, kill inner process 3x, verify exit on 4th |
| Integration | Broadcast fan-out: `['*']` resolves to N participants | Insert mission with 3 participants, send broadcast, verify 3 deliveries |
| Integration | Long-poll returns after 30s with empty on timeout | Mock server clock, verify response timing |
| E2E | Agent reconnect within 24h reuses token | Launch agent, disconnect, reconnect within 24h, verify same token |

## Migration / Rollout

1. **Schema**: Add `expires_at` column to `agent_auth_tokens` (nullable, default null — backward compatible)
2. **State**: No data migration required for `consumed`; new deliveries use new state
3. **Feature flags**: All 8 optimizations are independent — can ship progressively
4. **Rollback**: Revert individual files; `consumed` state is transparent (only new transitions affected)

**No migration needed** for `consumed` state — `upsertMessageDelivery` accepts any status from `MISSION_DELIVERY_STATUSES`; existing `delivered`/`failed` rows stay as-is.