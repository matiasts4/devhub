# Verification Report: swarm-bidirectional-optimizations

## Session
- **Change**: swarm-bidirectional-optimizations
- **Date**: 2026-05-31
- **Agent**: sdd-verify
- **Strict TDD**: ACTIVE

---

## Completeness Table

| Task | Status | Evidence |
|------|--------|----------|
| 1.1 `consumed` in `MISSION_DELIVERY_STATUSES` (constants.js) | PASS | constants.js:72 includes 'consumed' |
| 1.2 `expires_at` column + provisionAuthToken sets +24h | PASS | workspaces.js:338 sets `expires_at = +24h` |
| 1.3 `isTokenExpired()` helper | PASS | auth.js:48-53 |
| 2.1 `markDeliveryConsumed()` → 'consumed' | PASS | swarmMissions.js:617-625 |
| 2.2 `['*']` fan-out in `createLocalMissionMessage` | PASS | operations/health/route.js:1916-1920 |
| 2.3 `ack_delivery` action → 'consumed' | PASS | operations/health/route.js:2340-2348 |
| 2.4 Stale/offline tracking in heartbeat response | PASS | operations/health/route.js:2277-2304 (`presence_state`) |
| 2.5 `Retry-After` header in presence heartbeat | PASS | operations/health/route.js:2319-2320 |
| 3.1 `buildAutoRestartLoopCommand()` | PASS | agentLaunchWrapper.js:436-459 |
| 3.2 `nohup` + `disown` on background loops | PASS | agentLaunchWrapper.js:273-274, 347-348 |
| 3.3 Exponential backoff on heartbeat | PASS | agentLaunchWrapper.js:250-270 (120→240→480, max 900) |
| 3.4 Circuit breaker (3 retries, state file `/tmp/devhub-circuit-{agent_id}`) | PASS | agentLaunchWrapper.js:362-428 |
| 4.1 `GET /events?since=` with 30s timeout | PASS | events/route.js:186-252 |
| 4.2 `queryAgentEvents` unchanged (route handles long-poll) | PASS | events/route.js:194 |
| 5.1 `withAuth` checks `expires_at` grace | PASS | withAuth.js:87-98 |
| 5.2 `provisionAuthToken` sets +24h expiry | PASS | workspaces.js:338 |
| 6.1-6.5 Tests | FAIL | No test files found for any new feature |

---

## Spec Compliance Matrix

| Spec Requirement | Test | Implementation File | Status |
|-----------------|------|---------------------|--------|
| `consumed` as terminal delivery state | **NONE** | swarmMissions.js:623, constants.js:72 | UNTESTED |
| Heartbeat backoff 120s→240s→480s (max 15min) | **NONE** | agentLaunchWrapper.js:250-270 | UNTESTED |
| Background loops survive HUP via nohup/disown | **NONE** | agentLaunchWrapper.js:273,347 | UNTESTED |
| `GET /events?since=<timestamp>` with 30s server timeout | **NONE** | events/route.js:186-252 | UNTESTED |
| Circuit breaker: 3 retries with 1s/2s/4s backoff | **NONE** | agentLaunchWrapper.js:384-407 | UNTESTED |
| `recipient_agent_ids: ['*']` fans out to all active participants | **NONE** | operations/health/route.js:1916-1920 | UNTESTED |
| Reconnect within 24h reuses non-expired token | **NONE** | withAuth.js:89, workspaces.js:338 | UNTESTED |
| Non-zero exit triggers restart within 5s; exits after 3rd failure | **NONE** | agentLaunchWrapper.js:436-459 | UNTESTED |

---

## Design Coherence

### Correct Implementations
- **Auto-restart loop**: `MAX_RESTARTS=3`, `RESTART_DELAY=5`, `exec bash "$0" "$@"` — correct
- **Circuit breaker**: Reads `/tmp/devhub-circuit-{agent_id}`, retries 3x, exponential backoff, circuit state persisted — correct
- **Heartbeat backoff**: Agent-side `local _backoff=120` doubles on failure (240, 480, max 900) — correct
- **nohup/disown**: Both `_devhub_heartbeat_loop` (line 273) and `_devhub_pending_deliveries_loop` (line 347) use `nohup bash -c '...' >/dev/null 2>&1 & disown` — correct
- **Token expiry**: `expires_at` set to +24h (line 338 workspaces.js); `isTokenExpired()` checks properly (auth.js:48-53); `withAuth` rejects expired tokens (withAuth.js:89) — correct
- **Broadcast fan-out**: `normalizedRecipients.length === 1 && normalizedRecipients[0] === '*'` resolves to all eligible active participants — correct
- **Long-poll**: `GET /events?since=&long_poll=true&timeout=30` with deadline loop and 2s sleep — correct
- **`consumed` state**: `markDeliveryConsumed()` at swarmMissions.js:623 sets `status = 'consumed'`

### Inconsistencies

1. **`swarmMissions.js` has shadowing local constant** (line 31):
   ```js
   const MISSION_DELIVERY_STATUSES = ['pending', 'sent', 'failed', 'retry_pending', 'expired'];
   ```
   This does NOT include 'consumed', yet `markDeliveryConsumed()` at line 623 sets `status = 'consumed'`.
   - `isMissionDeliveryStatus('consumed')` returns **false** (line 196 checks against the local constant that lacks 'consumed')
   - The local constant at line 31 shadows the one exported from `constants.js` (which correctly has 'consumed')
   - This is a latent bug: any code path calling `isMissionDeliveryStatus('consumed')` will get wrong result

2. **Stale/offline tracking uses ephemeral in-memory counter**: The `missedHeartbeats` map (line 2285-2291) is passed via `dependencies` and not persisted to DB. If the route handler restarts or dependencies aren't provided, count resets. However, the underlying `presence_state` tracking via `expires_at` and `getAgentPresenceStatus()` IS durable (swarmMissions.js:225-241). The spec was ambiguous about persistence level — the durable part is implemented, the in-memory count is bonus state.

---

## TDD Evidence (Strict TDD Mode)

**STRICT TDD was active during this change.** Per tasks.md, Phase 6 required:
- 6.1 Unit test: `markDeliveryConsumed` → `consumed`
- 6.2 Unit test: `['*']` broadcast fan-out creates N deliveries
- 6.3 Integration test: auto-restart stops after 3 failures
- 6.4 Integration test: circuit breaker opens after 3 consecutive failures
- 6.5 Integration test: token reuse within 24h grace

**Result**: No test files found for any of these 5 tests. Grep across entire repo for `markDeliveryConsumed`, `fan.out`, `buildAutoRestart`, `autoRestart`, `circuit`, `isTokenExpired` in `.test.js` files returned zero matches for the new features.

**This is a TDD violation.** The tasks were marked complete but no tests were written.

---

## Issues

### CRITICAL (Must fix before merge)

1. **No tests written for any of the 8 optimizations** — Phase 6 tasks 6.1-6.5 all checked in tasks.md but zero test files exist. This violates strict TDD.

### WARNING (Should fix but not blocking)

2. **`swarmMissions.js` local `MISSION_DELIVERY_STATUSES` (line 31) missing `consumed`** — inconsistency: `isMissionDeliveryStatus('consumed')` returns false even though the function sets 'consumed'. The local constant should include 'consumed' to match the actual state machine.

---

## Final Verdict

**FAIL**

All 8 optimizations are correctly implemented in code. However, strict TDD evidence is missing — Phase 6 tests (6.1-6.5) were marked complete in tasks.md but no test files exist. This is a TDD violation.

**The CRITICAL blocking issue is: no tests written for any of the 8 optimizations despite Phase 6 marking all tasks done.**

### Required Remediation
1. Write unit test for `markDeliveryConsumed` → `consumed`
2. Write unit test for `['*']` broadcast fan-out
3. Write integration test for auto-restart stopping at 3 restarts
4. Write integration test for circuit breaker opening after 3 failures
5. Write integration test for token reuse within 24h grace

Additionally, fix the local `MISSION_DELIVERY_STATUSES` shadowing in swarmMissions.js (add 'consumed' to the local constant at line 31, or remove the local constant and rely on the imported one).