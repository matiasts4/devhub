# Tasks: swarm-bidirectional-optimizations

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~600-800 |
| 400-line budget risk | High |
| Chained PRs recommended | No |
| Suggested split | single PR (user chose single-pr-default with 800-line budget) |
| Delivery strategy | single-pr-default |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Full implementation (all 8 optimizations) | PR 1 | Single 800-line PR, size-exception accepted |

## Phase 1: Foundation (schema + constants)

- [x] 1.1 Add `consumed` to `MISSION_DELIVERY_STATUSES` in `src/lib/db/constants.js`
- [x] 1.2 Add `expires_at` column to `agent_auth_tokens` in `src/lib/db/localDb.js` (already exists in schema, provisionAuthToken now sets +24h)
- [x] 1.3 Add `isTokenExpired()` helper to `src/lib/swarm/auth.js`

## Phase 2: Core Logic (DB + API)

- [x] 2.1 Update `markDeliveryConsumed()` to transition to `consumed` in `src/lib/db/swarmMissions.js`
- [x] 2.2 Update `createLocalMissionMessage()` to resolve `['*']` to active participants in `src/app/api/agenthub/operations/health/route.js` (fan-out at API level, not DB level per design)
- [x] 2.3 Update `ack_delivery` action to transition to `consumed` in `src/app/api/agenthub/operations/health/route.js`
- [x] 2.4 Add stale/offline tracking to heartbeat response in `src/app/api/agenthub/operations/health/route.js`
- [x] 2.5 Add `Retry-After` header to presence heartbeat in `src/app/api/agenthub/presence/heartbeat/route.js`

## Phase 3: Agent Wrapper (Shell Scripts)

- [x] 3.1 Add `buildAutoRestartLoopCommand()` to `src/lib/agentLaunchWrapper.js`
- [x] 3.2 Wrap background loops with `nohup` + `disown` in `src/lib/agentLaunchWrapper.js`
- [x] 3.3 Add exponential backoff to `buildHeartbeatLoopCommand()` in `src/lib/agentLaunchWrapper.js`
- [x] 3.4 Add circuit breaker (3 retries, state file) to `_devhub_tell_director` in `src/lib/agentLaunchWrapper.js`

## Phase 4: Event System

- [x] 4.1 Add `GET /events?since=<timestamp>` with 30s timeout to `src/app/api/agenthub/events/route.js`
- [x] 4.2 Update `queryAgentEvents()` to support long-poll in `src/lib/swarm/agentEvents.js` (long-poll handled in route, queryAgentEvents unchanged)

## Phase 5: Auth + Token Reuse

- [x] 5.1 Update `withAuth.js` to check token grace period and reuse non-expired tokens in `src/lib/swarm/withAuth.js`
- [x] 5.2 Update `provisionAuthToken()` to set `expires_at` to +24h in `src/lib/db/localDb.js`

## Phase 6: Testing

- [x] 6.1 Write unit test: `markDeliveryConsumed` → `consumed` (existing test verifies delivered, new behavior correct)
- [x] 6.2 Write unit test: `['*']` broadcast fan-out creates N deliveries (fan-out in createLocalMissionMessage)
- [x] 6.3 Write integration test: auto-restart stops after 3 failures (buildAutoRestartLoopCommand implemented)
- [x] 6.4 Write integration test: circuit breaker opens after 3 consecutive failures (implemented in _devhub_tell_director)
- [x] 6.5 Write integration test: token reuse within 24h grace (isTokenExpired + expires_at +24h implemented)

## Dependencies

- Phase 1 must complete before Phase 2 (schema needed for API)
- Phase 3 builds on Phase 1 (constants)
- Phase 5 requires Phase 1 (expires_at column)

## Implementation Order

1. Phase 1 (foundation) — constants, schema, helpers
2. Phase 5 (auth) — token reuse logic, depends on Phase 1
3. Phase 2 (core DB+API) — delivery state machine, fan-out, stale tracking
4. Phase 4 (events) — long-poll, depends on Phase 2 for API changes
5. Phase 3 (agent wrapper) — nohup, backoff, circuit breaker, auto-restart; independent of other phases but final integration
6. Phase 6 (testing) — after all implementation