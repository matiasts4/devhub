# Delta Spec: terminal-event-bus

## Type: NEW

Introduces the reliable dispatcher that owns the `devhub:run-agent` event lifecycle for the planning path, replacing the brittle `setTimeout(150)` hop in `launchPlanningAgent.js`. Mirrors `openspec/changes/planning-launch-hardening/proposal.md` FR-PL06 and the gate-skip semantics in FR-PL07.

## Purpose

Dispatch custom `devhub:run-agent` events with retry so listeners that mount late do not miss planning runs. The dispatcher SHALL be portable (no coupling to `TerminalWorkspacesManager` lifecycle signals), bounded (no infinite loop), and observable (exposes the constants that drive attempts and interval so tests can drive a fake clock).

## ADDED Requirements

### Requirement: dispatchPlanningAgentRun retries until accepted

The system SHALL export `dispatchPlanningAgentRun(detail)` from `src/lib/planning/dispatchPlanningAgentRun.js`. The function SHALL fire the `devhub:run-agent` `CustomEvent` on `window` (or `globalThis` in non-browser test environments) and SHALL retry the dispatch on a fixed interval when no listener has yet accepted the event. The function SHALL treat a synchronous listener call that marks the detail as accepted as the stop condition. The detail object passed in SHALL be the same object (or a structurally equal clone) carried on every retry so a late-mounting listener can read `command`, `selectedAgent`, `launchOrigin`, and `promptSummary`.

#### Scenario: Retry succeeds on a late-mounting listener

- GIVEN no `devhub:run-agent` listener is registered at call time
- AND a listener is registered after the first two retries (using a fake clock)
- WHEN `dispatchPlanningAgentRun(detail)` is called
- THEN the third (or later) retry reaches the now-mounted listener
- AND the listener receives the full `detail` object

#### Scenario: Detail object is preserved across retries

- GIVEN `detail = { command: '...', selectedAgent: 'sdd-orchestrator', launchOrigin: 'planning-launch', promptSummary: '...' }`
- WHEN the dispatcher fires multiple times
- THEN every `CustomEvent`'s `detail` exposes the same `command`, `selectedAgent`, `launchOrigin`, and `promptSummary` values

### Requirement: dispatchPlanningAgentRun caps attempts

The system SHALL bound the retry loop with a `MAX_ATTEMPTS` constant (default `20`) and a `RETRY_MS` constant (default `100`). After `MAX_ATTEMPTS` unsuccessful attempts, the dispatcher SHALL stop firing and return without throwing. Both constants SHALL be exported from the module so unit tests can drive a fake clock and assert the bounded behavior in O(few) ms of wall time. The total bound (`MAX_ATTEMPTS * RETRY_MS`) SHALL be small enough that a planning click whose listener never mounts does not pin the JavaScript event loop for more than a few seconds.

#### Scenario: MAX_ATTEMPTS bound is respected

- GIVEN `MAX_ATTEMPTS = 20` and no listener ever accepts
- WHEN `dispatchPlanningAgentRun(detail)` runs under a fake clock
- THEN `window.dispatchEvent` is called exactly `MAX_ATTEMPTS` times
- AND the function returns normally (no throw)

#### Scenario: Constants are exported and overrideable in tests

- GIVEN the test imports the dispatcher module
- WHEN it reads `MAX_ATTEMPTS` and `RETRY_MS`
- THEN both values are exported and the test can substitute a smaller `MAX_ATTEMPTS` (e.g. `3`) to keep the test fast
- AND the substitute applies without leaking global state to other tests

#### Scenario: Loop is bounded within a small wall-clock window

- GIVEN the default constants `MAX_ATTEMPTS = 20, RETRY_MS = 100`
- WHEN the full retry loop runs without acceptance
- THEN the total elapsed time is approximately `MAX_ATTEMPTS * RETRY_MS` (≈2 seconds)
- AND the loop yields to the event loop between attempts (no tight sync loop)
