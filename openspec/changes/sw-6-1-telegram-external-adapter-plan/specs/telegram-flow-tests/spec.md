# Delta for telegram-flow-tests

## ADDED Requirements

### Requirement: Adapter Boundary Coverage

Telegram flow tests MUST verify that supported intents are limited to durable reads, approval responses, notification retries, and subscription changes. Tests MUST prove forbidden orchestration, queue, lease, git, worktree, merge, and filesystem verbs are rejected.

#### Scenario: Forbidden orchestration verb is denied

- GIVEN a Telegram command requests queue or git authority
- WHEN the adapter flow test executes
- THEN the response is an out-of-scope denial
- AND no orchestration-side mutation is observed

### Requirement: Approval Idempotency and Degraded-State Coverage

Flow tests MUST cover allowlisted actor mapping, pending approval for risky actions, duplicate-envelope deduplication, replay rejection, durable-read failure behavior, and delivery retry semantics.

#### Scenario: Duplicate approval envelope is deduplicated

- GIVEN the same actor resends an approval envelope with the same idempotency key
- WHEN the flow test executes both deliveries
- THEN only one approval outcome is persisted
- AND the second response reuses the first outcome

#### Scenario: Durable read failure yields degraded response

- GIVEN the durable status read fails
- WHEN Telegram asks for task or run status
- THEN the adapter returns degraded-unavailable status
- AND the test proves no stale local snapshot is used
