# telegram-external-adapter Specification

## Purpose

Define Telegram as a bounded external channel over durable DevHub state.

## Requirements

### Requirement: Bounded Telegram Intent Surface

Telegram MUST act only as an external adapter. It MUST read durable DevHub task, workspace, run, artifact, supervisor, and approval state, and MUST accept only status/query, task/workspace detail, approval response, notification retry, and subscribe/unsubscribe intents. It MUST NOT own orchestration, queue, lease, git, worktree, merge, or filesystem verbs.

#### Scenario: Allowed intent is accepted

- GIVEN an allowlisted user sends a task-detail or approve/reject intent
- WHEN the adapter validates the envelope
- THEN it records an intent against durable DevHub state
- AND no runtime-local mirror becomes source of truth

#### Scenario: Forbidden verb is rejected

- GIVEN a Telegram message requests queue control or git/worktree mutation
- WHEN the adapter classifies the verb
- THEN the request is denied as out of scope
- AND an audit entry records the denied actor and verb

### Requirement: Identity Approval and Audit Invariants

The adapter MUST authenticate chat actors through an allowlist-mapped DevHub identity. Risky or destructive actions MUST require an explicit human approval flow before any durable state mutation. Every accepted, denied, approved, or rejected action MUST record auditable actor mapping, decision, and target reference.

#### Scenario: Risky action requires approval

- GIVEN an authenticated user requests a risky action
- WHEN no approval decision exists
- THEN the adapter creates a pending approval intent
- AND the action remains unapplied

### Requirement: Idempotency Replay and Failure Safety

Inbound intents MUST carry a stable idempotency key and replay-protection window. Duplicate or replayed envelopes MUST NOT create duplicate intents or approvals. If durable DevHub reads fail, the adapter MUST return degraded-unavailable status and MUST NOT answer from stale local state. If Telegram delivery fails, the system MUST record delivery status for retry without changing underlying DevHub truth.

#### Scenario: Duplicate inbound envelope is replayed

- GIVEN an already-recorded idempotency key for the same actor and target
- WHEN Telegram redelivers the envelope
- THEN the adapter returns the prior outcome
- AND no second mutation or audit branch is created

#### Scenario: Durable read fails during status request

- GIVEN Telegram requests run status
- WHEN the durable read is unavailable
- THEN the reply reports degraded-unavailable status
- AND no synthetic status is emitted from runtime memory
