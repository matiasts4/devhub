# Browser Preview Responsiveness Specification

## Purpose

Define bounded preview-adjacent polling and diagnostics so responsiveness improves without losing actionable observability.

## Requirements

### Requirement: Bounded Preview-Adjacent Churn

The system SHOULD reduce non-essential polling, timer churn, and repeated diagnostic emission that compete with browser preview responsiveness. It MUST preserve state correctness and SHALL NOT require faster polling to keep preview behavior correct.

#### Scenario: Lower background churn preserves behavior

- GIVEN preview-adjacent state is being observed
- WHEN polling or timer cadence is reduced
- THEN preview support, browser-pane state, and right-dock state remain correct

#### Scenario: State changes do not depend on noisy retries

- GIVEN a preview support transition occurs
- WHEN DevHub processes that transition
- THEN the resulting state is driven by observed lifecycle state rather than repeated retry spam

### Requirement: Actionable And Quiet Diagnostics

The system SHOULD deduplicate or throttle repeated preview-adjacent diagnostics while preserving actionable support reasons, failure categories, and recovery signals.

#### Scenario: Repeated failure logs are coalesced

- GIVEN the same preview failure repeats rapidly without a state change
- WHEN diagnostics are emitted
- THEN operators receive fewer duplicate messages and still retain the stable failure reason

#### Scenario: State change emits actionable signal

- GIVEN preview support changes between supported, degraded, and unsupported states
- WHEN diagnostics or UI status are updated
- THEN the emitted reason distinguishes proxy loss, same-origin fallback, missing instrumentation, or recovery

### Requirement: Responsiveness Regression Boundary

The system MUST keep observability sufficient for tests and operators while avoiding any requirement for Chromium, CDP, or arbitrary remote inspection.

#### Scenario: Reduced noise does not erase diagnostics

- GIVEN regression coverage exercises polling and logging changes
- WHEN preview support fails or recovers
- THEN tests can still assert the resulting support reason and user-visible state deterministically
