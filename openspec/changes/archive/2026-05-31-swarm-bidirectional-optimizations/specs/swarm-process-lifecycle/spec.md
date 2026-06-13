# Delta: swarm-process-lifecycle — heartbeat-backoff + background-loop-survival + director-circuit-breaker + agent-auto-restart

## ADDED Requirements

### REQ-PL-8: Agent Heartbeat Backoff

**Priority**: P1 | **Status**: delta

On heartbeat failure, the agent SHALL increase the heartbeat interval exponentially: 120s → 240s → 480s, capping at 900s (15 min). On successful heartbeat, the interval SHALL reset to 120s.

#### Scenario: PL-S13 — Exponential backoff on failure

- GIVEN an agent with heartbeat interval at 120s
- WHEN a heartbeat request fails
- THEN the next heartbeat is sent after 240s
- WHEN that heartbeat also fails
- THEN the next is sent after 480s
- WHEN that succeeds
- THEN the interval resets to 120s

### REQ-PL-9: Director Stale/Offline Tracking

**Priority**: P1 | **Status**: delta

The Director SHALL track agent presence with two states: `stale` (2 consecutive missed heartbeats) and `offline` (3 consecutive missed heartbeats). These states affect delivery routing and UI indicators.

#### Scenario: PL-S14 — Agent marked stale at 2 missed heartbeats

- GIVEN an agent has missed 2 consecutive heartbeat windows
- WHEN the Director evaluates presence
- THEN the agent's status becomes `stale`
- AND subsequent deliveries may be routed to alternate participants

#### Scenario: PL-S15 — Agent marked offline at 3 missed heartbeats

- GIVEN an agent has missed 3 consecutive heartbeat windows
- WHEN the Director evaluates presence
- THEN the agent's status becomes `offline`
- AND the agent is excluded from broadcast fan-out recipients

### REQ-PL-10: Background Loop Survival

**Priority**: P0 | **Status**: delta

Background loops (`_devhub_heartbeat_loop`, `_devhub_pending_deliveries_loop`) SHALL be started with `nohup` and `disown` so they survive the launching process exit. The loops SHALL ignore `SIGHUP`.

#### Scenario: PL-S16 — Background loop survives parent exit

- GIVEN `_devhub_heartbeat_loop` is started via nohup+disown
- WHEN the parent opencode process exits
- THEN the heartbeat loop continues running
- AND heartbeats are still sent to the Director

### REQ-PL-11: Director Circuit Breaker

**Priority**: P1 | **Status**: delta

The `_devhub_tell_director` function SHALL implement a circuit breaker with 3 retries and exponential backoff (1s/2s/4s). Circuit state SHALL be persisted to `/tmp/devhub-circuit-{agent_id}` as JSON.

#### Scenario: PL-S17 — Retries with exponential backoff

- GIVEN `_devhub_tell_director` is called and the Director is unreachable
- WHEN the call fails
- THEN it retries up to 3 times
- AND delays between retries are 1s, 2s, 4s respectively
- AND after 3 failures, an error is thrown

#### Scenario: PL-S18 — Circuit state persisted

- GIVEN the circuit breaker has opened after failures
- WHEN the agent restarts
- THEN the circuit state is recovered from `/tmp/devhub-circuit-{agent_id}`
- AND the circuit remains open until the reset window expires

### REQ-PL-12: Agent Auto-Restart

**Priority**: P0 | **Status**: delta

The agent launch wrapper SHALL implement a self-restart loop that re-executes the inner command on non-zero exit. The loop SHALL allow at most 3 restarts with a 5s delay between attempts. After the 3rd failure, the wrapper SHALL exit with error code 1.

#### Scenario: PL-S19 — Non-zero exit triggers restart

- GIVEN the inner agent process exits with code 5
- WHEN the wrapper detects the non-zero exit
- THEN it waits 5s
- AND re-executes the inner command
- AND the restart counter increments

#### Scenario: PL-S20 — Max 3 restarts enforced

- GIVEN the wrapper has already restarted 3 times
- WHEN the inner process exits non-zero again
- THEN the wrapper exits with code 1
- AND no further restart attempts are made

## MODIFIED Requirements

None.

## REMOVED Requirements

None.